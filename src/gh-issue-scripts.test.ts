import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { skillsTemplateDir } from './utils.js';

// Runs the gh-issue scripts against a PATH-stub `gh` that answers from fixture
// JSON files and logs every call, so the tests see exactly what the script
// would send to GitHub.

const SCRIPT = path.join(skillsTemplateDir, 'smithy.gh-issue', 'scripts', 'link-sub-issue.sh');

const GH_STUB = `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$STUB_LOG"
if [ "$1" = "repo" ]; then echo '{"owner":{"login":"acme"},"name":"widgets"}'; exit 0; fi
shift # "api"
method=GET; jq_filter=""; endpoint=""
while [ $# -gt 0 ]; do
  case "$1" in
    --method) method="$2"; shift 2 ;;
    --jq) jq_filter="$2"; shift 2 ;;
    --paginate) shift ;;
    -F|-f) shift 2 ;;
    *) endpoint="$1"; shift ;;
  esac
done
if [ "$method" = "POST" ]; then echo '{}'; exit 0; fi
fixture="$STUB_FIXTURES/$(echo "$endpoint" | tr '/' '_').json"
[ -f "$fixture" ] || { echo "HTTP 404: Not Found ($endpoint)" >&2; exit 1; }
jq -r "$jq_filter" "$fixture"
`;

describe('link-sub-issue.sh', () => {
  let dir: string;
  let log: string;
  let fixtures: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-gh-stub-'));
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.writeFileSync(path.join(dir, 'bin', 'gh'), GH_STUB, { mode: 0o755 });
    fixtures = path.join(dir, 'fixtures');
    fs.mkdirSync(fixtures);
    log = path.join(dir, 'gh.log');
    fs.writeFileSync(log, '');
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const fixture = (endpoint: string, body: unknown) =>
    fs.writeFileSync(path.join(fixtures, `${endpoint.replace(/\//g, '_')}.json`), JSON.stringify(body));

  const run = (...args: string[]) => {
    const res = spawnSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, STUB_LOG: log, STUB_FIXTURES: fixtures },
    });
    return { ...res, calls: fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) };
  };

  it('is executable in the source tree', () => {
    expect(fs.statSync(SCRIPT).mode & 0o111).not.toBe(0);
  });

  it('posts the child issue id, not its number, to the parent sub_issues endpoint', () => {
    fixture('repos/acme/widgets/issues/10/sub_issues', [{ number: 11, id: 555001 }]);
    fixture('repos/acme/widgets/issues/12', { number: 12, id: 987654 });

    const res = run('10', '12');

    expect(res.status, res.stderr).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual({ parent: 10, child: 12, status: 'linked' });
    const post = res.calls.find(c => c.includes('--method POST'));
    expect(post).toBe('api --method POST repos/acme/widgets/issues/10/sub_issues -F sub_issue_id=987654');
    // The listing that decides "not yet linked" reads every page.
    expect(res.calls).toContain("api --paginate repos/acme/widgets/issues/10/sub_issues --jq .[].number");
  });

  it('treats an existing link as success and writes nothing', () => {
    fixture('repos/acme/widgets/issues/10/sub_issues', [{ number: 11, id: 555001 }, { number: 12, id: 987654 }]);

    const res = run('10', '12');

    expect(res.status, res.stderr).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual({ parent: 10, child: 12, status: 'already-linked' });
    expect(res.calls.some(c => c.includes('--method POST'))).toBe(false);
  });

  it('fails clearly when the child issue does not exist', () => {
    fixture('repos/acme/widgets/issues/10/sub_issues', []);

    const res = run('10', '99');

    expect(res.status).not.toBe(0);
    expect(res.calls.some(c => c.includes('--method POST'))).toBe(false);
  });

  it('rejects issue references that are not bare numbers', () => {
    const res = run('#10', '12');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('bare positive integers');
    expect(res.calls).toEqual([]);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { skillsTemplateDir } from './utils.js';

// Runs the gh-issue scripts against a PATH-stub `gh` that answers from fixture
// JSON files and logs every call, so the tests see exactly what the script
// would send to GitHub.

const SCRIPTS = path.join(skillsTemplateDir, 'smithy.gh-issue', 'scripts');
const SCRIPT = path.join(SCRIPTS, 'link-sub-issue.sh');

const GH_STUB = `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$STUB_LOG"
case "$1" in
  repo) echo '{"name":"widgets"}'; exit 0 ;;
  issue) if [ "$2" = "create" ]; then echo 'https://github.com/acme/widgets/issues/7'; else echo '[]'; fi; exit 0 ;;
esac
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
jq -r "\${jq_filter:-.}" "$fixture"
`;

describe('gh-issue scripts', () => {
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

  const runScript = (script: string, ...args: string[]) => {
    const res = spawnSync('bash', [path.join(SCRIPTS, script), ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, STUB_LOG: log, STUB_FIXTURES: fixtures },
    });
    return { ...res, calls: fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) };
  };
  const run = (...args: string[]) => runScript('link-sub-issue.sh', 'acme/widgets', ...args);

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
    expect(res.calls).toContain("api --paginate repos/acme/widgets/issues/10/sub_issues --jq .[].id");
  });

  it('treats an existing link as success and writes nothing', () => {
    fixture('repos/acme/widgets/issues/10/sub_issues', [{ number: 11, id: 555001 }, { number: 12, id: 987654 }]);
    fixture('repos/acme/widgets/issues/12', { number: 12, id: 987654 });

    const res = run('10', '12');

    expect(res.status, res.stderr).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual({ parent: 10, child: 12, status: 'already-linked' });
    expect(res.calls.some(c => c.includes('--method POST'))).toBe(false);
  });

  it('matches by id, so a same-numbered sub-issue from another repo is not this link', () => {
    fixture('repos/acme/widgets/issues/10/sub_issues', [{ number: 12, id: 111222 }]);
    fixture('repos/acme/widgets/issues/12', { number: 12, id: 987654 });

    const res = run('10', '12');

    expect(res.status, res.stderr).toBe(0);
    expect(JSON.parse(res.stdout).status).toBe('linked');
    expect(res.calls).toContain('api --method POST repos/acme/widgets/issues/10/sub_issues -F sub_issue_id=987654');
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

  // The repository is resolved once by the caller and passed in; no script
  // looks it up again, so every call lands in the same repository.
  const ownerRepoScripts: Array<[string, string[]]> = [
    ['search-issues.sh', ['open', '[Story] Title']],
    ['create-issue.sh', ['[Story] Title', 'BODY']],
    ['link-blocked-by.sh', ['12', '10']],
    ['link-sub-issue.sh', ['10', '12']],
    ['check-env.sh', []],
  ];

  it.each(ownerRepoScripts)('%s rejects a missing or malformed ownerRepo before calling gh', (script, rest) => {
    for (const bad of [[], ['widgets'], ['acme/widgets/extra'], ['acme/wid gets'], ['$(id)/x']]) {
      const res = runScript(script, ...(bad.length ? [...bad, ...rest] : []));
      expect(res.status, `${script} ${bad.join(' ')}`).not.toBe(0);
      expect(res.calls, `${script} ${bad.join(' ')}`).toEqual([]);
    }
  });

  it('passes ownerRepo to gh as -R and never runs gh repo view to find it', () => {
    const body = path.join(dir, 'body.md');
    fs.writeFileSync(body, '## Body');
    fixture('graphql', { data: { repository: { issue: { id: 'I_1' } } } });

    expect(runScript('search-issues.sh', 'acme/widgets', 'open', 'x').status).toBe(0);
    const created = runScript('create-issue.sh', 'acme/widgets', 'T', body);
    expect(created.status, created.stderr).toBe(0);
    expect(JSON.parse(created.stdout)).toEqual({ number: 7, url: 'https://github.com/acme/widgets/issues/7' });
    const linked = runScript('link-blocked-by.sh', 'acme/widgets', '12', '10');
    expect(linked.status, linked.stderr).toBe(0);

    const calls = linked.calls;
    expect(calls.find(c => c.startsWith('issue list'))).toMatch(/^issue list -R acme\/widgets /);
    expect(calls.find(c => c.startsWith('issue create'))).toMatch(/^issue create -R acme\/widgets /);
    expect(calls.filter(c => c.includes('-F owner=acme -F name=widgets'))).toHaveLength(2);
    expect(calls.some(c => c.startsWith('repo'))).toBe(false);
  });

  it('check-env.sh confirms the given repository rather than choosing one', () => {
    const res = runScript('check-env.sh', 'acme/widgets');
    expect(res.status, res.stderr).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual({ owner: 'acme', repo: 'widgets', ownerRepo: 'acme/widgets' });
    expect(res.calls).toEqual(['repo view acme/widgets --json name']);
  });
});

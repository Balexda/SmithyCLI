import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { skillsTemplateDir } from './utils.js';

// Runs the pr-review scripts against PATH-stub `gh` and `git` binaries that
// answer from fixture JSON files and log every call.

const SCRIPTS = path.join(skillsTemplateDir, 'smithy.pr-review', 'scripts');

// GraphQL calls are answered from `<kind>_<node-id>_<cursor>.json`, where kind
// is read off the query text and the cursor is `first` when none was passed.
const GH_STUB = `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$STUB_LOG"
if [ "$1" = "pr" ]; then
  if [ -s "$STUB_FIXTURES/pr-view.json" ]; then cat "$STUB_FIXTURES/pr-view.json"; exit 0; fi
  echo 'no pull requests found for branch "feature"' >&2; exit 1
fi
shift 2 # "api graphql"
after=first; id=""; query=""
while [ $# -gt 0 ]; do
  case "$1" in
    -F|-f)
      case "$2" in
        after=*) after="\${2#after=}" ;;
        id=*) id="\${2#id=}" ;;
        query=*) query="\${2#query=}" ;;
      esac
      shift 2 ;;
    *) shift ;;
  esac
done
case "$query" in
  *reviewThreads*) kind=threads ;;
  *"node(id"*) kind=replies ;;
  *) kind=conversation ;;
esac
fixture="$STUB_FIXTURES/\${kind}_\${id}_\${after}.json"
[ -f "$fixture" ] || { echo "no fixture $fixture" >&2; exit 1; }
cat "$fixture"
`;

const GIT_STUB = `#!/usr/bin/env bash
echo "$STUB_BRANCH"
`;

const at = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString();
const marker = (id: number) => `Fixed.\n\n<!-- smithy-pr-review-response-to:${id} -->`;

interface Comment { databaseId: number; body: string; path: string | null; diffHunk: string | null; author: { login: string }; createdAt: string }

let clock = 0;
const comment = (databaseId: number, login: string, body = 'Please change this.'): Comment => ({
  databaseId, body, path: 'src/a.ts', diffHunk: '@@', author: { login }, createdAt: at(clock++),
});

describe('pr-review scripts', () => {
  let dir: string;
  let log: string;
  let fixtures: string;

  beforeEach(() => {
    clock = 0;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-pr-stub-'));
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.writeFileSync(path.join(dir, 'bin', 'gh'), GH_STUB, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'bin', 'git'), GIT_STUB, { mode: 0o755 });
    fixtures = path.join(dir, 'fixtures');
    fs.mkdirSync(fixtures);
    log = path.join(dir, 'gh.log');
    fs.writeFileSync(log, '');
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const fixture = (name: string, body: unknown) =>
    fs.writeFileSync(path.join(fixtures, `${name}.json`), JSON.stringify(body));

  const run = (script: string, args: string[], branch = 'feature') => {
    const res = spawnSync('bash', [path.join(SCRIPTS, script), ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, STUB_LOG: log, STUB_FIXTURES: fixtures, STUB_BRANCH: branch },
    });
    return { ...res, calls: fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) };
  };

  // A 150-thread fixture runs the real script's jq pipeline; give it room
  // when the whole suite runs in parallel.
  describe('get-comments.sh', { timeout: 30_000 }, () => {
    const connection = <T>(nodes: T[], next?: string) => ({
      pageInfo: { hasNextPage: next !== undefined, endCursor: next ?? null }, nodes,
    });
    const threadsPage = (threads: unknown[], next?: string) => ({
      data: { viewer: { login: 'owner' }, repository: { pullRequest: { reviewThreads: connection(threads, next) } } },
    });
    const conversationPage = (comments: unknown[], next?: string) => ({
      data: { repository: { pullRequest: { comments: connection(comments, next) } } },
    });

    // 150 threads over two pages. Thread n's root is databaseId 1000 + n.
    // 0: resolved. 1: newest comment marks the root. 2: marked, then a
    // reviewer follow-up. 3: the owner's own unmarked comment. 4: a marker for
    // a different id that shares the root's digits. 120: 130 replies over two
    // pages. The rest: one open reviewer comment.
    const build = () => {
      const threads = Array.from({ length: 150 }, (_, n) => {
        const root = 1000 + n;
        let chain: Comment[] = [comment(root, n === 3 ? 'owner' : 'reviewer')];
        if (n === 1) chain.push(comment(5001, 'owner', marker(root)));
        if (n === 2) chain.push(comment(5002, 'owner', marker(root)), comment(5003, 'reviewer', 'Still wrong.'));
        if (n === 4) chain.push(comment(5004, 'owner', marker(10040)));
        if (n === 120) chain = chain.concat(Array.from({ length: 129 }, (_, k) => comment(6000 + k, k % 2 ? 'owner' : 'reviewer', `reply ${k}`)));
        return { id: `T_${n}`, isResolved: n === 0, chain };
      });
      const first = (t: typeof threads[number]) => ({
        id: t.id, isResolved: t.isResolved,
        comments: connection(t.chain.slice(0, 100), t.chain.length > 100 ? 'C2' : undefined),
      });
      fixture('threads__first', threadsPage(threads.slice(0, 100).map(first), 'P2'));
      fixture('threads__P2', threadsPage(threads.slice(100).map(first)));
      fixture('replies_T_120_C2', { data: { node: { comments: connection(threads[120]!.chain.slice(100)) } } });

      const conv = (databaseId: number, login: string, body: string) => ({ databaseId, body, author: { login }, createdAt: at(clock++) });
      fixture('conversation__first', conversationPage([
        conv(1, 'reviewer', 'Please add a test.'),
        conv(2, 'owner', 'Note to self: rename this.'),
      ], 'K2'));
      fixture('conversation__K2', conversationPage([
        conv(3, 'owner', marker(1)),
        conv(4, 'reviewer', 'And a changelog entry.'),
      ]));
      return threads;
    };

    it('reads every page of threads, of replies, and of conversation comments before filtering', () => {
      const threads = build();
      const res = run('get-comments.sh', ['acme/widgets', '42']);
      expect(res.status, res.stderr).toBe(0);

      const items = JSON.parse(res.stdout) as Array<{ kind: string; comments: Comment[] }>;
      const inline = items.filter(i => i.kind === 'inline_thread');
      expect(inline).toHaveLength(148);

      const long = inline.find(i => i.comments[0]!.databaseId === 1120)!;
      expect(long.comments.map(c => c.databaseId)).toEqual(threads[120]!.chain.map(c => c.databaseId));

      expect(res.calls.filter(c => c.includes('after=P2'))).toHaveLength(1);
      expect(res.calls.filter(c => c.includes('id=T_120') && c.includes('after=C2'))).toHaveLength(1);
      expect(res.calls.filter(c => c.includes('after=K2'))).toHaveLength(1);
    });

    it('decides "handled" by the response marker, not by who commented last', () => {
      build();
      const res = run('get-comments.sh', ['acme/widgets', '42']);
      expect(res.status, res.stderr).toBe(0);
      const items = JSON.parse(res.stdout) as Array<{ kind: string; comments: Comment[] }>;
      const roots = new Set(items.filter(i => i.kind === 'inline_thread').map(i => i.comments[0]!.databaseId));

      expect(roots.has(1000), 'resolved thread').toBe(false);
      expect(roots.has(1001), 'newest comment carries the marker').toBe(false);
      expect(roots.has(1002), 'a reviewer reply after the marker reopens it').toBe(true);
      expect(roots.has(1003), "the owner's own unmarked comment is feedback").toBe(true);
      expect(roots.has(1004), 'a marker for another id does not match').toBe(true);

      const conversation = items.filter(i => i.kind === 'conversation_comment').map(i => i.comments[0]!.databaseId);
      expect(conversation).toEqual([2, 4]);
    });

    it('fails instead of looping when a page repeats its cursor', () => {
      fixture('threads__first', threadsPage([], 'P2'));
      fixture('threads__P2', threadsPage([], 'P2'));
      const res = run('get-comments.sh', ['acme/widgets', '42']);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain('did not advance');
      expect(res.calls.filter(c => c.startsWith('api graphql'))).toHaveLength(2);
    });

    it('rejects a malformed ownerRepo before calling gh', () => {
      const res = run('get-comments.sh', ['acme', '42']);
      expect(res.status).not.toBe(0);
      expect(res.calls).toEqual([]);
    });
  });

  describe('find-pr.sh', () => {
    it("returns an open PR with owner and repo taken from the PR's own url", () => {
      fixture('pr-view', { number: 42, state: 'OPEN', url: 'https://github.com/upstream-org/widgets/pull/42' });
      const res = run('find-pr.sh', []);
      expect(res.status, res.stderr).toBe(0);
      expect(JSON.parse(res.stdout)).toEqual({ owner: 'upstream-org', repo: 'widgets', pr: 42, ownerRepo: 'upstream-org/widgets' });
      expect(res.calls).toEqual(['pr view --json number,state,url']);
    });

    it('returns {} when the tracked PR is closed or merged', () => {
      for (const state of ['CLOSED', 'MERGED']) {
        fixture('pr-view', { number: 42, state, url: 'https://github.com/acme/widgets/pull/42' });
        const res = run('find-pr.sh', []);
        expect(res.status, res.stderr).toBe(0);
        expect(JSON.parse(res.stdout), state).toEqual({});
      }
    });

    it('returns {} when the branch has no PR, and on a detached HEAD without calling gh', () => {
      expect(JSON.parse(run('find-pr.sh', []).stdout)).toEqual({});
      fs.writeFileSync(log, '');
      const detached = run('find-pr.sh', [], '');
      expect(JSON.parse(detached.stdout)).toEqual({});
      expect(detached.calls).toEqual([]);
    });
  });

  it('reply-comment.sh appends the response marker for the root comment once', () => {
    const body = path.join(dir, 'reply.md');
    fs.writeFileSync(body, 'Fixed in abc1234.');
    const stub = `#!/usr/bin/env bash\nprintf '%s\\0' "$@" > "$STUB_LOG"\n`;
    fs.writeFileSync(path.join(dir, 'bin', 'gh'), stub, { mode: 0o755 });

    const args = () => fs.readFileSync(log, 'utf8').split('\0');
    expect(run('reply-comment.sh', ['acme/widgets', '42', '1001', body]).status).toBe(0);
    expect(args()).toContain('body=Fixed in abc1234.\n\n<!-- smithy-pr-review-response-to:1001 -->');

    fs.writeFileSync(body, marker(1001));
    expect(run('reply-comment.sh', ['acme/widgets', '42', '1001', body]).status).toBe(0);
    expect(args()).toContain(`body=${marker(1001)}`);
  });
});

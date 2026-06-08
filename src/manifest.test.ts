import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Mock child_process
// ---------------------------------------------------------------------------
//
// `repoKey` shells out to `git` via `execFileSync`. We mock the whole module
// (keeping every other export real) so individual tests can decide what git
// reports: route to the real binary for the worktree-stability integration
// test, or simulate failure / a custom remote URL for the fallback paths.

const actualChildProcess =
  await vi.importActual<typeof import('child_process')>('child_process');
const realExecFileSync = actualChildProcess.execFileSync;

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execFileSync: vi.fn() };
});

const { execFileSync } = await import('child_process');
const { repoKey, resolveArtifactsRoot, templateArtifactsPrefix } = await import(
  './manifest.js'
);

// Run a real git command for fixture setup, bypassing the mock entirely.
function git(args: string[], cwd: string): void {
  realExecFileSync('git', args, { cwd, stdio: 'ignore' });
}

// Route the mocked `execFileSync` so real `git` invocations hit the binary.
function passGitThrough(): void {
  vi.mocked(execFileSync).mockImplementation(
    ((command: string, args: readonly string[] | undefined, options: unknown) => {
      if (command === 'git') {
        return realExecFileSync(
          command,
          args as string[] | undefined,
          options as Parameters<typeof realExecFileSync>[2],
        );
      }
      return Buffer.from('');
    }) as never,
  );
}

describe('repoKey', () => {
  const tmpDirs: string[] = [];

  function makeTmpDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(execFileSync).mockReset();
    while (tmpDirs.length > 0) {
      const dir = tmpDirs.pop()!;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves the same key from the main checkout and a linked worktree', () => {
    passGitThrough();

    const parent = makeTmpDir('smithy-manifest-wt-');
    const mainDir = path.join(parent, 'mainrepo');
    const wtDir = path.join(parent, 'wt');
    fs.mkdirSync(mainDir);

    git(['init', '-q'], mainDir);
    git(['config', 'user.email', 'test@example.com'], mainDir);
    git(['config', 'user.name', 'Test'], mainDir);
    git(['config', 'commit.gpgsign', 'false'], mainDir);
    fs.writeFileSync(path.join(mainDir, 'file.txt'), 'hello\n');
    git(['add', '.'], mainDir);
    git(['commit', '-q', '-m', 'init'], mainDir);
    // Linked worktree — its `--git-common-dir` points back at mainDir/.git.
    git(['worktree', 'add', '-q', wtDir], mainDir);

    const fromMain = repoKey(mainDir);
    const fromWorktree = repoKey(wtDir);

    // Worktree-stable: both checkouts resolve to the repo's own folder name,
    // never the worktree folder (`wt`).
    expect(fromMain).toBe(fromWorktree);
    expect(fromMain).toBe('mainrepo');
    expect(fromWorktree).not.toBe('wt');
  });

  it('falls back to basename(targetDir) for a non-git directory', () => {
    // No git repo here, so `git rev-parse` exits non-zero → fall through.
    vi.mocked(execFileSync).mockImplementation((() => {
      throw new Error('not a git repository');
    }) as never);

    expect(repoKey('/home/dev/projects/widget')).toBe('widget');
  });

  it('falls back to the origin remote basename when there is no common dir', () => {
    vi.mocked(execFileSync).mockImplementation(
      ((_command: string, args: readonly string[] | undefined) => {
        const argv = (args ?? []) as string[];
        if (argv.includes('--git-common-dir')) {
          throw new Error('not a git repository');
        }
        if (argv.includes('remote.origin.url')) {
          return 'https://github.com/acme/my-repo.git';
        }
        return '';
      }) as never,
    );

    expect(repoKey('/tmp/whatever')).toBe('my-repo');
  });

  it('sanitizes the key to a single filesystem-safe segment', () => {
    vi.mocked(execFileSync).mockImplementation((() => {
      throw new Error('not a git repository');
    }) as never);

    const key = repoKey('/home/dev/weird name@!');

    expect(key).not.toContain('/');
    expect(key).not.toContain('\\');
    expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe('resolveArtifactsRoot', () => {
  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue('/fake/home');
    // Non-git target → repoKey resolves to basename.
    vi.mocked(execFileSync).mockImplementation((() => {
      throw new Error('not a git repository');
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(execFileSync).mockReset();
  });

  it('returns the repo-keyed external root under ~/.smithy/repos/', () => {
    expect(resolveArtifactsRoot('/work/widget', 'external')).toBe(
      path.join('/fake/home', '.smithy', 'repos', 'widget'),
    );
  });

  it('returns targetDir unchanged for repo mode', () => {
    expect(resolveArtifactsRoot('/work/widget', 'repo')).toBe('/work/widget');
    expect(resolveArtifactsRoot('/work/widget')).toBe('/work/widget');
  });
});

describe('templateArtifactsPrefix', () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockImplementation((() => {
      throw new Error('not a git repository');
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(execFileSync).mockReset();
  });

  it('returns the repo-keyed tilde prefix for external mode', () => {
    expect(templateArtifactsPrefix('/work/widget', 'external')).toBe(
      '~/.smithy/repos/widget/',
    );
  });

  it('returns an empty prefix for repo mode', () => {
    expect(templateArtifactsPrefix('/work/widget', 'repo')).toBe('');
    expect(templateArtifactsPrefix('/work/widget')).toBe('');
  });

  it('renders identical prefixes from the main checkout and a worktree (display matches storage)', () => {
    passGitThrough();

    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-manifest-px-'));
    try {
      const mainDir = path.join(parent, 'mainrepo');
      const wtDir = path.join(parent, 'wt');
      fs.mkdirSync(mainDir);
      git(['init', '-q'], mainDir);
      git(['config', 'user.email', 'test@example.com'], mainDir);
      git(['config', 'user.name', 'Test'], mainDir);
      git(['config', 'commit.gpgsign', 'false'], mainDir);
      fs.writeFileSync(path.join(mainDir, 'file.txt'), 'hello\n');
      git(['add', '.'], mainDir);
      git(['commit', '-q', '-m', 'init'], mainDir);
      git(['worktree', 'add', '-q', wtDir], mainDir);

      expect(templateArtifactsPrefix(wtDir, 'external')).toBe(
        templateArtifactsPrefix(mainDir, 'external'),
      );
      expect(templateArtifactsPrefix(mainDir, 'external')).toBe(
        '~/.smithy/repos/mainrepo/',
      );
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});

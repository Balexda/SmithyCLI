import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { ensureArtifactStore } from './artifact-store.js';

/** Read the store's commit subjects, newest first. */
function gitLog(root: string): string[] {
  return execFileSync('git', ['log', '--format=%s'], {
    cwd: root,
    encoding: 'utf-8',
  })
    .trim()
    .split('\n')
    .filter((l) => l.length > 0);
}

describe('ensureArtifactStore', () => {
  let workdir: string;
  let fakeHome: string;

  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-store-work-'));
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-store-home-'));
    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(workdir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it('does nothing in repo mode', () => {
    expect(ensureArtifactStore(workdir, 'repo')).toBeNull();
    expect(fs.existsSync(path.join(fakeHome, '.smithy'))).toBe(false);
  });

  it('creates the store as a git repository with a seeded initial commit', () => {
    const result = ensureArtifactStore(workdir, 'external');

    expect(result).not.toBeNull();
    expect(result!.warning).toBeUndefined();
    expect(result!.createdDir).toBe(true);
    expect(result!.gitInitialized).toBe(true);
    expect(fs.existsSync(path.join(result!.root, '.git'))).toBe(true);
    expect(gitLog(result!.root)).toEqual(['smithy: initialize artifact store']);

    // The README explains what the directory is and how to attach a remote —
    // this store shows up in someone's home directory unannounced.
    const readme = fs.readFileSync(path.join(result!.root, 'README.md'), 'utf8');
    expect(readme).toContain('Smithy artifact store');
    expect(readme).toContain('remote add origin');
  });

  it('lands in projects/default outside a repo and repos/<key> inside one', () => {
    const loose = ensureArtifactStore(workdir, 'external');
    expect(loose!.root).toBe(
      path.join(fakeHome, '.smithy', 'projects', 'default'),
    );

    const repoDir = path.join(workdir, 'widget');
    fs.mkdirSync(repoDir);
    execFileSync('git', ['init', '-q'], { cwd: repoDir, stdio: 'ignore' });
    const keyed = ensureArtifactStore(repoDir, 'external');
    expect(keyed!.root).toBe(
      path.join(fakeHome, '.smithy', 'repos', 'widget'),
    );
  });

  it('is a no-op on re-run and never rewrites history', () => {
    const first = ensureArtifactStore(workdir, 'external');
    const root = first!.root;
    const headBefore = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf-8',
    }).trim();

    // A user artifact written between runs must survive untouched — `update`
    // is routine and must not commit, stash, or clobber work in progress.
    fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'specs', 'wip.spec.md'), '# WIP\n');

    const second = ensureArtifactStore(workdir, 'external');
    expect(second!.gitInitialized).toBe(false);
    expect(second!.createdDir).toBe(false);
    expect(second!.warning).toBeUndefined();
    expect(
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf-8' }).trim(),
    ).toBe(headBefore);
    expect(gitLog(root)).toEqual(['smithy: initialize artifact store']);
    expect(fs.readFileSync(path.join(root, 'specs', 'wip.spec.md'), 'utf8')).toBe(
      '# WIP\n',
    );
  });

  it('commits with a fallback identity when the machine has none', () => {
    // Point git at empty global/system config so no `user.email` resolves.
    // Without the fallback the very first commit fails and the store is left
    // historyless on exactly the machines least likely to notice.
    vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
    vi.stubEnv('GIT_CONFIG_SYSTEM', '/dev/null');
    try {
      const result = ensureArtifactStore(workdir, 'external');
      expect(result!.warning).toBeUndefined();
      expect(result!.gitInitialized).toBe(true);

      const author = execFileSync('git', ['log', '-1', '--format=%an <%ae>'], {
        cwd: result!.root,
        encoding: 'utf-8',
      }).trim();
      expect(author).toBe('Smithy CLI <smithy@localhost>');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses the user's own git identity when one is configured", () => {
    // These are the user's commits, not Smithy's — inheriting their identity
    // keeps `git log` in the store readable alongside their other work.
    vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
    vi.stubEnv('GIT_CONFIG_SYSTEM', '/dev/null');
    vi.stubEnv('GIT_AUTHOR_NAME', 'Ada');
    vi.stubEnv('GIT_AUTHOR_EMAIL', 'ada@example.com');
    vi.stubEnv('GIT_COMMITTER_NAME', 'Ada');
    vi.stubEnv('GIT_COMMITTER_EMAIL', 'ada@example.com');
    try {
      const result = ensureArtifactStore(workdir, 'external');
      const author = execFileSync('git', ['log', '-1', '--format=%an <%ae>'], {
        cwd: result!.root,
        encoding: 'utf-8',
      }).trim();
      expect(author).toBe('Ada <ada@example.com>');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('still creates the directory, with a warning, when git is unavailable', () => {
    // Empty PATH → `git` cannot be spawned. The install must survive: only
    // the history is lost, not the ability to write artifacts.
    vi.stubEnv('PATH', '');
    try {
      const result = ensureArtifactStore(workdir, 'external');
      expect(result!.gitInitialized).toBe(false);
      expect(result!.warning).toBeDefined();
      expect(fs.existsSync(result!.root)).toBe(true);
      expect(fs.existsSync(path.join(result!.root, '.git'))).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

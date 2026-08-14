import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The user-level engraved store holds knowledge the *user* authored, in a
 * directory Smithy also manages other things in. `~/.smithy/` is the home of
 * `smithy-manifest.json` and `templates/`, and every path listed in the
 * manifest's `files` array is deployed by `init` / `update` and **deleted** by
 * `uninit`. Nothing the user wrote may ever take that path.
 *
 * These tests drive the real CLI end to end against a throwaway `HOME`,
 * because the guarantee is about what the whole install/uninstall lifecycle
 * does, not about what one function intends to do.
 */

const CLI = path.resolve('dist/cli.js');

interface ManifestShape {
  files: Record<string, string[]>;
}

describe('user-level engraved store isolation', () => {
  let repoDir: string;
  let fakeHome: string;

  const run = (args: string[]): string =>
    execFileSync('node', [CLI, ...args], {
      encoding: 'utf-8',
      cwd: repoDir,
      env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
    });

  const engravedRoot = (): string => path.join(fakeHome, '.smithy', 'engraved');

  beforeEach(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-engraved-repo-'));
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-engraved-fakehome-'));
  });

  afterEach(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  /** Author a global record the way `smithy.engrave --level user` would. */
  function seedUserRecord(): string {
    const file = path.join(engravedRoot(), 'decisions', 'compute.decision.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      `---\nid: U-D-1\nkind: decision\ndomain: system\ntitle: "Compute, do not prompt"\nstatus: accepted\ndecided_at: 2026-01-01\n---\n# Compute, do not prompt\n`,
    );
    return file;
  }

  it('init creates the store and never lists it in the manifest', () => {
    run(['init', '-y']);

    expect(fs.existsSync(engravedRoot())).toBe(true);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(repoDir, '.smithy', 'smithy-manifest.json'), 'utf8'),
    ) as ManifestShape;
    const files = Object.values(manifest.files).flat();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(file).not.toContain('engraved');
    }
  });

  it('uninit leaves user-authored records untouched', () => {
    run(['init', '-y']);
    const record = seedUserRecord();

    run(['uninit', '-y']);

    // The deployed artifacts are gone (uninit removes the files it deployed,
    // leaving the now-empty directories behind)...
    expect(fs.existsSync(path.join(repoDir, '.claude', 'commands', 'smithy.engrave.md'))).toBe(
      false,
    );
    // ...and the user's own knowledge is not.
    expect(fs.existsSync(record)).toBe(true);
    expect(fs.readFileSync(record, 'utf8')).toContain('U-D-1');
  });

  it('a user-location uninit leaves the store alone too', () => {
    // The dangerous case: with `--location user`, the manifest itself lives in
    // `~/.smithy/` and removal is rooted at the home directory.
    run(['init', '-y', '-l', 'user']);
    const record = seedUserRecord();

    run(['uninit', '-y']);

    expect(fs.existsSync(record)).toBe(true);
  });

  it('update re-deploys without touching the store', () => {
    run(['init', '-y']);
    const record = seedUserRecord();

    run(['update', '-y']);

    expect(fs.existsSync(record)).toBe(true);
    expect(fs.readFileSync(record, 'utf8')).toContain('Compute, do not prompt');
  });
});

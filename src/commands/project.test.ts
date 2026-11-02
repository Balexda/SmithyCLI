import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { projectInitAction, projectLinkAction, projectListAction } from './project.js';
import { listProjectSlugs } from '../engraved/roots.js';

describe('smithy project', () => {
  let fakeHome: string;
  let scratch: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  const projectsDir = () => path.join(fakeHome, '.smithy', 'projects');
  const logged = () => logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-project-home-'));
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-project-scratch-'));
    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
    vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
    vi.stubEnv('GIT_CONFIG_SYSTEM', '/dev/null');
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.exitCode = undefined;
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('init creates a git-backed store that discovery and status see', () => {
    projectInitAction('pedregal');
    const root = path.join(projectsDir(), 'pedregal');
    expect(fs.existsSync(path.join(root, '.git'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8')).toContain('smithy project init');
    expect(listProjectSlugs()).toEqual(['pedregal']);
    expect(logged()).toContain('git repository initialized');
    expect(process.exitCode).toBeUndefined();

    // Re-running is a no-op that reports the store as already there.
    logSpy.mockClear();
    projectInitAction('pedregal');
    expect(logged()).toContain('already exists');
    const log = execFileSync('git', ['log', '--format=%s'], { cwd: root, encoding: 'utf-8' });
    expect(log.trim().split('\n')).toHaveLength(1);
  });

  it('init refuses the reserved default slug and path-shaped slugs', () => {
    projectInitAction('default');
    expect(process.exitCode).toBe(2);
    expect(String(errSpy.mock.calls[0]![0])).toContain("'default'");
    for (const bad of ['../elsewhere', 'all', '.git']) {
      process.exitCode = undefined;
      projectInitAction(bad);
      expect(process.exitCode, bad).toBe(2);
    }
    expect(fs.existsSync(projectsDir())).toBe(false);
  });

  it('init on an already-linked slug leaves the user\'s checkout alone', () => {
    const coord = path.join(scratch, 'coord');
    fs.mkdirSync(path.join(coord, 'planning'), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: coord, stdio: 'ignore' });
    projectLinkAction('coord', path.join(coord, 'planning'));
    logSpy.mockClear();

    projectInitAction('coord');
    expect(process.exitCode).toBeUndefined();
    expect(logged()).toContain('already linked');
    // No nested repository inside the linked worktree.
    expect(fs.existsSync(path.join(coord, 'planning', '.git'))).toBe(false);
  });

  it('init on a dangling link fails loudly instead of reporting the store ready', () => {
    fs.mkdirSync(projectsDir(), { recursive: true });
    fs.symlinkSync(path.join(scratch, 'gone'), path.join(projectsDir(), 'dang'), 'dir');
    projectInitAction('dang');
    expect(process.exitCode).toBe(2);
    expect(String(errSpy.mock.calls[0]![0])).toContain('does not exist');
    expect(logged()).not.toContain('Project store ready');
  });

  it('link never commits what is already in a non-empty plain directory', () => {
    const plain = path.join(scratch, 'plain');
    fs.mkdirSync(plain);
    fs.writeFileSync(path.join(plain, 'creds.env'), 'secret=1\n');
    projectLinkAction('plain', plain);
    expect(process.exitCode).toBeUndefined();
    // Linked, but left unversioned with a warning — the user's files were
    // not swept into a Smithy commit.
    expect(fs.lstatSync(path.join(projectsDir(), 'plain')).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(plain, '.git'))).toBe(false);
    expect(logged()).toContain('left unversioned');
  });

  it('link refuses the home directory, the filesystem root, and anything in or above ~/.smithy', () => {
    fs.mkdirSync(projectsDir(), { recursive: true });
    for (const target of [fakeHome, path.join(fakeHome, '.smithy'), projectsDir(), path.parse(fakeHome).root]) {
      process.exitCode = undefined;
      errSpy.mockClear();
      projectLinkAction('loop', target);
      expect(process.exitCode, target).toBe(2);
      expect(String(errSpy.mock.calls[0]![0]), target).toMatch(/home directory|contains ~\/.smithy\/projects|inside ~\/.smithy/);
      expect(fs.existsSync(path.join(projectsDir(), 'loop')), target).toBe(false);
    }
    // Nothing under ~/.smithy/ was turned into a repository.
    expect(fs.existsSync(path.join(projectsDir(), '.git'))).toBe(false);
    expect(fs.existsSync(path.join(fakeHome, '.smithy', '.git'))).toBe(false);
  });

  it('link points the store at an existing directory and rides its enclosing repository', () => {
    // A coord worktree: already a git repository, with the project's
    // artifacts to live in a subdirectory of it.
    const coord = path.join(scratch, 'coord');
    fs.mkdirSync(path.join(coord, 'planning'), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: coord, stdio: 'ignore' });

    projectLinkAction('007', path.join(coord, 'planning'));
    expect(process.exitCode).toBeUndefined();
    const link = path.join(projectsDir(), '007');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(link)).toBe(fs.realpathSync(path.join(coord, 'planning')));
    // No nested repository was created inside the coord checkout.
    expect(fs.existsSync(path.join(coord, 'planning', '.git'))).toBe(false);
    expect(listProjectSlugs()).toEqual(['007']);
    expect(logged()).toContain('Linked project store');
  });

  it('link initializes a repository when the target is a plain directory', () => {
    const plain = path.join(scratch, 'plain');
    fs.mkdirSync(plain);
    projectLinkAction('plain', plain);
    expect(fs.existsSync(path.join(plain, '.git'))).toBe(true);
    expect(logged()).toContain('git repository initialized at the link target');
  });

  it('link refuses a missing target and an occupied slug', () => {
    projectLinkAction('x', path.join(scratch, 'nope'));
    expect(process.exitCode).toBe(2);
    expect(String(errSpy.mock.calls[0]![0])).toContain('does not exist');

    process.exitCode = undefined;
    projectInitAction('taken');
    projectLinkAction('taken', scratch);
    expect(process.exitCode).toBe(2);
    expect(String(errSpy.mock.calls.at(-1)![0])).toContain('already exists');
  });

  it('list reports stores and link targets in both formats', () => {
    projectListAction();
    expect(logged()).toContain('No named project stores');

    logSpy.mockClear();
    projectInitAction('alpha');
    const target = path.join(scratch, 'beta-home');
    fs.mkdirSync(target);
    projectLinkAction('beta', target);
    logSpy.mockClear();

    projectListAction({ format: 'json' });
    const payload = JSON.parse(logged()) as { projects: Array<Record<string, unknown>> };
    expect(payload.projects.map((p) => p.slug)).toEqual(['alpha', 'beta']);
    expect(payload.projects[0]!.link_target).toBeNull();
    expect(payload.projects[1]!.link_target).toBe(fs.realpathSync(target));

    logSpy.mockClear();
    projectListAction();
    expect(logged()).toMatch(/alpha\t~\/.smithy\/projects\/alpha/);
    expect(logged()).toMatch(/beta\t~\/.smithy\/projects\/beta -> /);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  ArtifactRootError,
  projectContaining,
  projectDeclaredBy,
  resolveArtifactRoot,
} from './project-store.js';
import { rootAction } from './commands/root.js';

describe('resolveArtifactRoot', () => {
  let workdir: string;
  let fakeHome: string;

  const projectsDir = () => path.join(fakeHome, '.smithy', 'projects');
  const makeStore = (slug: string) =>
    fs.mkdirSync(path.join(projectsDir(), slug), { recursive: true });

  function writeManifest(artifactsLocation?: 'repo' | 'external'): void {
    const manifestPath = path.join(workdir, '.smithy', 'smithy-manifest.json');
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        smithyVersion: '0.0.0-test',
        deployLocation: 'repo',
        agents: ['claude'],
        permissions: false,
        ...(artifactsLocation === 'external' ? { artifactsLocation } : {}),
        files: { claude: [] },
      }),
    );
  }

  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-root-work-'));
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-root-home-'));
    execFileSync('git', ['init', '-q'], { cwd: workdir, stdio: 'ignore' });
    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(workdir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it('rule 4: with no project anywhere, the install root wins and the prefix matches the rendered one', () => {
    const inRepo = resolveArtifactRoot({ targetDir: workdir });
    expect(inRepo).toMatchObject({
      prefix: '',
      rendered_prefix: '',
      path: workdir,
      kind: 'in-repo',
      store: false,
      rule: 4,
      project: null,
      mode: 'read',
    });
    expect(inRepo.warning).toBeUndefined();

    writeManifest('external');
    const external = resolveArtifactRoot({ targetDir: workdir, mode: 'write' });
    const key = path.basename(workdir);
    expect(external).toMatchObject({
      prefix: `~/.smithy/repos/${key}/`,
      rendered_prefix: `~/.smithy/repos/${key}/`,
      path: path.join(fakeHome, '.smithy', 'repos', key),
      kind: 'repo-store',
      store: true,
      rule: 4,
      project: null,
    });
  });

  it('rule 1: an explicit --project resolves to that store regardless of the install root', () => {
    makeStore('pedregal');
    makeStore('web-next');
    writeManifest('external');
    const r = resolveArtifactRoot({ targetDir: workdir, project: 'pedregal', mode: 'write' });
    expect(r).toMatchObject({
      prefix: '~/.smithy/projects/pedregal/',
      rendered_prefix: `~/.smithy/repos/${path.basename(workdir)}/`,
      path: path.join(projectsDir(), 'pedregal'),
      kind: 'project',
      store: true,
      rule: 1,
      project: 'pedregal',
    });
  });

  it('rule 1: a project with no store on disk is an error, not a fall-through', () => {
    expect(() => resolveArtifactRoot({ targetDir: workdir, project: 'ghost' })).toThrow(
      ArtifactRootError,
    );
    expect(() => resolveArtifactRoot({ targetDir: workdir, project: 'ghost' })).toThrow(
      /smithy project init ghost/,
    );
    // The reserved shared store and path-shaped slugs are refused outright.
    expect(() => resolveArtifactRoot({ targetDir: workdir, project: 'default' })).toThrow(
      /invalid project slug/,
    );
    expect(() => resolveArtifactRoot({ targetDir: workdir, project: '../repos/x' })).toThrow(
      /invalid project slug/,
    );
  });

  it('rule 2: the artifact being worked on names the project through its header', () => {
    makeStore('pedregal');
    makeStore('web-next');
    const spec = path.join(workdir, 'some.spec.md');
    fs.writeFileSync(
      spec,
      '# Feature Specification: X\n\n**Created**: 2026-11-01\n**Status**: Draft\n**Project**: `pedregal`\n',
    );
    const r = resolveArtifactRoot({ targetDir: workdir, from: spec, mode: 'write' });
    expect(r.rule).toBe(2);
    expect(r.project).toBe('pedregal');
    expect(r.prefix).toBe('~/.smithy/projects/pedregal/');
  });

  it('rule 2: frontmatter is the second spelling, and the header wins when both appear', () => {
    makeStore('alpha');
    makeStore('beta');
    const fm = path.join(workdir, 'fm.md');
    fs.writeFileSync(fm, '---\nproject: alpha\n---\n# Record\n');
    expect(projectDeclaredBy(fm)).toBe('alpha');

    const both = path.join(workdir, 'both.md');
    fs.writeFileSync(both, '---\nproject: alpha\n---\n# Record\n\n**Project**: `beta`\n');
    expect(projectDeclaredBy(both)).toBe('beta');
  });

  it('rule 2: an artifact physically inside a named store resolves that store without a header', () => {
    makeStore('pedregal');
    makeStore('web-next');
    const tasks = path.join(projectsDir(), 'pedregal', 'specs', 'x', '01-y.tasks.md');
    fs.mkdirSync(path.dirname(tasks), { recursive: true });
    fs.writeFileSync(tasks, '# Tasks\n');
    expect(projectContaining(tasks)).toBe('pedregal');
    // Forge standing in a code worktree hands over an absolute tasks path;
    // the working directory plays no part.
    const r = resolveArtifactRoot({ targetDir: workdir, from: tasks, mode: 'write' });
    expect(r).toMatchObject({ rule: 2, project: 'pedregal' });
    // The tilde spelling the prompts use resolves the same way.
    const tilde = `~/.smithy/projects/pedregal/specs/x/01-y.tasks.md`;
    expect(resolveArtifactRoot({ targetDir: workdir, from: tilde }).project).toBe('pedregal');
  });

  it('rule 2: an artifact in the shared default store names no project', () => {
    const f = path.join(projectsDir(), 'default', 'specs', 'a.spec.md');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '# Spec\n');
    expect(projectContaining(f)).toBeNull();
    expect(resolveArtifactRoot({ targetDir: workdir, from: f }).rule).toBe(4);
  });

  it('rule 2: an unreadable --from path is an error', () => {
    expect(() =>
      resolveArtifactRoot({ targetDir: workdir, from: path.join(workdir, 'missing.md') }),
    ).toThrow(/cannot read --from path/);
  });

  it('rule 3: a read takes the single named store; a write never does', () => {
    makeStore('pedregal');
    // `default` is the shared store, not a named project.
    makeStore('default');

    const read = resolveArtifactRoot({ targetDir: workdir });
    expect(read).toMatchObject({ rule: 3, project: 'pedregal', prefix: '~/.smithy/projects/pedregal/' });

    const write = resolveArtifactRoot({ targetDir: workdir, mode: 'write' });
    expect(write).toMatchObject({ rule: 4, project: null, prefix: '' });
    expect(write.warning).toContain('pedregal');
    expect(write.warning).toContain('--project <slug>');
  });

  it('rule 3: several named stores never resolve by themselves, in either mode', () => {
    makeStore('pedregal');
    makeStore('web-next');
    expect(resolveArtifactRoot({ targetDir: workdir })).toMatchObject({ rule: 4, project: null });
    const write = resolveArtifactRoot({ targetDir: workdir, mode: 'write' });
    expect(write.rule).toBe(4);
    expect(write.warning).toMatch(/2 named project stores exist/);
  });

  it('follows a linked project store', () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-root-coord-'));
    try {
      fs.mkdirSync(projectsDir(), { recursive: true });
      fs.symlinkSync(target, path.join(projectsDir(), 'coord'), 'dir');
      const r = resolveArtifactRoot({ targetDir: workdir, project: 'coord' });
      expect(r.prefix).toBe('~/.smithy/projects/coord/');
      // A file reached through the link's real path still names the project.
      const inside = path.join(target, 'specs', 'z.spec.md');
      fs.mkdirSync(path.dirname(inside), { recursive: true });
      fs.writeFileSync(inside, '# Z\n');
      expect(projectContaining(inside)).toBe('coord');
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });
});

describe('rootAction', () => {
  let workdir: string;
  let fakeHome: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-rootcmd-work-'));
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-rootcmd-home-'));
    execFileSync('git', ['init', '-q'], { cwd: workdir, stdio: 'ignore' });
    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    fs.rmSync(workdir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it('prints the machine shape with both prefixes', () => {
    fs.mkdirSync(path.join(fakeHome, '.smithy', 'projects', 'pedregal'), { recursive: true });
    rootAction({ targetDir: workdir, project: 'pedregal', write: true, format: 'json' });
    const payload = JSON.parse(logSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      prefix: '~/.smithy/projects/pedregal/',
      rendered_prefix: '',
      kind: 'project',
      store: true,
      rule: 1,
      project: 'pedregal',
      mode: 'write',
    });
    expect(process.exitCode).toBeUndefined();
  });

  it('leads the text form with the prefix alone, spelling the repo as "."', () => {
    rootAction({ targetDir: workdir });
    const text = logSpy.mock.calls[0]![0] as string;
    expect(text.split('\n')[0]).toBe('.');
    expect(text).toContain('rule:     4');
  });

  it('exits 2 with the CLI message on a missing store', () => {
    rootAction({ targetDir: workdir, project: 'ghost' });
    expect(process.exitCode).toBe(2);
    expect(String(errSpy.mock.calls[0]![0])).toContain("no project store named 'ghost'");
  });
});

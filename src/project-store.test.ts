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
import { writeManifest as writeSmithyManifest } from './manifest.js';
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
    // `all` is the status fleet keyword; a leading dot would make the store
    // directory read as something else (`.git`).
    for (const reserved of ['all', '.git', '.hidden']) {
      expect(() => resolveArtifactRoot({ targetDir: workdir, project: reserved }), reserved).toThrow(
        /invalid project slug/,
      );
    }
  });

  it('rule 2: a spec folder resolves like the single spec inside it', () => {
    makeStore('pedregal');
    makeStore('web-next');
    // Cut's primary input is the folder, and `smithy status` suggests it.
    const folder = path.join(workdir, 'specs', '2026-11-01-007-persona');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'persona.spec.md'),
      '# Feature Specification: P\n\n**Status**: Draft\n**Project**: `pedregal`\n',
    );
    fs.writeFileSync(path.join(folder, 'persona.data-model.md'), '# Data Model\n');
    expect(resolveArtifactRoot({ targetDir: workdir, from: folder, mode: 'write' })).toMatchObject({
      rule: 2,
      project: 'pedregal',
    });

    // A folder inside a named store resolves by location when the spec says nothing.
    const stored = path.join(projectsDir(), 'web-next', 'specs', 'x');
    fs.mkdirSync(stored, { recursive: true });
    fs.writeFileSync(path.join(stored, 'x.spec.md'), '# X\n');
    expect(resolveArtifactRoot({ targetDir: workdir, from: stored }).project).toBe('web-next');

    // A folder at the install root with no declaration anchors the run there.
    const plain = path.join(workdir, 'specs', 'plain');
    fs.mkdirSync(plain, { recursive: true });
    expect(resolveArtifactRoot({ targetDir: workdir, from: plain }).rule).toBe(4);
  });

  it('rule 3 never overrides where a --from artifact actually lives', () => {
    makeStore('solo');
    const spec = path.join(workdir, 'in-repo.spec.md');
    fs.writeFileSync(spec, '# Spec\n\n**Status**: Draft\n');
    // A read anchored on an in-repo artifact stays at the install root even
    // though exactly one named store exists; audit/orders on a legacy spec
    // must not be told the run belongs to `solo`.
    const r = resolveArtifactRoot({ targetDir: workdir, from: spec });
    expect(r).toMatchObject({ rule: 4, project: null, recall_project: null });
    // Unanchored, the same read takes the lone store (rule 3).
    expect(resolveArtifactRoot({ targetDir: workdir })).toMatchObject({ rule: 3, project: 'solo' });
  });

  it('recall_project carries the read-mode answer alongside a write that refused to guess', () => {
    makeStore('solo');
    const write = resolveArtifactRoot({ targetDir: workdir, mode: 'write' });
    // The write lands at the install root (and warns), but engraved recall —
    // a read — may still consult the single named project's rules.
    expect(write).toMatchObject({ rule: 4, project: null, recall_project: 'solo' });
    expect(write.warning).toContain('solo');

    makeStore('duo');
    expect(resolveArtifactRoot({ targetDir: workdir, mode: 'write' }).recall_project).toBeNull();
    expect(
      resolveArtifactRoot({ targetDir: workdir, project: 'duo', mode: 'write' }).recall_project,
    ).toBe('duo');
  });

  it('rule 2: nested link targets resolve to the most specific store', () => {
    const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-root-outer-'));
    try {
      const inner = path.join(outer, 'sub');
      fs.mkdirSync(inner);
      fs.mkdirSync(projectsDir(), { recursive: true });
      fs.symlinkSync(outer, path.join(projectsDir(), 'a'), 'dir');
      fs.symlinkSync(inner, path.join(projectsDir(), 'b'), 'dir');
      const tasks = path.join(inner, 't.tasks.md');
      fs.writeFileSync(tasks, '# T\n');
      expect(projectContaining(tasks)).toBe('b');
      expect(projectContaining(path.join(outer, 'o.spec.md'))).toBe('a');
    } finally {
      fs.rmSync(outer, { recursive: true, force: true });
    }
  });

  it('rendered_prefix is what the install rendered, read from its manifest', () => {
    // A user-level install run from `~/Projects` baked `~/.smithy/repos/Projects/`
    // into every prompt. Resolving from some other repo must report *that*
    // string — recomputing from the current repo would name a prefix the
    // prompts never contained, and the literal substitution would no-op.
    writeSmithyManifest({
      targetDir: workdir,
      location: 'user',
      agents: ['claude'],
      permissions: false,
      artifactsLocation: 'external',
      artifactsRoot: '~/.smithy/repos/Projects/',
      files: { claude: [] },
    });
    makeStore('alpha');
    const r = resolveArtifactRoot({ targetDir: workdir, project: 'alpha', mode: 'write' });
    expect(r.rendered_prefix).toBe('~/.smithy/repos/Projects/');
    expect(r.prefix).toBe('~/.smithy/projects/alpha/');
    // A write with no declaration lands on the install root, spelled as the
    // prompts spell it (a read would take the lone store under rule 3).
    const plain = resolveArtifactRoot({ targetDir: workdir, mode: 'write' });
    expect(plain).toMatchObject({
      prefix: '~/.smithy/repos/Projects/',
      path: path.join(fakeHome, '.smithy', 'repos', 'Projects'),
      kind: 'repo-store',
    });
  });

  it('finds a repo-level manifest from a subdirectory and anchors a legacy prefix at the toplevel', () => {
    writeManifest('external'); // legacy: no artifactsRoot recorded
    const sub = path.join(workdir, 'src', 'deep');
    fs.mkdirSync(sub, { recursive: true });
    const key = path.basename(workdir);
    const r = resolveArtifactRoot({ targetDir: sub });
    expect(r.rendered_prefix).toBe(`~/.smithy/repos/${key}/`);
    expect(r.kind).toBe('repo-store');

    // In-repo mode from a subdirectory anchors paths at the toplevel too.
    fs.rmSync(path.join(workdir, '.smithy'), { recursive: true, force: true });
    writeManifest();
    expect(resolveArtifactRoot({ targetDir: sub })).toMatchObject({ prefix: '', path: workdir, kind: 'in-repo' });
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

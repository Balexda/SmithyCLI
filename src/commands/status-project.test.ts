import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { statusAction, type StatusJsonPayload } from './status.js';

/**
 * `smithy status` against named project stores: `--project <slug>` scans one
 * store, `--project all` scans every one, and the discovery cascade appends
 * the single named store when exactly one exists.
 */
describe('statusAction --project (planning view)', () => {
  let workdir: string;
  let fakeHome: string;
  let cwdSpy: MockInstance<() => string>;
  let logSpy: MockInstance<(...args: unknown[]) => void>;

  const projectsDir = () => path.join(fakeHome, '.smithy', 'projects');

  function writeTasks(root: string, folder: string, project?: string): void {
    const dir = path.join(root, 'specs', folder);
    fs.mkdirSync(dir, { recursive: true });
    const header = project === undefined ? '' : `**Project**: \`${project}\`\n\n`;
    fs.writeFileSync(
      path.join(dir, '01-first.tasks.md'),
      `# US1 Tasks\n\n${header}## Slice 1: Only\n\n- [ ] One\n\n## Dependency Order\n\n| ID | Title | Depends On | Artifact |\n|----|-------|------------|----------|\n| S1 | Only | — | — |\n`,
    );
  }

  function payload(): StatusJsonPayload {
    return JSON.parse(logSpy.mock.calls.map((c) => c.join(' ')).join('\n')) as StatusJsonPayload;
  }

  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-status-project-work-'));
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-status-project-home-'));
    execFileSync('git', ['init', '-q'], { cwd: workdir, stdio: 'ignore' });
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workdir);
    vi.stubEnv('HOME', fakeHome);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    vi.unstubAllEnvs();
    logSpy.mockRestore();
    process.exitCode = undefined;
    fs.rmSync(workdir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it('--project <slug> scans exactly that store, in its tilde form, tagging every record', () => {
    writeTasks(workdir, 'in-repo');
    writeTasks(path.join(projectsDir(), 'pedregal'), 'spec-007', 'pedregal');
    writeTasks(path.join(projectsDir(), 'web-next'), 'spec-003');

    statusAction({ format: 'json', project: 'pedregal' });
    const p = payload();
    expect(p.scan_root).toBe('~/.smithy/projects/pedregal/');
    expect(p.records.map((r) => r.path)).toEqual([
      '~/.smithy/projects/pedregal/specs/spec-007/01-first.tasks.md',
    ]);
    expect(p.records[0]!.project).toBe('pedregal');
  });

  it('--project all concatenates every named store and labels each record', () => {
    writeTasks(path.join(projectsDir(), 'pedregal'), 'spec-007', 'pedregal');
    writeTasks(path.join(projectsDir(), 'web-next'), 'spec-003');
    // The shared default store is not a named project and is left out.
    writeTasks(path.join(projectsDir(), 'default'), 'loose');

    statusAction({ format: 'json', project: 'all' });
    const p = payload();
    expect(p.scan_root).toBe('~/.smithy/projects/');
    expect(p.records.map((r) => [r.project, r.path])).toEqual([
      ['pedregal', '~/.smithy/projects/pedregal/specs/spec-007/01-first.tasks.md'],
      ['web-next', '~/.smithy/projects/web-next/specs/spec-003/01-first.tasks.md'],
    ]);
    expect(p.summary.counts.tasks['not-started']).toBe(2);
  });

  it('the cascade appends the one named store after the repo, and only when it is alone', () => {
    writeTasks(path.join(projectsDir(), 'pedregal'), 'spec-007', 'pedregal');

    // An empty repo falls through to the lone named store.
    statusAction({ format: 'json' });
    expect(payload().scan_root).toBe('~/.smithy/projects/pedregal/');

    // A repo with artifacts of its own still shows them first.
    logSpy.mockClear();
    writeTasks(workdir, 'in-repo');
    statusAction({ format: 'json' });
    expect(payload().records[0]!.path).toBe('specs/in-repo/01-first.tasks.md');

    // Two named stores: no guessing — the empty repo reports nothing.
    logSpy.mockClear();
    fs.rmSync(path.join(workdir, 'specs'), { recursive: true, force: true });
    writeTasks(path.join(projectsDir(), 'web-next'), 'spec-003');
    statusAction({ format: 'json' });
    expect(payload().records).toEqual([]);
  });

  it('the header is reported as `project` on records found at any root', () => {
    writeTasks(workdir, 'stamped', 'pedregal');
    statusAction({ format: 'json', root: workdir });
    expect(payload().records[0]!.project).toBe('pedregal');
  });

  it('rejects a store that does not exist, the reserved slug, and all under --engraved', () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      statusAction({ format: 'json', project: 'ghost' });
      expect(process.exitCode).toBe(2);
      expect(String(errSpy.mock.calls.at(-1)![0])).toContain("no project store named 'ghost'");

      process.exitCode = undefined;
      statusAction({ format: 'json', project: 'default' });
      expect(process.exitCode).toBe(2);
      expect(String(errSpy.mock.calls.at(-1)![0])).toContain("not 'default'");

      process.exitCode = undefined;
      statusAction({ engraved: true, project: 'all' });
      expect(process.exitCode).toBe(2);
      expect(String(errSpy.mock.calls.at(-1)![0])).toContain('planning-view option');
    } finally {
      errSpy.mockRestore();
    }
  });
});

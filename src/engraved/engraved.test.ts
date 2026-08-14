import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  hasStatusDrift,
  levelFromId,
  listProjectSlugs,
  parseLedger,
  renderEngraved,
  resolveEngravedRoots,
  resolveProject,
  scanEngraved,
  serializeEngravedForJson,
  userEngravedRoot,
} from './index.js';
import { buildTheme } from '../status/theme.js';

const THEME = buildTheme({ noColor: true, ascii: true });

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function decision(id: string, title: string, extra = ''): string {
  return `---
id: ${id}
kind: decision
domain: system
title: "${title}"
status: accepted
decided_at: 2026-01-01
topics: [experiment-platform]
applies_to: [API]
supersedes: []
superseded_by: []
establishes: []
${extra}---
# ${title}
`;
}

function invariant(id: string, title: string, ledgerRows: string, status = 'aligned'): string {
  return `---
id: ${id}
kind: invariant
domain: system
title: "${title}"
status: ${status}
topics: [experiment-platform]
established_by: [D-1]
---
# ${title}

## Rule
One layer only.

## Rationale
Legacy nesting was unreadable.

## Known Exceptions

| Where | What diverges | Disposition + Why | Tracking Issue | Severity |
|-------|---------------|-------------------|----------------|----------|
${ledgerRows}

## Citations
D-1
`;
}

describe('engraved level roots', () => {
  let workdir: string;
  let fakeHome: string;

  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-engraved-work-'));
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-engraved-home-'));
    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(workdir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it('roots the user store at ~/.smithy itself', () => {
    // Record directories are siblings of `smithy-manifest.json` and
    // `templates/`, both of which `uninit` clears. Safety comes from nothing
    // ever listing a record in the manifest, not from a separate segment.
    expect(userEngravedRoot()).toBe(path.join(fakeHome, '.smithy'));
  });

  it('rides the artifacts root for the repo level so planning and knowledge stay together', () => {
    const inRepo = resolveEngravedRoots(workdir, { artifactsLocation: 'repo' });
    expect(inRepo.find((l) => l.level === 'repo')!.root).toBe(workdir);

    const external = resolveEngravedRoots(workdir, { artifactsLocation: 'external' });
    expect(external.find((l) => l.level === 'repo')!.root.startsWith(fakeHome)).toBe(true);
  });

  it('orders record directories deterministically: system kinds, then design kinds', () => {
    const user = resolveEngravedRoots(workdir)[0]!;
    expect(user.dirs.map((d) => d.relPath)).toEqual([
      'decisions',
      'invariants',
      'constitution',
      'design/decisions',
      'design/invariants',
      'design/constitution',
    ]);
  });

  it('gives only the repo level a docs/ segment', () => {
    // `docs/decisions/` is where in-repo records already live, so the repo
    // level keeps it; the two home-anchored stores sit records directly under
    // their own root.
    const levels = resolveEngravedRoots(workdir, { project: 'discount-engine' });
    const relPathsFor = (level: string): string[] =>
      levels.find((l) => l.level === level)!.dirs.map((d) => d.relPath);

    expect(relPathsFor('user')[0]).toBe('decisions');
    expect(relPathsFor('repo')[0]).toBe('docs/decisions');
    expect(relPathsFor('project')[0]).toBe('decisions');

    const project = levels.find((l) => l.level === 'project')!;
    expect(project.dirs[0]!.path).toBe(
      path.join(fakeHome, '.smithy', 'projects', 'discount-engine', 'decisions'),
    );
  });

  it('omits the project level entirely when no project resolves', () => {
    expect(resolveEngravedRoots(workdir).map((l) => l.level)).toEqual(['user', 'repo']);
  });

  it('resolves a lone named project store, and refuses to guess between several', () => {
    const projects = path.join(fakeHome, '.smithy', 'projects');
    fs.mkdirSync(path.join(projects, 'discount-engine'), { recursive: true });
    // `default` is the shared cross-repo store, not a named workstream.
    fs.mkdirSync(path.join(projects, 'default'), { recursive: true });
    expect(listProjectSlugs()).toEqual(['discount-engine']);
    expect(resolveProject()).toBe('discount-engine');

    fs.mkdirSync(path.join(projects, 'pedregal'), { recursive: true });
    expect(resolveProject()).toBeNull();
    // Guessing wrong here would plan a workstream against a sibling's rules,
    // which is worse than planning with no project level at all.
    expect(resolveProject('pedregal')).toBe('pedregal');
  });
});

describe('engraved id levels', () => {
  it('reads the level off the id prefix, defaulting to repo', () => {
    expect(levelFromId('U-D-1')).toBe('user');
    expect(levelFromId('U-INV-2')).toBe('user');
    expect(levelFromId('PJ-P-3')).toBe('project');
    expect(levelFromId('D-1')).toBe('repo');
    expect(levelFromId('INV-1')).toBe('repo');
  });
});

describe('Known-Exceptions ledger parsing', () => {
  it('treats the em-dash placeholder row as no exception coverage', () => {
    const summary = parseLedger(invariant('INV-1', 'x', '| — | — | — | — | — |'))!;
    expect(summary.rows).toHaveLength(0);
    expect(summary.derivedStatus).toBe('aligned');
    expect(summary.maxSeverity).toBeNull();
  });

  it('derives drifting from Temporary rows and carries the worst severity', () => {
    const summary = parseLedger(
      invariant(
        'INV-1',
        'x',
        [
          '| src/a | nests three deep | Temporary: pending migration | #412 | high |',
          '| src/b | uses the old shim | Accepted: vendor constraint | — | low |',
        ].join('\n'),
      ),
    )!;
    expect(summary.temporary).toBe(1);
    expect(summary.accepted).toBe(1);
    expect(summary.maxSeverity).toBe('high');
    expect(summary.derivedStatus).toBe('drifting');
    expect(summary.rows[0]!.trackingIssue).toBe('#412');
    expect(summary.rows[1]!.trackingIssue).toBeNull();
  });

  it('returns null when there is no ledger section at all', () => {
    expect(parseLedger('# Title\n\n## Rule\nOne layer.\n')).toBeNull();
  });
});

describe('scanEngraved', () => {
  let workdir: string;
  let fakeHome: string;

  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-engraved-scan-'));
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-engraved-scanhome-'));
    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(workdir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  /**
   * The driving case: two workstreams in one repo on incompatible value
   * topologies, sharing code paths. Only the partition separates them.
   */
  function seedDrivingCase(): void {
    write(
      path.join(fakeHome, '.smithy', 'decisions', 'compute.decision.md'),
      decision('U-D-1', 'Compute, do not prompt'),
    );
    write(
      path.join(workdir, 'docs', 'invariants', 'one-layer.invariant.md'),
      invariant('INV-1', 'Value hierarchies stay single-layer', '| — | — | — | — | — |'),
    );
    write(
      path.join(fakeHome, '.smithy', 'projects', 'discount-engine', 'decisions', 'three-layer.decision.md'),
      decision('PJ-D-1', 'Discount engine stays three-layer', 'excepts: [INV-1]\n'),
    );
  }

  it('reads all three levels and tags every record with the store it came from', () => {
    seedDrivingCase();
    const scan = scanEngraved(workdir, { project: 'discount-engine' });

    expect(scan.records.map((r) => [r.id, r.level])).toEqual([
      ['U-D-1', 'user'],
      ['INV-1', 'repo'],
      ['PJ-D-1', 'project'],
    ]);
    expect(scan.project).toBe('discount-engine');
    // Paths are store-relative so a reader knows which store to open.
    expect(scan.records[1]!.path).toBe('docs/invariants/one-layer.invariant.md');
  });

  it('carries the declared cross-level exception through', () => {
    seedDrivingCase();
    const scan = scanEngraved(workdir, { project: 'discount-engine' });
    expect(scan.records.find((r) => r.id === 'PJ-D-1')!.excepts).toEqual(['INV-1']);
  });

  it('distinguishes a level with no store from a level with no records', () => {
    // "There is no user-level knowledge" and "the user level was never looked
    // at" are different answers to which rules apply, so both are reported.
    fs.mkdirSync(path.join(workdir, 'docs', 'decisions'), { recursive: true });
    const scan = scanEngraved(workdir);
    expect(scan.levels.find((l) => l.level === 'user')!.present).toBe(false);
    expect(scan.levels.find((l) => l.level === 'repo')!.present).toBe(true);
    expect(scan.levels.find((l) => l.level === 'repo')!.recordCount).toBe(0);
  });

  it('flags an id whose prefix disagrees with its store, without relocating it', () => {
    write(
      path.join(workdir, 'docs', 'decisions', 'misfiled.decision.md'),
      decision('U-D-9', 'Filed at repo level with a user id'),
    );
    const record = scanEngraved(workdir).records[0]!;
    expect(record.level).toBe('repo');
    expect(record.idLevelMismatch).toBe(true);
  });

  it('drops a malformed record instead of failing the whole inventory', () => {
    write(path.join(workdir, 'docs', 'decisions', 'broken.decision.md'), 'no frontmatter here\n');
    write(
      path.join(workdir, 'docs', 'decisions', 'good.decision.md'),
      decision('D-1', 'Fine'),
    );
    expect(scanEngraved(workdir).records.map((r) => r.id)).toEqual(['D-1']);
  });

  it('sorts ids numerically so D-10 follows D-9', () => {
    for (const n of [1, 9, 10, 2]) {
      write(
        path.join(workdir, 'docs', 'decisions', `d${n}.decision.md`),
        decision(`D-${n}`, `Decision ${n}`),
      );
    }
    expect(scanEngraved(workdir).records.map((r) => r.id)).toEqual([
      'D-1',
      'D-2',
      'D-9',
      'D-10',
    ]);
  });

  it('discovers principles by directory walk, not by suffix', () => {
    write(
      path.join(workdir, 'docs', 'constitution', 'offline-first.md'),
      `---\nid: P-1\nkind: principle\ndomain: system\ntitle: "Offline first"\nstatus: active\n---\n# Offline first\n`,
    );
    const record = scanEngraved(workdir).records[0]!;
    expect(record.kind).toBe('principle');
    expect(record.id).toBe('P-1');
  });
});

describe('engraved rendering', () => {
  let workdir: string;
  let fakeHome: string;

  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-engraved-render-'));
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-engraved-renderhome-'));
    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(workdir, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it('surfaces a status that disagrees with its own ledger', () => {
    write(
      path.join(workdir, 'docs', 'invariants', 'drifted.invariant.md'),
      invariant(
        'INV-1',
        'Single layer',
        '| src/a | nests | Temporary: migrating | #1 | high |',
        'aligned',
      ),
    );
    const scan = scanEngraved(workdir);
    expect(hasStatusDrift(scan.records[0]!)).toBe(true);
    const text = renderEngraved(scan, THEME);
    expect(text).toContain('status says aligned; ledger derives drifting');
  });

  it('states the precedence direction so reading order cannot imply the wrong one', () => {
    write(path.join(workdir, 'docs', 'decisions', 'd.decision.md'), decision('D-1', 'A'));
    const text = renderEngraved(scanEngraved(workdir), THEME);
    expect(text).toContain('project > repo > user (narrower wins)');
  });

  it('points at engrave when nothing is engraved anywhere', () => {
    const text = renderEngraved(scanEngraved(workdir), THEME);
    expect(text).toContain('No engraved records found');
  });

  it('serializes level provenance and ledger alignment for machine consumers', () => {
    write(
      path.join(workdir, 'docs', 'invariants', 'drifted.invariant.md'),
      invariant('INV-1', 'Single layer', '| src/a | nests | Temporary: migrating | #1 | high |'),
    );
    const payload = serializeEngravedForJson(scanEngraved(workdir));
    expect(payload.summary).toEqual({
      total: 1,
      by_level: { repo: 1 },
      by_kind: { invariant: 1 },
      drifting: 1,
    });
    expect(payload.records[0]!.ledger).toEqual({
      accepted: 0,
      temporary: 1,
      max_severity: 'high',
      derived_status: 'drifting',
      status_drift: true,
    });
    expect(payload.levels.map((l) => l.level)).toEqual(['user', 'repo']);
  });
});

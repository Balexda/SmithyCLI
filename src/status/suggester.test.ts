import path from 'node:path';
import { describe, expect, it } from 'vitest';
// Import through the `./index.js` barrel — that is the stable public
// surface downstream modules consume, and these tests double as an
// assertion that the barrel re-exports `suggestNextAction` correctly.
import {
  formatNextAction,
  suggestNextAction,
  type ArtifactRecord,
  type ArtifactType,
  type DependencyOrderTable,
  type DependencyRow,
  type NextAction,
  type Status,
} from './index.js';

/**
 * Build a synthetic `ArtifactRecord` with enough fields populated to
 * exercise the suggester. Tests pass individual overrides for the
 * fields they care about.
 */
function makeRecord(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  const type: ArtifactType = overrides.type ?? 'spec';
  const idPrefix: DependencyOrderTable['id_prefix'] =
    type === 'rfc'
      ? 'M'
      : type === 'features'
        ? 'F'
        : type === 'spec'
          ? 'US'
          : 'S';
  const dependency_order: DependencyOrderTable = overrides.dependency_order ?? {
    rows: [],
    id_prefix: idPrefix,
    format: 'table',
  };
  return {
    type,
    path: overrides.path ?? `specs/sample.${type === 'tasks' ? 'tasks' : type}.md`,
    title: overrides.title ?? 'Sample',
    status: overrides.status ?? 'unknown',
    dependency_order,
    warnings: overrides.warnings ?? [],
    ...overrides,
  };
}

function makeRow(
  id: string,
  artifact_path: string | null = null,
): DependencyRow {
  return { id, title: `Row ${id}`, depends_on: [], artifact_path };
}

function makeChild(status: Status, type: ArtifactType = 'tasks'): ArtifactRecord {
  return makeRecord({ type, status });
}

describe('suggestNextAction — done and unknown short-circuit to null', () => {
  it('returns null for a done tasks record', () => {
    const record = makeRecord({ type: 'tasks', status: 'done' });
    expect(suggestNextAction(record, [], false)).toBeNull();
  });

  it('returns null for a done spec record', () => {
    const record = makeRecord({ type: 'spec', status: 'done' });
    expect(suggestNextAction(record, [], false)).toBeNull();
  });

  it('returns null for a done features record', () => {
    const record = makeRecord({ type: 'features', status: 'done' });
    expect(suggestNextAction(record, [], false)).toBeNull();
  });

  it('returns null for a done rfc record', () => {
    const record = makeRecord({ type: 'rfc', status: 'done' });
    expect(suggestNextAction(record, [], false)).toBeNull();
  });

  it('returns null for an unknown-status tasks record', () => {
    const record = makeRecord({ type: 'tasks', status: 'unknown' });
    expect(suggestNextAction(record, [], false)).toBeNull();
  });

  it('returns null for an unknown-status spec record', () => {
    const record = makeRecord({
      type: 'spec',
      status: 'unknown',
      dependency_order: { rows: [], id_prefix: 'US', format: 'legacy' },
    });
    expect(suggestNextAction(record, [], false)).toBeNull();
  });

  it('returns null for an unknown-status features record', () => {
    const record = makeRecord({
      type: 'features',
      status: 'unknown',
      dependency_order: { rows: [], id_prefix: 'F', format: 'missing' },
    });
    expect(suggestNextAction(record, [], false)).toBeNull();
  });

  it('returns null for an unknown-status rfc record', () => {
    const record = makeRecord({
      type: 'rfc',
      status: 'unknown',
      dependency_order: { rows: [], id_prefix: 'M', format: 'legacy' },
    });
    expect(suggestNextAction(record, [], false)).toBeNull();
  });
});

describe('suggestNextAction — tasks records', () => {
  it('suggests smithy.forge with no slice digit when a not-started tasks record has no parsed slices', () => {
    // Older fixtures (and pathological tasks files with no `## Slice N:`
    // headings) have no `slices` field on the record, so the suggester
    // falls back to the legacy single-arg shape rather than fabricate
    // a `0` digit.
    const record = makeRecord({
      type: 'tasks',
      status: 'not-started',
      path: 'specs/x/01-foo.tasks.md',
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.forge');
    expect(action!.arguments).toEqual(['specs/x/01-foo.tasks.md']);
    expect(typeof action!.reason).toBe('string');
    expect(action!.reason.length).toBeGreaterThan(0);
    expect(action!.suppressed_by_ancestor).toBeUndefined();
  });

  it('appends the first non-done slice digit on a not-started tasks record with parsed slices', () => {
    // Real tasks records carry per-slice info (parser populates it from
    // `## Slice N:` headings). The first non-done slice's digit travels
    // into `args[1]` so the hint reads `smithy.forge <path> <N>` and
    // tells the user exactly which slice to pick up next.
    const record = makeRecord({
      type: 'tasks',
      status: 'not-started',
      path: 'specs/x/01-foo.tasks.md',
      slices: [
        { id: 'S1', title: 'Bootstrap', status: 'not-started' },
        { id: 'S2', title: 'Wire init', status: 'not-started' },
      ],
    });
    const action = suggestNextAction(record, [], false);
    expect(action!.command).toBe('smithy.forge');
    expect(action!.arguments).toEqual(['specs/x/01-foo.tasks.md', '1']);
    expect(action!.reason).toContain('S1');
  });

  it('appends the first non-done slice digit on an in-progress tasks record', () => {
    // S1 done, S2 in-progress, S3 not-started → next forge target is S2.
    // The suggester picks the first slice whose status !== 'done', so
    // an in-progress slice wins over a later not-started one — which
    // matches "resume mid-flight work" intent.
    const record = makeRecord({
      type: 'tasks',
      status: 'in-progress',
      path: 'specs/x/02-bar.tasks.md',
      completed: 2,
      total: 5,
      slices: [
        { id: 'S1', title: 'Foo', status: 'done' },
        { id: 'S2', title: 'Bar', status: 'in-progress' },
        { id: 'S3', title: 'Baz', status: 'not-started' },
      ],
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.forge');
    expect(action!.arguments).toEqual(['specs/x/02-bar.tasks.md', '2']);
    expect(action!.reason).toContain('S2');
  });

  it('falls back to the single-arg shape when every slice is already done', () => {
    // Pathological for an in-progress/not-started tasks record (would
    // normally roll up to done), but the suggester must still return
    // a usable action rather than emit a blank slice digit.
    const record = makeRecord({
      type: 'tasks',
      status: 'in-progress',
      path: 'specs/x/03-baz.tasks.md',
      slices: [
        { id: 'S1', title: 'Foo', status: 'done' },
        { id: 'S2', title: 'Bar', status: 'done' },
      ],
    });
    const action = suggestNextAction(record, [], false);
    expect(action!.command).toBe('smithy.forge');
    expect(action!.arguments).toEqual(['specs/x/03-baz.tasks.md']);
  });

  it('redirects a virtual tasks record to smithy.cut on its parent spec', () => {
    // A virtual tasks record has no file on disk, so `smithy.forge` on
    // its path would fail. The scanner populates `parent_path` (the
    // owning `.spec.md`) and `parent_row_id` (`US<N>`) whenever it
    // emits a virtual; the suggester must redirect to the `smithy.cut`
    // invocation that would create the tasks file in the first place.
    const record = makeRecord({
      type: 'tasks',
      status: 'not-started',
      virtual: true,
      path: 'specs/x/03-baz.tasks.md',
      parent_path: 'specs/x/x.spec.md',
      parent_row_id: 'US3',
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.cut');
    expect(action!.arguments).toEqual(['specs/x', '3']);
  });

  it('falls back to smithy.forge on a virtual tasks record missing parent fields', () => {
    // Defensive guard: if the scanner ever emits a virtual tasks
    // record without `parent_path`/`parent_row_id` (shouldn't happen
    // in practice), the suggester must still produce an action rather
    // than crashing. Fall back to the legacy forge shape.
    const record = makeRecord({
      type: 'tasks',
      status: 'not-started',
      virtual: true,
      path: 'specs/x/03-baz.tasks.md',
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.forge');
    expect(action!.arguments).toEqual(['specs/x/03-baz.tasks.md']);
  });
});

describe('suggestNextAction — rfc records', () => {
  it('suggests smithy.render with the first virtual milestone digit', () => {
    // M1 already has a feature map (real, in-progress); M2 / M3 do not
    // (virtual, not-started). The suggester points at M2 — the first
    // milestone whose feature map has yet to be rendered.
    const record = makeRecord({
      type: 'rfc',
      status: 'in-progress',
      path: 'docs/rfcs/2026-04-12-foo.rfc.md',
      dependency_order: {
        rows: [
          makeRow('M1', 'docs/rfcs/01-spawn.features.md'),
          makeRow('M2'),
          makeRow('M3'),
        ],
        id_prefix: 'M',
        format: 'table',
      },
    });
    const children: ArtifactRecord[] = [
      makeChild('in-progress', 'features'),
      makeRecord({ type: 'features', status: 'not-started', virtual: true }),
      makeRecord({ type: 'features', status: 'not-started', virtual: true }),
    ];
    const action = suggestNextAction(record, children, false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.render');
    expect(action!.arguments).toEqual(['docs/rfcs/2026-04-12-foo.rfc.md', '2']);
    expect(action!.reason).toContain('M2');
  });

  it('falls back to single-arg smithy.render when the rfc has zero milestones', () => {
    const record = makeRecord({
      type: 'rfc',
      status: 'not-started',
      path: 'docs/rfcs/2026-04-12-foo.rfc.md',
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.render');
    expect(action!.arguments).toEqual(['docs/rfcs/2026-04-12-foo.rfc.md']);
    expect(action!.reason.length).toBeGreaterThan(0);
  });

  it('falls back to single-arg smithy.render when every milestone already has a feature map', () => {
    // No virtual children → no "first virtual not-started" candidate.
    // Suggester degrades to the bare RFC-path hint rather than picking
    // an arbitrary milestone digit.
    const record = makeRecord({
      type: 'rfc',
      status: 'in-progress',
      path: 'docs/rfcs/2026-04-12-foo.rfc.md',
      dependency_order: {
        rows: [
          makeRow('M1', 'docs/rfcs/01-spawn.features.md'),
          makeRow('M2', 'docs/rfcs/02-dispatch.features.md'),
        ],
        id_prefix: 'M',
        format: 'table',
      },
    });
    const children: ArtifactRecord[] = [
      makeChild('done', 'features'),
      makeChild('in-progress', 'features'),
    ];
    const action = suggestNextAction(record, children, false);
    expect(action!.command).toBe('smithy.render');
    expect(action!.arguments).toEqual(['docs/rfcs/2026-04-12-foo.rfc.md']);
  });
});

describe('suggestNextAction — features records', () => {
  it('suggests smithy.mark with the first virtual (no-spec-on-disk) row numeric id', () => {
    const record = makeRecord({
      type: 'features',
      status: 'in-progress',
      path: 'docs/rfcs/foo.features.md',
      dependency_order: {
        rows: [
          makeRow('F1', 'specs/a'),
          makeRow('F2', 'specs/b'),
          makeRow('F3', 'specs/c'),
        ],
        id_prefix: 'F',
        format: 'table',
      },
    });
    const children: ArtifactRecord[] = [
      makeChild('done', 'spec'),
      makeRecord({ type: 'spec', status: 'not-started', virtual: true }),
      makeChild('in-progress', 'spec'),
    ];
    const action = suggestNextAction(record, children, false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.mark');
    expect(action!.arguments).toEqual(['docs/rfcs/foo.features.md', '2']);
    expect(action!.reason.length).toBeGreaterThan(0);
  });

  it('picks the lowest-index virtual row when multiple features have no spec file yet', () => {
    const record = makeRecord({
      type: 'features',
      status: 'not-started',
      path: 'docs/rfcs/foo.features.md',
      dependency_order: {
        rows: [
          makeRow('F1'),
          makeRow('F2'),
          makeRow('F3'),
        ],
        id_prefix: 'F',
        format: 'table',
      },
    });
    const children: ArtifactRecord[] = [
      makeRecord({ type: 'spec', status: 'not-started', virtual: true }),
      makeRecord({ type: 'spec', status: 'not-started', virtual: true }),
      makeRecord({ type: 'spec', status: 'not-started', virtual: true }),
    ];
    const action = suggestNextAction(record, children, false);
    expect(action!.command).toBe('smithy.mark');
    expect(action!.arguments).toEqual(['docs/rfcs/foo.features.md', '1']);
  });

  it('skips a real (on-disk) not-started spec and picks the next virtual row', () => {
    // Real not-started spec files already exist on disk — `smithy.mark`
    // would be a no-op there. The suggester must skip real children
    // (their own hints cover them) and only suggest mark for virtual
    // rows where the spec file does not yet exist.
    const record = makeRecord({
      type: 'features',
      status: 'in-progress',
      path: 'docs/rfcs/foo.features.md',
      dependency_order: {
        rows: [makeRow('F1', 'specs/a'), makeRow('F2', null)],
        id_prefix: 'F',
        format: 'table',
      },
    });
    const children: ArtifactRecord[] = [
      makeChild('not-started', 'spec'), // real not-started spec file on disk
      makeRecord({ type: 'spec', status: 'not-started', virtual: true }),
    ];
    const action = suggestNextAction(record, children, false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.mark');
    expect(action!.arguments).toEqual(['docs/rfcs/foo.features.md', '2']);
  });

  it('treats a virtual child as the mark target', () => {
    const record = makeRecord({
      type: 'features',
      status: 'in-progress',
      path: 'docs/rfcs/foo.features.md',
      dependency_order: {
        rows: [makeRow('F1', 'specs/a'), makeRow('F2', null)],
        id_prefix: 'F',
        format: 'table',
      },
    });
    const children: ArtifactRecord[] = [
      makeChild('done', 'spec'),
      makeRecord({ type: 'spec', status: 'not-started', virtual: true }),
    ];
    const action = suggestNextAction(record, children, false);
    expect(action!.command).toBe('smithy.mark');
    expect(action!.arguments).toEqual(['docs/rfcs/foo.features.md', '2']);
  });

  it('returns null when every declared feature already has a spec file on disk', () => {
    // All children are real (non-virtual). `smithy.mark` would be a
    // no-op at this level; per-spec hints below this record cover the
    // remaining work.
    const record = makeRecord({
      type: 'features',
      status: 'in-progress',
      path: 'docs/rfcs/foo.features.md',
      dependency_order: {
        rows: [makeRow('F1', 'specs/a'), makeRow('F2', 'specs/b')],
        id_prefix: 'F',
        format: 'table',
      },
    });
    const children: ArtifactRecord[] = [
      makeChild('done', 'spec'),
      makeChild('not-started', 'spec'),
    ];
    expect(suggestNextAction(record, children, false)).toBeNull();
  });

  it('falls back to record path only when no row matches but record is actionable', () => {
    // Pathological: actionable features record with zero rows.
    const record = makeRecord({
      type: 'features',
      status: 'not-started',
      path: 'docs/rfcs/foo.features.md',
      dependency_order: {
        rows: [],
        id_prefix: 'F',
        format: 'table',
      },
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.mark');
    expect(action!.arguments).toEqual(['docs/rfcs/foo.features.md']);
  });

  it('redirects a virtual features record to smithy.render on its parent rfc', () => {
    // A virtual features record has no `.features.md` on disk, so
    // `smithy.mark` on its path would fail — the feature map has not
    // been rendered from its RFC milestone yet. The scanner populates
    // `parent_path` (the owning `.rfc.md`) and `parent_row_id` (`M<N>`)
    // whenever it emits a virtual; the suggester must redirect to the
    // `smithy.render` invocation that would create the feature map in
    // the first place.
    const record = makeRecord({
      type: 'features',
      status: 'not-started',
      virtual: true,
      path: 'docs/rfcs/2026-002-foo/02-subsystem-contract.features.md',
      parent_path: 'docs/rfcs/2026-002-foo/foo.rfc.md',
      parent_row_id: 'M2',
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.render');
    expect(action!.arguments).toEqual([
      'docs/rfcs/2026-002-foo/foo.rfc.md',
      '2',
    ]);
    expect(action!.reason).toContain('M2');
  });

  it('falls back to smithy.render with rfc path only when a virtual features record lacks a row id', () => {
    // Defensive: scanner emitted a virtual with `parent_path` but no
    // usable `parent_row_id` digit. Still redirect to render (the file
    // does not exist, so mark would fail) but drop the milestone digit.
    const record = makeRecord({
      type: 'features',
      status: 'not-started',
      virtual: true,
      path: 'docs/rfcs/2026-002-foo/02-subsystem-contract.features.md',
      parent_path: 'docs/rfcs/2026-002-foo/foo.rfc.md',
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.render');
    expect(action!.arguments).toEqual(['docs/rfcs/2026-002-foo/foo.rfc.md']);
  });

  it('falls back to smithy.mark on a virtual features record missing parent fields', () => {
    // Defensive guard: if the scanner ever emits a virtual features
    // record without `parent_path` (shouldn't happen in practice), the
    // suggester must still produce an action rather than crashing. Fall
    // back to the legacy mark shape.
    const record = makeRecord({
      type: 'features',
      status: 'not-started',
      virtual: true,
      path: 'docs/rfcs/2026-002-foo/02-subsystem-contract.features.md',
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.mark');
    expect(action!.arguments).toEqual([
      'docs/rfcs/2026-002-foo/02-subsystem-contract.features.md',
    ]);
  });
});

describe('suggestNextAction — spec records', () => {
  it('suggests smithy.cut against the spec parent directory with the first virtual (no-tasks-on-disk) row numeric id', () => {
    const record = makeRecord({
      type: 'spec',
      status: 'in-progress',
      path: 'specs/2026-04-12-004-foo/smithy-status-skill.spec.md',
      dependency_order: {
        rows: [
          makeRow('US1', 'specs/2026-04-12-004-foo/01-bar.tasks.md'),
          makeRow('US2', 'specs/2026-04-12-004-foo/02-baz.tasks.md'),
          makeRow('US3', null),
        ],
        id_prefix: 'US',
        format: 'table',
      },
    });
    const children: ArtifactRecord[] = [
      makeChild('done', 'tasks'),
      makeChild('done', 'tasks'),
      makeRecord({ type: 'tasks', status: 'not-started', virtual: true }),
    ];
    const action = suggestNextAction(record, children, false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.cut');
    expect(action!.arguments).toEqual([
      path.dirname('specs/2026-04-12-004-foo/smithy-status-skill.spec.md'),
      '3',
    ]);
    expect(action!.reason.length).toBeGreaterThan(0);
  });

  it('uses path.dirname — not the .spec.md file path — for the first argument', () => {
    const record = makeRecord({
      type: 'spec',
      status: 'not-started',
      path: 'specs/deep/nested/dir/my.spec.md',
      dependency_order: {
        rows: [makeRow('US1')],
        id_prefix: 'US',
        format: 'table',
      },
    });
    // Child is virtual — the tasks file hasn't been cut yet, so the
    // spec-level `smithy.cut` hint fires. Real not-started children
    // do not trigger a spec-level cut suggestion (their own `forge`
    // hints cover them).
    const children: ArtifactRecord[] = [
      makeRecord({ type: 'tasks', status: 'not-started', virtual: true }),
    ];
    const action = suggestNextAction(record, children, false);
    expect(action!.command).toBe('smithy.cut');
    expect(action!.arguments[0]).toBe('specs/deep/nested/dir');
    expect(action!.arguments[0]).not.toContain('.spec.md');
    expect(action!.arguments[1]).toBe('1');
  });

  it('returns null when every declared user story already has a tasks file on disk', () => {
    // Regression for the Smithy Evals Framework scenario: the spec
    // has a real (on-disk) tasks file for every US row, including a
    // not-started one. `smithy.cut` at the spec level would be a
    // no-op because re-cutting a story that already has a tasks file
    // doesn't advance anything. The per-task `forge` hints below
    // this record cover the remaining work.
    const record = makeRecord({
      type: 'spec',
      status: 'in-progress',
      path: 'specs/evals/evals.spec.md',
      dependency_order: {
        rows: [
          makeRow('US1', 'specs/evals/01-a.tasks.md'),
          makeRow('US2', 'specs/evals/02-b.tasks.md'),
          makeRow('US3', 'specs/evals/03-c.tasks.md'),
        ],
        id_prefix: 'US',
        format: 'table',
      },
    });
    const children: ArtifactRecord[] = [
      makeChild('done', 'tasks'),
      makeChild('not-started', 'tasks'), // real — file exists, just not started
      makeChild('done', 'tasks'),
    ];
    expect(suggestNextAction(record, children, false)).toBeNull();
  });

  it('skips a real not-started user story and picks the next virtual one', () => {
    // Mixed: US1 done (real), US2 not-started (real — already cut),
    // US3 not-started (virtual — not yet cut). Only US3 needs
    // cutting; the spec-level hint must point at digit '3', not '2'.
    const record = makeRecord({
      type: 'spec',
      status: 'in-progress',
      path: 'specs/mix/mix.spec.md',
      dependency_order: {
        rows: [
          makeRow('US1', 'specs/mix/01-a.tasks.md'),
          makeRow('US2', 'specs/mix/02-b.tasks.md'),
          makeRow('US3'),
        ],
        id_prefix: 'US',
        format: 'table',
      },
    });
    const children: ArtifactRecord[] = [
      makeChild('done', 'tasks'),
      makeChild('not-started', 'tasks'), // real — tasks file exists
      makeRecord({ type: 'tasks', status: 'not-started', virtual: true }),
    ];
    const action = suggestNextAction(record, children, false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.cut');
    expect(action!.arguments).toEqual(['specs/mix', '3']);
  });

  it('falls back to dirname only when no row matches but record is actionable', () => {
    const record = makeRecord({
      type: 'spec',
      status: 'not-started',
      path: 'specs/empty/my.spec.md',
      dependency_order: {
        rows: [],
        id_prefix: 'US',
        format: 'table',
      },
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.cut');
    expect(action!.arguments).toEqual(['specs/empty']);
  });

  it('preserves the virtual spec folder path when record.path ends with a trailing slash', () => {
    // Virtual spec records emitted by the scanner (feature-map row whose
    // `Artifact` cell points at a folder with no discovered `.spec.md`)
    // use the folder path itself as `record.path` — including the
    // trailing slash. `path.dirname('specs/webhooks/')` collapses to
    // `'specs'`, which would cause smithy.cut to target the wrong
    // directory. The first argument must be the folder itself with
    // trailing slashes stripped.
    const record = makeRecord({
      type: 'spec',
      status: 'not-started',
      path: 'specs/webhooks/',
      virtual: true,
      dependency_order: {
        rows: [],
        id_prefix: 'US',
        format: 'table',
      },
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.cut');
    expect(action!.arguments).toEqual(['specs/webhooks']);
  });

  it('preserves the virtual spec folder path even with a matching virtual row', () => {
    const record = makeRecord({
      type: 'spec',
      status: 'not-started',
      path: 'specs/webhooks/',
      virtual: true,
      dependency_order: {
        rows: [makeRow('US2')],
        id_prefix: 'US',
        format: 'table',
      },
    });
    const action = suggestNextAction(
      record,
      [makeRecord({ type: 'tasks', status: 'not-started', virtual: true })],
      false,
    );
    expect(action!.arguments).toEqual(['specs/webhooks', '2']);
  });

  it('redirects a virtual spec record to smithy.mark on its parent features map', () => {
    // A virtual spec record has no `.spec.md` on disk, so `smithy.cut`
    // on its folder would fail — the spec has not been marked from its
    // feature map yet. The scanner populates `parent_path` (the owning
    // `.features.md`) and `parent_row_id` (`F<N>`) whenever it emits a
    // virtual; the suggester must redirect to the `smithy.mark`
    // invocation that would create the spec in the first place.
    const record = makeRecord({
      type: 'spec',
      status: 'not-started',
      virtual: true,
      path: 'specs/spawn-output-extraction/',
      parent_path: 'docs/rfcs/2026-001-march/01-spawn.features.md',
      parent_row_id: 'F5',
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.mark');
    expect(action!.arguments).toEqual([
      'docs/rfcs/2026-001-march/01-spawn.features.md',
      '5',
    ]);
    expect(action!.reason).toContain('F5');
  });

  it('falls back to smithy.mark with features path only when a virtual spec record lacks a row id', () => {
    // Defensive: scanner emitted a virtual with `parent_path` but no
    // usable `parent_row_id` digit. Still redirect to mark (the file
    // does not exist, so cut would fail) but drop the feature digit.
    const record = makeRecord({
      type: 'spec',
      status: 'not-started',
      virtual: true,
      path: 'specs/spawn-output-extraction/',
      parent_path: 'docs/rfcs/2026-001-march/01-spawn.features.md',
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.mark');
    expect(action!.arguments).toEqual([
      'docs/rfcs/2026-001-march/01-spawn.features.md',
    ]);
  });

  it('falls back to smithy.cut on a virtual spec record missing parent fields', () => {
    // Defensive guard: if the scanner ever emits a virtual spec record
    // without `parent_path` (shouldn't happen in practice), the
    // suggester must still produce an action rather than crashing. Fall
    // back to the legacy cut shape against the folder.
    const record = makeRecord({
      type: 'spec',
      status: 'not-started',
      virtual: true,
      path: 'specs/spawn-output-extraction/',
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.cut');
    expect(action!.arguments).toEqual(['specs/spawn-output-extraction']);
  });

  it('keeps smithy.cut for a real (on-disk) spec with an uncut user story', () => {
    // Regression guard for the F3/F4 case: a real spec (not virtual)
    // whose feature map row resolves to an existing `.spec.md`. Its
    // next-action must remain `smithy.cut <folder> <US#>` — the spec
    // exists, so marking it again would be wrong; the next uncut user
    // story is what needs decomposing.
    const record = makeRecord({
      type: 'spec',
      status: 'not-started',
      path: 'specs/2026-05-10-003-multi-backend/multi-backend.spec.md',
      parent_path: 'docs/rfcs/2026-001-march/01-spawn.features.md',
      parent_row_id: 'F3',
      dependency_order: {
        rows: [makeRow('US2', 'specs/2026-05-10-003-multi-backend/02-a.tasks.md'), makeRow('US3')],
        id_prefix: 'US',
        format: 'table',
      },
    });
    const children: ArtifactRecord[] = [
      makeChild('not-started', 'tasks'), // real — tasks file exists
      makeRecord({ type: 'tasks', status: 'not-started', virtual: true }),
    ];
    const action = suggestNextAction(record, children, false);
    expect(action!.command).toBe('smithy.cut');
    expect(action!.arguments).toEqual([
      'specs/2026-05-10-003-multi-backend',
      '3',
    ]);
  });
});

describe('suggestNextAction — ancestor suppression flag', () => {
  it('sets suppressed_by_ancestor: true when ancestorNotStarted is true', () => {
    const record = makeRecord({
      type: 'tasks',
      status: 'not-started',
      path: 'specs/x/01.tasks.md',
    });
    const action = suggestNextAction(record, [], true);
    expect(action).not.toBeNull();
    expect(action!.suppressed_by_ancestor).toBe(true);
  });

  it('omits suppressed_by_ancestor (not false) when ancestorNotStarted is false', () => {
    const record = makeRecord({
      type: 'tasks',
      status: 'not-started',
      path: 'specs/x/01.tasks.md',
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.suppressed_by_ancestor).toBeUndefined();
    expect('suppressed_by_ancestor' in action!).toBe(false);
  });

  it('sets suppressed_by_ancestor: true on a features record too', () => {
    const record = makeRecord({
      type: 'features',
      status: 'not-started',
      path: 'docs/rfcs/foo.features.md',
      dependency_order: {
        rows: [makeRow('F1')],
        id_prefix: 'F',
        format: 'table',
      },
    });
    // Virtual spec child — triggers the features-level `smithy.mark`
    // hint so we can observe the suppression flag being attached.
    const action = suggestNextAction(
      record,
      [makeRecord({ type: 'spec', status: 'not-started', virtual: true })],
      true,
    );
    expect(action!.suppressed_by_ancestor).toBe(true);
    expect(action!.command).toBe('smithy.mark');
  });
});

describe('suggestNextAction — purity', () => {
  it('does not mutate the input ArtifactRecord', () => {
    const record = makeRecord({
      type: 'features',
      status: 'in-progress',
      path: 'docs/rfcs/foo.features.md',
      dependency_order: {
        rows: [makeRow('F1'), makeRow('F2')],
        id_prefix: 'F',
        format: 'table',
      },
    });
    const snapshot = JSON.parse(JSON.stringify(record));
    const children: ArtifactRecord[] = [
      makeChild('done', 'spec'),
      makeChild('not-started', 'spec'),
    ];
    const childrenSnapshot = JSON.parse(JSON.stringify(children));
    suggestNextAction(record, children, false);
    expect(record).toEqual(snapshot);
    expect(children).toEqual(childrenSnapshot);
  });

  it('returns deterministic output for the same inputs', () => {
    const record = makeRecord({
      type: 'spec',
      status: 'in-progress',
      path: 'specs/x/my.spec.md',
      dependency_order: {
        rows: [makeRow('US1'), makeRow('US2')],
        id_prefix: 'US',
        format: 'table',
      },
    });
    const children: ArtifactRecord[] = [
      makeChild('done', 'tasks'),
      makeChild('not-started', 'tasks'),
    ];
    const a = suggestNextAction(record, children, false);
    const b = suggestNextAction(record, children, false);
    expect(a).toEqual(b);
  });
});

describe('formatNextAction', () => {
  function makeAction(overrides: Partial<NextAction> = {}): NextAction {
    return {
      command: overrides.command ?? 'smithy.forge',
      arguments: overrides.arguments ?? [],
      reason: overrides.reason ?? 'because',
      ...overrides,
    };
  }

  it('formats a smithy.forge action with its tasks file path', () => {
    const action = makeAction({
      command: 'smithy.forge',
      arguments: ['specs/foo/01.tasks.md'],
    });
    expect(formatNextAction(action)).toBe('\u2192 smithy.forge specs/foo/01.tasks.md');
  });

  it('formats a smithy.cut action with folder and numeric story id', () => {
    const action = makeAction({
      command: 'smithy.cut',
      arguments: ['specs/foo', '2'],
    });
    expect(formatNextAction(action)).toBe('\u2192 smithy.cut specs/foo 2');
  });

  it('formats a smithy.mark action with features path and numeric feature id', () => {
    const action = makeAction({
      command: 'smithy.mark',
      arguments: ['features.md', '3'],
    });
    expect(formatNextAction(action)).toBe('\u2192 smithy.mark features.md 3');
  });

  it('formats a smithy.render action with an rfc path', () => {
    const action = makeAction({
      command: 'smithy.render',
      arguments: ['path/to/rfc.rfc.md'],
    });
    expect(formatNextAction(action)).toBe('\u2192 smithy.render path/to/rfc.rfc.md');
  });

  it('formats an action with no arguments as command-only with no trailing space', () => {
    const action = makeAction({ command: 'smithy.ignite', arguments: [] });
    const formatted = formatNextAction(action);
    expect(formatted).toBe('\u2192 smithy.ignite');
    expect(formatted).not.toMatch(/\s$/);
  });

  it('emits exactly one line (no embedded newlines)', () => {
    const action = makeAction({
      command: 'smithy.cut',
      arguments: ['specs/a', '1', '2'],
    });
    const formatted = formatNextAction(action);
    expect(formatted.split('\n')).toHaveLength(1);
    expect(formatted).not.toContain('\n');
  });

  it('uses the arrow character U+2192 as the prefix', () => {
    const action = makeAction({
      command: 'smithy.forge',
      arguments: ['specs/x/01.tasks.md'],
    });
    expect(formatNextAction(action).startsWith('\u2192 ')).toBe(true);
  });

  it('joins multiple arguments with single spaces', () => {
    const action = makeAction({
      command: 'smithy.cut',
      arguments: ['specs/a', '1'],
    });
    expect(formatNextAction(action)).toBe('\u2192 smithy.cut specs/a 1');
  });

  it('is a pure function — same input produces identical output on repeat calls', () => {
    const action = makeAction({
      command: 'smithy.mark',
      arguments: [path.join('docs', 'rfcs', 'foo.features.md'), '2'],
    });
    expect(formatNextAction(action)).toBe(formatNextAction(action));
  });
});

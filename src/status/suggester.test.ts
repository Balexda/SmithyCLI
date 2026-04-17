import path from 'node:path';
import { describe, expect, it } from 'vitest';
// Import through the `./index.js` barrel — that is the stable public
// surface downstream modules consume, and these tests double as an
// assertion that the barrel re-exports `suggestNextAction` correctly.
import {
  suggestNextAction,
  type ArtifactRecord,
  type ArtifactType,
  type DependencyOrderTable,
  type DependencyRow,
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
  it('suggests smithy.forge for a not-started tasks record', () => {
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

  it('suggests smithy.forge for an in-progress tasks record', () => {
    const record = makeRecord({
      type: 'tasks',
      status: 'in-progress',
      path: 'specs/x/02-bar.tasks.md',
      completed: 2,
      total: 5,
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.forge');
    expect(action!.arguments).toEqual(['specs/x/02-bar.tasks.md']);
    expect(action!.reason.length).toBeGreaterThan(0);
  });

  it('treats a virtual tasks record like a not-started tasks record', () => {
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
  it('suggests smithy.render for a not-started rfc record', () => {
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

  it('suggests smithy.render for an in-progress rfc record', () => {
    const record = makeRecord({
      type: 'rfc',
      status: 'in-progress',
      path: 'docs/rfcs/2026-04-12-foo.rfc.md',
    });
    const action = suggestNextAction(record, [], false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.render');
    expect(action!.arguments).toEqual(['docs/rfcs/2026-04-12-foo.rfc.md']);
  });
});

describe('suggestNextAction — features records', () => {
  it('suggests smithy.mark with the first not-started row numeric id', () => {
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
      makeChild('not-started', 'spec'),
      makeChild('in-progress', 'spec'),
    ];
    const action = suggestNextAction(record, children, false);
    expect(action).not.toBeNull();
    expect(action!.command).toBe('smithy.mark');
    expect(action!.arguments).toEqual(['docs/rfcs/foo.features.md', '2']);
    expect(action!.reason.length).toBeGreaterThan(0);
  });

  it('picks the lowest-index not-started row when multiple are not-started', () => {
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
      makeChild('not-started', 'spec'),
      makeChild('not-started', 'spec'),
      makeChild('not-started', 'spec'),
    ];
    const action = suggestNextAction(record, children, false);
    expect(action!.command).toBe('smithy.mark');
    expect(action!.arguments).toEqual(['docs/rfcs/foo.features.md', '1']);
  });

  it('treats a virtual child as not-started for matching', () => {
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
});

describe('suggestNextAction — spec records', () => {
  it('suggests smithy.cut against the spec parent directory with the first not-started row numeric id', () => {
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
    const children: ArtifactRecord[] = [makeChild('not-started', 'tasks')];
    const action = suggestNextAction(record, children, false);
    expect(action!.command).toBe('smithy.cut');
    expect(action!.arguments[0]).toBe('specs/deep/nested/dir');
    expect(action!.arguments[0]).not.toContain('.spec.md');
    expect(action!.arguments[1]).toBe('1');
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
    const action = suggestNextAction(
      record,
      [makeChild('not-started', 'spec')],
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

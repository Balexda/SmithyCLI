import { describe, expect, it } from 'vitest';
// Import through the `./index.js` barrel — that is the stable public
// surface downstream modules consume, and these tests double as an
// assertion that the barrel re-exports the classifier correctly.
import {
  classifyRecord,
  type ArtifactRecord,
  type ArtifactType,
  type DependencyOrderTable,
  type DependencyRow,
  type Status,
} from './index.js';

/**
 * Build a synthetic `ArtifactRecord` with enough fields populated to
 * exercise the classifier. Tests that need to tweak individual fields
 * pass them in via `overrides`.
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

describe('classifyRecord — tasks records', () => {
  it('returns in-progress when some but not all checkboxes are ticked', () => {
    const record = makeRecord({ type: 'tasks', completed: 3, total: 6 });
    expect(classifyRecord(record, [])).toBe('in-progress');
  });

  it('returns done when every checkbox is ticked and total is positive', () => {
    const record = makeRecord({ type: 'tasks', completed: 6, total: 6 });
    expect(classifyRecord(record, [])).toBe('done');
  });

  it('returns not-started when completed is zero and total is positive', () => {
    const record = makeRecord({ type: 'tasks', completed: 0, total: 6 });
    expect(classifyRecord(record, [])).toBe('not-started');
  });

  it('returns not-started when total is zero', () => {
    const record = makeRecord({ type: 'tasks', completed: 0, total: 0 });
    expect(classifyRecord(record, [])).toBe('not-started');
  });

  it('returns not-started for the edge case where completed > 0 but total is zero', () => {
    // Structural guard — the parser should never produce this state, but
    // classifyRecord must still resolve deterministically.
    const record = makeRecord({ type: 'tasks', completed: 5, total: 0 });
    expect(classifyRecord(record, [])).toBe('not-started');
  });

  it('ignores resolvedChildren entirely for tasks records', () => {
    const record = makeRecord({ type: 'tasks', completed: 3, total: 6 });
    const bogusChildren = [makeChild('done'), makeChild('done')];
    expect(classifyRecord(record, bogusChildren)).toBe('in-progress');
  });
});

describe('classifyRecord — parent records (rollup)', () => {
  it('returns in-progress for a spec with two done tasks and one virtual not-started child (AS 1.1)', () => {
    const parent = makeRecord({
      type: 'spec',
      dependency_order: {
        rows: [
          makeRow('US1', 'specs/x/01.tasks.md'),
          makeRow('US2', 'specs/x/02.tasks.md'),
          makeRow('US3', null),
        ],
        id_prefix: 'US',
        format: 'table',
      },
    });
    const children: ArtifactRecord[] = [
      makeChild('done'),
      makeChild('done'),
      makeRecord({ type: 'tasks', status: 'not-started', virtual: true }),
    ];
    expect(classifyRecord(parent, children)).toBe('in-progress');
  });

  it('returns done for a spec where every child is done', () => {
    const parent = makeRecord({
      type: 'spec',
      dependency_order: {
        rows: [makeRow('US1'), makeRow('US2')],
        id_prefix: 'US',
        format: 'table',
      },
    });
    expect(
      classifyRecord(parent, [makeChild('done'), makeChild('done')]),
    ).toBe('done');
  });

  it('returns done for a features record where every child is done', () => {
    const parent = makeRecord({
      type: 'features',
      dependency_order: {
        rows: [makeRow('F1'), makeRow('F2')],
        id_prefix: 'F',
        format: 'table',
      },
    });
    expect(
      classifyRecord(parent, [
        makeChild('done', 'spec'),
        makeChild('done', 'spec'),
      ]),
    ).toBe('done');
  });

  it('returns done for an rfc record where every child is done', () => {
    const parent = makeRecord({
      type: 'rfc',
      dependency_order: {
        rows: [makeRow('M1'), makeRow('M2')],
        id_prefix: 'M',
        format: 'table',
      },
    });
    expect(
      classifyRecord(parent, [
        makeChild('done', 'features'),
        makeChild('done', 'features'),
      ]),
    ).toBe('done');
  });

  it('returns not-started for a spec where every child is not-started', () => {
    const parent = makeRecord({
      type: 'spec',
      dependency_order: {
        rows: [makeRow('US1'), makeRow('US2')],
        id_prefix: 'US',
        format: 'table',
      },
    });
    expect(
      classifyRecord(parent, [
        makeChild('not-started'),
        makeChild('not-started'),
      ]),
    ).toBe('not-started');
  });

  it('returns not-started for a features record where every child is not-started', () => {
    const parent = makeRecord({
      type: 'features',
      dependency_order: {
        rows: [makeRow('F1'), makeRow('F2')],
        id_prefix: 'F',
        format: 'table',
      },
    });
    expect(
      classifyRecord(parent, [
        makeChild('not-started', 'spec'),
        makeChild('not-started', 'spec'),
      ]),
    ).toBe('not-started');
  });

  it('returns not-started for an rfc record where every child is not-started', () => {
    const parent = makeRecord({
      type: 'rfc',
      dependency_order: {
        rows: [makeRow('M1'), makeRow('M2')],
        id_prefix: 'M',
        format: 'table',
      },
    });
    expect(
      classifyRecord(parent, [
        makeChild('not-started', 'features'),
        makeChild('not-started', 'features'),
      ]),
    ).toBe('not-started');
  });

  it('returns in-progress for a parent with an explicit in-progress child', () => {
    const parent = makeRecord({
      type: 'spec',
      dependency_order: {
        rows: [makeRow('US1'), makeRow('US2')],
        id_prefix: 'US',
        format: 'table',
      },
    });
    expect(
      classifyRecord(parent, [makeChild('in-progress'), makeChild('done')]),
    ).toBe('in-progress');
  });

  it('falls through to in-progress when at least one child has unknown status', () => {
    // Documented behavior: any child whose status is `unknown` prevents a
    // clean done / not-started verdict, so the parent resolves to
    // in-progress. The parent itself remains classifiable because its
    // own dependency_order parsed cleanly; only its child is impaired.
    const parent = makeRecord({
      type: 'spec',
      dependency_order: {
        rows: [makeRow('US1'), makeRow('US2')],
        id_prefix: 'US',
        format: 'table',
      },
    });
    expect(
      classifyRecord(parent, [makeChild('done'), makeChild('unknown')]),
    ).toBe('in-progress');
  });

  it('returns not-started for a parent with zero resolved children (empty rows, format=table)', () => {
    const parent = makeRecord({
      type: 'spec',
      dependency_order: { rows: [], id_prefix: 'US', format: 'table' },
    });
    expect(classifyRecord(parent, [])).toBe('not-started');
  });
});

describe('classifyRecord — parse failures on parent records', () => {
  it('returns unknown when dependency_order.format is legacy, ignoring children', () => {
    const parent = makeRecord({
      type: 'spec',
      dependency_order: { rows: [], id_prefix: 'US', format: 'legacy' },
    });
    const allDone = [makeChild('done'), makeChild('done')];
    expect(classifyRecord(parent, allDone)).toBe('unknown');
  });

  it('returns unknown when dependency_order.format is missing, ignoring children', () => {
    const parent = makeRecord({
      type: 'features',
      dependency_order: { rows: [], id_prefix: 'F', format: 'missing' },
    });
    const allDone = [makeChild('done', 'spec'), makeChild('done', 'spec')];
    expect(classifyRecord(parent, allDone)).toBe('unknown');
  });

  it('returns unknown for an rfc with legacy format regardless of children', () => {
    const parent = makeRecord({
      type: 'rfc',
      dependency_order: { rows: [], id_prefix: 'M', format: 'legacy' },
    });
    expect(classifyRecord(parent, [makeChild('done', 'features')])).toBe(
      'unknown',
    );
  });
});

describe('classifyRecord — virtual records', () => {
  it('always returns not-started for a virtual tasks record regardless of completed/total', () => {
    const record = makeRecord({
      type: 'tasks',
      virtual: true,
      completed: 6,
      total: 6,
    });
    expect(classifyRecord(record, [])).toBe('not-started');
  });

  it('always returns not-started for a virtual spec record regardless of dependency_order', () => {
    const record = makeRecord({
      type: 'spec',
      virtual: true,
      dependency_order: {
        rows: [makeRow('US1')],
        id_prefix: 'US',
        format: 'table',
      },
    });
    expect(classifyRecord(record, [makeChild('done')])).toBe('not-started');
  });

  it('returns not-started for a virtual parent whose format would otherwise yield unknown', () => {
    const record = makeRecord({
      type: 'features',
      virtual: true,
      dependency_order: { rows: [], id_prefix: 'F', format: 'legacy' },
    });
    expect(classifyRecord(record, [])).toBe('not-started');
  });
});

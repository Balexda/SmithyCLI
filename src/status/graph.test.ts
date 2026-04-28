import { describe, expect, it } from 'vitest';
// Import through the `./index.js` barrel so these tests also assert
// that `buildDependencyGraph` is re-exported on the stable public
// surface.
import {
  BROKEN_LINKS_PATH,
  ORPHANED_SPECS_PATH,
  ORPHANED_TASKS_PATH,
  buildDependencyGraph,
  type ArtifactRecord,
  type ArtifactType,
  type DependencyOrderTable,
  type DependencyRow,
} from './index.js';

/**
 * Build a minimal `ArtifactRecord` for graph tests. Only the fields
 * `buildDependencyGraph` actually consults (`path`, `status`,
 * `dependency_order`) carry semantic weight; the rest are padded with
 * sensible defaults so the tests read clearly at call sites.
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
    status: overrides.status ?? 'not-started',
    dependency_order,
    warnings: overrides.warnings ?? [],
    ...overrides,
  };
}

/** Build a single dependency row with sensible defaults. */
function row(
  id: string,
  depends_on: string[] = [],
  overrides: Partial<DependencyRow> = {},
): DependencyRow {
  return {
    id,
    title: overrides.title ?? `Story ${id}`,
    depends_on,
    artifact_path: overrides.artifact_path ?? null,
    ...overrides,
  };
}

describe('buildDependencyGraph — empty input', () => {
  it('returns an empty graph for no records', () => {
    const graph = buildDependencyGraph([]);
    expect(graph).toEqual({
      nodes: {},
      layers: [],
      cycles: [],
      dangling_refs: [],
    });
  });

  it('returns an empty graph for a record with no dependency-order rows', () => {
    const record = makeRecord({
      path: 'specs/sample/sample.spec.md',
      dependency_order: { rows: [], id_prefix: 'US', format: 'table' },
    });
    const graph = buildDependencyGraph([record]);
    expect(graph.nodes).toEqual({});
    expect(graph.layers).toEqual([]);
    expect(graph.cycles).toEqual([]);
    expect(graph.dangling_refs).toEqual([]);
  });
});

describe('buildDependencyGraph — within-artifact topological layering (AS 10.1)', () => {
  // Spec with four user stories where US1 and US4 are independent,
  // US2 depends on US1, and US3 depends on US2.
  const SPEC_PATH = 'specs/sample/sample.spec.md';
  const spec = makeRecord({
    type: 'spec',
    path: SPEC_PATH,
    title: 'Sample Spec',
    status: 'in-progress',
    dependency_order: {
      id_prefix: 'US',
      format: 'table',
      rows: [
        row('US1'),
        row('US2', ['US1']),
        row('US3', ['US2']),
        row('US4'),
      ],
    },
  });

  it('places US1 and US4 in Layer 0, US2 in Layer 1, and US3 in Layer 2', () => {
    const graph = buildDependencyGraph([spec]);
    expect(graph.layers).toEqual([
      { layer: 0, node_ids: [`${SPEC_PATH}#US1`, `${SPEC_PATH}#US4`] },
      { layer: 1, node_ids: [`${SPEC_PATH}#US2`] },
      { layer: 2, node_ids: [`${SPEC_PATH}#US3`] },
    ]);
  });

  it('emits one fully-qualified node per row carrying record_path, row, and rolled-up status', () => {
    const graph = buildDependencyGraph([spec]);
    expect(Object.keys(graph.nodes).sort()).toEqual([
      `${SPEC_PATH}#US1`,
      `${SPEC_PATH}#US2`,
      `${SPEC_PATH}#US3`,
      `${SPEC_PATH}#US4`,
    ]);
    const us2 = graph.nodes[`${SPEC_PATH}#US2`];
    expect(us2).toBeDefined();
    if (us2 === undefined) return;
    expect(us2.record_path).toBe(SPEC_PATH);
    expect(us2.status).toBe('in-progress');
    expect(us2.row).toEqual({
      id: 'US2',
      title: 'Story US2',
      depends_on: ['US1'],
      artifact_path: null,
    });
  });

  it('reports empty cycles and dangling_refs in this task', () => {
    const graph = buildDependencyGraph([spec]);
    expect(graph.cycles).toEqual([]);
    expect(graph.dangling_refs).toEqual([]);
  });
});

describe('buildDependencyGraph — determinism (SD-013)', () => {
  it('orders Layer 0 by record discovery order, then by row order within each table', () => {
    // Two records, each with two independent rows. Both records belong
    // in Layer 0 entirely — but the layer membership must follow
    // (a) the order records appear in the input array, then
    // (b) the row order inside each `## Dependency Order` table.
    const specA = makeRecord({
      type: 'spec',
      path: 'specs/a/a.spec.md',
      status: 'not-started',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US2'), row('US1')],
      },
    });
    const specB = makeRecord({
      type: 'spec',
      path: 'specs/b/b.spec.md',
      status: 'not-started',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US10'), row('US3')],
      },
    });

    const graph = buildDependencyGraph([specA, specB]);
    expect(graph.layers).toEqual([
      {
        layer: 0,
        node_ids: [
          'specs/a/a.spec.md#US2',
          'specs/a/a.spec.md#US1',
          'specs/b/b.spec.md#US10',
          'specs/b/b.spec.md#US3',
        ],
      },
    ]);
  });
});

describe('buildDependencyGraph — purity', () => {
  it('does not mutate input records or their dependency-order tables', () => {
    const original = makeRecord({
      type: 'spec',
      path: 'specs/sample/sample.spec.md',
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1'), row('US2', ['US1'])],
      },
    });
    const snapshot = JSON.parse(JSON.stringify(original));
    buildDependencyGraph([original]);
    expect(original).toEqual(snapshot);
  });
});

describe('buildDependencyGraph — non-table records contribute no nodes', () => {
  it('skips records whose dependency_order.format is legacy or missing', () => {
    const legacy = makeRecord({
      path: 'specs/legacy/legacy.spec.md',
      dependency_order: {
        id_prefix: 'US',
        format: 'legacy',
        rows: [row('US1')],
      },
    });
    const missing = makeRecord({
      path: 'specs/missing/missing.spec.md',
      dependency_order: {
        id_prefix: 'US',
        format: 'missing',
        rows: [],
      },
    });
    const graph = buildDependencyGraph([legacy, missing]);
    expect(graph.nodes).toEqual({});
    expect(graph.layers).toEqual([]);
  });
});

describe('buildDependencyGraph — synthetic tree sentinels are excluded', () => {
  it('drops records whose path is a tree sentinel even if they carry a dep-order table', () => {
    const sentinel = makeRecord({
      path: ORPHANED_SPECS_PATH,
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1')],
      },
    });
    const broken = makeRecord({
      path: BROKEN_LINKS_PATH,
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US2')],
      },
    });
    const orphanedTasks = makeRecord({
      path: ORPHANED_TASKS_PATH,
      dependency_order: {
        id_prefix: 'S',
        format: 'table',
        rows: [row('S1')],
      },
    });
    const graph = buildDependencyGraph([sentinel, broken, orphanedTasks]);
    expect(graph.nodes).toEqual({});
    expect(graph.layers).toEqual([]);
  });
});

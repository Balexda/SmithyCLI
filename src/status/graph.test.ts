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

describe('buildDependencyGraph — cross-artifact stitching (AS 10.2)', () => {
  // AS 10.2 fixture: a spec lists US1 and US2; a tasks file (the child
  // of US1 per `parent_path` / `parent_row_id`) lists S1 and S2 (S2
  // depends on S1). Because the spec's US1 row blocks the tasks
  // record's roots, S1 must NOT land in Layer 0 — it must land in the
  // layer immediately after US1.
  const SPEC_PATH = 'specs/sample/sample.spec.md';
  const TASKS_PATH = 'specs/sample/01-first.tasks.md';

  const spec = makeRecord({
    type: 'spec',
    path: SPEC_PATH,
    status: 'in-progress',
    dependency_order: {
      id_prefix: 'US',
      format: 'table',
      rows: [row('US1'), row('US2', ['US1'])],
    },
  });
  const tasks = makeRecord({
    type: 'tasks',
    path: TASKS_PATH,
    status: 'not-started',
    parent_path: SPEC_PATH,
    parent_row_id: 'US1',
    dependency_order: {
      id_prefix: 'S',
      format: 'table',
      rows: [row('S1'), row('S2', ['S1'])],
    },
  });

  it('places parent spec roots in Layer 0 and pins child tasks roots into a later layer', () => {
    const graph = buildDependencyGraph([spec, tasks]);
    // US1 (spec root) is the only node with no incoming edges — it
    // alone sits in Layer 0. US2 depends on US1, S1 depends on US1
    // (cross-artifact), so both land in Layer 1. S2 depends on S1, so
    // it lands in Layer 2.
    expect(graph.layers).toEqual([
      { layer: 0, node_ids: [`${SPEC_PATH}#US1`] },
      {
        layer: 1,
        node_ids: [`${SPEC_PATH}#US2`, `${TASKS_PATH}#S1`],
      },
      { layer: 2, node_ids: [`${TASKS_PATH}#S2`] },
    ]);
  });

  it('cross-artifact edges only pin a child record\'s roots, not its non-root rows', () => {
    // S2 depends on S1 inside the tasks table; the cross-artifact edge
    // from US1 must not also pin S2 directly (otherwise its in-degree
    // would jump to 2 and the topological depth would silently break).
    const graph = buildDependencyGraph([spec, tasks]);
    // S2 should appear after S1 in the layer ordering.
    const s1Layer = graph.layers.findIndex((l) =>
      l.node_ids.includes(`${TASKS_PATH}#S1`),
    );
    const s2Layer = graph.layers.findIndex((l) =>
      l.node_ids.includes(`${TASKS_PATH}#S2`),
    );
    expect(s1Layer).toBeGreaterThanOrEqual(0);
    expect(s2Layer).toBe(s1Layer + 1);
  });

  it('emits no edge when the parent record is missing (orphaned child)', () => {
    // Tasks record references a parent path that does not appear in
    // the records array. With no parent node to pin against, the
    // tasks' root row (S1) lands back in Layer 0.
    const orphan = makeRecord({
      type: 'tasks',
      path: 'specs/orphan/01-foo.tasks.md',
      status: 'not-started',
      parent_path: 'specs/missing/missing.spec.md',
      parent_row_id: 'US1',
      dependency_order: {
        id_prefix: 'S',
        format: 'table',
        rows: [row('S1'), row('S2', ['S1'])],
      },
    });
    const graph = buildDependencyGraph([orphan]);
    expect(graph.layers).toEqual([
      { layer: 0, node_ids: ['specs/orphan/01-foo.tasks.md#S1'] },
      { layer: 1, node_ids: ['specs/orphan/01-foo.tasks.md#S2'] },
    ]);
  });

  it('virtual records contribute their rolled-up not-started status when they have rows; routing through them still works when they do not', () => {
    // A virtual record in the wild carries `format: 'missing'` /
    // `rows: []`, but a child of that virtual must still be able to
    // chain off the virtual's parent. Modeled here as: spec → virtual
    // tasks (no rows) — the virtual contributes nothing itself, and
    // the spec's roots still sit in Layer 0.
    const virtualTasks = makeRecord({
      type: 'tasks',
      path: 'specs/sample/01-first.tasks.md',
      status: 'not-started',
      virtual: true,
      parent_path: SPEC_PATH,
      parent_row_id: 'US1',
      dependency_order: {
        id_prefix: 'S',
        format: 'missing',
        rows: [],
      },
    });
    const graph = buildDependencyGraph([spec, virtualTasks]);
    // Only the spec's two rows produce graph nodes; the virtual tasks
    // record contributes nothing and produces no errors.
    expect(Object.keys(graph.nodes).sort()).toEqual([
      `${SPEC_PATH}#US1`,
      `${SPEC_PATH}#US2`,
    ]);
    expect(graph.layers).toEqual([
      { layer: 0, node_ids: [`${SPEC_PATH}#US1`] },
      { layer: 1, node_ids: [`${SPEC_PATH}#US2`] },
    ]);
  });

  it('virtual tasks records that DO carry rows contribute graph nodes with not-started status', () => {
    const virtualTasks = makeRecord({
      type: 'tasks',
      path: 'specs/sample/01-first.tasks.md',
      status: 'not-started',
      virtual: true,
      parent_path: SPEC_PATH,
      parent_row_id: 'US1',
      dependency_order: {
        id_prefix: 'S',
        format: 'table',
        rows: [row('S1')],
      },
    });
    const graph = buildDependencyGraph([spec, virtualTasks]);
    const node = graph.nodes['specs/sample/01-first.tasks.md#S1'];
    expect(node).toBeDefined();
    if (node === undefined) return;
    expect(node.status).toBe('not-started');
  });
});

describe('buildDependencyGraph — dangling references (AS 10.6)', () => {
  const SPEC_PATH = 'specs/sample/sample.spec.md';

  it('emits one fully-qualified entry per unique dropped reference, drops the missing edge, and still layers valid edges', () => {
    // US3 depends on US1 (valid) and US9 (dangling); the parser drops
    // US9 from US3's depends_on at parse time and records it in the
    // structured dangling_refs field.
    const spec = makeRecord({
      type: 'spec',
      path: SPEC_PATH,
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [
          row('US1'),
          row('US2'),
          row('US3', ['US1']),
        ],
        dangling_refs: [{ source_id: 'US3', missing_id: 'US9' }],
      },
    });
    const graph = buildDependencyGraph([spec]);
    expect(graph.dangling_refs).toEqual([
      {
        source_id: `${SPEC_PATH}#US3`,
        missing_id: `${SPEC_PATH}#US9`,
      },
    ]);
    // Valid edge US1 → US3 still pulls US3 into Layer 1; US2 stays in
    // Layer 0 alongside US1.
    expect(graph.layers).toEqual([
      {
        layer: 0,
        node_ids: [`${SPEC_PATH}#US1`, `${SPEC_PATH}#US2`],
      },
      { layer: 1, node_ids: [`${SPEC_PATH}#US3`] },
    ]);
  });

  it('de-duplicates identical (source_id, missing_id) pairs', () => {
    const spec = makeRecord({
      type: 'spec',
      path: SPEC_PATH,
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1')],
        dangling_refs: [
          { source_id: 'US1', missing_id: 'US9' },
          { source_id: 'US1', missing_id: 'US9' },
        ],
      },
    });
    const graph = buildDependencyGraph([spec]);
    expect(graph.dangling_refs).toEqual([
      {
        source_id: `${SPEC_PATH}#US1`,
        missing_id: `${SPEC_PATH}#US9`,
      },
    ]);
  });

  it('does NOT parse warning strings to derive dangling_refs', () => {
    // The record carries a parser-style warning string but no
    // structured `dangling_refs` field. The graph builder MUST consume
    // the structured field exclusively, so `graph.dangling_refs` must
    // be empty here.
    const spec = makeRecord({
      type: 'spec',
      path: SPEC_PATH,
      status: 'in-progress',
      warnings: [
        "dependency_order: US1 depends on dangling ID 'US9' — dropped",
      ],
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1')],
      },
    });
    const graph = buildDependencyGraph([spec]);
    expect(graph.dangling_refs).toEqual([]);
  });

  it('returns empty dangling_refs when no records carry dropped references', () => {
    const spec = makeRecord({
      type: 'spec',
      path: SPEC_PATH,
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1'), row('US2', ['US1'])],
      },
    });
    const graph = buildDependencyGraph([spec]);
    expect(graph.dangling_refs).toEqual([]);
  });
});

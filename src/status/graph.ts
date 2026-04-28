/**
 * Pure cross-artifact dependency-graph builder. Unions every artifact's
 * parsed `## Dependency Order` table into a single directed graph and
 * computes topological layers via Kahn's algorithm so the `--graph`
 * renderer can group nodes by "ready-to-work-on" depth.
 *
 * This module is deliberately side-effect-free. `buildDependencyGraph`
 * performs no I/O, never mutates its input, and returns the same graph
 * for the same input — the graph is a pure projection of the records
 * supplied to it.
 *
 * ## Scope (US10 Slice 2 Task 1)
 *
 * Only the within-artifact case is implemented here: every node lives
 * inside the table that produced it, and only intra-table `depends_on`
 * edges contribute to layering. Cross-artifact edges (parent rows
 * blocking child roots), structured `dangling_refs`, virtual-record
 * inclusion as graph nodes, and cycle detection are explicitly deferred
 * to Tasks 2 and 3 of this same slice. This task therefore always
 * returns `cycles: []` and `dangling_refs: []`.
 *
 * ## Node identity
 *
 * Nodes are keyed by fully-qualified ID — `<record.path>#<row.id>`
 * (e.g. `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md#US2`).
 * Fully-qualified IDs allow the same short ID (`US1`) to appear in
 * multiple specs without collision, which becomes essential once
 * cross-artifact stitching lands in Task 2.
 *
 * ## Determinism (SD-013)
 *
 * Within-layer node ordering is not specified by data-model §6 or
 * AS 10.1. The implementation orders by:
 *   1. The artifact's discovery order in the input `records` array.
 *   2. The row's order inside its `## Dependency Order` table.
 * Layer assignment iterates zero-in-degree nodes in this discovery
 * order so layer contents always mirror user-authored tables.
 *
 * ## Skipped records
 *
 * Two record classes are skipped before any node is emitted:
 *   - Records whose `dependency_order.format !== 'table'` (i.e. legacy
 *     or missing). The owning record is already `status: 'unknown'` in
 *     these cases and contributes nothing meaningful to the graph.
 *   - Records whose `path` matches one of the synthetic tree sentinels
 *     (`ORPHANED_SPECS_PATH`, `BROKEN_LINKS_PATH`, `ORPHANED_TASKS_PATH`).
 *     These exist purely as tree-grouping stand-ins and have no place
 *     in the dependency graph.
 */

import {
  BROKEN_LINKS_PATH,
  ORPHANED_SPECS_PATH,
  ORPHANED_TASKS_PATH,
} from './tree.js';
import type {
  ArtifactRecord,
  DependencyGraph,
  DependencyNode,
} from './types.js';

const SENTINEL_PATHS: ReadonlySet<string> = new Set([
  ORPHANED_SPECS_PATH,
  BROKEN_LINKS_PATH,
  ORPHANED_TASKS_PATH,
]);

/** Build the fully-qualified node id for a row inside a record. */
function nodeId(recordPath: string, rowId: string): string {
  return `${recordPath}#${rowId}`;
}

/**
 * Project a flat `ArtifactRecord[]` into a {@link DependencyGraph}. Pure
 * function — does no I/O and does not mutate its input. See the
 * module-level JSDoc for the scoping rules.
 */
export function buildDependencyGraph(
  records: ArtifactRecord[],
): DependencyGraph {
  const nodes: Record<string, DependencyNode> = {};
  // Discovery order — the index a node was first observed at while
  // walking records in input order and rows in table order. Drives both
  // Kahn-queue ordering and within-layer sort.
  const discoveryOrder = new Map<string, number>();
  // Adjacency: for each node, the nodes it points TO (i.e. the nodes
  // that depend on it). Kahn's algorithm consumes outgoing edges to
  // decrement successors' in-degree.
  const outgoing = new Map<string, string[]>();
  // In-degree count per node; nodes with zero in-degree start in the
  // queue.
  const inDegree = new Map<string, number>();

  let cursor = 0;
  for (const record of records) {
    if (SENTINEL_PATHS.has(record.path)) continue;
    if (record.dependency_order.format !== 'table') continue;

    // First pass: register every row as a node. Doing this before
    // wiring edges means a self-referential `depends_on` still finds
    // its target node; it also keeps the discovery-order map populated
    // before we read it during edge construction.
    for (const row of record.dependency_order.rows) {
      const id = nodeId(record.path, row.id);
      // Defensive: if two rows in the same table somehow share an ID,
      // the first one wins — the parser already flags this as a
      // warning on the owning record, so the graph need not re-flag it.
      if (id in nodes) continue;
      nodes[id] = {
        record_path: record.path,
        row,
        status: record.status,
      };
      discoveryOrder.set(id, cursor);
      cursor += 1;
      outgoing.set(id, []);
      inDegree.set(id, 0);
    }
  }

  // Second pass: wire edges. We re-walk records so this stays a single
  // top-level loop; per-row work is O(depends_on.length).
  for (const record of records) {
    if (SENTINEL_PATHS.has(record.path)) continue;
    if (record.dependency_order.format !== 'table') continue;

    for (const row of record.dependency_order.rows) {
      const targetId = nodeId(record.path, row.id);
      if (!(targetId in nodes)) continue;
      for (const depId of row.depends_on) {
        const sourceId = nodeId(record.path, depId);
        // Within-task scope: only intra-table edges are considered. A
        // depends_on entry whose ID does not name a sibling row in the
        // same table is silently dropped here — Task 2 will surface
        // these via structured `dangling_refs`.
        if (!(sourceId in nodes)) continue;
        const successors = outgoing.get(sourceId);
        // `outgoing.get` is guaranteed defined because every key in
        // `nodes` was seeded above; the explicit guard keeps TS happy
        // without an `as` assertion.
        if (successors === undefined) continue;
        successors.push(targetId);
        inDegree.set(targetId, (inDegree.get(targetId) ?? 0) + 1);
      }
    }
  }

  // Kahn's algorithm — group nodes whose in-degree is currently zero
  // into a layer, decrement their successors, and repeat until the
  // queue empties. Iterating `discoveryOrder` (which is insertion-
  // ordered) gives the deterministic within-layer ordering required by
  // SD-013.
  const layers: DependencyGraph['layers'] = [];
  const remainingInDegree = new Map(inDegree);
  // Track which nodes have been placed in a layer so subsequent passes
  // do not revisit them when an earlier layer's `outgoing` walk lowers
  // their in-degree to zero.
  const placed = new Set<string>();
  let layerIndex = 0;

  // Sort node IDs once by discovery order; we re-scan this list each
  // pass to harvest the next layer's members.
  const orderedIds = [...discoveryOrder.entries()]
    .sort(([, a], [, b]) => a - b)
    .map(([id]) => id);

  while (placed.size < orderedIds.length) {
    const layerNodeIds: string[] = [];
    for (const id of orderedIds) {
      if (placed.has(id)) continue;
      if ((remainingInDegree.get(id) ?? 0) === 0) {
        layerNodeIds.push(id);
      }
    }
    if (layerNodeIds.length === 0) {
      // Within-task scope cannot produce cycles for this slice (every
      // edge is intra-table and the parser drops dangling refs), but
      // breaking out defensively avoids an infinite loop if a future
      // change introduces them. Cycle handling lands in Task 3.
      break;
    }
    for (const id of layerNodeIds) {
      placed.add(id);
      const successors = outgoing.get(id) ?? [];
      for (const successorId of successors) {
        const next = (remainingInDegree.get(successorId) ?? 0) - 1;
        remainingInDegree.set(successorId, next);
      }
    }
    layers.push({ layer: layerIndex, node_ids: layerNodeIds });
    layerIndex += 1;
  }

  return {
    nodes,
    layers,
    cycles: [],
    dangling_refs: [],
  };
}

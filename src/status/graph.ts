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
 * ## Scope (US10 Slice 2 Tasks 1 + 2)
 *
 * Task 1 covered the within-artifact case: every node lives inside the
 * table that produced it, and only intra-table `depends_on` edges
 * contribute to layering. Task 2 extends that union with:
 *
 *   - Cross-artifact edges via the scanner-populated `parent_path` +
 *     `parent_row_id` fields. A child record's "root" rows (rows whose
 *     intra-table `depends_on` is empty) are treated as blocked by the
 *     fully-qualified parent dep-order row that referenced the child,
 *     so the unioned graph spans the full RFC → features → spec → tasks
 *     lineage. Cross-artifact edges are derived exclusively from
 *     `parent_path` / `parent_row_id` — never from filename convention.
 *
 *   - Structured dangling-reference reporting via
 *     {@link DependencyOrderTable.dangling_refs}. The parser now
 *     records every `depends_on` ID it dropped during second-pass
 *     resolution alongside the existing warning string; the builder
 *     consumes that structured metadata (never parses warnings) and
 *     emits one fully-qualified `{ source_id, missing_id }` entry per
 *     unique pair into `graph.dangling_refs`.
 *
 *   - Virtual records (`virtual: true`) participate as ordinary graph
 *     nodes. In practice they have `format: 'missing'` / `rows: []`, so
 *     they often contribute zero nodes themselves, but cross-artifact
 *     edges still flow through them via the `parent_row_id` link from
 *     any further child that references them.
 *
 * Cycle detection still defers to Task 3; this module currently always
 * returns `cycles: []`. If a cross-artifact cycle ever produced one,
 * the Kahn pass would simply leave the cyclic nodes unplaced and the
 * `while` loop would terminate early — Task 3 will surface them.
 *
 * ## Node identity
 *
 * Nodes are keyed by fully-qualified ID — `<record.path>#<row.id>`
 * (e.g. `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md#US2`).
 * Fully-qualified IDs allow the same short ID (`US1`) to appear in
 * multiple specs without collision, which is essential once
 * cross-artifact stitching is in play.
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
 *     Virtual records typically fall into this bucket too — they hold
 *     no rows of their own — but their `parent_path` / `parent_row_id`
 *     links still inform cross-artifact edges into any further child.
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
  // De-duplicating set of cross-artifact edges already wired so
  // duplicate parent rows (extremely unusual in practice) cannot
  // double-count a successor's in-degree.
  const seenEdges = new Set<string>();

  // Filter out sentinel-pathed records up front. We still iterate
  // `records` for cross-artifact stitching below, but those records
  // never contribute any nodes either way.
  const eligible = records.filter((r) => !SENTINEL_PATHS.has(r.path));

  let cursor = 0;
  for (const record of eligible) {
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

  // Second pass: wire intra-table edges. Re-walks records so this stays
  // a single top-level loop; per-row work is O(depends_on.length).
  for (const record of eligible) {
    if (record.dependency_order.format !== 'table') continue;

    for (const row of record.dependency_order.rows) {
      const targetId = nodeId(record.path, row.id);
      if (!(targetId in nodes)) continue;
      for (const depId of row.depends_on) {
        const sourceId = nodeId(record.path, depId);
        // Intra-table edges only — `depends_on` may only reference IDs
        // inside the same table. Anything else was a parse-time
        // dangling reference and was dropped before reaching us.
        if (!(sourceId in nodes)) continue;
        addEdge(sourceId, targetId, outgoing, inDegree, seenEdges);
      }
    }
  }

  // Third pass: stitch cross-artifact edges. A child record's "root"
  // rows (rows whose intra-table `depends_on` is empty) are blocked by
  // the parent row that referenced them. Per the data model
  // (§Relationships), parent linkage is authoritative via
  // `parent_path` + `parent_row_id` — populated by the scanner during
  // Phase 2 — so we read those exclusively rather than re-deriving
  // anything from filenames.
  //
  // Edges are only created when BOTH endpoints exist as graph nodes,
  // so a missing parent record (or a parent whose dep-order table
  // dropped the row) silently produces no edge. The child's root rows
  // simply remain at in-degree 0 and surface as graph roots, which is
  // the correct behavior for orphaned records.
  for (const record of eligible) {
    if (record.dependency_order.format !== 'table') continue;
    const parentPath = record.parent_path;
    const parentRowId = record.parent_row_id;
    if (typeof parentPath !== 'string' || parentPath.length === 0) continue;
    if (typeof parentRowId !== 'string' || parentRowId.length === 0) continue;
    const parentNodeId = nodeId(parentPath, parentRowId);
    if (!(parentNodeId in nodes)) continue;

    for (const row of record.dependency_order.rows) {
      // Only "root" rows (no intra-table predecessors) are pinned to the
      // parent — non-root rows are already gated by their intra-table
      // dependencies, which themselves transitively bottom out at the
      // record's roots.
      if (row.depends_on.length > 0) continue;
      const childNodeId = nodeId(record.path, row.id);
      if (!(childNodeId in nodes)) continue;
      addEdge(parentNodeId, childNodeId, outgoing, inDegree, seenEdges);
    }
  }

  // Fourth pass: collect structured dangling references from each
  // table and lift them into the graph's `dangling_refs` field with
  // fully-qualified IDs. We deliberately consume the parser's
  // structured field (never the warning strings) so the surfaces stay
  // independently typed.
  const dangling_refs: Array<{ source_id: string; missing_id: string }> = [];
  const seenDangling = new Set<string>();
  for (const record of eligible) {
    const tableDangling = record.dependency_order.dangling_refs;
    if (tableDangling === undefined) continue;
    for (const ref of tableDangling) {
      const source_id = nodeId(record.path, ref.source_id);
      const missing_id = nodeId(record.path, ref.missing_id);
      const key = `${source_id} ${missing_id}`;
      if (seenDangling.has(key)) continue;
      seenDangling.add(key);
      dangling_refs.push({ source_id, missing_id });
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
      // Cycle detection lands in Task 3. For now, breaking out
      // defensively avoids an infinite loop if a cross-artifact cycle
      // were ever introduced — the cyclic nodes simply remain
      // unplaced.
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
    dangling_refs,
  };
}

/**
 * Wire a directed edge `source -> target` in the adjacency + in-degree
 * maps, de-duplicating against `seenEdges` so the same pair cannot
 * inflate `target`'s in-degree more than once.
 */
function addEdge(
  source: string,
  target: string,
  outgoing: Map<string, string[]>,
  inDegree: Map<string, number>,
  seenEdges: Set<string>,
): void {
  const key = `${source} ${target}`;
  if (seenEdges.has(key)) return;
  seenEdges.add(key);
  const successors = outgoing.get(source);
  if (successors === undefined) return;
  successors.push(target);
  inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
}

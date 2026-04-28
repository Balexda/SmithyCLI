/**
 * Pure text rendering over the {@link DependencyGraph} produced by
 * {@link buildDependencyGraph}. Walks the graph's topological layers and
 * emits a block of lines describing each layer's members, with done-layer
 * collapsing in default mode and a flat cycle-warning fallback when the
 * graph is not a DAG.
 *
 * This module is deliberately side-effect-free. `renderGraph` performs
 * no I/O, does not touch `process.stdout`, and never mutates its input —
 * the output is a pure function of the graph (and the options bag).
 *
 * ## Layout
 *
 * ### Layered view (default — `graph.cycles.length === 0`)
 *
 * One labeled block per entry in `graph.layers`, in order. Layer 0 leads
 * with the canonical "ready to work" copy from contracts §1:
 *
 * ```
 * Layer 0 — ready to work (2 items)
 * ├─ specs/.../foo.spec.md#US1 — Scan Artifacts and Classify Status  ◐
 * └─ specs/.../foo.spec.md#US8 — Deterministic Dependency Order      ○
 *
 * Layer 1 (1 item)
 * └─ specs/.../foo.spec.md#US2 — Render a Hierarchical Status View   ○
 * ```
 *
 * Subsequent layers use the simpler `Layer N (M items)` form. Each node
 * line uses tree connectors drawn from the active {@link Theme}'s
 * `glyphs` bundle (`├─` for non-last members, `└─` for the last
 * member of each layer). Adjacent layer blocks are separated by a
 * single blank line.
 *
 * Each node line carries:
 * - the fully-qualified node id (`<artifact-path>#<row-id>`),
 * - an em-dash separator and the title from the underlying
 *   {@link DependencyNode.row.title}, and
 * - a trailing status marker mirroring the icon mapping used by the
 *   default tree renderer (`✓` / `◐` / `○` / `⚠`).
 *
 * #### Done-layer collapsing (AS 10.4)
 *
 * When every node in a layer has `status === 'done'` AND
 * `options.all !== true`, the entire layer collapses to a single
 * `Layer N: DONE (M items)` line with no member listing. Passing
 * `{ all: true }` disables collapsing — every layer is fully expanded
 * regardless of member status.
 *
 * ### Cycle fallback (AS 10.3 — `graph.cycles.length > 0`)
 *
 * When the graph contains cycles, layer assignment is undefined for the
 * cyclic subgraph and the renderer falls back to a flat listing. The
 * output leads with a warning block:
 *
 * ```
 * WARNING: dependency graph contains cycle(s); falling back to flat listing.
 * Cycle: specs/foo.spec.md#US1 -> specs/foo.spec.md#US2 -> specs/foo.spec.md#US1
 *
 * Nodes (flat fallback):
 * ├─ specs/foo.spec.md#US3 — Independent  ○
 * └─ specs/foo.spec.md#US4 — Downstream   ○
 * ```
 *
 * Each cycle entry repeats the first id at the tail so the loop is
 * visually obvious. Cyclic nodes intentionally do NOT appear in the
 * flat fallback — they already surface on the `Cycle:` line — and no
 * `Layer N` heading is emitted for them.
 *
 * ### Dangling references (AS 10.6)
 *
 * When `graph.dangling_refs` is non-empty, a `Dangling refs:` block is
 * appended after the layer / cycle blocks, with one painted line per
 * unresolved pair: `<source_id> -> <missing_id> (unresolved)`.
 *
 * ### Empty graph
 *
 * `renderGraph({ nodes: {}, layers: [], cycles: [], dangling_refs: [] })`
 * returns the empty string, matching the {@link renderTree} convention.
 */

import { createTheme, type Theme } from './theme.js';
import type { DependencyGraph, DependencyNode } from './types.js';

/**
 * Options accepted by {@link renderGraph}. A default theme (UTF-8
 * glyphs, no color) is used when `theme` is omitted so callers can
 * skip the bag entirely for plain-text rendering.
 */
export interface RenderGraphOptions {
  /**
   * Theme bundle controlling glyphs, icons, and paint helpers. Callers
   * typically build it once at the top of `statusAction` via
   * {@link buildTheme}; tests construct deterministic themes via
   * {@link createTheme}.
   */
  theme?: Theme;
  /**
   * When `true`, disable done-layer collapsing — every layer expands
   * with its full member list, even when every member is `done`.
   * Defaults to `false`, matching the contracts default-mode collapsing
   * behavior (AS 10.4).
   */
  all?: boolean;
}

/**
 * Default theme used when `renderGraph` is called without an explicit
 * theme. Keeps UTF-8 glyphs and disables color so snapshots stay
 * ANSI-free.
 */
const DEFAULT_THEME: Theme = createTheme({ color: false, encoding: 'utf8' });

/**
 * Render a {@link DependencyGraph} as a block of layer / cycle / dangling
 * lines. Pure function — does no I/O and does not mutate its input.
 * Callers are responsible for writing the returned string to stdout.
 *
 * The returned string does NOT include a trailing newline; typical
 * callers pipe it through `console.log`, which adds one. An empty graph
 * (no nodes, no layers, no cycles, no dangling refs) yields the empty
 * string.
 */
export function renderGraph(
  graph: DependencyGraph,
  options: RenderGraphOptions = {},
): string {
  const isEmpty =
    Object.keys(graph.nodes).length === 0 &&
    graph.layers.length === 0 &&
    graph.cycles.length === 0 &&
    graph.dangling_refs.length === 0;
  if (isEmpty) return '';

  const theme = options.theme ?? DEFAULT_THEME;
  const all = options.all === true;
  const blocks: string[] = [];

  if (graph.cycles.length > 0) {
    blocks.push(formatCycleFallback(graph, theme));
  } else {
    const layered = formatLayeredView(graph, theme, all);
    if (layered.length > 0) blocks.push(layered);
  }

  if (graph.dangling_refs.length > 0) {
    blocks.push(formatDanglingRefs(graph, theme));
  }

  return blocks.join('\n\n');
}

/**
 * Format the layered view (DAG case). Returns the empty string when no
 * layers exist (which can happen for an entirely cyclic graph — but in
 * that branch we never call this function). One block per layer,
 * separated by a single blank line.
 */
function formatLayeredView(
  graph: DependencyGraph,
  theme: Theme,
  all: boolean,
): string {
  if (graph.layers.length === 0) return '';
  const blocks: string[] = [];
  for (const layer of graph.layers) {
    blocks.push(formatLayerBlock(layer, graph, theme, all));
  }
  return blocks.join('\n\n');
}

/**
 * Format one layer block: heading line plus, when expanded, one tree-
 * connector line per member node. When every member of a layer is
 * `done` and collapsing is enabled (`all === false`), the heading
 * shifts to the `Layer N: DONE (M items)` form and the member list is
 * suppressed.
 */
function formatLayerBlock(
  layer: { layer: number; node_ids: string[] },
  graph: DependencyGraph,
  theme: Theme,
  all: boolean,
): string {
  const total = layer.node_ids.length;
  const allDone =
    total > 0 &&
    layer.node_ids.every((id) => graph.nodes[id]?.status === 'done');

  if (allDone && !all) {
    return formatLayerHeading(layer.layer, total, { collapsedDone: true });
  }

  const heading = formatLayerHeading(layer.layer, total, {
    collapsedDone: false,
  });
  const lines: string[] = [heading];
  for (let i = 0; i < layer.node_ids.length; i++) {
    const id = layer.node_ids[i];
    if (id === undefined) continue;
    const node = graph.nodes[id];
    if (node === undefined) continue;
    const isLast = i === layer.node_ids.length - 1;
    lines.push(formatNodeLine(id, node, isLast, theme));
  }
  return lines.join('\n');
}

/**
 * Compose the heading line for a layer. Layer 0 leads with the
 * "ready to work" copy from contracts §1; subsequent layers use the
 * simpler `Layer N (M items)` form. Singular `1 item` vs plural
 * `M items` is selected based on the count.
 *
 * `collapsedDone === true` overrides the layer-specific copy with the
 * uniform `Layer N: DONE (M items)` collapse line (AS 10.4) — the
 * caller decides when to flip it.
 */
function formatLayerHeading(
  layerIndex: number,
  count: number,
  opts: { collapsedDone: boolean },
): string {
  const itemsWord = count === 1 ? 'item' : 'items';
  if (opts.collapsedDone) {
    return `Layer ${layerIndex}: DONE (${count} ${itemsWord})`;
  }
  if (layerIndex === 0) {
    return `Layer 0 — ready to work (${count} ${itemsWord})`;
  }
  return `Layer ${layerIndex} (${count} ${itemsWord})`;
}

/**
 * Format a single node line under a layer / fallback heading. Uses the
 * theme's `branch` / `lastBranch` glyphs for the connector, an em-dash
 * to separate the fully-qualified id from the row title, and a trailing
 * status marker.
 */
function formatNodeLine(
  id: string,
  node: DependencyNode,
  isLast: boolean,
  theme: Theme,
): string {
  const connector = isLast ? theme.glyphs.lastBranch : theme.glyphs.branch;
  const marker = formatStatusMarker(node, theme);
  return `${connector}${id} — ${node.row.title}  ${marker}`;
}

/**
 * Derive the trailing status marker for a graph node. Mirrors the
 * default tree renderer's icon mapping but is inlined here so the two
 * renderers can evolve independently. Counters and progress segments
 * (used by the tree renderer's in-progress parents and tasks rows) are
 * intentionally omitted — graph nodes carry only their owning record's
 * rolled-up status, not the per-record completion arithmetic.
 */
function formatStatusMarker(node: DependencyNode, theme: Theme): string {
  switch (node.status) {
    case 'done':
      return theme.paint.done(theme.icons.done);
    case 'in-progress':
      return theme.paint.inProgress(theme.icons.inProgress);
    case 'not-started':
      return theme.paint.notStarted(theme.icons.notStarted);
    case 'unknown':
      return theme.paint.unknown(theme.icons.unknown);
  }
}

/**
 * Format the cycle-warning fallback. Leads with a painted warning line,
 * one `Cycle:` line per cycle entry (closing the loop by repeating the
 * first id), and then a flat listing of every non-cyclic node — both
 * the nodes Kahn's algorithm placed in `graph.layers` AND any nodes
 * downstream of a cycle that the builder left outside both `layers`
 * and `cycles` (those nodes never reached in-degree zero, so they are
 * absent from any layer, but they are not themselves cyclic). Cyclic
 * nodes are intentionally excluded from the flat listing — they
 * already appear on the cycle lines above.
 */
function formatCycleFallback(graph: DependencyGraph, theme: Theme): string {
  const lines: string[] = [];
  lines.push(
    theme.paint.error(
      'WARNING: dependency graph contains cycle(s); falling back to flat listing.',
    ),
  );
  // Build the set of cyclic IDs once so we can exclude them from the
  // flat fallback while keeping iteration over `graph.nodes` cheap.
  const cyclicIds = new Set<string>();
  for (const cycle of graph.cycles) {
    if (cycle.length === 0) continue;
    const first = cycle[0];
    if (first === undefined) continue;
    for (const id of cycle) cyclicIds.add(id);
    // Close the loop by repeating the first id at the tail so the
    // cycle is visually obvious.
    const closed = [...cycle, first];
    lines.push(`Cycle: ${closed.join(' -> ')}`);
  }
  // Flat fallback covers every non-cyclic node, not just the ones that
  // ended up inside `graph.layers`. Walk `graph.layers` first so layered
  // nodes keep their topological ordering, then sweep `graph.nodes` to
  // catch any node Kahn's left outside both `layers` and `cycles` (i.e.
  // nodes downstream of a cycle whose in-degree never reached zero).
  // Without that second pass those nodes would silently disappear from
  // the rendered output even though the JSON payload reports them.
  const flatIds: string[] = [];
  const seenFlat = new Set<string>();
  for (const layer of graph.layers) {
    for (const id of layer.node_ids) {
      if (cyclicIds.has(id)) continue;
      if (seenFlat.has(id)) continue;
      seenFlat.add(id);
      flatIds.push(id);
    }
  }
  for (const id of Object.keys(graph.nodes)) {
    if (cyclicIds.has(id)) continue;
    if (seenFlat.has(id)) continue;
    seenFlat.add(id);
    flatIds.push(id);
  }
  if (flatIds.length > 0) {
    const flatLines: string[] = ['', 'Nodes (flat fallback):'];
    for (let i = 0; i < flatIds.length; i++) {
      const id = flatIds[i];
      if (id === undefined) continue;
      const node = graph.nodes[id];
      if (node === undefined) continue;
      const isLast = i === flatIds.length - 1;
      flatLines.push(formatNodeLine(id, node, isLast, theme));
    }
    lines.push(...flatLines);
  }
  return lines.join('\n');
}

/**
 * Format the trailing `Dangling refs:` block. One painted line per
 * unresolved pair, each formatted as
 * `<source_id> -> <missing_id> (unresolved)`. The block is omitted by
 * the caller when `graph.dangling_refs` is empty.
 */
function formatDanglingRefs(graph: DependencyGraph, theme: Theme): string {
  const lines: string[] = ['Dangling refs:'];
  for (const ref of graph.dangling_refs) {
    lines.push(
      theme.paint.error(`${ref.source_id} -> ${ref.missing_id} (unresolved)`),
    );
  }
  return lines.join('\n');
}

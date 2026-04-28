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
 * ├─ Scan Artifacts and Classify Status  ◐  specs/.../foo.spec.md#US1
 * └─ Deterministic Dependency Order      ○  specs/.../foo.spec.md#US8
 *
 * Layer 1 (1 item)
 * └─ Render a Hierarchical Status View   ○  specs/.../foo.spec.md#US2
 * ```
 *
 * Subsequent layers use the simpler `Layer N (M items)` form. Each node
 * line uses tree connectors drawn from the active {@link Theme}'s
 * `glyphs` bundle (`├─` for non-last members, `└─` for the last
 * member of each layer). Adjacent layer blocks are separated by a
 * single blank line.
 *
 * Each node line carries:
 * - the title from the underlying {@link DependencyNode.row.title} as
 *   the primary, scannable label,
 * - a trailing status marker mirroring the icon mapping used by the
 *   default tree renderer (`✓` / `◐` / `○` / `⚠`), and
 * - either a per-row next-action hint (`→ smithy.<cmd> <args>`) when
 *   the caller passes {@link RenderGraphOptions.records}, or the
 *   fully-qualified node id (`<artifact-path>#<row-id>`) as a
 *   trailing, dim-painted suffix when no records are supplied. The
 *   action hint mirrors the `Next:` line in the summary header and the
 *   per-record hints under `renderTree` so the graph view is visually
 *   consistent with the rest of `smithy status`. Done / unknown
 *   downstreams yield no hint; their lines fall back to the dim FQ id.
 *
 * #### Done-item hiding and layer omission (AS 10.4)
 *
 * Default mode aggressively focuses the view on what still needs work:
 *
 * - Within a partially-done layer, members with `status === 'done'` are
 *   hidden from the listing. The layer heading gains a
 *   `, N done hidden` suffix so the suppressed work is still
 *   accounted for (e.g. `Layer 0 — ready to work (11 items, 9 done hidden)`).
 *   Members with any other status (`in-progress`, `not-started`,
 *   `unknown`) always surface so parse errors and not-yet-started work
 *   stay visible.
 * - When every member of a layer is `done` (i.e. nothing actionable
 *   remains after the filter), the entire layer is omitted from the
 *   rendered output. No `Layer N: DONE` heading is emitted — the per-
 *   layer done count adds no actionable signal, and the user can
 *   re-expand via `--all` if they want to see the full graph.
 * - Passing `{ all: true }` disables both the hide-done filter and the
 *   layer omission — every member of every layer is listed regardless
 *   of status, and the heading omits the `done hidden` suffix.
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

import path from 'node:path';

import { formatNextAction } from './suggester.js';
import { createTheme, type Theme } from './theme.js';
import type {
  ArtifactRecord,
  DependencyGraph,
  DependencyNode,
  NextAction,
} from './types.js';

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
  /**
   * Optional record set used to enrich each node line with a per-row
   * next-action hint (e.g. `→ smithy.cut <spec-folder> 1`) instead of
   * the dim fully-qualified id. When provided, the renderer mirrors the
   * `→ <command> <args>` shape that `renderTree` and the summary
   * header's `Next:` line use, so the graph view is visually
   * consistent with the rest of `smithy status`. When omitted, the
   * suffix falls back to the dim FQ id — keeps unit tests that exercise
   * just the graph algorithm light.
   *
   * Per-row resolution: a node's hint comes from (a) the downstream
   * record claimed by the row's `artifact_path` (looked up by
   * `parent_path` + `parent_row_id` so virtual records emitted by the
   * scanner participate too) when that record carries a non-null
   * `next_action`; or (b) a synthesized hint based on the owning
   * record's type and the row's numeric suffix when no downstream
   * record exists (slice rows in tasks files, or rows whose owner is
   * itself the actionable level). Done-status downstreams yield no
   * hint and the line falls back to the dim FQ id.
   */
  records?: ArtifactRecord[];
}

/**
 * Internal lookup tables built once per `renderGraph` call from the
 * caller-supplied {@link RenderGraphOptions.records}. Both maps are
 * O(1) so per-node action derivation stays cheap even on large repos.
 */
interface RecordLookup {
  /** Records keyed by their canonical `path`. */
  byPath: Map<string, ArtifactRecord>;
  /**
   * Records keyed by `<parent_path>#<parent_row_id>` — the inverse
   * lineage edge. Lets a graph node look up the record claimed by the
   * row that owns it without re-deriving the naming convention.
   */
  byParentSlot: Map<string, ArtifactRecord>;
}

function buildRecordLookup(records: ArtifactRecord[]): RecordLookup {
  const byPath = new Map<string, ArtifactRecord>();
  const byParentSlot = new Map<string, ArtifactRecord>();
  for (const record of records) {
    byPath.set(record.path, record);
    if (
      typeof record.parent_path === 'string' &&
      record.parent_path.length > 0 &&
      typeof record.parent_row_id === 'string' &&
      record.parent_row_id.length > 0
    ) {
      byParentSlot.set(
        `${record.parent_path}#${record.parent_row_id}`,
        record,
      );
    }
  }
  return { byPath, byParentSlot };
}

/**
 * Derive the per-row {@link NextAction} for a graph node, mirroring the
 * `→ smithy.<cmd> <args>` shape that `renderTree` and the summary
 * header surface. Returns `null` when the row has no actionable next
 * step (the downstream record is `done` or the lookup table cannot
 * find an owning record).
 *
 * The per-row variant is intentionally distinct from the per-record
 * `suggestNextAction`: a spec record carries one collapsed
 * `smithy.cut` hint (the first virtual story), but each user-story
 * row in that spec wants its OWN `smithy.cut <spec> <N>` hint so the
 * graph view tells the user exactly which story to act on. We resolve
 * by looking up the downstream record (real or virtual) via the
 * `byParentSlot` map — the scanner-populated `parent_row_id` link is
 * authoritative — and falling back to a synthesised hint only when the
 * row has no downstream record (slice rows in tasks files; certain
 * pathological cases).
 */
function deriveRowAction(
  node: DependencyNode,
  lookup: RecordLookup,
): NextAction | null {
  // Preferred path: the downstream record (real or virtual) carries
  // the action via the suggester's per-record rules. Virtual records
  // emitted by the scanner already produce `smithy.cut <folder> <N>`
  // for unstarted stories — exactly the per-row hint we want — so a
  // simple lookup avoids re-implementing that logic here.
  const downstreamKey = `${node.record_path}#${node.row.id}`;
  const downstream = lookup.byParentSlot.get(downstreamKey);
  if (downstream !== undefined) {
    return downstream.next_action ?? null;
  }

  // Fallback path: the row has no downstream record. This happens for
  // slice rows in tasks files (slices have no separate files, so the
  // scanner never emits a child record), and as a defensive default
  // when the lookup misses for any other reason. Synthesise a hint
  // from the owning record's type so the view stays uniformly
  // actionable.
  const owning = lookup.byPath.get(node.record_path);
  if (owning === undefined) return null;
  if (owning.status === 'done' || owning.status === 'unknown') return null;

  const digits = node.row.id.match(/[0-9]+$/)?.[0];

  switch (owning.type) {
    case 'tasks': {
      // Slice rows always land here. `smithy.forge <tasks-path> <N>`
      // routes forge to the specific slice, matching the per-row
      // signal a graph reader expects.
      const args =
        digits !== undefined ? [owning.path, digits] : [owning.path];
      return {
        command: 'smithy.forge',
        arguments: args,
        reason: `${node.row.title} is an open slice; run smithy.forge to implement it.`,
      };
    }
    case 'spec': {
      // Defensive: a spec row whose downstream lookup missed. The
      // suggester's per-record rule (`smithy.cut <folder> <digits>`)
      // is the right shape.
      if (digits === undefined) return null;
      const folder = path.dirname(owning.path);
      return {
        command: 'smithy.cut',
        arguments: [folder, digits],
        reason: `${node.row.title} has no tasks file yet; run smithy.cut to decompose it.`,
      };
    }
    case 'features': {
      if (digits === undefined) return null;
      return {
        command: 'smithy.mark',
        arguments: [owning.path, digits],
        reason: `${node.row.title} has no spec yet; run smithy.mark to produce one.`,
      };
    }
    case 'rfc': {
      return {
        command: 'smithy.render',
        arguments: [owning.path],
        reason: `${node.row.title} has no features map yet; run smithy.render to produce one.`,
      };
    }
  }
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
  const lookup =
    options.records !== undefined ? buildRecordLookup(options.records) : null;
  const blocks: string[] = [];

  if (graph.cycles.length > 0) {
    blocks.push(formatCycleFallback(graph, theme, lookup));
  } else {
    const layered = formatLayeredView(graph, theme, all, lookup);
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
  lookup: RecordLookup | null,
): string {
  if (graph.layers.length === 0) return '';
  const blocks: string[] = [];
  for (const layer of graph.layers) {
    const block = formatLayerBlock(layer, graph, theme, all, lookup);
    // `formatLayerBlock` returns the empty string for fully-done
    // layers in default mode (those are omitted from the rendered
    // view rather than collapsed to a `DONE` heading). Skip them so
    // adjacent blocks do not get an extra blank line where the
    // collapse line used to live.
    if (block.length === 0) continue;
    blocks.push(block);
  }
  return blocks.join('\n\n');
}

/**
 * Format one layer block: heading line plus, when expanded, one tree-
 * connector line per actionable member.
 *
 * Default mode (`all === false`) hides members with `status === 'done'`
 * from the visible listing and tacks a `, N done hidden` suffix on the
 * heading so the dropped work is still accounted for. When every
 * member of the layer is `done` (zero actionable remainder), this
 * function returns the empty string so the caller omits the layer
 * entirely from the rendered output.
 *
 * `--all` mode (`all === true`) disables both behaviors — every member
 * surfaces with its full marker, and the heading omits the
 * `done hidden` suffix.
 */
function formatLayerBlock(
  layer: { layer: number; node_ids: string[] },
  graph: DependencyGraph,
  theme: Theme,
  all: boolean,
  lookup: RecordLookup | null,
): string {
  const total = layer.node_ids.length;

  // Partition members into actionable (everything that isn't `done`)
  // and hidden-done. In `--all` mode the partition collapses — every
  // member is "actionable" for display purposes, so no hiding occurs.
  const visibleIds: string[] = [];
  let doneHidden = 0;
  for (const id of layer.node_ids) {
    const node = graph.nodes[id];
    if (all || node === undefined || node.status !== 'done') {
      visibleIds.push(id);
    } else {
      doneHidden += 1;
    }
  }

  // Layer with no actionable members → omit entirely from default
  // mode. Earlier slices rendered a `Layer N: DONE (M items)`
  // collapse line, but that conveyed no actionable information — the
  // user already knows fully-done layers exist (they show up under
  // `--all`), and showing per-layer done counts just added noise.
  // Returning the empty string lets `formatLayeredView` filter the
  // block out before joining so no blank line is emitted in its
  // place either.
  if (visibleIds.length === 0 && total > 0) {
    return '';
  }

  const heading = formatLayerHeading(layer.layer, total, { doneHidden });
  const lines: string[] = [heading];
  for (let i = 0; i < visibleIds.length; i++) {
    const id = visibleIds[i];
    if (id === undefined) continue;
    const node = graph.nodes[id];
    if (node === undefined) continue;
    const isLast = i === visibleIds.length - 1;
    lines.push(formatNodeLine(id, node, isLast, theme, lookup));
  }
  return lines.join('\n');
}

/**
 * Compose the heading line for a layer. Layer 0 leads with the
 * "ready to work" copy from contracts §1; subsequent layers use the
 * simpler `Layer N (M items)` form. Singular `1 item` vs plural
 * `M items` is selected based on the count. `doneHidden > 0` appends
 * a `, N done hidden` suffix inside the parens so reviewers see that
 * work was suppressed by the hide-done filter.
 *
 * Note: fully-done layers are omitted from the rendered output
 * entirely (see `formatLayerBlock`); this function is never called
 * for them.
 */
function formatLayerHeading(
  layerIndex: number,
  count: number,
  opts: { doneHidden: number },
): string {
  const itemsWord = count === 1 ? 'item' : 'items';
  const hiddenSuffix =
    opts.doneHidden > 0 ? `, ${opts.doneHidden} done hidden` : '';
  if (layerIndex === 0) {
    return `Layer 0 — ready to work (${count} ${itemsWord}${hiddenSuffix})`;
  }
  return `Layer ${layerIndex} (${count} ${itemsWord}${hiddenSuffix})`;
}

/**
 * Format a single node line under a layer / fallback heading. The line
 * leads with the row's title (the scannable label), then the status
 * marker, then either a per-row next-action hint (when a record
 * lookup is available and the row resolves to an action) or the
 * dim-painted fully-qualified id (the fallback so the line still
 * carries a copy/paste-able referent).
 *
 * The action hint mirrors `formatNextAction`'s `→ <command> <args>`
 * shape so the graph view is visually consistent with the `Next:`
 * line in the summary header and the per-record hints under
 * `renderTree`. When the row has no action (done/unknown downstream,
 * or no records were supplied), the dim FQ id keeps the line useful
 * for navigation.
 */
function formatNodeLine(
  id: string,
  node: DependencyNode,
  isLast: boolean,
  theme: Theme,
  lookup: RecordLookup | null,
): string {
  const connector = isLast ? theme.glyphs.lastBranch : theme.glyphs.branch;
  const marker = formatStatusMarker(node, theme);
  const action = lookup !== null ? deriveRowAction(node, lookup) : null;
  const suffix =
    action !== null
      ? formatNextAction(action, theme.glyphs.arrow)
      : theme.paint.dim(id);
  return `${connector}${node.row.title}  ${marker}  ${suffix}`;
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
function formatCycleFallback(
  graph: DependencyGraph,
  theme: Theme,
  lookup: RecordLookup | null,
): string {
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
      flatLines.push(formatNodeLine(id, node, isLast, theme, lookup));
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

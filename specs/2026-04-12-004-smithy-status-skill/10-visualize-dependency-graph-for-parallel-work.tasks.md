# Tasks: Visualize the Dependency Graph for Parallel Work

**Source**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md` — User Story 10
**Data Model**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.data-model.md`
**Contracts**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.contracts.md`
**Story Number**: 10

---

## Slice 1: Define Graph Types and Repair JSON Stub

**Goal**: `DependencyGraph` and `DependencyNode` exist as first-class exported types, and `StatusJsonPayload.graph` is re-typed to `DependencyGraph`. The runtime continues to emit a zero-value graph object that satisfies the new type — no user-observable change, but downstream slices can import the types from the stable module entry point.

**Justification**: The current `StatusJsonPayload.graph` inline type (`nodes: Record<string, never>`, `layers: []` literal tuples, etc.) is structurally incompatible with the data-model's `DependencyGraph`. Any downstream slice that imports `DependencyGraph` and assigns it to that field fails typecheck. Landing a type-only PR first unblocks Slices 2 and 3 independently and keeps review focus on the near-zero-risk type addition rather than mixing it with the graph algorithm.

**Addresses**: FR-026 (data-model contract alignment); AS 10.5 (shape only — values still empty)

### Tasks

- [ ] **Add `DependencyGraph` and `DependencyNode` to the status type surface**

  Extend `src/status/types.ts` with `DependencyNode` and `DependencyGraph` per data-model §6. `DependencyNode` carries `record_path`, `row`, and the rolled-up `status`. `DependencyGraph` carries `nodes` (keyed by fully-qualified `<artifact-path>#<row-id>` IDs), `layers`, `cycles`, and `dangling_refs`. The existing `export * from './types.js'` re-export in `src/status/index.ts` picks both up automatically.

  _Acceptance criteria:_
  - Both types match data-model §6 exactly, including the `layers` element field name being `node_ids` (the data-model + contracts convention; the `ids` wording in AS 10.5 prose is a spec-level typo, tracked as SD-012).
  - Both types are importable from the `src/status/index.ts` barrel.
  - The module-level JSDoc in `types.ts` is updated so the "still owned by User Story 10" note on `DependencyGraph` / `DependencyNode` reads accurately for their new landed state.
  - `npm run typecheck` and `npm test` pass with no new errors.

- [ ] **Re-type `StatusJsonPayload.graph` as `DependencyGraph`**

  Replace the local inline type on the `graph` field of `StatusJsonPayload` in `src/commands/status.ts` with the imported `DependencyGraph`. The existing zero-value object literal (`{ nodes: {}, layers: [], cycles: [], dangling_refs: [] }`) already satisfies the new type — the runtime emission is unchanged in this slice. Slice 3 replaces that literal with a live `buildDependencyGraph(records)` call.

  _Acceptance criteria:_
  - `StatusJsonPayload.graph` is typed as `DependencyGraph` (imported from `../status/index.js`).
  - The unchanged zero-value runtime stub still satisfies the new type.
  - JSON mode still emits a populated `graph` field unconditionally per the contracts (no gating added or removed).
  - `npm run typecheck` and `npm test` pass with no new errors.

**PR Outcome**: `DependencyGraph` / `DependencyNode` land on the public type surface; `StatusJsonPayload.graph` uses the real type; no user-observable change in CLI output. The status module is ready for the builder in Slice 2.

---

## Slice 2: Build the Cross-Artifact Dependency Graph

**Goal**: A new pure module `src/status/graph.ts` exports `buildDependencyGraph(records: ArtifactRecord[]): DependencyGraph` that unions every artifact's `DependencyOrderTable` into a single cross-artifact directed graph, assigns topological layers when the graph is acyclic (and for the acyclic portion when cycles exist), detects cycles, and reports unresolvable `depends_on` references. Fully covered by unit tests and re-exported from the module entry point. No caller wires it yet — CLI output is unchanged.

**Justification**: The graph algorithm is the core intellectual work of US10 and has four acceptance scenarios riding on it (AS 10.1, 10.2, 10.3, 10.6). Isolating it in a dedicated pure module — alongside the existing one-concern-per-module layout (`tree.ts`, `collapse.ts`, `filter.ts`, `render.ts`) — keeps scanner I/O, classification, and graph construction independently testable. Sequencing this before the consumer slice lets the function be validated exhaustively before any rendering or CLI wiring touches it.

**Addresses**: FR-025, FR-026; AS 10.1, AS 10.2, AS 10.3, AS 10.6

### Tasks

- [ ] **Implement single-artifact topological layering in `buildDependencyGraph`**

  Create `src/status/graph.ts` exporting `buildDependencyGraph(records): DependencyGraph`. In this task, the function handles the within-artifact case: each record's `dependency_order.rows` contribute nodes keyed `<record.path>#<row.id>` whose `status` is the rolled-up status from the owning record, and intra-table `depends_on` edges are unioned into the graph. Topological layering uses Kahn's algorithm so Layer 0 contains nodes with no incoming edges. Export the function from `src/status/index.ts`.

  _Acceptance criteria:_
  - For a spec fixture matching AS 10.1 (US1/US4 independent, US2 depends on US1, US3 depends on US2), Layer 0 contains `US1, US4` fully-qualified, Layer 1 contains `US2`, Layer 2 contains `US3`.
  - Every `DependencyNode` carries `record_path`, `row`, and the rolled-up `status` from the owning `ArtifactRecord`.
  - Within-layer node order is deterministic: sort by (a) artifact discovery order in the input `records` array, then (b) row order inside each artifact's `## Dependency Order` table (documented as SD-013).
  - The function is pure — no I/O, no mutation of input records — and is re-exported from `src/status/index.ts`.

- [ ] **Stitch cross-artifact edges and emit dangling-reference diagnostics**

  Extend `buildDependencyGraph` so the unioned graph spans the full RFC → features → spec → tasks lineage. A child record's root nodes are blocked by the parent row referencing them (per data-model §Relationships, via `parent_path` + `parent_row_id`). Any `depends_on` ID that cannot be resolved against nodes in the same artifact's table contributes a `{ source_id, missing_id }` entry to `graph.dangling_refs` (with fully-qualified IDs) and is dropped from the edge set. Virtual records (`virtual: true`) participate as normal graph nodes with their rolled-up `not-started` status — synthetic tree sentinels (`ORPHANED_SPECS_PATH`, `BROKEN_LINKS_PATH`, `ORPHANED_TASKS_PATH`) are excluded from graph construction.

  _Acceptance criteria:_
  - AS 10.2 holds: a tasks-file slice node cannot land in Layer 0 unless its parent spec row is in Layer 0, which in turn requires its parent feature row to be in Layer 0, etc.
  - AS 10.6 holds: an unresolved `depends_on` ID appears exactly once in `dangling_refs` with both `source_id` and `missing_id` fully-qualified; the edge is dropped; remaining valid edges are layered normally.
  - Virtual records contribute to the graph using their rolled-up `not-started` status; tree sentinel records never appear as graph nodes.
  - Cross-artifact edges are derived exclusively from `parent_path` + `parent_row_id` (populated by the scanner from `artifact_path` links) — never from filename convention.

- [ ] **Detect cycles and exclude cyclic nodes from layer assignment**

  Extend `buildDependencyGraph` so cycles in the unioned graph are recorded in `graph.cycles` as arrays of participating fully-qualified node IDs in traversal order. Nodes involved in any cycle are excluded from every entry in `graph.layers` (layer computation is undefined for cyclic subgraphs per data-model §6). The exact algorithm is left to the implementer; SD-011 (below) records the recommended approach.

  _Acceptance criteria:_
  - AS 10.3 holds at the builder boundary: a two-node mutual-dependency cycle produces exactly one entry in `cycles` listing both fully-qualified node IDs; the builder does not throw.
  - When the graph is a DAG, `cycles` is an empty array.
  - No cyclic node appears in any `layers[].node_ids`; non-cyclic nodes in the same graph are still layered correctly.
  - Cycle detection handles both intra-artifact cycles (rare; would be caught upstream) and cross-artifact cycles (impossible today but covered defensively).

**PR Outcome**: `buildDependencyGraph` is importable from `src/status/index.ts` and fully validated by unit tests. `statusAction` still emits the zero-value graph stub — no CLI behavior change.

---

## Slice 3: Wire the Graph into JSON Emission and `--graph` Text Rendering

**Goal**: `smithy status --format json` emits a fully-populated `graph` object unconditionally, and `smithy status --graph` renders topological layers as text with done-layer collapsing (respecting `--all`) and a cycle-warning fallback. A new pure `src/status/renderGraph.ts` module owns the text layout; `statusAction` orchestrates the calls.

**Justification**: Both consumer surfaces (JSON emission and text rendering) share the same `DependencyGraph` input, so bundling them into one slice avoids an empty interim state where one surface is wired and the other is not. Placing `renderGraph` in a dedicated module mirrors the existing one-concern-per-module layout (`render.ts`, `collapse.ts`, `filter.ts`); inlining it in `status.ts` would give `statusAction` a rendering responsibility it does not currently hold. This slice also closes out the `node_ids` / `ids` field-name reconciliation (SD-012) by auditing every implementation reference.

**Addresses**: FR-026, FR-027; AS 10.1, AS 10.3, AS 10.4, AS 10.5, AS 10.6

### Tasks

- [ ] **Implement `renderGraph` in a new `src/status/renderGraph.ts` module**

  Create `src/status/renderGraph.ts` exporting `renderGraph(graph: DependencyGraph, options?: RenderGraphOptions): string`. The renderer emits one labeled block per layer (`Layer 0 (ready):`, `Layer 1:`, …), listing each node's title and fully-qualified ID under its layer heading. A layer whose members are all `status: 'done'` collapses to a single `Layer N: DONE (M items)` line in the default (non-`--all`) mode. When `graph.cycles` is non-empty, the output leads with a human-readable cycle-warning block listing the participating fully-qualified IDs and renders the non-cyclic nodes in a flat layer-0-style listing instead of the layered view (per AS 10.3 fallback). Dangling references in `graph.dangling_refs` surface as their own warning lines. Re-export from `src/status/index.ts`.

  _Acceptance criteria:_
  - AS 10.1 holds: the four-story fixture produces layer output with the correct membership and ordering.
  - AS 10.4 holds: a layer whose nodes are all `done` collapses to `Layer N: DONE (M items)` in default mode; `{ all: true }` expands every layer regardless of status.
  - AS 10.3 holds: a non-empty `graph.cycles` produces a warning block listing participating IDs followed by a flat fallback listing; no crash or unhandled exception.
  - AS 10.6 holds: each entry in `graph.dangling_refs` produces one warning line in the output.
  - The function is pure (no I/O, no mutation of `graph`), matches the `renderTree(tree, options) → string` signature pattern, and is exported from `src/status/index.ts`.
  - Layer entries read membership via the canonical `node_ids` key (SD-012 reconciliation).

- [ ] **Wire `buildDependencyGraph` and `renderGraph` into `statusAction`**

  Update `statusAction` in `src/commands/status.ts` so `buildDependencyGraph(records)` is called once per invocation (using the pre-filter record set per SD-010 / existing `summarize()` convention) and its result serves both consumer surfaces: (a) the JSON payload's `graph` field is populated unconditionally, replacing the zero-value stub; (b) in text mode, `opts.graph === true` routes through `renderGraph(graph, { all: opts.all === true })` instead of the tree pipeline. The existing tree pipeline is untouched when `--graph` is absent. Update the `StatusOptions.graph` JSDoc to reflect the now-wired state.

  _Acceptance criteria:_
  - AS 10.5 holds: `smithy status --format json` (with or without `--graph`) emits a populated `graph` object with `nodes`, `layers` (using `node_ids`), `cycles`, and `dangling_refs`; an empty repo still emits all four keys with empty values.
  - AS 10.1 / 10.4 hold at the CLI boundary: `smithy status --graph` prints the layered text view via `renderGraph`; `--graph --all` expands done layers.
  - AS 10.3 / AS 10.6 hold at the CLI boundary: cycles and dangling refs surface as warnings without crashing.
  - `buildDependencyGraph` is called exactly once per invocation (not once per consumer surface); the pre-filter record set is used so graph shape does not shift when `--status` / `--type` narrow the tree view.
  - The default text path (no `--graph`) is unchanged: summary header, tree, collapse behavior, empty-repo hint all match current output.
  - The `StatusOptions.graph` JSDoc no longer describes the option as a "stub".

- [ ] **Audit `node_ids` vs `ids` across code and flag the spec-text drift**

  Sweep every implementation reference (the new `DependencyGraph` type, `graph.ts`, `renderGraph.ts`, and `src/commands/status.ts`) to confirm the canonical `node_ids` field name is used everywhere — `.ids` must not appear on any layer object in any code path. The spec-level drift in AS 10.5 (which reads `ids: string[]`) is tracked as SD-012 and surfaced in the PR description so the author can reconcile the spec prose in a follow-up; this task does not silently edit the spec.

  _Acceptance criteria:_
  - No occurrence of `.ids` on a layer object in any file under `src/status/` or `src/commands/status.ts`.
  - The `DependencyGraph` type, `buildDependencyGraph` output, `renderGraph` consumption, and the JSON payload all agree on `node_ids`.
  - The PR description calls out SD-012 (spec-text drift) so the author can follow up on the spec prose.

**PR Outcome**: `smithy status --graph` renders topological layers with done-layer collapsing, cycle fallback, and dangling-ref warnings. `smithy status --format json` emits a fully-populated `graph` unconditionally. The canonical `node_ids` field name is enforced end-to-end across code; the spec-text drift is surfaced for a follow-up fix.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Exact ANSI color palette and tree-connector characters are not specified — will be resolved during implementation by matching existing smithy CLI output conventions. | Interaction & UX | Low | High | inherited | — |
| SD-002 | inherited from spec: The handling of `specs/strikes/` folder contents (lightweight strike artifacts that don't follow the full RFC → tasks hierarchy) is unspecified — are they rendered as a flat list, ignored, or promoted into the tree as orphans? | Functional Scope | Medium | Medium | inherited | — |
| SD-003 | inherited from spec: Whether the scanner should respect `.gitignore` / `.smithyignore` when walking the repo is undefined. | Functional Scope | Low | Medium | inherited | — |
| SD-004 | inherited from spec: Whether `smithy status --watch` (continuous refresh) is in scope is undefined — leaning out-of-scope for v1 but not stated. | Interaction & UX | Low | High | inherited | — |
| SD-005 | inherited from spec: A one-time migration tool or script to convert legacy checkbox-based `## Dependency Order` sections to the new table format is implied by FR-020/FR-028 but not specified. Open question: manual edit, dedicated `smithy migrate` command, or a one-off script in `scripts/`? | Functional Scope | Medium | Medium | inherited | — |
| SD-006 | inherited from spec: The exact ASCII rendering for the `--graph` dependency layer view (plain indented list vs. tree connectors vs. Mermaid-style) is not pinned down. | Interaction & UX | Low | High | inherited | — |
| SD-007 | inherited from spec: Whether the `DependencyGraph` spans only the current scan root or can cross repository boundaries (mono-repo vs. multi-repo) is unaddressed. Leaning single-root but not stated. | Functional Scope | Low | High | inherited | — |
| SD-008 | inherited from spec: The interaction between `--graph` and `--status` / `--root` / `--type` filters is unspecified — does filtering prune the graph before layering, or does it hide filtered nodes within the full graph? | Interaction & UX | Medium | Medium | inherited | — |
| SD-009 | inherited from spec: The documentation mirror required by FR-029 lives in two places (CLAUDE.md and `src/templates/agent-skills/README.md`). If those two drift from each other or from the spec, there is no automated check to catch it. A lint rule or doc-generation step is implied but not designed. | Integration | Medium | Medium | inherited | — |
| SD-010 | `buildDependencyGraph` is called with the pre-filter record set (mirroring `summarize()`'s existing convention) so the emitted `graph` reflects the full scan regardless of `--status` / `--type`. This is consistent with the contracts' "emitted unconditionally in JSON mode" requirement but leaves open whether a future `--graph --status in-progress` should project or prune the graph. Closely related to inherited SD-008. | Interaction & UX | Low | High | open | — |
| SD-011 | Cycle-detection algorithm choice is not specified by the data model or the spec. Recommended approach: Kahn's algorithm for layering; whatever nodes remain after Kahn's terminates form the cyclic set, and a single DFS over that remainder extracts participating IDs per strongly-connected component in traversal order. This matches data-model §6's "participating IDs in traversal order" wording and avoids importing a graph library. Alternative algorithms (Tarjan SCC, DFS coloring) produce different `cycles[][]` shapes for the same input. | Technical Risk | Medium | Medium | open | — |
| SD-012 | Field-name drift in the spec: data-model §6 and the contracts JSON example both use `node_ids` as the per-layer ID array; AS 10.5 prose reads `ids: string[]`. The implementation adopts `node_ids` per the two-source consensus. The spec prose in AS 10.5 should be reconciled to `node_ids` in a follow-up edit to the spec document. | Scope Edges | Low | High | open | — |
| SD-013 | Within-layer node ordering is not specified by data-model §6 or AS 10.1 (AS 10.1 implies source-order without mandating it). The implementation orders by (a) artifact discovery order in the scanner's input, then (b) row order inside each artifact's `## Dependency Order` table, so layer contents are deterministic and mirror user-authored tables. A future spec update could pin or override this. | Scope Edges | Low | Medium | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Define Graph Types and Repair JSON Stub | — | — |
| S2 | Build the Cross-Artifact Dependency Graph | S1 | — |
| S3 | Wire the Graph into JSON Emission and `--graph` Text Rendering | S2 | — |

1. **Slice 1** — lands the greenfield types and repairs the compile-breaking `StatusJsonPayload.graph` type. Unblocks Slices 2 and 3 independently. No CLI behavior change.
2. **Slice 2** — delivers the pure `buildDependencyGraph` algorithm with full coverage of AS 10.1, 10.2, 10.3, 10.6. Still no CLI behavior change — the builder is not yet wired.
3. **Slice 3** — wires both consumer surfaces (JSON graph field unconditionally; `--graph` text mode via new `renderGraph` module) and closes the `node_ids`/`ids` reconciliation.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 8: Deterministic Dependency Order Format Across All Artifacts | depends on | US10 consumes the 4-column `## Dependency Order` table format that US8 established as the sole authoring output. The graph builder assumes every `dependency_order` on every record is `format: 'table'` (or `'legacy'` / `'missing'`, in which case the owning record is already `status: 'unknown'` and contributes no nodes). |
| User Story 9: Scanner Classifies Without Relying on Dependency-Order Checkboxes | depends on | US10 consumes the rolled-up statuses US9 attests to — each `DependencyNode.status` is the owning record's classified status, which US9 already verifies is derived purely from downstream artifact existence and slice-body checkboxes (never from dep-order checkboxes). |

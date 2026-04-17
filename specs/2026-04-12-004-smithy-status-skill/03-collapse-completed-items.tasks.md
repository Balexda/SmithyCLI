# Tasks: Collapse Completed Items

**Source**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md` — User Story 3
**Data Model**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.data-model.md`
**Contracts**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.contracts.md`
**Story Number**: 03

---

## Slice 1: Collapse Done Subtrees with `--all` Bypass

**Goal**: Insert a pure `collapseTree(tree, { all })` transform between `buildTree` and `renderTree` in the text-mode pipeline so any artifact whose `record.status === 'done'` renders as a single line with its `DONE` marker and no descendants. Passing `--all` (already plumbed end-to-end from `cli.ts` through `StatusOptions` into `statusAction`) returns the tree unchanged, restoring the full listing. JSON mode keeps emitting the uncollapsed `buildTree` output so machine consumers (CI, the `smithy.status` agent skill) receive the complete structural projection. Group sentinel nodes (`Orphaned Specs`, `Broken Links`, `Orphaned Tasks`) never collapse regardless of their synthesized status.

**Justification**: Collapsing is a structural transformation on the tree, not a formatting decision. Landing it as a named pure module keeps `renderTree` a single-responsibility layout function and establishes the `records → buildTree → collapseTree → (future: filterTree) → renderTree` pipeline that US6 will extend without touching collapse policy. One PR suffices: `collapseTree` is self-contained and independently unit-testable against synthetic `StatusTree` inputs, and the `--all` CLI option already reaches `statusAction`, so wiring is a one-call change alongside retirement of the two stale `// stub` comments left behind by US2.

**Addresses**: FR-008, FR-009; Acceptance Scenarios 3.1, 3.2, 3.3, 3.4, 3.5

### Tasks

- [x] **Add pure `collapseTree` transform to prune done subtrees**

  Create `src/status/collapse.ts` exporting `collapseTree(tree: StatusTree, options?: { all?: boolean }): StatusTree`. The transform returns a new `StatusTree` in which any `TreeNode` whose `record.status === 'done'` is replaced by a copy with an empty `children` array — its descendants are not visited or emitted. When `options.all` is truthy the tree is returned structurally unchanged. Group sentinel nodes (detected via the reserved `ORPHANED_SPECS_PATH`, `BROKEN_LINKS_PATH`, and `ORPHANED_TASKS_PATH` constants already exported from `src/status/tree.ts`) always retain their children regardless of their synthesized status. Re-export `collapseTree` from `src/status/index.ts` so `statusAction` and future pipeline consumers (US6) can import it from the module barrel. Satisfies AS 3.1, AS 3.3, AS 3.4, and the bypass half of AS 3.5 as a pure tree transform.

  _Acceptance criteria:_
  - `collapseTree` is a pure function — performs no I/O and never mutates its input tree or any `TreeNode` / `ArtifactRecord` reachable from it.
  - Same input always produces an equivalent output; a second call on the transformed tree is a stable no-op.
  - A node with `record.status === 'done'` returns a node carrying the same record and an empty `children` array (AS 3.1, 3.3, 3.4).
  - A node with `record.status` of `'in-progress'`, `'not-started'`, or `'unknown'` keeps its descendants and the transform recurses into its children.
  - `options.all === true` returns a tree in which every `ArtifactRecord` reachable in the input remains reachable in the output (AS 3.5).
  - Group sentinel nodes pass through uncollapsed regardless of `options.all` so "Orphaned Specs", "Broken Links", and "Orphaned Tasks" still surface their members.
  - Empty input (`{ roots: [] }`) returns `{ roots: [] }` without throwing.
  - Unit tests in a new `src/status/collapse.test.ts` drive synthetic `StatusTree` inputs covering each of the criteria above: done leaf collapse, done parent collapsing whole subtree, partial subtree preservation, `--all` passthrough, group-sentinel passthrough, and empty tree.

- [x] **Wire `collapseTree` into the text-mode pipeline and retire `--all` stub comments**

  In `src/commands/status.ts`, insert `collapseTree(tree, { all: opts.all === true })` between the existing `buildTree(records)` and `renderTree(...)` calls on the default text-mode path so the rendered output reflects the collapsed tree; the JSON-mode branch keeps emitting the uncollapsed `buildTree(records)` output verbatim. Update the `StatusOptions.all` JSDoc in the same file (currently labelled as a stub wired in US3) so it describes the live behavior, and refresh the `src/status/render.ts` module docstring block that currently asserts "Collapsing of done subtrees is US3's responsibility, so every record shows its marker inline here" so it reflects the new reality that collapse now runs before the renderer. Satisfies AS 3.2 (partial tasks keep the `N/M` counter because only `done` nodes collapse) and the end-to-end half of AS 3.5.

  _Acceptance criteria:_
  - Default `smithy status` text output collapses any fully-`done` subtree to a single line ending in the existing `DONE` marker, with no descendants of that node appearing beneath it (AS 3.1, 3.3, 3.4).
  - A tasks record with partial completion continues to render with its `N/M` marker and any child surfacing the renderer already performs — collapse keys off `status === 'done'` only (AS 3.2).
  - `smithy status --all` text output matches the pre-collapse baseline — every artifact previously rendered still appears (AS 3.5).
  - `smithy status --format json` output is unchanged: the `tree` field reflects `buildTree(records)` and `--all` has no effect on JSON mode.
  - Exit-code paths and empty-repo hint in `statusAction` remain intact; `collapseTree` is only invoked when `records.length > 0` in text mode.
  - The `StatusOptions.all` JSDoc no longer describes the field as a stub / unwired and accurately names the behavior it controls.
  - The `src/status/render.ts` module docstring no longer claims collapsing is unimplemented; the SD-011 / SD-012 marker table wording stays unchanged.
  - An integration test in `src/cli.test.ts` (or the nearest existing CLI-level test harness) asserts that a temp-dir fixture with one fully-done feature renders as one `DONE` line by default, expands back to the full set under `--all`, and leaves JSON output identical regardless of `--all`.

**PR Outcome**: `smithy status` defaults to a compact view where every fully-done artifact collapses to a single `DONE` line, hiding its descendants; `smithy status --all` restores the full listing shipped by US2; `smithy status --format json` continues to emit the uncollapsed tree untouched. A new `collapseTree` module gives US6 a clean insertion point for the forthcoming `filterTree` transform, and the two US2-era `// stub: wired in US3` markers are gone.

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
| SD-010 | AS 3.2 reads "unchecked slices are shown beneath it while the checked slices are hidden (or shown only as a count)". The data model deliberately does not model slices as `TreeNode` entries — they live only as `DependencyRow` entries and `completed`/`total` counts on tasks records — so this slice implements AS 3.2 via the count-only escape hatch. Proposed resolution: accept the count-only interpretation for US3; revisit if a future story introduces slice-level tree nodes (a scanner-level scope expansion). | Scope Edges | Low | High | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Collapse Done Subtrees with `--all` Bypass | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Scan Artifacts and Classify Status | depends on | Collapse keys off `record.status === 'done'` finalized by US1's classifier; no change to classification behavior. |
| User Story 2: Render a Hierarchical Status View | depends on | US3 inserts `collapseTree` between US2's `buildTree` and `renderTree` with no API change to either; the US2 module docstring claim that collapsing is still unimplemented is the only US2 artifact touched, and only as a doc refresh. |
| User Story 6: Filter and Scope the View | depended upon by | US6 will insert `filterTree` into the same pipeline; documenting the collapse-before-render ordering here preempts an accidental reorder. |
| User Story 7: Summary Roll-up Header | depended upon by | The summary header already printed above the tree is not affected by collapsing and remains computed from the full uncollapsed record set. |
| User Story 10: Visualize the Dependency Graph for Parallel Work | depended upon by | `--graph` renders from the cross-artifact `DependencyGraph` rather than the `StatusTree`; collapsing has no effect on graph output. |

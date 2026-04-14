# Tasks: Render a Hierarchical Status View

**Source**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md` — User Story 2
**Data Model**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.data-model.md`
**Contracts**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.contracts.md`
**Story Number**: 02

---

## Slice 1: Tree Model and Broken-Link Detection

**Goal**: Ship the `StatusTree` data model and a pure `buildTree(records)` that turns the flat `ArtifactRecord[]` produced by `scan()` into the hierarchical projection described in `smithy-status-skill.data-model.md` — nested parent/child nodes, an "Orphaned Specs" group, and a "Broken Links" group. As part of this slice, extend the scanner with a narrow `**Source**:` header probe so orphaned tasks files whose declared source no longer exists on disk are surfaced via `parent_missing: true`. Wire the resulting tree into the existing `--format json` output so the `tree.roots` stub from US1 is replaced with a fully populated structure.

**Justification**: JSON consumers are real today — CI scripts and the forthcoming `smithy.status` agent skill (US5) both parse `--format json` output and depend on the top-level shape declared in the contracts file. Landing the tree model and broken-link detection as a self-contained PR lets those consumers adopt the populated `tree` field immediately, ahead of the text renderer in Slice 2. The scanner touch is narrow (Source-header parsing plus `parent_missing` wiring) and only activates on records that have no resolved parent, so it cannot regress the classification rules US1 already ships.

**Addresses**: FR-007, FR-012; Acceptance Scenarios 2.1, 2.2, 2.3

### Tasks

- [ ] **Detect broken tasks-file parent links in `scan()`**

  Extend `src/status/scanner.ts` (and, if needed, `src/status/parser.ts`) so that after the existing parent-resolution pass, any tasks record whose `parent_path` is still unresolved has its own `**Source**:` header inspected for a repo-relative spec path. When the declared path points at a file missing from disk, set `parent_missing: true` and populate `parent_path` with the declared path so downstream consumers can surface the dangling reference. Records with a normally-resolved parent remain untouched. Satisfies AS 2.3.

  _Acceptance criteria:_
  - Source-header parsing is limited to the canonical `**Source**: <path>` line written by `smithy.cut` and is tolerant of surrounding whitespace and trailing narrative (e.g. `— User Story 4`).
  - A tasks file whose declared source resolves to an existing spec file is unaffected — no `parent_missing` flag, no `parent_path` override.
  - A tasks file whose declared source resolves to a path not present on disk produces a real (non-virtual) record with `parent_missing === true` and `parent_path` set to the declared repo-relative path.
  - A tasks file with no parseable `**Source**:` header and no resolved parent keeps `parent_path` null/absent (it stays an orphan rather than being misreported as a broken link).
  - Scanner-level unit or fixture tests in `src/status/scanner.test.ts` cover: resolved-parent (untouched), missing-declared-source (broken link), and absent-source-header (orphan) cases.
  - The change remains additive — every pre-existing `scan()` test continues to pass without modification.

- [ ] **Add `StatusTree` types, implement `buildTree()`, and populate the JSON tree output**

  Define `TreeNode` and `StatusTree` in `src/status/types.ts` per the data model (recursive `children: TreeNode[]`, `roots` on `StatusTree`, no duplicated summary). Implement a pure `buildTree(records: ArtifactRecord[]): StatusTree` in a new `src/status/tree.ts` that groups records under their ancestors using each record's `parent_path`, preserves input order, and emits synthetic top-level group nodes for "Orphaned Specs" and "Broken Links" when populated. Re-export the new types and `buildTree` from `src/status/index.ts`, and update `statusAction` in `src/commands/status.ts` so `--format json` emits `tree: buildTree(records)` in place of the current `{ roots: [] }` stub. Satisfies AS 2.1, 2.2, 2.3.

  _Acceptance criteria:_
  - `StatusTree` and `TreeNode` exports match the data-model shape — `TreeNode` carries an `ArtifactRecord` plus a `children: TreeNode[]` field and no duplicated counts.
  - `buildTree` is a pure function: same input always produces the same output, performs no I/O, and never mutates its input records.
  - A full RFC → features → spec → tasks chain yields a tree whose deepest tasks node is reachable by walking `roots[].children[].children[].children[]` — every real record appears exactly once in the tree (AS 2.1).
  - A spec record whose `parent_path` is null or absent surfaces under a synthetic "Orphaned Specs" group at the top of `roots` (AS 2.2).
  - A tasks record with `parent_missing === true` surfaces under a synthetic "Broken Links" group at the top of `roots`, and its dangling parent path remains recoverable from the node's `ArtifactRecord` (AS 2.3).
  - An empty `records` array yields `{ roots: [] }` without throwing.
  - `statusAction` with `--format json` emits a populated `tree` whose `roots` match `buildTree(records)` byte-for-byte against a synthetic temp-dir fixture representing at least one full chain, one orphaned spec, and one broken-link tasks record.
  - The existing `src/commands/status.ts` JSON error-handling paths (empty repo, invalid `--status`/`--type`, non-existent `--root`) remain intact.
  - Unit tests for `buildTree` live in a new `src/status/tree.test.ts` and exercise synthetic `ArtifactRecord[]` inputs for full-chain, orphan, and broken-link cases in memory.

**PR Outcome**: `src/status/` exports `buildTree`, `StatusTree`, and `TreeNode`; the scanner flags broken tasks-file parent links via `parent_missing`; and `smithy status --format json` emits a populated `tree` field matching the contracts file. The default text output still uses the placeholder flat listing from US1 — that moves in Slice 2.

---

## Slice 2: Text Rendering with Tree Connectors

**Goal**: Replace the placeholder flat text listing in `statusAction` with a hierarchical renderer that walks the `StatusTree` from Slice 1 and emits indented lines using `├─` / `└─` connectors, artifact titles (not file paths) as the primary label, and per-record status markers (`DONE`, `N/M`, `not started`, or an `unknown` warning). Status markers are rendered inline for every node — collapsing of fully-done subtrees remains US3's job, and no new CLI flags are wired here.

**Justification**: The flat listing shipped by US1 Slice 3 is explicitly a stub. Landing a real hierarchical renderer as a focused PR gives human users their first readable `smithy status` output and satisfies AS 2.4 without entangling collapsing or filtering, which belong to downstream stories. `renderTree` is a pure function over a `StatusTree`, so it is unit-testable against synthetic trees without touching the filesystem.

**Addresses**: FR-007, FR-016 (partial — per-record markers only; summary header stays on US7); Acceptance Scenario 2.4; Contracts §`smithy status` text-mode outputs

### Tasks

- [ ] **Implement `renderTree()` and replace the `statusAction` placeholder text output**

  Add `renderTree(tree: StatusTree, options?: { color?: boolean }): string` in a new `src/status/render.ts` that recursively walks `tree.roots` and emits a block of lines: each node contributes its indentation prefix, a tree connector (`├─` for any non-last child, `└─` for the last child of its parent), the record's `title`, and a status marker chosen from the record's `status` and (for tasks records) `completed` / `total` counts. Top-level group nodes ("Orphaned Specs", "Broken Links") render as their own headings above their grouped children. Update `statusAction` in `src/commands/status.ts` so the default text mode builds a `StatusTree` via `buildTree` and writes `renderTree(tree)` to stdout instead of the current `type\tpath\ttitle\tstatus` flat listing. Empty-repo, `--format json`, and error-exit paths remain unchanged. Satisfies AS 2.4 and the text-mode rows of the contracts `Outputs` table.

  _Acceptance criteria:_
  - `renderTree` is a pure function over its `StatusTree` input and never performs I/O.
  - Output indents descendants under their ancestors consistently and uses `├─` for every non-last sibling and `└─` for the last sibling of each parent group (AS 2.4).
  - Each rendered line uses the artifact's title, not its file path, as the primary label (AS 2.4). File paths are available for JSON consumers but are not the visual focus of the text view.
  - Status markers map per the contracts table: `done` → `DONE`; `in-progress` on a tasks record → the `completed`/`total` counter; `in-progress` on a parent record → an unambiguous progress marker distinct from `DONE`; `not-started` (real or virtual) → a clear "not started" marker; `unknown` → a warning marker surfacing at least one entry from the record's `warnings` array.
  - "Orphaned Specs" and "Broken Links" groups from `buildTree` are rendered as top-level headings with their members nested beneath them; a broken-link tasks record surfaces its dangling parent reference alongside its title.
  - Every `ArtifactRecord` produced by `scan()` on a synthetic fixture is represented by exactly one line in the rendered output — no silent drops, no duplicates — because collapsing is deferred to US3.
  - `statusAction` text mode against the same fixture emits the `renderTree` output verbatim and still honors the empty-repo hint, the JSON code path, and the error exits from US1 Slice 3.
  - Unit tests in a new `src/status/render.test.ts` drive `renderTree` with synthetic `StatusTree` inputs covering: a full RFC → features → spec → tasks chain, an orphaned spec group, a broken-link tasks group, and each of the four status marker variants.
  - An integration test in `src/cli.test.ts` asserts that the default `smithy status` output against a temp-dir fixture contains the tree-connector characters and at least one known artifact title.

**PR Outcome**: `smithy status` run from the shell prints a readable nested tree using `├─` / `└─` connectors, titles, and per-record status markers. `--format json` behavior is unchanged. Collapsing, filtering, the summary header, and next-action suggestions remain owned by US3 / US6 / US7 / US4 respectively.

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
| SD-010 | The "Broken Links" scope is narrowed in Slice 1 to tasks files that declare a `**Source**:` header pointing at a missing spec file. Spec files (and features files) do not carry an analogous canonical self-declared parent reference today, so `parent_missing` cannot currently be derived for them. Proposed resolution: accept the narrowed scope for US2; revisit if a future story introduces a self-declared parent header on specs/features artifacts. | Scope Edges | Low | High | open | — |
| SD-011 | The exact wording of the rendered status markers (`DONE`, `N/M`, `not started`, `unknown`) is not locked in by the contracts file beyond the illustrative examples. Proposed resolution: resolve during implementation by matching existing smithy CLI output conventions, the same way SD-001 handles the ANSI palette. | Interaction & UX | Low | High | open | — |
| SD-012 | The rendered status marker for an `in-progress` parent record (spec, features, rfc) is not specified — the data model only guarantees `N/M` for tasks records. Proposed resolution: render a distinct progress marker derived from the parent's children (e.g., an aggregate counter) and document it alongside the renderer; collapsing behavior in US3 may supersede this. | Interaction & UX | Low | High | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Tree Model and Broken-Link Detection | — | — |
| S2 | Text Rendering with Tree Connectors | S1 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Scan Artifacts and Classify Status | depends on | US2 consumes the classified `ArtifactRecord[]` produced by US1's `scan()`; Slice 1 adds a narrow scanner enhancement (`**Source**:` header probe, `parent_missing` population) but does not alter the existing classification rules. |
| User Story 8: Deterministic Dependency Order Format Across All Artifacts | depends on | US2's rendering is built against the 4-column `## Dependency Order` table format US8 migrates every authoring command to emit. Until US8 lands, real repo artifacts produced by pre-migration templates will classify as `unknown`, and the renderer will surface them under their `unknown` marker without crashing. |
| User Story 3: Collapse Completed Items | depended upon by | US3 layers collapsing behavior on top of the `StatusTree` and `renderTree` shipped by this story; no API change to either is expected. |
| User Story 4: Suggest the Next Command | depended upon by | US4 attaches `next_action` suggestions to the records that feed `renderTree`; the renderer's extension points accommodate inline next-action display without structural changes. |
| User Story 5: Invoke Status via the smithy.status Skill | depended upon by | US5 shells out to `smithy status` and returns its output verbatim — the text output shape stabilized here is what the skill reproduces inside Claude Code. |
| User Story 6: Filter and Scope the View | depended upon by | US6 wires `--status`, `--type`, and `--root` filter behaviors on top of the `StatusTree` produced here; filtering prunes records before tree construction. |
| User Story 7: Summary Roll-up Header | depended upon by | US7 prepends a summary header above the `renderTree` output; this story leaves the top of the text block unclaimed so US7 can insert cleanly. |
| User Story 10: Visualize the Dependency Graph for Parallel Work | depended upon by | US10's `--graph` text rendering reuses the connector conventions and indentation primitives introduced here. |

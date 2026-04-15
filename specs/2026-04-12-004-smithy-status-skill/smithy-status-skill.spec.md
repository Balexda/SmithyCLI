# Feature Specification: Smithy Status Skill

**Spec Folder**: `2026-04-12-004-smithy-status-skill`
**Branch**: `feature/smithy-status`
**Created**: 2026-04-12
**Status**: Draft
**Input**: User description — add a `smithy.status` skill backed by a deterministic script that scans all `.rfc.md`, `.features.md`, `.spec.md`, and `.tasks.md` files in a repo and produces a hierarchical status view (RFC → Feature → Spec → Tasks → Slice) showing done, in-progress, and not-started items, with suggestions for the next smithy command to move work forward. Minimal LLM involvement — the skill should delegate to the script.

## Clarifications

### Session 2026-04-12

- _The status scanner is a deterministic script shipped with the Smithy CLI (not a separate package), exposed as a `smithy status` subcommand and wrapped by a thin `smithy.status` agent-skill that invokes the script and passes its output through with minimal interpretation._ `[Critical Assumption]`
- _Artifact discovery is rooted at the repo working directory and walks `specs/`, `docs/rfcs/`, and `specs/strikes/` by default; additional roots can be configured but are out of scope for v1._ `[Critical Assumption]`
- _Status classification is derived entirely from existing markdown patterns already written by `smithy.ignite`, `smithy.render`, `smithy.mark`, and `smithy.cut` — no new frontmatter fields, no hidden metadata files, no `.smithy-status.json` sidecar._ `[Critical Assumption]`
- _The default output is human-readable terminal text (with optional ANSI color); a `--format json` mode exists for programmatic consumers but is secondary._
- _"Done" collapsing rule: a tasks file displays as `DONE` when all its slice checkboxes are checked, and as `N/M` (checked slices over total slices) otherwise. Fully-done parents (feature, spec) collapse to `DONE` similarly — their children are hidden unless `--all` is passed._
- _"Not started" for a spec means its `## Dependency Order` table has at least one row whose `Artifact` column is `—` (or points at a tasks file that does not exist on disk yet) and no row has rolled up to `in-progress` or `done`. "Not started" for a feature means its feature map's `## Dependency Order` row for that feature has `—` in its `Artifact` column or points at a missing spec folder, with no downstream activity. Both definitions are derived entirely from the dependency-order table — no checkbox inspection._
- _Next-action suggestions are pattern-based, not LLM-inferred: if a feature has no spec → suggest `smithy.mark`; if a spec has an unspecced user story → suggest `smithy.cut`; if a tasks file has open slices → suggest `smithy.forge`._
- _All four planning artifact types (`.rfc.md`, `.features.md`, `.spec.md`, `.tasks.md`) use a unified, deterministic `## Dependency Order` table format with columns `ID | Title | Depends On | Artifact`. IDs are canonical per level (`M` for milestones, `F` for features, `US` for user stories, `S` for slices). Dependencies are expressed as comma-separated ID references within the same table. The `Artifact` column holds a repo-relative path to the downstream file/folder (or `—` when the downstream does not yet exist) and replaces the checkbox as the "started/not" signal._ `[Critical Assumption]`
- _The legacy checkbox-based dependency-order format (`- [x] **Feature N Spec: Title** → path`) is a planned migration target: this work assumes all smithy command templates will be updated to emit only the new table format, and that existing artifacts still using the old format will need conversion (migration script or manual pass) before a table-only scanner can classify them. At the time this spec was written, several command templates (`smithy.mark`, `smithy.render`, `smithy.cut`, `smithy.forge`) and audit snippets still define checkbox-based dependency sections; those must be migrated as part of US8. The scanner will understand only the new table format. This clean break is deliberate — the checkbox format caused merge conflicts, and a tolerant parser would perpetuate the problem._ `[Critical Assumption]`
- _The implementation checkboxes inside `## Slice N:` task lists in `.tasks.md` files are **not** affected. Only the checkboxes in the top-level `## Dependency Order` section are removed. Slice completion continues to be derived from the task checkboxes inside each slice's body._ `[Critical Assumption]`
- _`.rfc.md` templates gain a new `## Dependency Order` section, placed immediately after the list of milestones, using the same 4-column table format._ `[Critical Assumption]`

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Tasks → Slice

This is the canonical smithy conceptual lineage (shared across all specs). The **status tree this feature actually builds** is narrower and reflects only the discoverable artifact files on disk: `RFC → feature map → spec → tasks`, with slices represented as per-tasks-record counters (not as standalone nodes). Milestone and User Story do not appear as standalone nodes in the rendered tree — they are folded into their containing feature-map and spec records respectively.

## User Scenarios & Testing *(mandatory)*

### User Story 1: Scan Artifacts and Classify Status (Priority: P1)

As a Smithy user with multiple in-flight planning artifacts, I want a single command that walks the repo and produces a structured status record for every RFC, feature map, spec, and tasks file, so that I have one authoritative view of what exists and how far along it is.

**Why this priority**: Every other story depends on this scan producing a reliable, typed record set. Without it, nothing else can render or suggest.

**Independent Test**: Run the scanner against a repo containing one fully-done feature, one in-progress feature, and one not-started feature. Verify the scanner emits one record per artifact with the correct status classification, and that all three categories are represented.

**Acceptance Scenarios**:

1. **Given** a repo with `specs/2026-04-08-003-reduce-interaction-friction/` containing a spec whose `## Dependency Order` table has three user-story rows — two whose `Artifact` column points at existing tasks files that are fully done, and one whose `Artifact` column is `—` — **When** the scanner runs, **Then** it emits one spec record (status: in-progress), two tasks records (status: done), and one virtual tasks record (status: not-started) for the row with the `—` Artifact.
2. **Given** a tasks file where 3 of 6 slice-body task checkboxes (inside `## Slice N:` sections) are checked, **When** the scanner classifies it, **Then** its status is `in-progress` with `completed=3, total=6`.
3. **Given** a tasks file where all slice-body task checkboxes are checked, **When** the scanner classifies it, **Then** its status is `done`.
4. **Given** a spec's `## Dependency Order` row has its `Artifact` column pointing at a tasks file at `01-foo.tasks.md` that does not exist on disk, **When** the scanner runs, **Then** a virtual "not-started" tasks record is emitted for that row with the declared path.
5. **Given** a `.features.md` whose `## Dependency Order` table has a row `| F3 | Webhooks | — | — |`, **When** the scanner runs, **Then** a virtual "not-started" spec record is emitted for F3 using the naming-convention-expected spec folder path.
6. **Given** an artifact file that cannot be parsed (missing required headings, malformed table), **When** the scanner encounters it, **Then** a record with status `unknown` is emitted with a parse-error note, and scanning continues.

---

### User Story 2: Render a Hierarchical Status View (Priority: P1)

As a Smithy user reviewing my backlog, I want the scan results rendered as a tree that clearly shows RFC → Feature → Spec → Tasks → Slice relationships, so that I can see at a glance how work items nest and which branches still need attention.

**Why this priority**: The flat record set from US1 is not useful on its own — the parent/child relationships are what make the report readable. This is the primary value of the feature.

**Independent Test**: Run `smithy status` on a repo with at least one full chain (RFC → feature map → spec → tasks) and verify that the terminal output visually nests the children under their parents with consistent indentation and clear connector characters.

**Acceptance Scenarios**:

1. **Given** a scanned repo with one RFC, two feature maps, three specs, and five tasks files, **When** the view renders, **Then** every artifact appears under its parent in a tree structure (children indented beneath parents) and every tasks file traces back to its owning user story, spec, feature, and RFC.
2. **Given** a spec with no parent feature map (created directly from a description, not from a `.features.md`), **When** the view renders, **Then** the spec appears at the top level of the tree under an "Orphaned Specs" group.
3. **Given** a tasks file that references a spec folder that no longer exists, **When** the view renders, **Then** the tasks file is grouped under a "Broken Links" section with its dangling reference shown.
4. **Given** the tree is rendered to a terminal, **When** the default terminal text output is shown, **Then** indentation, tree connectors (`├─`, `└─`), and titles (not file paths) are the primary visual elements.

---

### User Story 3: Collapse Completed Items (Priority: P1)

As a Smithy user scanning a large repo, I want completed branches of the tree to be visually compressed so that my attention goes to what still needs work, not to a wall of green checkmarks.

**Why this priority**: Without collapsing, a mature repo with many done items would drown the in-progress and not-started items. The collapse behavior is what makes the report actionable rather than just informational.

**Independent Test**: Run the status view against a repo where one feature is fully done and another is partially done. Verify the done feature renders as a single collapsed line (e.g., `DONE`) while the partial feature shows its children and slice counts.

**Acceptance Scenarios**:

1. **Given** a tasks file with all slices done, **When** the view renders, **Then** the tasks file appears as `DONE` with no child slice list and no `N/M` counter.
2. **Given** a tasks file with 3 of 6 slices done, **When** the view renders, **Then** it appears with `3/6` and its unchecked slices are shown beneath it while the checked slices are hidden (or shown only as a count).
3. **Given** a spec where all its tasks files are `DONE`, **When** the view renders, **Then** the spec collapses to a single `DONE` line and its task children are hidden by default.
4. **Given** a feature where all its specs collapse to `DONE`, **When** the view renders, **Then** the feature itself collapses to `DONE` and its spec children are hidden by default.
5. **Given** the user passes `--all`, **When** the view renders, **Then** collapsing is disabled and every artifact and slice is expanded regardless of status.

---

### User Story 4: Suggest the Next Command (Priority: P1)

As a Smithy user trying to make progress, I want the status view to tell me which smithy command to run next for each in-progress or not-started item, so that I can act on the report without having to remember which command corresponds to which phase.

**Why this priority**: This is the "actionable" half of the feature. Without it, the report is a diagnostic; with it, the report is a worklist. Pattern-based (not LLM-inferred) keeps it deterministic.

**Independent Test**: Construct a repo with: (a) a feature map with unchecked features, (b) a spec with a story that has no tasks file, (c) a tasks file with open slices. Run the status view and verify each item has the correct next-command suggestion.

**Acceptance Scenarios**:

1. **Given** a feature-map entry that is unchecked and has no spec folder, **When** the next-action rule runs, **Then** the suggestion is `smithy.mark <features-file> <N>`.
2. **Given** a spec with a user story that has no tasks file on disk, **When** the next-action rule runs, **Then** the suggestion is `smithy.cut <spec-path>` scoped to that story.
3. **Given** a tasks file with at least one unchecked slice, **When** the next-action rule runs, **Then** the suggestion is `smithy.forge <tasks-path>`.
4. **Given** an RFC with no associated feature map, **When** the next-action rule runs, **Then** the suggestion is `smithy.render <rfc-path>`.
5. **Given** an artifact whose parent is itself not-started, **When** suggestions are generated, **Then** only the topmost actionable item in that chain is suggested (to avoid noise from impossible-yet suggestions).

---

### User Story 5: Invoke Status via the smithy.status Skill (Priority: P1)

As a Smithy user inside an AI coding session, I want to type `/smithy.status` and get the same report the CLI produces, so that I can check progress without leaving my agent session.

**Why this priority**: The user described this as a skill first and a script second. Shipping only the script would miss the primary entry point.

**Independent Test**: After `smithy init -a claude`, run `/smithy.status` inside Claude Code and verify the output matches what the `smithy status` CLI produces for the same repo.

**Acceptance Scenarios**:

1. **Given** `smithy init -a claude` has deployed the skill, **When** the user invokes `/smithy.status`, **Then** the skill shells out to the `smithy status` script and returns its output verbatim with minimal additional commentary.
2. **Given** the skill runs with no arguments, **When** it executes, **Then** it uses the repo working directory as the scan root.
3. **Given** the skill runs with a filter argument (e.g., `/smithy.status --status in-progress`), **When** it executes, **Then** the filter is forwarded to the script and applied there — the skill does not re-filter in the LLM.
4. **Given** the skill encounters an error (script missing, parse error), **When** it runs, **Then** it reports the error verbatim rather than attempting to reconstruct the missing information via LLM inference.

---

### User Story 6: Filter and Scope the View (Priority: P1)

As a Smithy user with a specific question (e.g., "what's still in progress?"), I want to filter the status view by status, by hierarchy branch, or by artifact type, so that I can narrow the report without reading the full tree.

**Why this priority**: Filtering is a required v1 behavior — FR-017 specifies it with MUST language because "show me just the in-progress work" is one of the core questions this feature exists to answer. It is implemented after US1–US3 only because it reuses their rendering.

**Independent Test**: Run `smithy status --status in-progress` and verify only in-progress artifacts are shown. Run `smithy status --root specs/2026-04-08-003-reduce-interaction-friction` and verify only that subtree is shown.

**Acceptance Scenarios**:

1. **Given** `--status in-progress`, **When** the view renders, **Then** only in-progress artifacts and their ancestors (for context) appear.
2. **Given** `--root <path>`, **When** the view renders, **Then** only artifacts under that path and their descendants appear.
3. **Given** `--type spec`, **When** the view renders, **Then** only spec-level artifacts appear (ancestors shown as headers, descendants hidden).

---

### User Story 7: Summary Roll-up Header (Priority: P1)

As a Smithy user glancing at the status report, I want a one-line summary at the top showing total counts of done / in-progress / not-started items per artifact type, so that I get the high-level picture before diving into the tree.

**Why this priority**: The summary header is a required v1 behavior — FR-016 specifies it with MUST language because users need a high-level view before diving into details. It is implemented after US1 only because it consumes US1's record counts.

**Independent Test**: Run the status view and verify a summary line or block appears above the tree with per-type counts that match the records rendered below.

**Acceptance Scenarios**:

1. **Given** a scanned repo, **When** the view renders, **Then** a summary block shows counts like `RFCs: 1 done · Features: 3 done / 2 in-progress / 1 not-started · Specs: ... · Tasks: ...`.
2. **Given** `--format json`, **When** the view renders, **Then** the summary counts appear under a top-level `summary` key in the JSON output.

---

### User Story 8: Deterministic Dependency Order Format Across All Artifacts (Priority: P1)

As a Smithy user maintaining planning artifacts in git, I want the `## Dependency Order` section in every `.rfc.md`, `.features.md`, `.spec.md`, and `.tasks.md` to be a machine-parseable table without checkboxes, so that merge conflicts on completion state disappear and the dependency graph becomes derivable without LLM inference.

**Why this priority**: This is the scope-expansion the feature pivoted on. Checkbox conflicts are already hurting daily work; the scanner's US1/US2 classification logic depends on this new format; and the dependency-graph visualization (US10) cannot be built without it. It is foundational for everything below.

**Independent Test**: Open a freshly-generated `.spec.md` from `smithy.mark` against a clean repo. Verify the `## Dependency Order` section uses the 4-column `ID | Title | Depends On | Artifact` table, contains no checkboxes, and references dependencies by canonical ID (e.g., `US2, US3`) — not prose. Parse the table with a regex-only script and reconstruct the dependency list.

**Acceptance Scenarios**:

1. **Given** a developer runs `smithy.mark` to create a new spec, **When** the spec file is written, **Then** its `## Dependency Order` section is a 4-column table (`ID | Title | Depends On | Artifact`) with no `- [ ]` or `- [x]` checkboxes anywhere inside the section.
2. **Given** a `smithy.cut` run decomposes a user story into slices, **When** the tasks file is written, **Then** its `## Dependency Order` table uses `S1`, `S2`, ... IDs and expresses slice dependencies as comma-separated ID references (e.g., `S1, S3`).
3. **Given** a `smithy.render` run creates a feature map, **When** the feature map is written, **Then** its `## Dependency Order` table uses `F1`, `F2`, ... IDs and each row's `Artifact` column points at the spec folder for that feature (or `—` if no spec exists yet).
4. **Given** a `smithy.ignite` run produces an RFC, **When** the RFC file is written, **Then** it contains a new `## Dependency Order` section placed immediately after the list of milestones, using `M1`, `M2`, ... IDs and pointing each row's `Artifact` column at the corresponding feature-map file.
5. **Given** a row's `Depends On` column contains IDs, **When** a deterministic parser splits on commas and trims whitespace, **Then** every resulting ID matches another row's ID in the same table — no prose, no cross-artifact references, no free-text justifications.
6. **Given** a row has no dependencies, **When** the table is written, **Then** the `Depends On` column contains `—` (em dash) rather than being empty or containing prose like "No dependencies."
7. **Given** a row's downstream artifact does not exist on disk yet, **When** the table is written, **Then** the `Artifact` column contains `—` rather than a placeholder path.

---

### User Story 9: Scanner Classifies Without Relying on Dependency-Order Checkboxes (Priority: P1)

As a Smithy developer running `smithy status` after the template migration, I want the scanner to derive completion state from the existence and status of downstream artifacts (not from dependency-order checkboxes, which no longer exist), so that classification remains accurate under the new format.

**Why this priority**: US1's original FR-005/FR-006 keyed classification off the checkboxes that are now being removed. Without this replacement rule, the scanner's core classification logic is broken. P1 because US1 depends on it.

**Independent Test**: Run the scanner against a spec whose `## Dependency Order` table lists three user stories, where two have existing tasks files (one done, one in progress) and one has `—` in its Artifact column. Verify the scanner classifies the spec as `in-progress` based on the downstream tasks-file statuses, not on any checkbox state.

**Acceptance Scenarios**:

1. **Given** a spec's `## Dependency Order` row has a populated `Artifact` column pointing at an existing tasks file, **When** the scanner runs, **Then** that row's status rolls up from the tasks file's computed status (done / in-progress / not-started based on slice checkboxes in `## Slice N:` bodies).
2. **Given** a spec's `## Dependency Order` row has `—` in its `Artifact` column, **When** the scanner runs, **Then** a virtual "not-started" tasks record is emitted for that row with the expected filename derived from naming convention (e.g., `NN-<story-slug>.tasks.md`).
3. **Given** a feature-map row points at a spec folder that exists on disk, **When** the scanner runs, **Then** the feature's status is the rolled-up status of the underlying spec (and recursively the spec's tasks files).
4. **Given** an RFC row in `## Dependency Order` points at an existing `.features.md`, **When** the scanner runs, **Then** the milestone's status is the rolled-up status of the feature map.
5. **Given** the scanner encounters a legacy artifact with the old checkbox-based `## Dependency Order` format, **When** it reads the section, **Then** it emits a `format_legacy` warning on the record and classifies it as `unknown` — it does not attempt tolerant parsing of the old format.
6. **Given** the unified table format is the only source of child ordering, **When** the scanner parses the `## Dependency Order` section, **Then** it does not count `- [ ]` or `- [x]` patterns anywhere in the section (even if present) — checkboxes inside the dependency-order section are semantically meaningless under the new format.

---

### User Story 10: Visualize the Dependency Graph for Parallel Work (Priority: P1)

As a Smithy user with multiple in-progress artifacts, I want `smithy status` to show me the dependency graph in topological layers so that I can immediately see which items are ready to work on in parallel right now.

**Why this priority**: The user explicitly called this out — the whole point of making the dependency format deterministic is to enable this view. Without it, the format change is half-delivered. It depends on US8 (deterministic format) and US9 (classification), but nothing else depends on it, so it slots in at the end of the P1 sequence.

**Independent Test**: Run `smithy status --graph` against a repo with at least one spec whose `## Dependency Order` has a mix of independent and dependent user stories (e.g., US1, US4 independent; US2 depends on US1; US3 depends on US2). Verify the output groups US1 and US4 into "Layer 0 (ready)", US2 into Layer 1, US3 into Layer 2.

**Acceptance Scenarios**:

1. **Given** a spec with 4 user stories where US1 and US4 have no dependencies, US2 depends on US1, and US3 depends on US2, **When** the user runs `smithy status --graph`, **Then** the output shows Layer 0 containing `US1, US4`, Layer 1 containing `US2`, and Layer 2 containing `US3`.
2. **Given** the dependency tables across RFC, features, spec, and tasks artifacts are unioned into a single graph, **When** `smithy status --graph` renders, **Then** layer assignment uses the rolled-up (cross-artifact) graph — a tasks-file slice cannot be "ready" until its parent user story is ready, which requires its parent feature to be ready, and so on up the chain.
3. **Given** the graph contains a cycle (e.g., US1 depends on US2 and US2 depends on US1 — user error), **When** the scanner builds the graph, **Then** the cycle is reported as a structured error listing the participating IDs, and the graph view falls back to flat rendering with a warning instead of crashing.
4. **Given** all items in a layer are `done`, **When** `--graph` renders in default (collapsed) mode, **Then** that layer collapses to `Layer N: DONE (M items)` and its children are hidden unless `--all` is passed.
5. **Given** `--format json` is combined with `--graph` (or `--format json` alone), **When** the view renders, **Then** the JSON output includes a top-level `graph` object with `layers: Array<{ layer: number, ids: string[] }>` and a `cycles: string[][]` field (empty when the graph is a DAG).
6. **Given** a dependency ID in the `Depends On` column references an ID that does not exist in any dependency table, **When** the graph builder runs, **Then** the dangling reference is reported as a warning on the record and the graph is built using only the valid edges.

---

### Edge Cases

- A `.features.md` exists but has no `## Dependency Order` section (legacy or hand-edited file) — scanner must not crash; classify as `unknown` with a `missing_dependency_order` parse warning, and (if the file contains a legacy `## Feature Dependency Order` checkbox section) additionally emit the `format_legacy` warning from FR-028.
- Two spec folders claim the same slug (user mistake) — scanner reports both and flags the collision.
- A tasks file has both checked and unchecked boxes outside of a `## Slice N:` heading (e.g., in an appendix) — scanner only counts checkboxes inside slice sections.
- A spec folder exists but its `.spec.md` is empty or corrupted — scanner emits a parse-error record and continues.
- A tasks file's `## Slice` sections use non-standard numbering (e.g., "Slice 1.1", "Slice A") — scanner must either tolerate or emit a clear format-violation warning.
- The repo has zero Smithy artifacts — scanner prints a friendly "no artifacts found; try `smithy.ignite` to start" message rather than empty output.
- The scanner is run outside a git repo — it still works, rooted at CWD.
- A `## Dependency Order` table has malformed rows (missing columns, invalid ID format, Markdown table syntax errors) — scanner emits a parse warning on the artifact, treats the section as empty, and continues without crashing.
- A `Depends On` cell references an ID that does not exist in the same table (typo or stale edit) — scanner emits a `dangling_dep` warning and builds the graph using only valid edges.
- The unioned dependency graph contains a cycle introduced by user error — scanner reports the cycle's participating IDs as a structured error and the `--graph` view falls back to flat layer-0 rendering with a warning.
- A repo is mid-migration and contains a mix of new-format and legacy-format artifacts — scanner classifies new-format artifacts normally and flags legacy-format artifacts as `unknown` with a `format_legacy` warning pointing to the migration instructions.
- The `Artifact` column is `—` for a user-story row but a file matching the expected naming convention already exists on disk (the author forgot to update the table) — scanner emits a `stale_artifact_column` warning, uses the existing file for classification, and suggests re-running the authoring command to refresh the table.

## Dependency Order

| ID   | Title                                                                      | Depends On     | Artifact |
|------|----------------------------------------------------------------------------|----------------|----------|
| US1  | Scan Artifacts and Classify Status                                         | —              | `specs/2026-04-12-004-smithy-status-skill/01-scan-artifacts-and-classify-status.tasks.md` |
| US2  | Render a Hierarchical Status View                                          | US1            | `specs/2026-04-12-004-smithy-status-skill/02-render-hierarchical-status-view.tasks.md` |
| US3  | Collapse Completed Items                                                   | US2            | —        |
| US4  | Suggest the Next Command                                                   | US1            | —        |
| US5  | Invoke Status via the smithy.status Skill                                  | US1, US2, US3, US4 | —    |
| US6  | Filter and Scope the View                                                  | US2            | —        |
| US7  | Summary Roll-up Header                                                     | US1            | `specs/2026-04-12-004-smithy-status-skill/07-summary-roll-up-header.tasks.md` |
| US8  | Deterministic Dependency Order Format Across All Artifacts                 | —              | `specs/2026-04-12-004-smithy-status-skill/08-deterministic-dependency-order-format.tasks.md` |
| US9  | Scanner Classifies Without Relying on Dependency-Order Checkboxes          | US1, US8       | `specs/2026-04-12-004-smithy-status-skill/09-scanner-classifies-without-checkboxes.tasks.md` |
| US10 | Visualize the Dependency Graph for Parallel Work                           | US8, US9       | —        |

Rows whose `Artifact` cell is `—` have not been cut yet; `smithy.cut` populates each row's path as its tasks file is created (e.g., US1 and US8 have been cut and carry their tasks-file paths; the remaining rows are still `—`). Parallelizable work surfaces directly from the `Depends On` column: at the start of implementation, `US1` and `US8` form Layer 0 and can be worked in parallel. US9 must land in the same release as US8 so the scanner's classification rules (FR-005/FR-006) remain correct after the template migration.

Notes on this table's form (which is itself the format mandated by US8 / FR-020 – FR-023):

- Row IDs use the canonical `US<N>` prefix per FR-021.
- Dependencies are comma-separated same-table IDs per FR-022. No prose.
- Dependencies that cross artifact boundaries (e.g., "this story depends on a row in a different spec") are NOT written here — they flow implicitly through the parent/child lineage (FR-022, data-model Relationships section).
- Because this spec has no RFC or feature-map parent, its own rows are the top of the dependency graph for the status feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a `smithy status` CLI subcommand that scans a fixed set of default roots relative to the working directory (or to `--root` when supplied) — namely `specs/`, `docs/rfcs/`, and `specs/strikes/` — and discovers all Smithy artifact files within those roots by extension: `.rfc.md`, `.features.md`, `.spec.md`, `.tasks.md`. Files outside those roots are not scanned.
- **FR-002**: The system MUST parse each discovered artifact deterministically — no LLM calls, no network access, no external services — using Markdown pattern matching on three signal classes produced by existing smithy commands: required section headings, the 4-column `## Dependency Order` table format (FR-020), and the task-completion checkboxes inside `## Slice N:` body sections of tasks files. Checkboxes inside `## Dependency Order` sections are semantically ignored (see FR-028).
- **FR-003**: The system MUST classify every artifact as one of: `done`, `in-progress`, `not-started`, or `unknown` (for parse failures).
- **FR-004**: Tasks-file classification MUST count slice checkboxes inside `## Slice N:` sections only — checkboxes elsewhere in the file MUST NOT affect the count.
- **FR-005**: Spec-file classification MUST derive each user story's state from the existence and status of its downstream tasks file, located via the `Artifact` column of the spec's `## Dependency Order` table (or a `—` cell, which triggers a virtual "not-started" tasks record using the naming-convention-expected path). The scanner MUST NOT use checkboxes in the `## Dependency Order` section for classification — those checkboxes are no longer emitted by any smithy authoring command.
- **FR-006**: Feature-map classification MUST derive each feature's state from the existence and rolled-up status of its downstream spec folder, located via the `Artifact` column of the feature map's `## Dependency Order` table. Checkbox counting in the `## Dependency Order` section is explicitly forbidden.
- **FR-007**: The system MUST render a hierarchical tree view that visually nests descendants under their ancestors using titles (not file paths) as the primary labels.
- **FR-008**: The system MUST collapse any fully-done subtree to a single `DONE` line by default, hiding its children, and expand any partially-done subtree to show its children with a `N/M` counter.
- **FR-009**: The system MUST provide an `--all` flag that disables collapsing and shows every artifact and slice regardless of status.
- **FR-010**: For every in-progress or not-started artifact, the system MUST emit a next-action suggestion naming the specific smithy command and arguments needed to move that artifact forward, using pattern-based rules (no LLM inference).
- **FR-011**: Next-action suggestions MUST suppress child suggestions when an ancestor is itself not-started, so that only the topmost actionable item in each chain is surfaced.
- **FR-012**: The system MUST surface orphaned artifacts (tasks with missing spec parents, specs with missing feature-map parents) under dedicated "Orphaned" or "Broken Links" groups with their dangling references shown.
- **FR-013**: The system MUST provide a `--format json` flag that emits the full scan record set and summary as machine-readable JSON suitable for programmatic consumers.
- **FR-014**: The system MUST ship a `smithy.status` agent-skill template that invokes the `smithy status` CLI and returns its output with minimal LLM commentary (at most a one-sentence framing).
- **FR-015**: The skill MUST forward any arguments it receives directly to the CLI rather than interpreting them — filtering and formatting are the script's responsibility.
- **FR-016**: The system MUST print a summary header with per-artifact-type counts (done / in-progress / not-started) above the tree view.
- **FR-017**: The system MUST support filtering via `--status <state>`, `--root <path>`, and `--type <artifact-type>` flags, with filtering applied inside the script (not the skill).
- **FR-018**: On parse failures, the system MUST emit the error as part of the record (not a crash) and continue scanning remaining artifacts.
- **FR-019**: The system MUST handle the zero-artifacts case by printing a discoverable hint that directs the user to `smithy.ignite` or `smithy.mark` rather than emitting empty output.
- **FR-020**: All smithy authoring commands that produce `.rfc.md`, `.features.md`, `.spec.md`, or `.tasks.md` artifacts (currently `smithy.ignite`, `smithy.render`, `smithy.mark`, `smithy.cut`, and `smithy.strike`) MUST emit a unified `## Dependency Order` section using a 4-column Markdown table with columns `ID | Title | Depends On | Artifact`. The authoring commands MUST NOT emit the legacy checkbox-based format. Prompt-template updates required to satisfy this FR are in scope for this feature.
- **FR-021**: IDs in the `## Dependency Order` table MUST use canonical per-level prefixes: `M` for milestones (RFC), `F` for features (feature map), `US` for user stories (spec), and `S` for slices (tasks). IDs MUST be unique within a single table and MUST be written as `<prefix><number>` (e.g., `M1`, `F2`, `US3`, `S4`) with no leading zeros.
- **FR-022**: The `Depends On` column MUST contain either `—` (em dash, no dependencies) or a comma-separated list of IDs drawn exclusively from the same table. Free-text justifications and cross-artifact ID references are forbidden — authoring commands place cross-artifact lineage in the `Artifact` column and the narrative prose elsewhere in the document.
- **FR-023**: The `Artifact` column MUST contain either `—` (no downstream artifact yet) or a repo-relative path to the downstream file or folder (`.features.md` for milestones, a spec folder for features, `.tasks.md` for user stories). Slice rows in tasks files MUST use `—` (slices have no separate files). This column replaces the checkbox as the "started/not started" signal.
- **FR-024**: `.rfc.md` templates MUST include a `## Dependency Order` section placed immediately after the list of milestones. The section lists every milestone with its dependencies and the path to its feature-map file (or `—` if not yet rendered).
- **FR-025**: The scanner MUST parse each artifact's `## Dependency Order` table deterministically (Markdown table regex + simple ID tokenization) and build a per-artifact dependency list. The scanner MUST NOT use LLM inference, prose parsing, or graph heuristics.
- **FR-026**: The scanner MUST union the per-artifact dependency lists into a single cross-artifact DependencyGraph by joining on `Artifact` column paths (a child artifact's nodes become children of the parent row that references it). The scanner MUST detect cycles and report them as structured errors rather than crashing or infinite-looping.
- **FR-027**: The system MUST provide a `--graph` flag that renders the DependencyGraph as topological layers, where Layer 0 contains all nodes with no incoming edges and each subsequent layer contains nodes whose dependencies are all satisfied by earlier layers. Layers containing only `done` nodes MUST collapse to a single line in the default view and expand under `--all`.
- **FR-028**: When the scanner encounters a legacy checkbox-based `## Dependency Order` section, it MUST flag the artifact with a `format_legacy` warning, classify the record as `unknown`, and suggest the migration path in its warning text. The scanner MUST NOT attempt tolerant parsing of the legacy format.
- **FR-029**: The artifact hierarchy and the deterministic `## Dependency Order` table format MUST be documented in two authoritative in-repo locations so the mapping is maintained as Smithy evolves: (a) `CLAUDE.md` (project instructions loaded into every session) MUST contain an "Artifact Hierarchy and Relationships" subsection describing the RFC → Feature Map → Spec → Tasks lineage and naming the Dependency Order table as the deterministic link, and (b) `src/templates/agent-skills/README.md` MUST contain a section with the canonical 4-column table schema (`ID | Title | Depends On | Artifact`), the canonical ID prefixes (`M`, `F`, `US`, `S`), and the relationship rules (each parent row's `Artifact` column points at a child file/folder; slices are dependency rows inside tasks files with no separate files). Every planning-artifact-producing command template (`smithy.ignite`, `smithy.render`, `smithy.mark`, `smithy.cut`, `smithy.strike`) MUST link back to these docs rather than redefining the format inline, so the rules have a single source of truth.

### Key Entities *(include if feature involves data)*

- **ArtifactRecord**: One entry per discovered artifact file, carrying its type (`rfc | features | spec | tasks`), path, title, status, optional `completed/total` counts, parent reference, its parsed `DependencyOrderTable`, and any parse warnings.
- **DependencyOrderTable**: The parsed contents of an artifact's `## Dependency Order` section, as an ordered list of `DependencyRow` entries. Each row carries `id`, `title`, `depends_on: string[]`, and `artifact_path: string | null`.
- **DependencyGraph**: The unioned cross-artifact DAG built from every artifact's `DependencyOrderTable`. Nodes are keyed by fully-qualified IDs (e.g., `specs/.../spec.md#US2`), edges are dependency relationships, and the graph carries topological layers and any detected cycles.
- **StatusTree**: A rendered hierarchical view built by grouping ArtifactRecords under their parents (RFC → features → spec → tasks), with orphan and broken-link groups for records whose parents are missing.
- **NextAction**: A suggested smithy command (name + arguments) attached to a non-done ArtifactRecord, derived by deterministic rules from the record's type and status.
- **ScanSummary**: Aggregate counts of records per type and per status for the summary header and JSON output.

## Assumptions

- The status scanner is shipped as part of the Smithy CLI package (`src/commands/status.ts` or equivalent) and exposed as `smithy status`. It is not a separate binary, not a standalone npm package, and not a shell script.
- The `smithy.status` agent-skill is a thin wrapper — its prompt text tells the agent to execute `smithy status` via a shell call and return the output verbatim. The skill does no independent parsing or tree-building.
- Artifact status is fully derivable from three in-artifact signal classes: (1) section headings and frontmatter, (2) the 4-column `## Dependency Order` table (FR-020) produced by all authoring commands after the US8 rollout, and (3) task-completion checkboxes inside `## Slice N:` bodies of tasks files (unchanged). This feature introduces NO new metadata fields and NO sidecar files beyond those already written by `smithy.ignite`, `smithy.render`, `smithy.mark`, and `smithy.cut`.
- "RFC" and "feature map" files may not always exist in a repo that uses `smithy.strike` directly — the scanner must handle strike-only repos (spec-less, feature-map-less) without degrading.
- Terminal output is the primary rendering target; JSON is a secondary consumer-facing format; HTML / web dashboards are out of scope for v1.
- Next-action rules are encoded as a static decision table in the script, not driven by configuration.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Exact ANSI color palette and tree-connector characters are not specified — will be resolved during implementation by matching existing smithy CLI output conventions. | Interaction & UX | Low | High | open | — |
| SD-002 | The handling of `specs/strikes/` folder contents (lightweight strike artifacts that don't follow the full RFC → tasks hierarchy) is unspecified — are they rendered as a flat list, ignored, or promoted into the tree as orphans? | Functional Scope | Medium | Medium | open | — |
| SD-003 | Whether the scanner should respect `.gitignore` / `.smithyignore` when walking the repo is undefined. | Functional Scope | Low | Medium | open | — |
| SD-004 | Whether `smithy status --watch` (continuous refresh) is in scope is undefined — leaning out-of-scope for v1 but not stated. | Interaction & UX | Low | High | open | — |
| SD-005 | A one-time migration tool or script to convert legacy checkbox-based `## Dependency Order` sections to the new table format is implied by FR-020/FR-028 but not specified. Open question: manual edit, dedicated `smithy migrate` command, or a one-off script in `scripts/`? | Functional Scope | Medium | Medium | open | — |
| SD-006 | The exact ASCII rendering for the `--graph` dependency layer view (plain indented list vs. tree connectors vs. Mermaid-style) is not pinned down. | Interaction & UX | Low | High | open | — |
| SD-007 | Whether the `DependencyGraph` spans only the current scan root or can cross repository boundaries (mono-repo vs. multi-repo) is unaddressed. Leaning single-root but not stated. | Functional Scope | Low | High | open | — |
| SD-008 | The interaction between `--graph` and `--status` / `--root` / `--type` filters is unspecified — does filtering prune the graph before layering, or does it hide filtered nodes within the full graph? | Interaction & UX | Medium | Medium | open | — |
| SD-009 | The documentation mirror required by FR-029 lives in two places (CLAUDE.md and `src/templates/agent-skills/README.md`). If those two drift from each other or from the spec, there is no automated check to catch it. A lint rule or doc-generation step is implied but not designed. | Integration | Medium | Medium | open | — |

## Out of Scope

- New metadata fields, sidecar files, or hidden state beyond the `## Dependency Order` table format defined in this spec. Status MUST derive from artifact contents only.
- Backwards-compatible tolerant parsing of the legacy checkbox-based dependency-order format. The break is clean by design (see FR-028).
- Automatic bulk migration of existing artifacts to the new format. A migration tool may ship alongside this feature, but its design is tracked in SD-005 and not specified here.
- LLM-driven summarization, prioritization, or narrative rendering. The skill is a thin passthrough.
- Web dashboards, HTML reports, or any non-terminal rendering target.
- GitHub issue integration (that is `smithy.orders`' job).
- Editing artifacts to change their status — the scanner is read-only.
- Continuous watch mode (`--watch`) — deferred.
- Cross-repo aggregation — single-repo only.
- Configurable scan roots beyond `specs/`, `docs/rfcs/`, `specs/strikes/` — deferred to a future iteration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running `smithy status` on a repo with ≥3 in-flight artifacts produces a report in under 500 ms with no LLM calls.
- **SC-002**: For every artifact the scanner classifies as `done`, a manual audit confirms the classification holds under the rollup rules: for a tasks record, every slice-body task checkbox inside `## Slice N:` sections is checked; for a spec / features / rfc record, every row in its `## Dependency Order` table rolls up to `done`. 100% agreement on a corpus of at least 5 mixed-state artifacts.
- **SC-003**: For every in-progress artifact, the next-action suggestion names a real smithy command that, when run, advances the artifact state (manual spot-check on at least 5 artifacts).
- **SC-004**: Collapsed `DONE` subtrees hide all their children by default, verified on a repo where at least one feature is fully done.
- **SC-005**: The `smithy.status` skill invoked via `/smithy.status` in a deployed Claude Code session produces byte-for-byte the same tree text as `smithy status` run from the shell (ignoring any optional one-sentence framing).
- **SC-006**: Adding a new slice checkbox to an existing tasks file and re-running `smithy status` reflects the updated `N/M` count with zero additional input from the user.
- **SC-007**: Running `smithy status` on an empty repo (no Smithy artifacts) prints a single friendly hint message and exits cleanly, not an error.
- **SC-008**: Every artifact produced by a post-migration `smithy.ignite`, `smithy.render`, `smithy.mark`, `smithy.cut`, or `smithy.strike` run contains a `## Dependency Order` table conforming to the 4-column format and zero `- [ ]` / `- [x]` checkboxes inside that section (verified by automated test).
- **SC-009**: A deterministic parser using only Markdown table regex and ID tokenization can reconstruct the full dependency graph from a repo's artifacts with zero LLM calls and zero prose parsing (100% of rows parsed correctly on a test corpus of at least 5 artifacts).
- **SC-010**: `smithy status --graph` on a repo with a known dependency structure (4 stories, 2 independent in Layer 0, cascading downstream) produces layer assignments that match a hand-computed reference exactly.
- **SC-011**: Modifying a `Depends On` cell from `US1` to `US1, US3` and re-running `smithy status --graph` reflects the new edge in the layer output immediately, with no cache invalidation step.
- **SC-012**: A legacy artifact with the old checkbox format is flagged with a `format_legacy` warning and classified as `unknown` rather than being silently misclassified.

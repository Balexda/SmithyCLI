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
- _"Not started" for a spec means the `## Story Dependency Order` section exists but no referenced tasks file exists on disk yet. "Not started" for a feature means its feature-map checklist entry is unchecked and no spec folder exists._
- _Next-action suggestions are pattern-based, not LLM-inferred: if a feature has no spec → suggest `smithy.mark`; if a spec has an unspecced user story → suggest `smithy.cut`; if a tasks file has open slices → suggest `smithy.forge`._

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

This is the canonical smithy conceptual lineage (shared across all specs). The **status tree this feature actually builds** is narrower and reflects only the discoverable artifact files on disk: `RFC → feature map → spec → tasks`, with slices represented as per-tasks-record counters (not as standalone nodes). Milestone and User Story do not appear as standalone nodes in the rendered tree — they are folded into their containing feature-map and spec records respectively.

## User Scenarios & Testing *(mandatory)*

### User Story 1: Scan Artifacts and Classify Status (Priority: P1)

As a Smithy user with multiple in-flight planning artifacts, I want a single command that walks the repo and produces a structured status record for every RFC, feature map, spec, and tasks file, so that I have one authoritative view of what exists and how far along it is.

**Why this priority**: Every other story depends on this scan producing a reliable, typed record set. Without it, nothing else can render or suggest.

**Independent Test**: Run the scanner against a repo containing one fully-done feature, one in-progress feature, and one not-started feature. Verify the scanner emits one record per artifact with the correct status classification, and that all three categories are represented.

**Acceptance Scenarios**:

1. **Given** a repo with `specs/2026-04-08-003-reduce-interaction-friction/` containing a spec, two completed tasks files, and one unchecked story in the spec's `## Story Dependency Order`, **When** the scanner runs, **Then** it emits one spec record (status: in-progress), two tasks records (status: done), and one virtual tasks record (status: not-started) for the unchecked story.
2. **Given** a tasks file where 3 of 6 slice checkboxes are checked, **When** the scanner classifies it, **Then** its status is `in-progress` with `completed=3, total=6`.
3. **Given** a tasks file where all slice checkboxes are checked, **When** the scanner classifies it, **Then** its status is `done`.
4. **Given** a spec's `## Story Dependency Order` references a tasks file at `01-foo.tasks.md` that does not exist on disk, **When** the scanner runs, **Then** a virtual "not-started" tasks record is emitted for that story with the suggested path.
5. **Given** a `.features.md` with `## Feature Dependency Order` containing `- [ ] **Feature 3: Webhooks**`, **When** the scanner runs and no spec folder exists for Feature 3, **Then** a feature record is emitted with status `not-started`.
6. **Given** an artifact file that cannot be parsed (missing required headings), **When** the scanner encounters it, **Then** a record with status `unknown` is emitted with a parse-error note, and scanning continues.

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

### Edge Cases

- A `.features.md` exists but has no `## Feature Dependency Order` section (legacy or hand-edited file) — scanner must not crash; treat as "unknown" structure and surface a parse warning.
- Two spec folders claim the same slug (user mistake) — scanner reports both and flags the collision.
- A tasks file has both checked and unchecked boxes outside of a `## Slice N:` heading (e.g., in an appendix) — scanner only counts checkboxes inside slice sections.
- A spec folder exists but its `.spec.md` is empty or corrupted — scanner emits a parse-error record and continues.
- A tasks file's `## Slice` sections use non-standard numbering (e.g., "Slice 1.1", "Slice A") — scanner must either tolerate or emit a clear format-violation warning.
- The repo has zero Smithy artifacts — scanner prints a friendly "no artifacts found; try `smithy.ignite` to start" message rather than empty output.
- The scanner is run outside a git repo — it still works, rooted at CWD.

## Story Dependency Order

Recommended implementation sequence:

- [ ] **User Story 1: Scan Artifacts and Classify Status** — Foundational; every other story consumes its record output. No dependencies.
- [ ] **User Story 2: Render a Hierarchical Status View** — Consumes US1 records. Depends on US1.
- [ ] **User Story 3: Collapse Completed Items** — Extends US2's rendering with collapsing logic. Depends on US2.
- [ ] **User Story 4: Suggest the Next Command** — Reads US1 records and annotates the US2 tree. Depends on US1; can parallelize with US2/US3.
- [ ] **User Story 5: Invoke Status via the smithy.status Skill** — Wraps the CLI produced by US1–US4 in an agent-skill. Depends on US1–US4 being callable via `smithy status`.
- [ ] **User Story 6: Filter and Scope the View** (P1) — Adds required filter flags to the renderer from US2/US3. Depends on US2.
- [ ] **User Story 7: Summary Roll-up Header** (P1) — Aggregates US1 record counts. Depends on US1; can parallelize with US2–US6.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a `smithy status` CLI subcommand that scans a fixed set of default roots relative to the working directory (or to `--root` when supplied) — namely `specs/`, `docs/rfcs/`, and `specs/strikes/` — and discovers all Smithy artifact files within those roots by extension: `.rfc.md`, `.features.md`, `.spec.md`, `.tasks.md`. Files outside those roots are not scanned.
- **FR-002**: The system MUST parse each discovered artifact deterministically — no LLM calls, no network access, no external services — using markdown pattern matching on the headings and checkbox conventions already produced by existing smithy commands.
- **FR-003**: The system MUST classify every artifact as one of: `done`, `in-progress`, `not-started`, or `unknown` (for parse failures).
- **FR-004**: Tasks-file classification MUST count slice checkboxes inside `## Slice N:` sections only — checkboxes elsewhere in the file MUST NOT affect the count.
- **FR-005**: Spec-file classification MUST use the `## Story Dependency Order` checklist as the source of truth for story completion, with a virtual "not-started" record emitted for each referenced tasks file that does not exist on disk.
- **FR-006**: Feature-map classification MUST use the `## Feature Dependency Order` checklist as the source of truth for feature completion.
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

### Key Entities *(include if feature involves data)*

- **ArtifactRecord**: One entry per discovered artifact file, carrying its type (`rfc | features | spec | tasks`), path, title, status, optional `completed/total` counts, parent reference, and any parse warnings.
- **StatusTree**: A rendered hierarchical view built by grouping ArtifactRecords under their parents (RFC → features → spec → tasks), with orphan and broken-link groups for records whose parents are missing.
- **NextAction**: A suggested smithy command (name + arguments) attached to a non-done ArtifactRecord, derived by deterministic rules from the record's type and status.
- **ScanSummary**: Aggregate counts of records per type and per status for the summary header and JSON output.

## Assumptions

- The status scanner is shipped as part of the Smithy CLI package (`src/commands/status.ts` or equivalent) and exposed as `smithy status`. It is not a separate binary, not a standalone npm package, and not a shell script.
- The `smithy.status` agent-skill is a thin wrapper — its prompt text tells the agent to execute `smithy status` via a shell call and return the output verbatim. The skill does no independent parsing or tree-building.
- Artifact status is fully derivable from existing markdown conventions (checkboxes, headings, frontmatter) written by `smithy.ignite`, `smithy.render`, `smithy.mark`, and `smithy.cut`. This feature introduces NO new metadata fields and NO sidecar files.
- "RFC" and "feature map" files may not always exist in a repo that uses `smithy.strike` directly — the scanner must handle strike-only repos (spec-less, feature-map-less) without degrading.
- Terminal output is the primary rendering target; JSON is a secondary consumer-facing format; HTML / web dashboards are out of scope for v1.
- Next-action rules are encoded as a static decision table in the script, not driven by configuration.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Exact ANSI color palette and tree-connector characters are not specified — will be resolved during implementation by matching existing smithy CLI output conventions. | Interaction & UX | Low | High | open | — |
| SD-002 | The handling of `strikes/` folder contents (lightweight strike artifacts that don't follow the full RFC → tasks hierarchy) is unspecified — are they rendered as a flat list, ignored, or promoted into the tree as orphans? | Functional Scope | Medium | Medium | open | — |
| SD-003 | Whether the scanner should respect `.gitignore` / `.smithyignore` when walking the repo is undefined. | Functional Scope | Low | Medium | open | — |
| SD-004 | Whether `smithy status --watch` (continuous refresh) is in scope is undefined — leaning out-of-scope for v1 but not stated. | Interaction & UX | Low | High | open | — |

## Out of Scope

- New metadata fields, sidecar files, or hidden state. Status MUST derive from existing artifact contents only.
- LLM-driven summarization, prioritization, or narrative rendering. The skill is a thin passthrough.
- Web dashboards, HTML reports, or any non-terminal rendering target.
- GitHub issue integration (that is `smithy.orders`' job).
- Editing artifacts to change their status — the scanner is read-only.
- Continuous watch mode (`--watch`) — deferred.
- Cross-repo aggregation — single-repo only.
- Configurable scan roots beyond `specs/`, `docs/rfcs/`, `strikes/` — deferred to a future iteration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running `smithy status` on a repo with ≥3 in-flight artifacts produces a report in under 500 ms with no LLM calls.
- **SC-002**: For every artifact the scanner classifies as `done`, a manual audit of the underlying markdown confirms all relevant checkboxes are checked (100% agreement).
- **SC-003**: For every in-progress artifact, the next-action suggestion names a real smithy command that, when run, advances the artifact state (manual spot-check on at least 5 artifacts).
- **SC-004**: Collapsed `DONE` subtrees hide all their children by default, verified on a repo where at least one feature is fully done.
- **SC-005**: The `smithy.status` skill invoked via `/smithy.status` in a deployed Claude Code session produces byte-for-byte the same tree text as `smithy status` run from the shell (ignoring any optional one-sentence framing).
- **SC-006**: Adding a new slice checkbox to an existing tasks file and re-running `smithy status` reflects the updated `N/M` count with zero additional input from the user.
- **SC-007**: Running `smithy status` on an empty repo (no Smithy artifacts) prints a single friendly hint message and exits cleanly, not an error.

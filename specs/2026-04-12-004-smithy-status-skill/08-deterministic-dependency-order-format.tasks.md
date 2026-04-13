# Tasks: Deterministic Dependency Order Format

**Source**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md` — User Story 8
**Data Model**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.data-model.md`
**Contracts**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.contracts.md`
**Story Number**: 08

---

## Slice 1: Migrate Output Templates to 4-Column Dependency Order Table

**Goal**: Every authoring command (`smithy.mark`, `smithy.render`, `smithy.cut`, `smithy.ignite`) emits a `## Dependency Order` 4-column table with canonical per-level IDs and no checkboxes anywhere inside the section.

**Justification**: This is a pure template-text migration with no behavioral coupling. After this slice, any newly created artifact uses the correct format. It can be reviewed as a single self-contained "format consistency" PR — all four output templates get the same structure, making compliance immediately visible.

**Addresses**: FR-020, FR-021, FR-022, FR-023, FR-024; AS 8.1, AS 8.2, AS 8.3, AS 8.4, AS 8.5, AS 8.6, AS 8.7

### Tasks

- [x] **Migrate smithy.mark spec template to US-ID Dependency Order table**

  In `src/templates/agent-skills/commands/smithy.mark.prompt`, replace the `## Story Dependency Order` checkbox-list template in Phase 3 (Specify) with a `## Dependency Order` 4-column table using `US<N>` IDs. Also update the authoring-guidelines section so no checkbox-format instructions remain. Satisfies AS 8.1, AS 8.5, AS 8.6, AS 8.7.

  _Acceptance criteria:_
  - Template emits `## Dependency Order` (not `## Story Dependency Order`)
  - Table columns are `ID | Title | Depends On | Artifact` in that order
  - Row IDs use `US<N>` format (no leading zeros), unique within the table
  - `Depends On` column contains `—` or comma-separated same-table IDs; no prose justifications
  - `Artifact` column contains `—` in the template placeholder
  - No `- [ ]` or `- [x]` checkbox syntax appears in the spec template or its authoring guidelines

- [x] **Migrate smithy.render features template to F-ID Dependency Order table**

  In `src/templates/agent-skills/commands/smithy.render.prompt`, replace the `## Feature Dependency Order` checkbox-list template in Phase 3 (Draft Feature Map) with a `## Dependency Order` 4-column table using `F<N>` IDs. Update the Rules section to remove checkbox-based instructions. Satisfies AS 8.3, AS 8.5, AS 8.6, AS 8.7.

  _Acceptance criteria:_
  - Template emits `## Dependency Order` (not `## Feature Dependency Order`)
  - Table uses `F<N>` IDs; `Artifact` column placeholder is `—`
  - Rules section contains no `[ ]`/`[x]` checkbox mechanics or `**Feature N Spec:` row-title format
  - No `- [ ] **Feature N Spec:` patterns remain in the template

- [x] **Migrate smithy.cut tasks template to S-ID Dependency Order table**

  In `src/templates/agent-skills/commands/smithy.cut.prompt`, replace the numbered-checkbox `## Dependency Order` template in Phase 4 (Slice) with a 4-column table using `S<N>` IDs. Per-task checkboxes inside each `## Slice N:` body are not affected — those track implementation progress. Satisfies AS 8.2, AS 8.5, AS 8.6, AS 8.7.

  _Acceptance criteria:_
  - Template emits `## Dependency Order` with 4-column table and `S<N>` IDs
  - `Artifact` column is `—` for every slice row (slices live inline as `## Slice N:` bodies)
  - No `1. [ ] **Slice N` or `- [ ] **Slice` numbered/bulleted-checkbox format remains
  - Per-task checkboxes inside `## Slice N:` bodies are preserved unchanged

- [x] **Add Dependency Order table to smithy.ignite RFC template**

  In `src/templates/agent-skills/commands/smithy.ignite.prompt`, add a `## Dependency Order` section immediately after the final `### Milestone N:` block in the RFC template code fence. Update the sub-phase 3f instructions to direct the drafting agent to produce this table alongside milestones. Satisfies AS 8.4, AS 8.5, AS 8.6, AS 8.7.

  _Acceptance criteria:_
  - RFC template body contains `## Dependency Order` positioned immediately after `## Milestones`
  - Table uses `M<N>` IDs; `Artifact` column placeholder is `—`
  - Sub-phase 3f instructions reference producing both the milestones list and the Dependency Order table
  - No checkbox markup in the new section

**PR Outcome**: Running any of the four authoring commands on a fresh artifact produces the new 4-column `## Dependency Order` table. All format-compliance requirements (AS 8.1–8.7) are satisfied for newly created artifacts.

---

## Slice 2: Update Behavioral Logic for Table-Based Dependency Order

**Goal**: Routing and write-back logic in `smithy.mark`, `smithy.cut`, and `smithy.forge` read and update the new table format. Legacy artifacts encountered in the wild are handled gracefully with explicit skip-silently rules.

**Justification**: Slice 1 changed what is emitted; this slice changes what commands do when reading or updating existing artifacts. These four changes form a single behavioral contract — mark's routing reads what render writes; cut's write-back targets what mark produced — and must ship together to avoid an intermediate state where the new format is emitted but the old read/write paths are still active.

**Addresses**: FR-020, FR-021, FR-022, FR-023, FR-024, FR-029; AS 8.1, AS 8.2, AS 8.3, AS 8.4, AS 8.7

### Tasks

- [x] **Rewrite smithy.mark routing to detect specc'd features from the Artifact column**

  Update Phase 1c of `smithy.mark.prompt` so that a feature is "specc'd" when its `## Dependency Order` table row's `Artifact` cell contains a path (not `—`). Add an explicit backward-compat clause: if the features file only contains the legacy `## Feature Dependency Order` checkbox section and no table, treat every feature as unspecced and do not modify the file during routing. Satisfies AS 8.3, AS 8.7.

  _Acceptance criteria:_
  - Routing references `## Dependency Order` (not `## Feature Dependency Order`) for detection
  - A feature is "specc'd" iff its row's `Artifact` cell is a non-`—` path
  - Legacy checkbox-only files cause all features to be treated as unspecced
  - Mark does not write to or migrate legacy files during the routing phase
  - No `[x]`/`[ ]` references remain in Phase 1c

- [x] **Update smithy.mark Phase 6 write-back to populate the Artifact column**

  Rewrite the Phase 6 feature-map write-back in `smithy.mark.prompt` so that after creating a spec folder, mark locates the matching `F<N>` row in the features file's `## Dependency Order` table and sets the `Artifact` cell to the spec folder path (replacing `—`). If the table is absent, create it in the 4-column format seeded from the feature list. If only the legacy checkbox format is present, skip silently. Satisfies AS 8.3, AS 8.7.

  _Acceptance criteria:_
  - Phase 6 write-back locates the row by `F<N>` ID and updates the `Artifact` cell
  - No checkbox is flipped during write-back
  - If `## Dependency Order` table is absent, a new 4-column table is created
  - If only legacy `## Feature Dependency Order` is present, write-back skips silently
  - Authoring-guidelines section contains no checkbox-flip instructions

- [x] **Update smithy.cut Phase 5 write-back to populate the spec Artifact column**

  Rewrite the Phase 5 spec write-back in `smithy.cut.prompt` so that after writing the tasks file, cut finds the matching `US<N>` row in the spec's `## Dependency Order` table and sets the `Artifact` cell to the repo-relative tasks file path. If the spec only has the legacy `## Story Dependency Order` section and no table, skip silently. Satisfies AS 8.1, AS 8.7.

  _Acceptance criteria:_
  - Phase 5 targets `## Dependency Order` (not `## Story Dependency Order`)
  - `US<N>` row's `Artifact` cell is set to the tasks file repo-relative path
  - If `Artifact` is already set to the same path, the operation is a no-op (idempotent)
  - If only legacy `## Story Dependency Order` exists, write-back skips silently
  - No checkbox-flip language remains in Phase 5 or in the Rules section

- [x] **Remove "Mark Slice Complete" section and update "Story Completion Cascade" in smithy.forge**

  Delete the "Mark Slice Complete" section in `smithy.forge.prompt` entirely — forge no longer writes to any `## Dependency Order` table. Rewrite "Story Completion Cascade" to explain that slice completion is derived from per-task checkboxes inside `## Slice N:` bodies, and that parent artifacts' `Artifact` columns are set by `smithy.mark` and `smithy.cut`, not forge. Satisfies AS 8.2.

  _Acceptance criteria:_
  - "Mark Slice Complete" section is absent from the forge template
  - "Story Completion Cascade" references per-task checkboxes in `## Slice N:` bodies as the completion signal
  - No `## Story Dependency Order` or `## Feature Dependency Order` checkbox-flip references remain
  - Forge makes no writes to any `## Dependency Order` table

**PR Outcome**: Authoring commands consistently read and write the 4-column table format. Legacy artifacts are handled gracefully. Forge no longer attempts to flip a deprecated checkbox.

---

## Slice 3: Update Audit Checklists and Add Template Regression Tests

**Goal**: All four audit-checklist snippets enforce the new table format in Phase 0a reviews, and `templates.test.ts` has regression tests that fail if any authoring template regresses to checkbox dependency ordering.

**Justification**: Slices 1–2 established the new format and behavior; this slice closes the loop so the tooling enforces it going forward. Audit snippets are shared across multiple commands via Handlebars partials, so one snippet update propagates everywhere. Tests must land last so they assert against the fully-migrated state.

**Addresses**: FR-020, FR-021, FR-022, FR-023, FR-024, FR-029; AS 8.1, AS 8.2, AS 8.3, AS 8.4

### Tasks

- [x] **Update all four audit-checklist snippets to check the 4-column Dependency Order table**

  Update `src/templates/agent-skills/snippets/audit-checklist-spec.md`, `audit-checklist-features.md`, `audit-checklist-tasks.md`, and `audit-checklist-rfc.md`. Replace checkbox-format descriptions with 4-column table descriptions. The rfc snippet gains a new `Dependency Order` row (currently absent). No snippet should retain `[ ]`/`[x]` references for dependency ordering. Satisfies FR-029; AS 8.1–8.4.

  _Acceptance criteria:_
  - All four snippets describe the 4-column table with the correct per-level ID prefix (`US<N>`, `F<N>`, `S<N>`, `M<N>`)
  - No snippet retains `[ ]` or `[x]` as valid dependency-ordering syntax
  - The spec snippet checks that `Artifact` cells with paths match existing `.tasks.md` files
  - The features snippet checks that `Artifact` cells with paths match existing spec folders
  - The tasks snippet notes every `S<N>` row's `Artifact` cell should be `—`
  - The rfc snippet has a new `Dependency Order` row asserting the table appears after `## Milestones`

- [x] **Add templates.test.ts regression tests for 4-column Dependency Order format**

  Add four test cases to `src/templates.test.ts` — one per authoring command (mark, render, cut, ignite) — that compose each template and assert the new format is present and the old format is absent. These are pattern-based assertions against the rendered template text. Satisfies FR-029; AS 8.1–8.4.

  _Acceptance criteria:_
  - Four new `it` blocks added for mark, render, cut, and ignite respectively
  - Each asserts `## Dependency Order` is present with `| ID | Title | Depends On | Artifact |` header (or normalized equivalent)
  - Each asserts old section names (`## Story Dependency Order`, `## Feature Dependency Order`) are absent
  - Each asserts no dependency row in checkbox format (`- [ ] **`, `1. [ ] **`) exists in the dependency-order context
  - All existing tests continue to pass; `npm test` is green

**PR Outcome**: Phase 0a audit runs by any authoring command flag legacy-format artifacts. CI prevents future regressions that would reintroduce checkbox-based dependency ordering into composed templates.

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
| SD-009 | inherited from spec: The documentation mirror required by FR-029 lives in two places (CLAUDE.md and `src/templates/agent-skills/README.md`). If those two drift from each other or from the spec, there is no automated check to catch it. | Integration | Medium | Medium | inherited | — |
| SD-010 | Whether `smithy.mark`'s Phase 6 write-back should actively upgrade a legacy `## Feature Dependency Order` section to the new table format, or skip silently when only the legacy format is present. Resolved for this story as: skip silently. Full migration is tracked in SD-005. | Scope Edges | High | Medium | open | Resolved in Slice 2 Task 2: write-back skips silently when only legacy checkbox format is present. |
| SD-011 | Whether `smithy.cut`'s Phase 5 write-back should upgrade a legacy `## Story Dependency Order` section to the new table format, or skip silently. Resolved for this story as: skip silently. Same rationale as SD-010. | Scope Edges | High | Medium | open | Resolved in Slice 2 Task 3: write-back skips silently when only legacy format is present. |
| SD-012 | Slice 1 and Slice 2 are not independently releasable: after Slice 1, new features files use `## Dependency Order`, but `smithy.mark`'s Phase 1c routing still looks for the old heading. Heading-alias tolerance belongs in Slice 2, so Slices 1–2 should deploy together as a paired migration. | Slice Boundaries | Medium | Medium | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Migrate Output Templates to 4-Column Dependency Order Table | — | — |
| S2 | Update Behavioral Logic for Table-Based Dependency Order | S1 | — |
| S3 | Update Audit Checklists and Add Template Regression Tests | S1, S2 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 9: Scanner Classifies Without Relying on Dependency-Order Checkboxes | depended upon by | US9's classification logic (FR-005/FR-006) requires authoring commands to emit the table format from US8. US9 must not ship before US8. |

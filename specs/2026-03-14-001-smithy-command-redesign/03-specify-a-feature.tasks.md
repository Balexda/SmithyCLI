# Tasks: Mark: Specify a Feature

**Source**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.spec.md` — User Story 3
**Data Model**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.data-model.md`
**Contracts**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.contracts.md`
**Story Number**: 03

---

## Slice 1: Create smithy.mark template from smithy.design

**Goal**: A working `smithy.mark.md` template exists with correct naming, frontmatter, and terminology aligned to the command redesign spec.

**Justification**: This is the core deliverable — the mark command template is the artifact that `smithy init` deploys. Everything else depends on this file existing.

**Addresses**: FR-003, FR-004, FR-005, FR-008; Acceptance Scenarios 3.1, 3.2, 3.3, 3.4, 3.5, 3.6

### Tasks

- [X] Copy `src/templates/base/smithy.design.md` to `src/templates/base/smithy.mark.md`
- [X] Update frontmatter: rename `name: smithy-design` to `name: smithy-mark`, update description to reference "mark" instead of "design"
- [X] Find-and-replace all references to "design" with "mark" in command name contexts (e.g., `smithy.design` → `smithy.mark`, "design agent" → "mark agent")
- [X] Update artifact hierarchy terminology to match the spec (RFC → Milestone → Feature → User Story → Slice → Tasks)
- [X] Verify folder naming convention references use `specs/<YYYY-MM-DD-NNN-slug>/` pattern per FR-008
- [X] Verify the template ensures all three output files are produced (`.spec.md`, `.data-model.md`, `.contracts.md`) including minimal placeholders when not needed (Acceptance Scenario 3.6)
- [X] Verify Phase 0 review loop is present and enters refinement when re-run on existing spec (FR-004, Acceptance Scenario 3.3)
- [X] Verify the template requires clarifying questions before producing artifacts (FR-003)
- [X] Confirm `command: true` remains in frontmatter so it deploys as a slash command

**PR Outcome**: `smithy.mark.md` exists as a deployable template with correct naming and spec-aligned content. Running `smithy init` would deploy it as `/smithy.mark`.

---

## Slice 2: Remove legacy smithy.design and update references

**Goal**: The legacy `smithy.design.md` template is removed, and all project references point to `smithy.mark` instead.

**Justification**: Standalone because the mark template is already functional from Slice 1. This slice cleans up the old command and updates documentation so the project is internally consistent.

**Addresses**: FR-016; Acceptance Scenario 3.2

### Tasks

- [X] Delete `src/templates/base/smithy.design.md`
- [X] Update `CLAUDE.md` "Smithy Workflow Commands" section: replace `smithy.design` with `smithy.mark` and update its description
- [X] Update any other `CLAUDE.md` references to "design" that should now say "mark" (e.g., in the pipeline stages list)
- [X] Search codebase for remaining references to `smithy.design` (in `.ts` files, other templates, specs) and update or remove them
- [X] Verify `npm run build` succeeds with the template changes
- [X] Verify `npm run typecheck` passes

**PR Outcome**: `smithy.design` is fully removed. All documentation and cross-references point to `smithy.mark`. The build passes cleanly.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

| ID | Title                                               | Depends On | Artifact |
|----|-----------------------------------------------------|------------|----------|
| S1 | Create smithy.mark template from smithy.design     | —          | —        |
| S2 | Remove legacy smithy.design and update references  | S1         | —        |

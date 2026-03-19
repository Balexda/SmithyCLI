# Tasks: Cut: Slice a User Story into Tasks

**Source**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.spec.md` — User Story 4
**Data Model**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.data-model.md`
**Contracts**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.contracts.md`
**Story Number**: 04

---

## Slice 1: Verify smithy.cut template spec alignment

**Goal**: Confirm the existing `smithy.cut.md` template is fully aligned with the command redesign spec, with no changes required.

**Justification**: The template was implemented ahead of the spec cut process and used to generate tasks for other stories. This slice verifies that alignment and documents it — no code changes needed.

**Addresses**: FR-003, FR-004, FR-005, FR-009, FR-011; Acceptance Scenarios 4.1, 4.2, 4.3, 4.4, 4.5

### Tasks

- [X] Read `src/templates/base/smithy.cut.md` and verify frontmatter has `command: true` and correct name/description
- [X] Verify Phase 0 review loop exists and handles re-run refinement (FR-004, AS 4.3)
- [X] Verify Phase 3 requires clarifying questions before producing artifacts (FR-003)
- [X] Verify output naming convention matches `<NN>-<story-slug>.tasks.md` with zero-padded numbering (FR-009, AS 4.5)
- [X] Verify slice structure includes Source/Data Model/Contracts/Story Number header, and each slice has Goal/Justification/Addresses/Tasks/PR Outcome (FR-011, AS 4.1, 4.4)
- [X] Verify each slice is constrained to PR-sized scope (AS 4.2)
- [X] Verify edge cases are handled: no user stories, invalid story number, >99 stories

**PR Outcome**: No code changes. Verification confirms the existing template is spec-aligned. Tasks file exists to advance the cut pipeline to subsequent user stories.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — Single verification slice, no dependencies.

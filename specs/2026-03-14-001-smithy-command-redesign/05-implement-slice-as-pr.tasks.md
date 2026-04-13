# Tasks: Forge: Implement a Slice as a PR

**Source**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.spec.md` — User Story 5
**Data Model**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.data-model.md`
**Contracts**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.contracts.md`
**Story Number**: 05

---

## Slice 1: Rewrite smithy.forge template for slice-based workflow

**Goal**: A working `smithy.forge.md` template that consumes `.tasks.md` slice structure, uses the correct branch naming convention, and deploys as a slash command.

**Justification**: This is the core deliverable — forge is the terminal pipeline step where planning becomes code. The entire template needs rewriting to consume the new artifact format.

**Addresses**: FR-001, FR-005; Acceptance Scenarios 5.1, 5.2, 5.3

### Tasks

- [X] Read the existing `src/templates/base/smithy.forge.md` to understand current structure
- [X] Rewrite the template with the following changes:
  - Add `command: true` to frontmatter so it deploys as `/smithy.forge`
  - Update description to reference slices from `.tasks.md` files, not phases
  - Define input: a tasks file path + slice number (e.g., `specs/2026-03-14-001-foo/03-bar.tasks.md 2`)
  - Add intake logic: parse the tasks file, extract the target slice's Goal, Tasks checklist, and Addresses
  - Hardcode branch naming convention: `<NNN>/us-<NN>-<slug>/slice-<N>` (per contracts)
  - Define implementation flow: execute tasks sequentially, run tests after each task, stop on failure
  - Define PR creation: PR title references slice, PR body links to source spec and slice for reviewability (AS 5.3)
  - Remove all references to old concepts: journeys, CHANGELOG, `docs/dev/coding-standards.md`, phase terminology
- [X] Verify the template handles edge cases: slice number out of range, tasks file not found, branch already exists
- [X] Verify the template instructs the agent to reference source spec and slice in the PR (AS 5.3)
- [X] Confirm `command: true` is in frontmatter

**PR Outcome**: `smithy.forge.md` is a deployable slash command template that consumes `.tasks.md` slices, creates correctly-named branches, implements tasks in order, and opens PRs with spec traceability.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

| ID | Title                                                      | Depends On | Artifact |
|----|------------------------------------------------------------|------------|----------|
| S1 | Rewrite smithy.forge template for slice-based workflow     | —          | —        |

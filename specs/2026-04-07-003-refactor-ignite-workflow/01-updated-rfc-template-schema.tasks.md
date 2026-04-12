# Tasks: Updated RFC Template Schema

**Source**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.spec.md` — User Story 1
**Data Model**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.data-model.md`
**Contracts**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.contracts.md`
**Story Number**: 01

---

## Slice 1: Insert Out of Scope and Personas into Phase 3 RFC Template

**Goal**: Insert `## Out of Scope` and `## Personas` sections into the Phase 3 RFC template in `src/templates/agent-skills/commands/smithy.ignite.prompt`, in the correct positions (after Goals, before Proposal), with placeholder content matching the existing section style.

**Addresses**: FR-005, FR-006; Acceptance Scenarios US1-1, US1-2

### Tasks

- [x] Read `src/templates/agent-skills/commands/smithy.ignite.prompt` to locate the Phase 3 RFC template block (the fenced markdown block inside `## Phase 3: Draft RFC`). Note the exact lines of the `## Goals` section and `## Proposal` section within the code fence.
- [x] In the template block, insert `## Out of Scope` immediately after the `## Goals` section (after its placeholder bullets, before `## Proposal`), with placeholder content for explicitly excluded capabilities.
- [x] Immediately after `## Out of Scope`, insert `## Personas` (still before `## Proposal`), with placeholder content for persona roles and benefits.
- [x] Verify the resulting section order in the template block is: Summary, Motivation / Problem Statement, Goals, Out of Scope, Personas, Proposal, Design Considerations, Decisions, Open Questions, Milestones.
- [ ] Task 5 (pending assignment by orchestrator)
- [ ] Task 6 (pending assignment by orchestrator)
- [ ] Task 7 (pending assignment by orchestrator)

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

Recommended implementation sequence:

- [x] **Slice 1** — Only slice. Insert Out of Scope and Personas sections into the Phase 3 RFC template.

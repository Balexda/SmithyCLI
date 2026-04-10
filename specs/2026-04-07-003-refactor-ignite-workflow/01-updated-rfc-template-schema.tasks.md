# Tasks: Updated RFC Template Schema

**Source**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.spec.md` — User Story 1
**Data Model**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.data-model.md`
**Contracts**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.contracts.md`
**Story Number**: 01

---

## Slice 1: Insert Out of Scope and Personas Sections into RFC Template

**Goal**: Update the Phase 3 RFC template in `smithy.ignite.prompt` to include `## Out of Scope` and `## Personas` sections in the correct positions, and add a regression test to guard the schema contract.

**Justification**: The template is the authoritative schema that sub-phases (Stories 2–4) and the Phase 0 audit (Story 9) depend on. This slice is self-contained — it adds the required slots to the template and verifies them with a test. No other story can produce these sections in the RFC until the template has the heading positions defined.

**Addresses**: FR-005, FR-006; Acceptance Scenarios 1.1, 1.2, 1.3

### Tasks

- [ ] Read `src/templates/agent-skills/commands/smithy.ignite.prompt` to locate the Phase 3 RFC template block (the fenced markdown block inside `## Phase 3: Draft RFC`)
- [ ] In the template block, insert `## Out of Scope` immediately after the `## Goals` section (after its placeholder bullets, before `## Proposal`), with this content:
  ```markdown
  ## Out of Scope

  - <Explicitly excluded capability 1>
  - <Explicitly excluded capability 2>
  ```
- [ ] Immediately after `## Out of Scope`, insert `## Personas` (still before `## Proposal`), with this content:
  ```markdown
  ## Personas

  - <Persona 1 — role and how they benefit from this RFC>
  - <Persona 2 — role and how they benefit>
  ```
- [ ] Verify the resulting section order in the template block is: Summary → Motivation / Problem Statement → Goals → **Out of Scope** → **Personas** → Proposal → Design Considerations → Decisions → Open Questions → Milestones
- [ ] Read `src/templates.test.ts` to find the `getComposedTemplates` describe block and the existing default ignite test case (around line 347)
- [ ] Add a new test case in the `getComposedTemplates` describe block:
  ```typescript
  it('ignite template includes Out of Scope and Personas sections', () => {
    const ignite = composed.commands.get('smithy.ignite.md')!;
    expect(ignite).toBeDefined();
    expect(ignite).toContain('## Out of Scope');
    expect(ignite).toContain('## Personas');
  });
  ```
- [ ] Run `npm test` and verify the new test passes and no existing tests regress

**PR Outcome**: The ignite RFC template contains mandatory `## Out of Scope` and `## Personas` slots in the correct positions (Out of Scope after Goals, Personas after Out of Scope, both before Proposal). A regression test enforces this schema contract going forward.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — The only slice. Template edit and regression test are a single atomic unit: the test validates the edit, so they ship together.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Shared Smithy-Prose Sub-Agent | depended upon by | smithy-prose dispatches use the new template section positions as their section assignment targets (3a → Summary/Motivation, 3b → Personas) |
| User Story 3: Smithy-Plan for Structured RFC Sections | depended upon by | smithy-plan dispatches for Goals+Out of Scope (3c) and Proposal+Design (3d) depend on the template having these slots |
| User Story 4: Piecewise RFC Generation | depended upon by | the orchestrator creates `<slug>.rfc.md` using this template structure as the section guide |
| User Story 9: Updated Phase 0 Audit Categories | depended upon by | the updated audit categories reference `## Out of Scope` and `## Personas` as named sections to check |

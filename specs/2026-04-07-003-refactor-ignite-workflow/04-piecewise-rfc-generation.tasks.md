# Tasks: Piecewise RFC Generation

**Source**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.spec.md` — User Story 4
**Data Model**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.data-model.md`
**Contracts**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.contracts.md`
**Story Number**: 04

---

## Slice 1: Piecewise RFC Pipeline — Full Phase 3 Orchestration + Phase 4 Update

**Goal**: Extend the `{{#ifAgent}}` block in `src/templates/agent-skills/commands/smithy.ignite.prompt` to implement the complete piecewise RFC pipeline: RFC folder/file creation with header-only content, sub-phases 3a (smithy-prose for Summary + Motivation), 3b (smithy-prose for Personas), 3e (inline Decisions + Open Questions synthesis), and 3g (inline Harmonize pass). Update Phase 4 so the agent path presents summary and asks for review without overwriting the file. Augment the existing claude-variant ignite test to verify all new sub-phase identifiers and smithy-prose dispatch.

**Justification**: All changes target the `{{#ifAgent}}` block in one prompt file plus one test file. Sub-phases 3c, 3d, and 3f (from Story 3) already anchor the block structure. This slice inserts the missing sub-phases before, between, and after them, and corrects Phase 4 so it does not overwrite the piecewise-built RFC. No intermediate state produces a coherent deliverable — the Phase 4 overwrite issue means Slice 1 and the Phase 4 fix must ship together to avoid a broken pipeline.

**Addresses**: FR-001, FR-002, FR-003, FR-004, FR-007a, FR-007b; Acceptance Scenarios US4-1, US4-2, US4-3, US4-4

### Tasks

- [ ] In `src/templates/agent-skills/commands/smithy.ignite.prompt`, read the current `{{#ifAgent}}` block in Phase 3 (the block that begins with the append-and-continue protocol note and contains sub-phases 3c, 3d, 3f). Insert an RFC creation step before any sub-phase block: instruct the orchestrator to create the RFC folder (`docs/rfcs/<YYYY>-<NNN>-<slug>/`) and the RFC file (`<slug>.rfc.md`) with only the RFC header — `# RFC: <Title>` followed by `**Created**: YYYY-MM-DD | **Status**: Draft` — and nothing else. No template skeleton; no empty section placeholders. Each sub-phase will append its own section headings and content. Place this creation step at the very top of the `{{#ifAgent}}` block, before any sub-phase.

- [ ] In the same `{{#ifAgent}}` block, generalize the append-and-continue protocol note from "each sub-phase's smithy-plan call returns" to "each sub-phase's sub-agent returns" (or equivalent phrasing that does not imply only smithy-plan). The updated note should still describe the append-before-continuing invariant. Place the updated note immediately after the RFC creation step, before sub-phase 3a.

- [ ] Insert sub-phase 3a in the `{{#ifAgent}}` block, after the updated protocol note and before the existing sub-phase 3c block. Sub-phase 3a must instruct the orchestrator to dispatch **smithy-prose** with: `section_assignment` of "Summary and Motivation / Problem Statement", `idea_description` from intake, `clarify_output` from Phase 2, and no `rfc_file_path` (this is the first sub-phase; the RFC file contains only the header). After smithy-prose returns, the orchestrator appends the returned content to `<slug>.rfc.md`.

- [ ] Insert sub-phase 3b in the `{{#ifAgent}}` block, after sub-phase 3a and before the existing sub-phase 3c block. Sub-phase 3b must instruct the orchestrator to dispatch **smithy-prose** with: `section_assignment` of "Personas", `idea_description` from intake, `clarify_output` from Phase 2, and `rfc_file_path` pointing to the accumulating `<slug>.rfc.md` (which at this point contains the header plus Summary and Motivation). After smithy-prose returns, the orchestrator appends the returned content to the RFC file.

- [ ] Insert sub-phase 3e in the `{{#ifAgent}}` block, between the existing sub-phase 3d block and the existing sub-phase 3f block. Sub-phase 3e is orchestrator-inline (no sub-agent dispatch). The instructions must tell the orchestrator to synthesize the Decisions and Open Questions sections directly from the clarification record (Phase 2 output) and the reconciled approach (Phase 1.5): items that were discussed and resolved belong in Decisions (each entry states what was decided and why); items that remain genuinely unresolved belong in Open Questions. The instructions should reference the existing "Decisions vs Open Questions" guidance already present below the `{{/ifAgent}}` boundary, then instruct the orchestrator to append both formatted sections to the RFC file.

- [ ] Insert sub-phase 3g in the `{{#ifAgent}}` block, after the existing sub-phase 3f block and before the `{{else}}` directive. Sub-phase 3g is orchestrator-inline (no sub-agent dispatch). The instructions must tell the orchestrator to: (1) read the complete `<slug>.rfc.md` from disk, (2) perform a coherence pass — smooth tone across sections written by different sub-agents, fix cross-references between sections, and verify that every expected template section is present and non-empty, (3) rewrite the file in place with the harmonized content. The orchestrator should confirm the harmonize step completed before proceeding to Phase 4.

- [ ] Update Phase 4 in `src/templates/agent-skills/commands/smithy.ignite.prompt` to handle the agent path separately from the non-agent path. Wrap steps 1–2 of Phase 4 (folder creation and RFC file write) in the non-agent branch of a new `{{#ifAgent}}` / `{{else}}` conditional: in the agent path (where Phase 3 already created the folder, wrote the file piecewise, and harmonized it in 3g), Phase 4 must skip folder creation and file write entirely — instead proceeding directly to: (a) present a summary of the harmonized RFC (title, milestone count and titles, key decisions), (b) point the user to the file on disk, and (c) ask for review. Steps 3–5 (summary, no-dump rule, ask for review, incorporate changes) apply to both paths. If the user requests changes in the agent path, the orchestrator updates the existing file in place rather than re-writing from scratch.

- [ ] In `src/templates.test.ts`, augment the existing `'ignite with claude variant renders competing plan dispatch'` test (around lines 356–369) to add the following assertions on the `ignite` claude-variant output: `expect(ignite).toContain('3a')`, `expect(ignite).toContain('3b')`, `expect(ignite).toContain('3e')`, `expect(ignite).toContain('3g')`, `expect(ignite).toContain('smithy-prose')`. Then add a corresponding assertion to verify the Phase 4 update: the claude-variant rendered text must NOT contain the literal phrase `'Write the RFC to'` (which is the step-2 unconditional file-write instruction that must now only appear in the non-agent `{{else}}` branch). Confirm the existing `'ignite default does not contain competing plan dispatch'` test continues to pass, and that the default variant does still contain `'Write the RFC to'` (non-agent path unchanged). Run `npm test` and confirm all assertions pass with no regressions.

**PR Outcome**: Merging this PR delivers a fully-specified piecewise RFC pipeline in `smithy.ignite`. The `{{#ifAgent}}` block for Phase 3 orchestrates all sub-phases 3a through 3g in order: RFC header creation, smithy-prose for narrative sections (3a/3b), smithy-plan for structured sections (3c/3d/3f), inline orchestrator for Decisions/Open Questions (3e), and a harmonize pass (3g). Phase 4 conditionally skips the file write in the agent path. The test suite verifies all sub-phase identifiers, smithy-prose dispatch, and the Phase 4 correctness.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — Only slice. All tasks within the slice are ordered sequentially: RFC creation and protocol note (tasks 1–2) must precede 3a (task 3), which must precede 3b (task 4); 3e (task 5) inserts between the already-present 3d and 3f; 3g (task 6) inserts after the already-present 3f; Phase 4 update (task 7) and tests (task 8) complete the PR.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Shared Smithy-Prose Sub-Agent | depends on | Sub-phases 3a and 3b dispatch smithy-prose. The agent file `src/templates/agent-skills/agents/smithy.prose.prompt` must exist with correct frontmatter before this story's prompt changes can reference it. Story 2 is complete. |
| User Story 3: Smithy-Plan for Structured RFC Sections | depends on | Sub-phases 3c, 3d, and 3f must already be present in the `{{#ifAgent}}` block so that 3a/3b can be inserted before 3c, 3e can be inserted between 3d and 3f, and 3g can be inserted after 3f. Story 3 is complete. |
| User Story 5: Mandatory Personas Section | depended upon by | Story 5 ensures the Personas section contains substantive content. Story 4's sub-phase 3b wires the pipeline to produce that section; Story 5 verifies it is always populated. |
| User Story 6: Mandatory Out of Scope Section | depended upon by | Story 6 ensures the Out of Scope section contains explicit content. Story 4's sub-phase 3c dispatch (from Story 3) produces that section; Story 6 verifies it is always populated. |

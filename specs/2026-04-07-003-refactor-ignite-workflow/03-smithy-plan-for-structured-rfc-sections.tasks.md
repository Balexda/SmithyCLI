# Tasks: Smithy-Plan for Structured RFC Sections

**Source**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.spec.md` — User Story 3
**Data Model**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.data-model.md`
**Contracts**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.contracts.md`
**Story Number**: 03

---

## Slice 1: Add smithy-plan Dispatch Instructions to Phase 3 (Agent-Mode Gated)

**Goal**: Phase 3 of `src/templates/agent-skills/commands/smithy.ignite.prompt` gains `{{#ifAgent}}`-gated sub-phase dispatch instructions for smithy-plan (sub-phases 3c, 3d, and 3f). Non-agent renders retain the existing monolithic drafting block in the `{{else}}` branch. The existing template code fence (the RFC section structure reference) remains as shared content. Template rendering tests are updated to verify both variants.

**Justification**: Story 3's entire behavioral surface lives in the ignite prompt's Phase 3 — there is no new agent file and no TypeScript change. The `{{#ifAgent}}` gating pattern is already established in Phase 1.5 of the same prompt, and is required to preserve the existing test that asserts the default render does not contain `smithy-plan`. All three sub-phase dispatch blocks (3c, 3d, 3f) follow the same pattern and belong in a single PR: they share the append-and-continue protocol, use the same smithy-plan interface, and are covered by the same test assertions. Story 4 builds on this by wiring the full pipeline (file creation, 3a/3b/3e/3g, sequential orchestration).

**Addresses**: FR-002, FR-003, FR-007a, FR-007b; Acceptance Scenarios US3-1, US3-2, US3-3, US3-4

### Tasks

- [x] In `src/templates/agent-skills/commands/smithy.ignite.prompt`, add a `{{#ifAgent}}` conditional block within Phase 3 that contains smithy-plan dispatch instructions for sub-phases 3c, 3d, and 3f. The block must follow the same `{{#ifAgent}}...{{else}}...{{/ifAgent}}` structure used in Phase 1.5 (the competing-plans block). Structure the gated block as follows:
  - **Protocol note** (at the top of the `{{#ifAgent}}` block): one paragraph stating the append-and-continue protocol — after each sub-phase's smithy-plan call returns, the orchestrator appends the returned content to `<slug>.rfc.md` before dispatching the next sub-phase. This note is the single authoritative statement of the protocol for all sub-phases and does not need to be repeated in each sub-phase block.
  - **Sub-phase 3c** (Goals + Out of Scope): Dispatch smithy-plan with `planning context` = "Draft the Goals and Out of Scope sections for this RFC"; `feature/problem description` = the user's idea description plus the full clarification output from Phase 2; `codebase file paths` = the path to the accumulating `<slug>.rfc.md` (which by this point contains Summary, Motivation, and Personas from earlier sub-phases); `additional planning directives` = constrain smithy-plan to produce only the Goals and Out of Scope sections in the RFC template format — not a full planning document. Append the returned content to the RFC file.
  - **Sub-phase 3d** (Proposal + Design Considerations): Dispatch smithy-plan with `planning context` = "Draft the Proposal and Design Considerations sections for this RFC"; `feature/problem description` = the user's idea description plus the clarification output and the reconciled approach from Phase 1.5; `codebase file paths` = the path to the accumulating `<slug>.rfc.md` (which by this point contains Summary through Out of Scope); `additional planning directives` = constrain smithy-plan to produce only the Proposal and Design Considerations sections — not a full planning document. Append the returned content to the RFC file.
  - **Sub-phase 3f** (Milestones): Dispatch smithy-plan with `planning context` = "Draft the Milestones section for this RFC, with per-milestone success criteria"; `feature/problem description` = the user's idea description plus the clarification output; `codebase file paths` = the path to the accumulating `<slug>.rfc.md` (containing all prior sections); `additional planning directives` = produce milestone decomposition only, with each milestone formatted as `### Milestone N: <Title>` followed by `**Description**` and `**Success Criteria**` bullets matching the RFC template. Append the returned content to the RFC file.
  - **`{{else}}` block**: Retain the existing monolithic Phase 3 inline drafting instruction ("Using the workshopped answers from Phase 2, draft a structured RFC with this format.") and the Important note about Decisions vs. Open Questions. The RFC template code fence (`# RFC: <Title>` through the final milestone block) stays **outside** both the `{{#ifAgent}}` and `{{else}}` blocks — it is shared reference content for both render modes.

- [ ] In `src/templates.test.ts`, augment the existing `'ignite with claude variant renders competing plan dispatch'` test to also assert that the claude-variant ignite prompt contains the sub-phase identifiers `'3c'`, `'3d'`, and `'3f'` — these identifiers are unique markers that the dispatch instructions rendered correctly and are not present in the RFC template code fence itself. Confirm the existing `'ignite default does not contain competing plan dispatch'` test continues to pass without modification: the `{{else}}` fallback must not contain `smithy-plan`. Run `npm test` and confirm all assertions pass with no regressions.

**PR Outcome**: Phase 3 of `smithy.ignite.prompt` contains `{{#ifAgent}}`-gated smithy-plan dispatch instructions for sub-phases 3c (Goals + Out of Scope), 3d (Proposal + Design Considerations), and 3f (Milestones), each specifying the correct context fields and the append-after-return protocol. Non-agent renders are unaffected. Template tests verify both variants. The dispatch instructions are present and inspectable in isolation — end-to-end pipeline sequencing (file creation, 3a/3b wiring, harmonize) is delivered by Story 4.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — Only slice. The prompt change and test augmentation are tightly coupled (the test verifies the rendering of the prompt change) and belong in a single PR. Covers Acceptance Scenarios US3-1, US3-2, US3-3, US3-4.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Shared Smithy-Prose Sub-Agent | depends on | smithy-prose (created by Story 2) handles sub-phases 3a and 3b. Story 3 does not wire 3a/3b — that is Story 4's job — but the full pipeline cannot execute until Story 2's agent exists. No PR-level dependency; this story is independently mergeable. |
| User Story 4: Piecewise RFC Generation | depended upon by | Story 4 wires the full sub-phase pipeline (file creation, sequential execution, sub-phases 3a/3b/3e/3g, harmonize). Story 3's dispatch instructions for 3c/3d/3f must be merged first so Story 4 has stable anchors to build around. |

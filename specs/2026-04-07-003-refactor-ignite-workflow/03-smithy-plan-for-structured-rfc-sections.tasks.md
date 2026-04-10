# Tasks: Smithy-Plan for Structured RFC Sections

**Source**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.spec.md` — User Story 3
**Data Model**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.data-model.md`
**Contracts**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.contracts.md`
**Story Number**: 03

---

## Slice 1: Sub-phase 3c Dispatch — Goals + Out of Scope

**Goal**: Add a `### Sub-phase 3c: Goals + Out of Scope` dispatch block to the `{{#ifAgent}}` section of `smithy.ignite.prompt`'s Phase 3, instructing the orchestrator to dispatch smithy-plan with the clarification output and accumulating RFC file path, then append the returned Goals and Out of Scope sections to the RFC file.

**Justification**: Sub-phase 3c is the first smithy-plan dispatch in the piecewise pipeline. It establishes the dispatch pattern — precondition check, assemble context, dispatch with output-format override, append result — that slices 2 and 3 extend. This block is independently reviewable as a complete, self-contained orchestrator instruction set.

**Addresses**: FR-007a, FR-007b, FR-003; Acceptance Scenario US3-1

### Tasks

- [ ] Read `src/templates/agent-skills/commands/smithy.ignite.prompt` lines ~150–265 to understand the current monolithic Phase 3 structure (the "Title conventions" block, the "Decisions vs Open Questions" note, and the fenced RFC template block).
- [ ] Read `src/templates/agent-skills/agents/smithy.plan.prompt` to confirm the four input parameters (planning context, feature/problem description, codebase file paths, additional planning directives) and understand that the output format can be overridden by the planning context parameter.
- [ ] Within the `{{#ifAgent}}` block in Phase 3 (insert after any existing Phase 3 preamble, before Phase 4), add a `### Sub-phase 3c: Goals + Out of Scope` section with the following orchestrator instructions:
  - **Precondition**: Read `<slug>.rfc.md` and verify it contains a `## Personas` heading (written by sub-phase 3b). If absent, halt and report that sub-phase 3b has not completed.
  - **Dispatch smithy-plan** with these parameters:
    - Planning context: "Draft the `## Goals` and `## Out of Scope` sections for this RFC. Return only those two sections as Markdown, not the standard Plan format with Approach/Decisions/Risks/Tradeoffs."
    - Feature/problem description: the clarification output from Phase 2.
    - Codebase file paths: path to the accumulating `<slug>.rfc.md`.
    - Additional planning directives: "Derive concrete, non-overlapping goals directly from the clarification Q&A. For `## Out of Scope`, list capabilities and concerns explicitly set aside during clarification. If nothing was explicitly excluded, write a single bullet: `- None identified at this time.`"
  - **Append**: After smithy-plan returns, append its output to `<slug>.rfc.md`. If the returned content is empty or an error, halt and report.
- [ ] Verify the Handlebars block opens and closes correctly (`{{#ifAgent}}` … `{{/ifAgent}}`) with no unclosed tags introduced by the new section.

**PR Outcome**: The ignite prompt, in agent mode, instructs the orchestrator to dispatch smithy-plan for Goals + Out of Scope (sub-phase 3c) with the clarification output and accumulating RFC path, validates the prior sub-phase completed, and appends the returned Markdown sections to the RFC file.

---

## Slice 2: Sub-phase 3d Dispatch — Proposal + Design Considerations

**Goal**: Add a `### Sub-phase 3d: Proposal + Design Considerations` dispatch block immediately after the sub-phase 3c block. This dispatch is distinguished by its requirement for the reconciled approach from Phase 1.5 as primary context (not just clarification output).

**Justification**: Sub-phase 3d has a distinct input signature from 3c — it draws on the reconciled approach rather than the clarification Q&A, and the sections it produces (Proposal, Design Considerations) require "WHAT not HOW" framing. Keeping this as a separate slice isolates the Proposal-specific dispatch context for independent review.

**Addresses**: FR-007a, FR-007b, FR-003; Acceptance Scenario US3-2

### Tasks

- [ ] In `src/templates/agent-skills/commands/smithy.ignite.prompt`, inside the `{{#ifAgent}}` Phase 3 block and after the sub-phase 3c section added in Slice 1, add a `### Sub-phase 3d: Proposal + Design Considerations` section with these orchestrator instructions:
  - **Precondition**: Read `<slug>.rfc.md` and verify it contains a `## Goals` heading (written by sub-phase 3c). If absent, halt and report.
  - **Dispatch smithy-plan** with these parameters:
    - Planning context: "Draft the `## Proposal` and `## Design Considerations` sections for this RFC. Return only those two sections as Markdown, not the standard Plan format with Approach/Decisions/Risks/Tradeoffs."
    - Feature/problem description: the reconciled approach from Phase 1.5. If no reconciled plan was produced (non-competing-plans mode), fall back to the idea description plus the clarification output.
    - Codebase file paths: path to the accumulating `<slug>.rfc.md`.
    - Additional planning directives: "Write `## Proposal` as high-level outcomes and capabilities (WHAT, not HOW). Write `## Design Considerations` to capture architectural tradeoffs and constraints that will influence downstream decisions — keep it at the WHAT-not-HOW level."
  - **Append**: After smithy-plan returns, append its output to `<slug>.rfc.md`. If the returned content is empty or an error, halt and report.
- [ ] Verify Handlebars syntax is intact — no unclosed blocks introduced by the new section.

**PR Outcome**: The ignite prompt instructs the orchestrator to dispatch smithy-plan for Proposal + Design Considerations (sub-phase 3d) with the reconciled approach as primary context, and appends the returned sections to the RFC file.

---

## Slice 3: Sub-phase 3f Dispatch — Milestones

**Goal**: Add a `### Sub-phase 3f: Milestones` dispatch block after the (future) sub-phase 3e inline section. This is the final smithy-plan dispatch; it receives the near-complete RFC and the reconciled approach to produce milestone decomposition with success criteria.

**Justification**: Sub-phase 3f uses the heaviest context (near-complete RFC + reconciled approach), produces the most structurally complex section (milestones with `### Milestone N: <Title>` sub-headings and `**Success Criteria**` blocks), and closes the smithy-plan dispatch series. Its standalone goal is complete milestone dispatch instructions.

**Addresses**: FR-007a, FR-007b, FR-003; Acceptance Scenarios US3-3, US3-4

### Tasks

- [ ] In `src/templates/agent-skills/commands/smithy.ignite.prompt`, inside the `{{#ifAgent}}` Phase 3 block and after the sub-phase 3e placeholder (or after 3d if 3e is not yet present — note in a comment that 3f follows 3e), add a `### Sub-phase 3f: Milestones` section with these orchestrator instructions:
  - **Precondition**: Check that `<slug>.rfc.md` contains `## Decisions` or `## Open Questions` (from sub-phase 3e). If absent, warn in the output ("Sub-phase 3e may not have run — proceeding with available RFC content") but do not halt, since 3e may be added separately (Story 4 scope).
  - **Dispatch smithy-plan** with these parameters:
    - Planning context: "Draft the `## Milestones` section for this RFC. Return only the Milestones section as Markdown with `### Milestone N: <Title>` headings, each containing `**Description**` and `**Success Criteria**` sub-sections. Not the standard Plan format."
    - Feature/problem description: the reconciled approach from Phase 1.5. This input is required for milestone decomposition — it provides the architectural approach that milestones must align to. If unavailable, use the Goals section from the RFC file as the primary decomposition guide.
    - Codebase file paths: path to the accumulating `<slug>.rfc.md` (which by this point contains all sections through Open Questions).
    - Additional planning directives: "Each milestone must have a distinct, bounded scope. Success criteria must be measurable outcomes, not process descriptions. Order milestones by dependency (what must be delivered before the next milestone can start), not by priority."
  - **Append**: After smithy-plan returns, append its output to `<slug>.rfc.md`. If the returned content is empty or an error, halt and report.
- [ ] Verify Handlebars syntax is intact across all three new sub-phase blocks (3c, 3d, 3f) — no unclosed tags.
- [ ] Read through the full Phase 3 `{{#ifAgent}}` block and confirm the sub-phase ordering matches the contracts' Sub-Phase to Section Mapping table: 3a (prose) → 3b (prose) → 3c → 3d → 3e (inline) → 3f → 3g (harmonize).

**PR Outcome**: The ignite prompt instructs the orchestrator to dispatch smithy-plan for Milestones (sub-phase 3f) using the near-complete RFC and reconciled approach as context, note the `reconciled_plan` as required input, and append the returned milestone structure to the RFC file.

---

## Slice 4: Template Composition Tests for Smithy-Plan Dispatches

**Goal**: Update `src/templates.test.ts` to assert that the three new smithy-plan dispatch blocks exist in the ignite template's agent-mode (claude) variant, and that the existing non-agent-mode invariant is preserved.

**Justification**: Tier 2 template composition tests are the automated safety net for these prompt-only changes. They validate structure and dispatch presence without requiring a live agent session. The test slice follows all content slices because it must verify the ordered presence of all three dispatch blocks together.

**Addresses**: FR-007a (structural verification); Acceptance Scenarios US3-1, US3-2, US3-3

### Tasks

- [ ] Read `src/templates.test.ts` lines ~330–390 to understand the existing ignite test group structure — specifically the claude-variant tests and the default-variant assertion at the line asserting `smithy-plan` is not present.
- [ ] Add three test cases within the ignite claude-variant test group:
  - `'ignite claude variant contains sub-phase 3c smithy-plan dispatch'` — `expect(igniteClaudeVariant).toContain('Sub-phase 3c')` and `toContain('smithy-plan')` and `toContain('Goals')` and `toContain('Out of Scope')`.
  - `'ignite claude variant contains sub-phase 3d smithy-plan dispatch'` — `expect(igniteClaudeVariant).toContain('Sub-phase 3d')` and `toContain('smithy-plan')` and `toContain('Proposal')` and `toContain('Design Considerations')`.
  - `'ignite claude variant contains sub-phase 3f smithy-plan dispatch'` — `expect(igniteClaudeVariant).toContain('Sub-phase 3f')` and `toContain('smithy-plan')` and `toContain('Milestones')` and `toContain('Success Criteria')`.
- [ ] Check the existing assertion that `smithy-plan` is NOT present in the default (non-claude) variant. Because sub-phase blocks are inside `{{#ifAgent}}`, they are not rendered in the default variant — this assertion should remain valid. If it fails, investigate whether the `{{#ifAgent}}` guard was omitted in one of the sub-phase blocks and fix the omission rather than removing the assertion.
- [ ] Run `npm test` and verify all tests pass.

**PR Outcome**: `npm test` passes with three new assertions confirming each sub-phase's smithy-plan dispatch block is present in the claude variant of the ignite template, and the default-variant invariant remains intact.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — Establishes the smithy-plan dispatch pattern (precondition check, dispatch, append) and is the only slice that can be reviewed without prior slices being present.
2. **Slice 2** — Extends the pattern with the distinct reconciled-plan input for sub-phase 3d. Requires Slice 1 to precede it in the file.
3. **Slice 3** — Final smithy-plan dispatch, requires Slices 1 and 2 present in the file so the sub-phase ordering can be verified end-to-end.
4. **Slice 4** — Tests depend on all three dispatch blocks existing in the template.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Updated RFC Template Schema | depends on | Sub-phase 3c's precondition checks for `## Personas` — a heading that only exists if Story 1's template additions are in place. Without Story 1, the precondition check will always fail. |
| User Story 2: Shared Smithy-Prose Sub-Agent | depends on | Sub-phase 3c reads the accumulating RFC expecting `## Summary`, `## Motivation`, and `## Personas` written by smithy-prose in sub-phases 3a–3b. Story 3's dispatch blocks assume Story 2 is complete. |
| User Story 4: Piecewise RFC Generation | depended upon by | Story 4's pipeline wiring (RFC file creation, sub-phase sequencing, append protocol, harmonize pass) references the sub-phase dispatch blocks defined in Story 3. Story 3 is a prerequisite for Story 4. |

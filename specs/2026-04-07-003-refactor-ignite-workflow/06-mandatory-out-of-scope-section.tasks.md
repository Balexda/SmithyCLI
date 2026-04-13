# Tasks: Mandatory Out of Scope Section

**Source**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.spec.md` — User Story 6
**Data Model**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.data-model.md`
**Contracts**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.contracts.md`
**Story Number**: 06

---

## Slice 1: Enforce Out of Scope in 3c Dispatch and 3g Harmonize Safety Net

**Goal**: The agent-mode ignite pipeline guarantees a non-empty `## Out of Scope` section in every generated RFC. Sub-phase 3c's dispatch directives explicitly require smithy-plan to always emit the section (with a placeholder fallback when no exclusions are identified), and sub-phase 3g's harmonize pass enforces a safety net that fills the placeholder if smithy-plan returned an empty section. Template tests verify both the strengthened directive and the safety-net language render in the agent-variant ignite prompt.

**Justification**: Stories 1, 3, and 4 already place the section in the template, dispatch smithy-plan for it, and wire the full pipeline — but none of them obligate the dispatch to always produce content, and the generic "verify every section is present and non-empty" line in 3g does not say what to do when verification fails. This slice closes both gaps in one PR: directive + safety net + verification test. All edits land in `src/templates/agent-skills/commands/smithy.ignite.prompt` and `src/templates.test.ts`. Splitting the directive from the safety net would ship a PR where 3c claims to mandate Out of Scope but 3g still has no fallback, leaving the user-visible guarantee broken between merges.

**Addresses**: FR-005 (Out of Scope template slot, end-to-end verification), FR-007a (smithy-plan dispatch for structured sections); Acceptance Scenarios US6-1, US6-2, US6-3, US6-4; Success Criteria SC-001, SC-003

### Tasks

- [x] **Mandate non-empty Out of Scope in sub-phase 3c directive**

  Strengthen the `Additional planning directives` field in sub-phase 3c (Goals + Out of Scope) inside the `{{#ifAgent}}` block of `src/templates/agent-skills/commands/smithy.ignite.prompt`. The directive must require smithy-plan to always emit a `## Out of Scope` section in its returned content — pulling exclusions from the clarification record when present, and using an explicit placeholder ("None identified at this time" or equivalent) when no exclusions were identified. References AS US6-2, US6-3, US6-4.

  _Acceptance criteria:_
  - Sub-phase 3c directive explicitly names `## Out of Scope` as a required section in the returned content
  - Directive instructs smithy-plan to source exclusions from the clarification output when present (AS US6-3)
  - Directive defines the empty-case placeholder phrasing the sub-agent must emit (AS US6-4)
  - The existing constraint that smithy-plan produces only the Goals + Out of Scope sections (not a full planning document) is preserved
  - The Goals half of the dispatch directive remains unchanged in scope

- [ ] **Add Out of Scope safety net to sub-phase 3g harmonize pass**

  In the same prompt file, extend sub-phase 3g (Harmonize) so the orchestrator's coherence pass includes an explicit Out of Scope check: if the section is missing or contains no substantive content after all sub-phases have run, the orchestrator inserts the placeholder text in place rather than leaving the section blank or absent. References AS US6-1, US6-4.

  _Acceptance criteria:_
  - Sub-phase 3g instructions explicitly enumerate Out of Scope as a section the harmonize pass must verify (AS US6-1)
  - Instructions describe the in-place placeholder fill when the section is absent or empty (AS US6-4)
  - Safety-net language does not contradict 3c's directive — both point at the same placeholder phrasing
  - Existing 3g responsibilities (tone smoothing, cross-reference fixing, generic completeness verification, in-place rewrite) remain intact

- [ ] **Assert ignite agent variant enforces Out of Scope mandate**

  In `src/templates.test.ts`, extend the existing `'ignite with claude variant renders competing plan dispatch'` test (the agent-variant rendering test that already covers Phase 3 sub-phases) to verify the strengthened 3c directive and the 3g safety net both render in the composed claude-variant ignite prompt. The new assertions must target distinctive phrases from the strengthened wording rather than substrings that could match the unrelated RFC template code fence.

  _Acceptance criteria:_
  - Claude-variant ignite output contains a phrase identifying Out of Scope as a required output of sub-phase 3c
  - Claude-variant ignite output contains the placeholder phrasing introduced in tasks 1 and 2
  - Claude-variant ignite output contains a phrase identifying the 3g safety-net check for Out of Scope
  - Existing assertions in the same test (sub-phase identifiers, smithy-prose dispatch, Phase 4 agent-path correctness) continue to pass
  - The `'ignite default does not contain competing plan dispatch'` test continues to pass — strengthened directive lives only inside the `{{#ifAgent}}` block, not the `{{else}}` branch
  - The `'ignite RFC template contains Out of Scope and Personas sections in correct order'` test continues to pass unchanged
  - `npm test` succeeds with no regressions

**PR Outcome**: Merging this PR makes the Out of Scope section a hard guarantee of every RFC produced by `smithy.ignite` in agent mode. Sub-phase 3c instructs smithy-plan to always emit the section with a placeholder fallback; sub-phase 3g enforces the same guarantee as a safety net during harmonize; template tests verify both layers render in the composed prompt. Issue #50 is resolved end-to-end and Success Criterion SC-003 is observable in any new RFC.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

| ID | Title                                                                   | Depends On | Artifact |
|----|-------------------------------------------------------------------------|------------|----------|
| S1 | Enforce Out of Scope in 3c Dispatch and 3g Harmonize Safety Net        | —          | —        |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Updated RFC Template Schema | depends on | Story 1 inserted the `## Out of Scope` slot in the RFC template reference. Story 6 enforces that the slot is always populated. Story 1 is complete. |
| User Story 3: Smithy-Plan for Structured RFC Sections | depends on | Story 3 added the sub-phase 3c smithy-plan dispatch block that Story 6 strengthens. The dispatch block must already exist in the `{{#ifAgent}}` branch before Story 6's directive edit can land. Story 3 is complete. |
| User Story 4: Piecewise RFC Generation | depends on | Story 4 wired the full pipeline including the 3g harmonize step that Story 6's safety net extends. Story 4 is complete. |
| User Story 5: Mandatory Personas Section | — | Story 5 is the parallel verification story for Personas (sub-phase 3b). It edits the same prompt file but a different sub-phase block, so the two stories can ship independently with no merge dependency. |

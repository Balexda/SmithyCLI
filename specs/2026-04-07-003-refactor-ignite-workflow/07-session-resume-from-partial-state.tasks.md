# Tasks: Session Resume from Partial State

**Source**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.spec.md` — User Story 7
**Data Model**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.data-model.md`
**Contracts**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.contracts.md`
**Story Number**: 07

---

## Slice 1: Phase 0 Partial-RFC Detection and Resume Branch

**Goal**: The agent-mode ignite pipeline classifies any existing `<slug>.rfc.md` it encounters, branches between audit/resume/fresh based on which template sections are already present, and — when resuming — hands off to Phase 3 at the first missing sub-phase so that no completed work is redone. All edits land in `src/templates/agent-skills/commands/smithy.ignite.prompt` and `src/templates.test.ts`.

**Justification**: The template-schema story (US1), the piecewise pipeline (US4), and the two narrative stories (US5, US6) already guarantee that every RFC is built sub-phase by sub-phase and written directly to disk. That naturally leaves a partial file on disk whenever a session is interrupted — but today Phase 0 only knows how to run the review loop on a complete RFC, and the mid-intake redirect only offers "review or create new". This slice teaches Phase 0 to detect partial state and route accordingly in a single cohesive prompt edit. Splitting detection from the resume handoff would ship an intermediate state where Phase 0 correctly classifies a partial RFC but has nowhere to send it, which is worse than the status quo.

**Addresses**: FR-008; Acceptance Scenarios US7-1, US7-2, US7-3; Edge Cases "Partial RFC from a different idea" and "Session crash during harmonization (3g)"; Success Criterion SC-005

### Tasks

- [x] **Add Phase 0 state-detection step and section-to-sub-phase map**

  Rename the existing `## Phase 0: Review Loop` heading in the `{{#ifAgent}}` branch of `src/templates/agent-skills/commands/smithy.ignite.prompt` to `## Phase 0: State Detection and Review Loop`, and insert a new initial sub-step before the current `Phase 0a–0b` audit block. The new sub-step must instruct the orchestrator to read the RFC file, enumerate its `##` headings, and classify the file as `fresh` (header only), `partial` (some but not all mandatory template sections), or `complete` (all mandatory sections present) using an explicit section-to-sub-phase mapping covering Summary/Motivation → 3a, Personas → 3b, Goals/Out of Scope → 3c, Proposal/Design Considerations → 3d, Decisions/Open Questions → 3e, Milestones → 3f.

  _Acceptance criteria:_
  - Phase 0 heading reflects both detection and review responsibilities
  - Detection step names the three states (`fresh`, `partial`, `complete`) using those exact words
  - Section-to-sub-phase map enumerates every sub-phase 3a–3f introduced by US4
  - Mapping uses the same section titles as the RFC template code fence already in the prompt
  - Detection step instructs the orchestrator to report which sections are present to the user (AS US7-1)
  - Existing `Phase 0a–0b` audit block and `Phase 0c` apply-refinements block remain intact below the new detection step

- [x] **Branch Phase 0 on detected state**

  Immediately after the detection step introduced in task 1, add a branch block that routes the orchestrator based on the classification: `complete` → continue into the existing audit/review loop; `partial` → compute the first missing sub-phase from the section map, inform the user which sections are present and which sub-phase will run next, confirm resume with the user, and hand off to Phase 3 starting at that sub-phase; `fresh` → skip the review loop and hand off to Phase 3 at sub-phase 3a with the existing header-only file left in place. Add an explicit note covering the "partial RFC from a different idea" edge case: before resuming, the orchestrator must verify that the existing Summary/Motivation is contextually related to the current idea and, if not, warn the user and offer to overwrite, create a new RFC, or proceed anyway. Add a second note covering the "session crash during harmonization" edge case: if the file is classified `complete` but the detection step sees inconsistent or duplicated headings, enter the review loop so smithy-refine can repair it. References AS US7-1, US7-2, and the two edge cases from the spec.

  _Acceptance criteria:_
  - Branch names all three states and routes each to a distinct next step
  - Partial branch defines "first missing sub-phase" in terms of the section-to-sub-phase map from task 1
  - Partial branch requires user confirmation before resume (AS US7-1)
  - Partial branch instructs the orchestrator not to re-run completed sub-phases (AS US7-2)
  - Fresh branch preserves the existing header-only file rather than recreating it
  - Contextual-mismatch warning offers overwrite / new RFC / proceed as explicit options
  - Harmonize-crash note routes inconsistent "complete" files into the existing review loop
  - Existing review-loop behavior for genuinely complete RFCs is unchanged

- [x] **Teach Phase 3 to honor the resume hand-off**

  In the same prompt file, extend the preamble of the Phase 3 `{{#ifAgent}}` block (the append-and-continue protocol note added by US4) with an explicit resume note: when Phase 0 hands off with a specific starting sub-phase, the orchestrator must skip all earlier sub-phases, leave the accumulating `<slug>.rfc.md` untouched on entry, and begin dispatching from the designated sub-phase. Clarify that each sub-phase's existing `rfc_file_path` context already gives the dispatched sub-agent access to every previously written section via disk read, so no additional context bridging is required. Do not modify the per-sub-phase dispatch blocks themselves. References AS US7-2.

  _Acceptance criteria:_
  - Resume note is placed alongside the append-and-continue protocol, not inside any individual sub-phase block
  - Note explicitly states completed sub-phases are skipped (AS US7-2)
  - Note affirms prior sections flow through the existing `rfc_file_path` parameter already passed to sub-agents
  - RFC file creation step still runs only in the fresh-pipeline case, not on resume
  - Sub-phases 3a–3g keep their current dispatch directives from US3 and US4 unchanged

- [x] **Handle the no-RFC-file case in Routing**

  Update the `## Routing` section of the prompt so it cleanly covers the US7-3 case where no RFC file exists. The routing must still send explicit `.rfc.md` inputs into Phase 0 (which now classifies state itself) and still send description/PRD inputs into Phase 1. Also update the mid-intake redirect inside Phase 1 so that, when it finds a close-matching `docs/rfcs/` folder, it hands control to Phase 0 rather than asking the user to choose "review or create new" inline — Phase 0's state detection is now the single place that handles that decision. The option to create a new RFC instead of touching the existing one must still be available to the user from within Phase 0. References AS US7-3 and the existing mid-intake redirect behavior the spec preserves.

  _Acceptance criteria:_
  - Routing explicitly notes that description-only input with no matching folder proceeds to Phase 1 as normal (AS US7-3)
  - Mid-intake redirect delegates the review-vs-resume-vs-new decision to Phase 0
  - "Create new RFC instead" remains reachable from Phase 0's partial/complete branches
  - Routing does not duplicate the section-to-sub-phase map (that lives only in Phase 0)
  - Phase 1 intake for genuinely new ideas is otherwise unchanged

- [x] **Assert ignite agent variant renders state detection and resume branch**

  In `src/templates.test.ts`, extend the existing `'ignite with claude variant renders competing plan dispatch'` test to verify the new Phase 0 detection step, the three-way branch, and the Phase 3 resume note all render in the composed claude-variant ignite prompt. Target distinctive phrases from the new wording rather than substrings that could collide with the RFC template code fence or the existing audit table. Confirm the default (non-agent) variant remains free of the detection step so the new logic is scoped to the agent path.

  _Acceptance criteria:_
  - Claude-variant ignite output contains the renamed Phase 0 heading covering both detection and review
  - Claude-variant ignite output contains all three state labels (`fresh`, `partial`, `complete`) introduced in task 1
  - Claude-variant ignite output contains a phrase wiring the partial branch to the first missing sub-phase
  - Claude-variant ignite output contains the resume note added to the Phase 3 preamble in task 3
  - `'ignite default does not contain competing plan dispatch'` test continues to pass — the new detection step lives only inside `{{#ifAgent}}`
  - Existing US4/US5/US6 assertions on sub-phase identifiers, smithy-prose dispatch, Phase 4 agent-path correctness, and Out of Scope / Personas enforcement continue to pass
  - `npm test` succeeds with no regressions

**PR Outcome**: Merging this PR makes `smithy.ignite` resumable across interrupted sessions. Phase 0 now classifies every RFC it encounters, routes complete files into the existing review loop, resumes partial files from the first missing sub-phase without redoing prior work, and treats header-only files as fresh drafts. Contextual-mismatch and harmonize-crash edge cases are handled explicitly. Template tests verify the detection and resume branch render in the composed agent-variant prompt. Success Criterion SC-005 is observable: a session interrupted mid-pipeline can be restarted and will resume at the first missing section.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

| ID | Title                                                  | Depends On | Artifact |
|----|--------------------------------------------------------|------------|----------|
| S1 | Phase 0 Partial-RFC Detection and Resume Branch        | —          | —        |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Updated RFC Template Schema | depends on | The section-to-sub-phase map added in task 1 uses the same section titles Story 1 introduced into the RFC template (Out of Scope, Personas). Story 1 is complete. |
| User Story 4: Piecewise RFC Generation | depends on | Phase 0 can only route to a specific sub-phase because Story 4 split Phase 3 into sub-phases 3a–3g and wired the append-and-continue protocol. The Phase 3 preamble that task 3 extends was added by Story 4. Story 4 is complete. |
| User Story 8: Cross-Session Question Deduplication | — | Story 8 adds `.clarify-log.md` read/write around Phase 2. It edits a different phase of the same prompt file, so the two stories can ship independently with no merge dependency. |
| User Story 9: Updated Phase 0 Audit Categories | — | Story 9 updated the audit-category table inside the existing Phase 0a–0b review loop. Story 7 leaves that block intact and only prepends a detection step, so the two stories do not conflict. Story 9 is complete. |

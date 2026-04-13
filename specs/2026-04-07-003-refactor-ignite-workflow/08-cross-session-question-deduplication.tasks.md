# Tasks: Cross-Session Question Deduplication

**Source**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.spec.md` — User Story 8
**Data Model**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.data-model.md`
**Contracts**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.contracts.md`
**Story Number**: 08

---

## Slice 1: Wire `.clarify-log.md` Read and Write Around Phase 2

**Goal**: Extend Phase 2 of `src/templates/agent-skills/commands/smithy.ignite.prompt` so the orchestrator (a) reads any existing `.clarify-log.md` from the derived RFC folder before dispatching smithy-clarify and passes the last two sessions as additional context with a no-re-ask instruction, and (b) appends a new dated session entry containing the returned assumptions and Q&A to `.clarify-log.md` after smithy-clarify completes, creating the RFC folder first if it does not yet exist. Augment the existing claude-variant ignite template test to assert the new read and write instructions render.

**Justification**: Both prompt edits target the same Phase 2 region of the same file and are tightly coupled — without the write step the read step never has a log to consume, and without the read step the write step is dormant. Shipping them together keeps the cross-session deduplication feature coherent in a single PR.

**Addresses**: FR-009, FR-010; Acceptance Scenarios US8-1, US8-2, US8-3

### Tasks

- [ ] **Add clarify-log read step at the start of Phase 2**

  In `src/templates/agent-skills/commands/smithy.ignite.prompt`, insert a step at the top of Phase 2 (before the existing "Use the **smithy-clarify** sub-agent" instruction) that tells the orchestrator to look for an existing `.clarify-log.md` in the RFC folder derived in Phase 1, and if present, extract the last two `### Session YYYY-MM-DD` entries and pass them to smithy-clarify as additional context per the Clarify Log Contract Read Protocol in the contracts file.

  _Acceptance criteria:_
  - Step references the RFC folder path derived in Phase 1 (no hard-coded path)
  - Step instructs the orchestrator to skip the read silently when no `.clarify-log.md` exists, satisfying AS 8.3
  - Step instructs the orchestrator to extract only the last two sessions (per the Read Protocol), not the full history
  - Step instructs the orchestrator to include the dedup instruction quoted in the Read Protocol ("Do not re-ask questions already answered in this log.") when passing the log content to smithy-clarify, satisfying AS 8.2
  - Step is positioned so that smithy-clarify still receives all existing Phase 2 inputs (criteria, context, special instructions) unchanged

- [ ] **Add clarify-log write step after Phase 2 completes**

  In the same prompt file, append a step at the end of Phase 2 (after smithy-clarify returns its summary, before Phase 1.5 / Phase 3 begins) that tells the orchestrator to format the returned assumptions and Q&A as a new `### Session YYYY-MM-DD` entry per the Clarify Log Contract Write Format and append it to `.clarify-log.md` in the RFC folder. The step must ensure the RFC folder exists (creating it if needed) so the write succeeds even on the first session before sub-phase 3a runs, satisfying AS 8.1.

  _Acceptance criteria:_
  - Step references the Write Format defined in the contracts file rather than restating it
  - Step instructs the orchestrator to create the RFC folder if it does not already exist before writing
  - Step instructs the orchestrator to append (not overwrite) so prior sessions are preserved per the data model's append-only validation rule
  - Step uses the current date for the session heading
  - Step pulls assumptions and Q&A from the smithy-clarify return summary (not from a separate source)
  - Step is positioned after the Phase 2 dispatch instructions and before any Phase 1.5 or Phase 3 content

- [ ] **Assert clarify-log read and write instructions render in the claude variant**

  In `src/templates.test.ts`, augment the existing `'ignite with claude variant renders competing plan dispatch'` test to add assertions that the rendered claude-variant ignite template contains identifiable markers for both the new clarify-log read step and the new clarify-log write step. Use stable phrase fragments (e.g., `.clarify-log.md`, plus a phrase distinguishing the read step from the write step) rather than exact long sentences that will drift. Confirm the existing assertions in the same test continue to pass.

  _Acceptance criteria:_
  - Test asserts the rendered template contains `.clarify-log.md` at least twice (once for read, once for write)
  - Test asserts a phrase that uniquely identifies the read step (e.g., language about not re-asking answered questions)
  - Test asserts a phrase that uniquely identifies the write step (e.g., language about appending a new session)
  - Existing `'ignite default does not contain competing plan dispatch'` test continues to pass unchanged
  - `npm test` passes with no regressions

**PR Outcome**: Merging this PR makes `smithy.ignite` deduplicate clarification questions across sessions on the same RFC folder. The first run writes assumptions and Q&A to `.clarify-log.md`; subsequent runs read the log, pass the last two sessions to smithy-clarify with a no-re-ask instruction, and append a new session entry of their own. Template tests verify the new instructions render in the claude variant.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

| ID | Title                                              | Depends On | Artifact |
|----|----------------------------------------------------|------------|----------|
| S1 | Wire `.clarify-log.md` Read and Write Around Phase 2 | —          | —        |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 4: Piecewise RFC Generation | depends on | US4 establishes the agent-path Phase 3 that creates the RFC folder in sub-phase 3a. This story moves folder creation earlier (or duplicates it conditionally) so that Phase 2 can write `.clarify-log.md` before sub-phase 3a runs. US4 must be in place so the `{{#ifAgent}}` block structure exists for the new Phase 2 instructions to slot into cleanly. |

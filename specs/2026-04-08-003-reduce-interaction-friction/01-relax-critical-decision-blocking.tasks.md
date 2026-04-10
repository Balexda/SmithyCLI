# Tasks: Relax Critical Decision Blocking

**Source**: `specs/2026-04-08-003-reduce-interaction-friction/reduce-interaction-friction.spec.md` — User Story 1
**Data Model**: `specs/2026-04-08-003-reduce-interaction-friction/reduce-interaction-friction.data-model.md`
**Contracts**: `specs/2026-04-08-003-reduce-interaction-friction/reduce-interaction-friction.contracts.md`
**Story Number**: 01

---

## Slice 1: Update Triage Rules and Critical Assumption Annotation

**Goal**: Modify smithy-clarify's triage logic so Critical+High-confidence
candidates become assumptions with a `[Critical Assumption]` annotation instead
of mandatory questions.

**Justification**: This slice delivers the core behavioral change — after
merging, any planning command that invokes smithy-clarify will stop blocking on
Critical+High items. The triage rule, annotation format, impact guideline, edge
case safety, and verification are all in one file
(`src/templates/agent-skills/agents/smithy.clarify.prompt`),
making this an atomic, testable unit.

**Addresses**: FR-001, FR-002 (partial — annotation in clarify output);
Acceptance Scenarios 1.1 (Critical+High → assumption), 1.2 (all High →
all assumptions), 1.3 (Critical+Low → stays in Questions)

### Tasks

All line references below are in
`src/templates/agent-skills/agents/smithy.clarify.prompt`.

- [x] Update the Critical row in the Impact guidelines table (Step 2, line 68)
  to remove "Must be confirmed with the user." Replace with: "Getting this wrong
  would invalidate the artifact or cause significant rework. When confidence is
  High, proceed as a `[Critical Assumption]`."
- [x] Rewrite the Assumptions criteria in Step 3 (lines 88–93). Change from
  `Impact is **not Critical**, AND Confidence is **High**` to
  `Confidence is **High**` (any Impact level). Add: "If Impact is **Critical**
  and Confidence is **High**, the item becomes an assumption with a
  `[Critical Assumption]` annotation."
- [x] Update the Questions criteria in Step 3 (lines 98–104). Change "All
  Critical-impact items — regardless of confidence" to "Critical-impact items
  where Confidence is **not High**" (Critical+Medium and Critical+Low still
  become questions). Adjust the fill-up-to-5 rule accordingly.
- [x] Update the edge case rule in Step 3 (lines 109–111). Change "convert the
  single highest-impact assumption back into a question" to "convert the single
  lowest-impact non-Critical assumption back into a question." This prevents
  FR-001 from being undermined when the fallback triggers.
- [x] Update the assumption rendering format in Step 4 (lines 117–122). Add
  the `[Critical Assumption]` annotation to the example block:
  `> - _Assumption text_ [Critical Assumption] [Impact: Critical · Confidence: High]`
- [x] Update the return summary in the Rules section (lines 160–165) to note
  that the assumptions list includes `[Critical Assumption]` annotations for
  Critical-impact items promoted to assumptions.
- [x] Update the frontmatter description (line 3) from "triages findings into
  assumptions and questions" to "triages findings into assumptions (including
  Critical Assumptions) and questions."
- [x] Add a Tier 2 test assertion in `src/templates.test.ts` (after line 236)
  that validates the composed `smithy.clarify.md` template contains
  `[Critical Assumption]`. This catches accidental regression if the annotation
  text is removed during future edits.

**PR Outcome**: smithy-clarify allows Critical+High-confidence items through as
assumptions with `[Critical Assumption]` annotation. All other triage rules
remain unchanged. The Questions category is preserved for non-High-confidence
items.

---

## Slice 2: Annotation Visibility in Parent Command Artifacts

**Goal**: Transition mark's Clarifications section template toward its one-shot
format — assumptions as primary content with `[Critical Assumption]` annotations
visible — and clean up stale interactive-mode instructions in parent commands.

**Justification**: The entire pipeline is going one-shot (Story 3). In that
world there are no interactive Q&A pairs — the Clarifications section contains
only assumptions and debt (with debt potentially triggering bail-out). Story 1
starts this transition: the `Q: → A:` format in mark's Clarifications template
(lines 192–197) is a dead end. This slice replaces it with assumption-first
rendering, completing FR-002's requirement that `[Critical Assumption]` be
visible in the artifact. It also removes stale instructions that reference
interactive clarification behavior.

**Addresses**: FR-002 (completeness — annotation in artifact Clarifications
section); Acceptance Scenario 1.4 (user can challenge via Clarifications section)

### Tasks

- [x] Replace the Clarifications section template in `src/templates/agent-skills/commands/smithy.mark.prompt`
  (lines 192–197). The current `Q: <question> → A: <answer>` format assumes
  interactive Q&A which is being eliminated across the board. Replace with an
  assumptions-first format:
  ```
  ## Clarifications

  ### Session YYYY-MM-DD

  - _Assumption text_ `[Critical Assumption]`
  - _Assumption text_
  ```
  This positions the Clarifications section for the one-shot world where
  assumptions (and later, debt summaries from Story 2) are the primary content.
- [x] Update the stale instruction in `src/templates/agent-skills/commands/smithy.mark.prompt` (line 498). Change
  "DO internally generate all clarifying questions first, then present them
  one at a time with recommended answers" to "DO invoke smithy-clarify for
  ambiguity scanning and triage." The parent command delegates clarification
  entirely to the sub-agent; interactive question presentation is eliminated.
- [x] Update the identical stale instruction in `src/templates/agent-skills/commands/smithy.cut.prompt` (line 295).
  Apply the same change as above.
- [x] Add an A-series agent test case in `tests/Agent.tests.md` (after the last
  existing test) that exercises Critical+High triage behavior:
  - **Steps**: Invoke clarify with a feature description that produces a
    Critical+High candidate (e.g., "Add payment processing" which has Critical
    impact on data handling).
  - **Expected**: The Critical+High item appears in the assumptions list with
    `[Critical Assumption]` annotation, not as an interactive question.

**PR Outcome**: Mark's Clarifications template uses assumption-first format
(anticipating one-shot), `[Critical Assumption]` annotations are visible in
artifacts. Stale interactive instructions in mark and cut are removed. Agent
test case validates end-to-end triage behavior.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — Core triage logic must exist before parent commands can render
   the annotation. This is the foundational behavioral change.
2. **Slice 2** — Depends on Slice 1's annotation format being defined. Ensures
   annotation visibility in downstream artifacts and provides verification.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Track Specification Debt | depended upon by | Story 1's acceptance scenarios 1.1 and 1.3 reference "debt items" as the disposition for non-High-confidence candidates. In Story 1, these items remain in the existing Questions category. When Story 2 lands, Questions becomes Debt — Story 1's triage changes are forward-compatible with this replacement. |
| User Story 3: One-Shot Planning Workflows | depended upon by | Story 3 removes the Questions category entirely (FR-012) and makes clarify non-interactive. Story 1 preserves Questions in the triage but begins the transition in artifact templates: Slice 2 replaces mark's Q&A-based Clarifications format with assumption-first rendering, anticipating the one-shot world where Q&A pairs do not exist. Story 3 will also remove the edge case rule (lines 109-111) that Story 1 modifies defensively. |

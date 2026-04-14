# Tasks: One-Shot Planning Workflows

**Source**: `specs/2026-04-08-003-reduce-interaction-friction/reduce-interaction-friction.spec.md` — User Story 3
**Data Model**: `specs/2026-04-08-003-reduce-interaction-friction/reduce-interaction-friction.data-model.md`
**Contracts**: `specs/2026-04-08-003-reduce-interaction-friction/reduce-interaction-friction.contracts.md`
**Story Number**: 03

---

## Slice 1: Shared One-Shot Output Snippet

**Goal**: Create the shared `one-shot-output` snippet that defines the
standardized terminal output format (summary → assumptions → specification
debt → PR link) so every planning command can render the same contract.

**Justification**: The snippet is the foundation FR-016 requires: a single
source of truth for one-shot output. Landing it first as a standalone,
composable Handlebars partial means every subsequent slice can reference it
via `{{>one-shot-output}}` without duplicating format language. Nothing else
depends on snippet rendering, so this PR delivers visible content (the snippet
+ its test coverage) on its own.

**Addresses**: FR-016; Acceptance Scenario 3.6

### Tasks

- [x] **Create the `one-shot-output` snippet file**

  Add `src/templates/agent-skills/snippets/one-shot-output.md` containing the
  Markdown block defined in the contracts (`## Summary`, `## Assumptions`,
  `## Specification Debt`, `## PR`). Mirror the exact section order from the
  contracts file and include placeholder guidance so planning commands can
  copy values into each section.

  _Acceptance criteria:_
  - Snippet file exists at the expected snippets path
  - Contains the four sections in the contracts-defined order
  - Includes a PR-creation-failure fallback note (contracts Error Conditions)
  - Includes a bail-out fallback note (contracts Error Conditions)
  - File has no YAML frontmatter (snippets are raw Markdown per snippets README)

- [x] **Register the snippet in the snippets README table**

  Add a row to `src/templates/agent-skills/snippets/README.md` documenting
  the new snippet and listing the consumers the remaining slices will wire it
  into.

  _Acceptance criteria:_
  - Row added with snippet name, purpose, and planned consumers
  - Alphabetical or logical placement within the existing table
  - No deployment metadata changes (snippet is not deployed standalone)

- [x] **Assert the snippet composes into every planning command**

  Add Tier 2 assertions in `src/templates.test.ts` that verify the snippet
  is resolvable and that it will be referenced from each planning command
  once subsequent slices land. For this slice, at minimum assert that the
  composed snippet content is available via the template composition
  machinery and that the snippet itself contains the section headers
  required by the contracts.

  _Acceptance criteria:_
  - Test imports the composed snippet content
  - Test verifies the four required section headers are present
  - Test fails if the snippet file is deleted or renamed

**PR Outcome**: A shared one-shot-output snippet exists on disk with a
registered partial name and test coverage, ready to be included by each
planning command in subsequent slices.

---

## Slice 2: Non-Interactive Clarify and Refine Sub-Agents

**Goal**: Remove the user-interaction STOP gates from both `smithy-clarify`
and `smithy-refine` so they return structured results directly, matching the
non-interactive contracts defined in `reduce-interaction-friction.contracts.md`.

**Justification**: Clarify and refine are the only sub-agents that currently
block planning commands on user input. Converting them to non-interactive is
independent of the command-level changes — parent commands continue to work
after this slice lands because they already consume `assumptions` and
`debt_items` from clarify's return. Bundling clarify and refine together
keeps the "sub-agent interaction removal" change atomic.

**Addresses**: FR-012, FR-013; Acceptance Scenarios 3.3, 3.4

### Tasks

- [x] **Remove the clarify assumption-presentation STOP gate**

  Delete Step 4 (Present Assumptions) from
  `src/templates/agent-skills/agents/smithy.clarify.prompt` and remove the
  "you own the user interaction" rule in the Rules section. Clarify must run
  Steps 1–3 and return the structured summary directly, matching the
  `ClarifyResult` contract. Keep Steps 1–3 (scan, candidates, triage) and
  the bail-out assessment unchanged.

  _Acceptance criteria:_
  - Step 4 section is removed entirely
  - No "STOP" or "wait for the user" language remains in the clarify prompt
  - Rules section no longer asserts that clarify owns user interaction
  - Return-contract description in Rules still lists `assumptions`,
    `debt_items`, `bail_out`, `bail_out_summary` per the contracts file
  - Frontmatter description updated to reflect non-interactive behavior

- [x] **Convert refine to apply refinements directly or record as debt**

  In `src/templates/agent-skills/agents/smithy.refine.prompt`, remove the
  audit-scan STOP (end of Step 1) and the per-question STOP (Step 3).
  Replace Step 3 with instructions to apply high-confidence refinements
  inline and route low-confidence findings into `debt_items`. Update the
  return contract to match the `RefineResult` shape in the contracts file
  (`refinements`, `debt_items`, `summary`).

  _Acceptance criteria:_
  - No "STOP" or "wait for the user" language remains in the refine prompt
  - Step 2 still produces structured findings but is no longer gated on user
    responses
  - Step 3 describes direct application of high-confidence refinements
  - Rules section reflects the non-interactive contract and the
    `RefineResult` return shape
  - Frontmatter description updated to reflect non-interactive behavior

- [x] **Add Tier 2 assertions covering the non-interactive contracts**

  Extend `src/templates.test.ts` with assertions that the composed
  `smithy.clarify.md` and `smithy.refine.md` templates no longer contain
  STOP-gate language and that each includes the return-contract fields
  required by `reduce-interaction-friction.contracts.md`.

  _Acceptance criteria:_
  - Assertion that clarify template has no "STOP and wait" language
  - Assertion that refine template has no "STOP and wait" language
  - Assertion that clarify return contract mentions `assumptions`, `debt_items`,
    `bail_out`, `bail_out_summary`
  - Assertion that refine return contract mentions `refinements`, `debt_items`,
    `summary`

**PR Outcome**: `smithy-clarify` and `smithy-refine` both run end-to-end
without stopping for user input. Parent planning commands continue to work
because they already consume the structured summaries returned by each
sub-agent.

---

## Slice 3: Mark and Cut One-Shot Conversion

**Goal**: Convert `smithy.mark` and `smithy.cut` to one-shot execution:
remove every intermediate STOP gate, add PR creation after artifact
generation, and render the shared one-shot output snippet as the terminal
contract.

**Justification**: Mark and cut form the primary `spec → tasks` pipeline and
are the first end-to-end validation of the one-shot contract. Bundling them
ensures an integration test: a developer can take a feature description
through mark and then cut, with both commands producing PRs and rendering
the same one-shot output. Depends on Slices 1 and 2 for the snippet and
non-interactive sub-agents.

**Addresses**: FR-011, FR-016; Acceptance Scenario 3.1

### Tasks

- [ ] **Remove mark's intermediate STOP gates and add PR creation**

  In `src/templates/agent-skills/commands/smithy.mark.prompt`, delete the
  Phase 6 "Review & approve" STOP and the Phase 0c refinement STOP. After
  artifact write-out in Phase 6, add a PR-creation step modeled on forge's
  `gh pr create` pattern, then render the one-shot output snippet as the
  terminal contract.

  _Acceptance criteria:_
  - No Phase 6 STOP asking the user to review and approve
  - No Phase 0c STOP asking the user to review refinements
  - Phase 6 (or its successor section) instructs the agent to create a PR
    for the spec artifacts using the existing forge PR-creation pattern
  - `{{>one-shot-output}}` partial is referenced so terminal output follows
    FR-016 format
  - Phase 0 review loop ends by committing refinements, creating a PR, and
    rendering one-shot output

- [ ] **Remove cut's intermediate STOP gates and add PR creation**

  In `src/templates/agent-skills/commands/smithy.cut.prompt`, delete the
  Phase 5 "Review tasks" STOP and the Phase 0c refinement STOP. Add a PR
  creation step after writing the tasks file and after the spec
  write-back, and render the one-shot output snippet.

  _Acceptance criteria:_
  - No Phase 5 STOP asking the user to review and approve the tasks file
  - No Phase 0c STOP after applying refinements
  - Phase 5 instructs the agent to create a PR for the tasks artifact and
    spec write-back via the existing forge PR-creation pattern
  - `{{>one-shot-output}}` partial is referenced so terminal output follows
    FR-016 format
  - Existing bail-out behavior from Story 2 is preserved (clarify bail-out
    still short-circuits before PR creation)

- [ ] **Assert mark and cut render the one-shot output contract**

  Add Tier 2 assertions in `src/templates.test.ts` verifying that the
  composed `smithy.mark.md` and `smithy.cut.md` templates contain the
  resolved one-shot output sections and that they no longer carry the
  STOP-gate language removed above.

  _Acceptance criteria:_
  - Assertion that mark template includes all four one-shot output headers
  - Assertion that cut template includes all four one-shot output headers
  - Assertion that neither template contains "STOP and ask" language
  - Assertion that both templates reference PR creation after artifact write

**PR Outcome**: Mark and cut run prompt → artifact → PR with no intermediate
STOPs. The terminal output follows the shared one-shot format. Developers
can test the full `feature description → spec → tasks → PRs` pipeline end
to end after this slice merges.

---

## Slice 4: Strike One-Shot Conversion with Phase 3 Skip

**Goal**: Convert `smithy.strike` to one-shot execution by removing Phase 3
(Refine iteration), removing the Phase 5 approval STOP, and adding PR
creation for the strike document artifact.

**Justification**: Strike's structural differences from the other planning
commands — a dedicated Refine phase and a forge handoff at the end — mean
its conversion is not mechanical. FR-014 explicitly requires Phase 3 to be
skipped. Isolating strike into its own slice makes the Phase-3 removal
atomic and auditable, and keeps the diff reviewable. Depends on Slices 1
and 2.

**Addresses**: FR-011, FR-014, FR-016; Acceptance Scenario 3.2

### Tasks

- [x] **Remove strike's Phase 3 Refine iteration**

  In `src/templates/agent-skills/commands/smithy.strike.prompt`, delete
  Phase 3 (Refine) in its entirety. Phase 2's reconciled plan and clarify
  output become the implicitly-approved input to Phase 4 (Strike Document).
  Update the flow comments so the transition from Phase 2 to Phase 4 is
  explicit.

  _Acceptance criteria:_
  - Phase 3 section is removed entirely
  - Phase 2 narrative explains that its output flows directly into Phase 4
  - No "keep iterating until the user gives explicit approval" language
    remains in the strike prompt
  - Subsequent phase numbering or references are updated for consistency

- [x] **Remove strike's Phase 5 STOP and add one-shot PR creation**

  Replace the Phase 5 "Ready to forge, or want to refine the plan?" STOP
  with a non-interactive sequence: write the strike document, create a PR
  for the strike document using the forge `gh pr create` pattern, render
  the one-shot output snippet, and point the user at the next command
  (`smithy.forge`) without blocking on approval.

  _Acceptance criteria:_
  - No Phase 5 STOP asking for forge/refine approval
  - Phase 5 instructs the agent to create a PR for the strike document
  - `{{>one-shot-output}}` partial is referenced in Phase 5
  - The "forge handoff" is reduced to a suggestion in the terminal output,
    not an interactive branching gate

- [x] **Assert strike runs one-shot with no Refine phase**

  Add Tier 2 assertions in `src/templates.test.ts` verifying that the
  composed `smithy.strike.md` template has no Phase 3 Refine section, no
  STOP-gate language, references PR creation, and renders the one-shot
  output headers.

  _Acceptance criteria:_
  - Assertion that strike template has no `## Phase 3` Refine heading
  - Assertion that strike template contains no "STOP and ask" language
  - Assertion that strike template references PR creation
  - Assertion that strike template includes all four one-shot output
    headers

**PR Outcome**: Strike runs from feature description to strike-document PR
with no intermediate stops, skipping Phase 3 as required by FR-014. Terminal
output matches the shared one-shot format.

---

## Slice 5: Ignite and Render One-Shot Conversion

**Goal**: Convert `smithy.ignite` and `smithy.render` to one-shot execution:
remove their STOP gates (including render's Phase 1 target-confirmation
gate), add PR creation, and render the shared one-shot output snippet.

**Justification**: Ignite and render complete the set of five planning
commands required by FR-011 and SC-001. Their changes are structurally
similar to mark and cut but in a different part of the pipeline
(RFC → feature map), so bundling them keeps the final PR focused on the
`idea → RFC → feature map` chain. Depends on Slices 1 and 2. After this
slice merges, SC-001 is satisfied.

**Addresses**: FR-011, FR-016; Acceptance Scenario 3.1 (completing all 5
commands), SC-001

### Tasks

- [ ] **Remove ignite's Phase 4 STOPs and add PR creation**

  In `src/templates/agent-skills/commands/smithy.ignite.prompt`, delete
  both Phase 4 "Review RFC" STOPs (agent and non-agent branches). After
  writing the RFC file, add PR creation using the forge `gh pr create`
  pattern and render the one-shot output snippet. Preserve Phase 0 Review
  Loop structure but remove any STOP gates within it.

  _Acceptance criteria:_
  - No "STOP and ask" language in ignite's Phase 4 (either branch)
  - Phase 4 instructs the agent to create a PR for the RFC artifact
  - `{{>one-shot-output}}` partial is referenced in Phase 4
  - Phase 0 Review Loop ends non-interactively and creates a PR with the
    refinement diff

- [ ] **Remove render's STOP gates and add PR creation**

  In `src/templates/agent-skills/commands/smithy.render.prompt`, delete the
  Phase 0c refinement STOP, the Phase 1 target-confirmation STOP, and the
  Phase 4 review STOP. After writing the feature map, add PR creation and
  render the one-shot output snippet.

  _Acceptance criteria:_
  - No "STOP and wait" language remains in render's Phase 1
  - No "STOP and ask" language remains in Phase 0c or Phase 4
  - Phase 4 instructs the agent to create a PR for the feature map artifact
  - `{{>one-shot-output}}` partial is referenced in Phase 4
  - Phase 0 Review Loop ends non-interactively and creates a PR with the
    refinement diff

- [ ] **Assert ignite and render render the one-shot output contract**

  Add Tier 2 assertions in `src/templates.test.ts` verifying that the
  composed `smithy.ignite.md` and `smithy.render.md` templates contain the
  resolved one-shot output sections, reference PR creation, and no longer
  carry STOP-gate language. Extend the cross-command coverage so a
  regression reintroducing a STOP in any of the five planning commands
  fails the test suite.

  _Acceptance criteria:_
  - Assertion that ignite template contains all four one-shot output headers
  - Assertion that render template contains all four one-shot output headers
  - Assertion that neither template contains "STOP and ask" or
    "STOP and wait" language
  - Assertion that both templates reference PR creation after artifact write
  - A shared assertion iterates over all five planning-command templates and
    fails if any contains STOP-gate language

**PR Outcome**: Ignite and render run one-shot from prompt to PR. All five
planning commands (strike, ignite, mark, render, cut) execute with no
intermediate STOP gates, satisfying FR-011 and SC-001. Regression coverage
locks in the invariant across all planning commands.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | PR creation mechanism for planning commands reuses forge's `gh pr create` pattern, but planning artifacts live on feature-spec branches, not forge slice branches. The exact branch lifecycle (whether mark/cut/render reuse the spec folder branch, create a dedicated planning branch, or push to the current branch) is not pinned down here. Slice 3 should land with whatever is simplest, but later drift could surface if multiple planning commands share a branch. | Integration | High | Medium | open | — |
| SD-002 | Strike's forge handoff becomes a terminal-output suggestion rather than an interactive branch (Slice 4). If existing users rely on the "do it → forge runs automatically" flow, the split into a separate `smithy.forge` invocation may feel like a regression. No fallback is planned. | Interaction & UX | Medium | Medium | open | — |
| SD-003 | Refine's non-interactive "apply directly or record as debt" model (Slice 2) assumes refine can confidently distinguish high-confidence from low-confidence findings. The contracts define the RefineResult shape but do not specify the confidence calibration. The implementation will need to lean on the same Impact × Confidence heuristics as clarify, which may or may not generalize cleanly to the audit-style findings refine produces. | Domain & Data Model | Medium | Medium | open | — |
| SD-004 | One-shot output rendering for the Phase 0 review loops (mark, cut, ignite, render) reuses the same snippet as the first-pass flow, but Phase 0 operates on an existing artifact — "Artifacts produced" and "User stories count" become less meaningful. The snippet does not currently distinguish first-pass from refinement output, so Phase 0 PRs will show the same headers with potentially misleading values. | Interaction & UX | Medium | Medium | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Shared One-Shot Output Snippet | — | — |
| S2 | Non-Interactive Clarify and Refine Sub-Agents | — | — |
| S3 | Mark and Cut One-Shot Conversion | S1, S2 | — |
| S4 | Strike One-Shot Conversion with Phase 3 Skip | S1, S2 | — |
| S5 | Ignite and Render One-Shot Conversion | S1, S2 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Relax Critical Decision Blocking | depends on | US1's triage rules (Critical+High → `[Critical Assumption]`) are the foundation for clarify's non-interactive return. Story 3 removes the Step 4 STOP from clarify; the triage logic itself is already in place. |
| User Story 2: Track Specification Debt | depends on | US2 added the two-category triage (assumptions + debt) and the `## Specification Debt` sections across all planning artifacts. Story 3 assumes those sections exist and are populated from clarify's return, and assumes the bail-out check already short-circuits before artifact write-out. |
| User Story 4: Unified Review Pattern | depended upon by | Story 4 introduces `smithy-plan-review` and renames `smithy-review` to `smithy-implementation-review`. Story 4 will wire plan-review into the same planning commands Story 3 converts to one-shot. No changes in Story 3 should preempt the review-agent invocation points — leave the artifact-write → PR-create sequence as the natural insertion point for Story 4. |

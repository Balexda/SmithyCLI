# Tasks: Unified Review Pattern

**Source**: `specs/2026-04-08-003-reduce-interaction-friction/reduce-interaction-friction.spec.md` — User Story 4
**Data Model**: `specs/2026-04-08-003-reduce-interaction-friction/reduce-interaction-friction.data-model.md`
**Contracts**: `specs/2026-04-08-003-reduce-interaction-friction/reduce-interaction-friction.contracts.md`
**Story Number**: 04

---

## Slice 1: Shared Review Finding Protocol Snippet

**Goal**: Replace the current `review-protocol.md` snippet with a
read-only, findings-based protocol that both review sub-agents can
compose. The snippet documents the shared `Finding` structure from
the contracts (category/severity/confidence/description/artifact_path/proposed_fix),
the severity × confidence triage table, and the "parent command
applies fixes" invariant.

**Justification**: Both review agents (plan and implementation) must
return findings in the same structure per FR-017 and FR-021. Landing
the shared snippet first unblocks the two agent slices that follow
and gives the composition tests a stable target to assert against.
The snippet is a reusable Handlebars partial, so it delivers
standalone value — even before the agents consume it, the template
composition tests can verify its content.

**Addresses**: FR-017, FR-021; Acceptance Scenario 4.7

### Tasks

- [x] **Rewrite `review-protocol.md` as a read-only findings protocol**

  Replace the current auto-fix-oriented content in
  `src/templates/agent-skills/snippets/review-protocol.md` with a
  shared protocol describing: the gather-context step, the
  identification step, the shared `Finding` structure from the
  contracts, the severity × confidence triage table from the
  contracts, and the invariant that review agents are read-only.
  Do not include per-agent category lists — each agent prompt
  supplies its own.

  _Acceptance criteria:_
  - Snippet documents the shared Finding fields from the contracts
  - Snippet includes the contracts' severity × confidence triage table
  - Snippet states review agents do not modify files or code
  - Snippet is usable as a partial from both review agent prompts
  - No references to auto-fixing, committing, or Edit/Write tools

- [x] **Update the snippets README entry for `review-protocol`**

  Update the row for `review-protocol.md` in
  `src/templates/agent-skills/snippets/README.md` so its consumer
  column lists both `smithy.plan-review` and
  `smithy.implementation-review` and its purpose reflects the shared
  read-only findings pattern.

  _Acceptance criteria:_
  - Consumer column lists both review agents
  - Purpose column describes read-only findings protocol
  - No other snippet rows are touched

- [x] **Assert the rewritten snippet content in template tests**

  Add Tier 2 assertions in `src/templates.test.ts` that verify the
  rewritten snippet composes correctly and exposes the sections the
  review agents depend on.

  _Acceptance criteria:_
  - Test imports the composed snippet content
  - Test asserts presence of the shared Finding structure section
  - Test asserts presence of the severity × confidence triage table
  - Test asserts the snippet no longer contains auto-fix language
  - Test fails if the snippet file is deleted or renamed

**PR Outcome**: The shared review-protocol snippet is rewritten to a
read-only findings contract with test coverage, ready to be composed
into both review agent prompts by the next two slices.

---

## Slice 2: `smithy-plan-review` Sub-Agent

**Goal**: Create the new `smithy-plan-review` sub-agent that
performs automated self-consistency review of planning artifacts and
returns structured findings matching the shared `Finding` structure.
Register it in the agents index and deploy it alongside the other
read-only sub-agents.

**Justification**: US4 requires a new sub-agent that does not exist
yet. Landing it as its own PR lets it be tested in isolation against
the shared snippet (from Slice 1) before any planning command is
wired to invoke it. Once this slice merges, `smithy-plan-review` is
dispatchable but unused — safe for parallel review.

**Addresses**: FR-017, FR-018, FR-019, FR-022; Acceptance Scenarios
4.1, 4.3, 4.4, 4.5

### Tasks

- [x] **Create `smithy.plan-review.prompt`**

  Add `src/templates/agent-skills/agents/smithy.plan-review.prompt`
  with frontmatter (`name: smithy-plan-review`, description, and
  read-only tools list matching `smithy-refine`) and a body that
  composes the shared `review-protocol` snippet, documents the
  plan-review categories from the contracts (Internal contradiction,
  Logical gap, Assumption-output drift, Debt completeness, Brittle
  reference), and specifies the `ReviewResult` return contract.

  _Acceptance criteria:_
  - File exists with valid Dotprompt YAML frontmatter
  - Frontmatter `name` matches `smithy-plan-review`
  - Tool list is read-only (no Edit, Write, or Bash)
  - Body composes the shared `review-protocol` partial
  - Body documents the five plan-review categories from contracts
  - Body describes the `ReviewResult` return shape from contracts
  - Body states the agent does not modify artifacts directly

- [x] **Register the new agent in the templates index**

  Add `smithy.plan-review.md` to the expected agents list in
  `src/templates.test.ts` and document the agent in
  `src/templates/agent-skills/agents/README.md`. Also add the agent
  to the Sub-Agents section of the root `CLAUDE.md` so the
  contributor reference matches reality.

  _Acceptance criteria:_
  - Composed templates test includes `smithy.plan-review.md`
  - Agents README has a row for the new agent
  - CLAUDE.md Sub-Agents list mentions `smithy-plan-review`
  - Gemini deployment test still excludes non-deployed agents

- [x] **Assert `smithy-plan-review` composition and tool restrictions**

  Add Tier 2 assertions in `src/templates.test.ts` mirroring the
  existing `smithy.plan.prompt` checks: verify frontmatter is
  retained, the `name` is correct, the tool list does not contain
  `Edit` or `Write`, and the composed body includes the shared
  review-protocol content from Slice 1.

  _Acceptance criteria:_
  - Test finds the composed agent file
  - Test asserts frontmatter `name: smithy-plan-review`
  - Test asserts tool list excludes Edit and Write
  - Test asserts the composed body contains the shared finding
    structure section from the review-protocol snippet
  - Test fails if the agent file is deleted or renamed

**PR Outcome**: `smithy-plan-review` exists as a read-only sub-agent
with frontmatter, the shared review-protocol composition, and test
coverage. It is deployable but not yet invoked — the planning-command
wiring lands in Slice 4.

---

## Slice 3: Rename and Refactor `smithy-review` to `smithy-implementation-review`

**Goal**: Rename the existing `smithy.review.prompt` to
`smithy.implementation-review.prompt`, refactor it to use read-only
tools, and update forge to apply the findings the renamed agent
returns. Forge owns all file edits and commits; the review agent
returns only findings.

**Justification**: FR-020 requires both the rename and the refactor
from auto-fixing to returning findings. Keeping them in a single
slice keeps forge working at every commit — if the rename landed
without the forge update, forge would still dispatch `smithy-review`
and expect auto-fix commits that no longer happen. The migration is
atomic for the entire review pipeline.

**Addresses**: FR-017, FR-020, FR-021; Acceptance Scenario 4.6

### Tasks

- [x] **Rename and refactor the implementation-review prompt**

  Rename `src/templates/agent-skills/agents/smithy.review.prompt` to
  `smithy.implementation-review.prompt`. Update its frontmatter
  (`name`, description, and tools list) to match the read-only
  pattern used by `smithy-refine`. Rewrite the body so it composes
  the shared `review-protocol` snippet, documents the
  implementation-review categories from the contracts (Missing tests,
  Broken contracts, Security issues, Error handling gaps, Naming
  inconsistencies, Scope creep), and describes the `ReviewResult`
  return shape. Remove the "Handling Auto-Fixes" section entirely.

  _Acceptance criteria:_
  - Old filename no longer exists; new filename exists
  - Frontmatter `name` matches `smithy-implementation-review`
  - Tool list is read-only (no Edit, Write, or Bash)
  - Body composes the shared `review-protocol` partial
  - Body documents the six implementation-review categories
  - Body describes the `ReviewResult` return shape from contracts
  - No auto-fix or commit instructions remain in the body

- [x] **Update forge to apply findings from the renamed review agent**

  Update `src/templates/agent-skills/commands/smithy.forge.prompt`
  to dispatch `smithy-implementation-review` (not `smithy-review`)
  and to process the returned findings per the contracts' triage
  table: apply High-confidence proposed fixes on disk, commit them
  as `review: <description>`, record Low-confidence Important
  findings as specification debt, note Minor findings in the PR
  body, and flag Low-confidence Critical findings to the user. Keep
  forge's existing error-handling STOP gates unchanged (FR-015).

  _Acceptance criteria:_
  - Forge references `smithy-implementation-review` (agent mode)
  - Forge references the new `Finding` structure from contracts
  - Forge applies proposed fixes before committing (not the review agent)
  - Forge commits review-applied fixes with the `review:` prefix
  - Forge covers every row of the contracts triage table, including
    the Low-confidence Important → specification debt path
  - Forge retains the existing test-failure and blocked-task STOP gates
  - Default (non-agent) forge branch still composes the inline
    review-protocol content for the direct-agent case

- [x] **Update template tests, READMEs, and CLAUDE.md references**

  Update `src/templates.test.ts` so the agents list contains
  `smithy.implementation-review.md` instead of `smithy.review.md`,
  update the frontmatter assertion for the renamed agent, update
  forge's agent-mode assertion to expect
  `smithy-implementation-review`, and adjust the
  `src/agents/gemini.test.ts` exclusion check to reference the new
  name. Also update `src/templates/agent-skills/README.md`, the
  `agents/README.md` index, `smithy.maid.prompt`'s "that is
  smithy-review's job" reference, and the root `CLAUDE.md`
  Sub-Agents list so all text references match the new name.

  _Acceptance criteria:_
  - Templates test expects `smithy.implementation-review.md` and
    not `smithy.review.md`
  - Renamed-agent frontmatter assertion uses read-only tool list
  - Forge agent-mode assertion expects `smithy-implementation-review`
  - Gemini test reflects the new excluded agent name
  - All README references use the new agent name
  - `smithy.maid.prompt` comment references the new agent name
  - CLAUDE.md Sub-Agents list entry uses the new name

**PR Outcome**: The existing review agent is renamed, refactored to
read-only, and forge now owns all file edits and commits. Both
review agents share the same read-only return-findings contract, and
the entire test suite and documentation references the new name.

---

## Slice 4: Wire `smithy-plan-review` Into Planning Commands

**Goal**: Invoke `smithy-plan-review` from all five planning commands
(strike, ignite, mark, render, cut) after artifact generation but
before PR creation, and process the returned findings (apply
High-confidence fixes on disk, record Low-confidence findings as
specification debt) so the plan-review loop is active end-to-end.

**Justification**: This is the integration slice that closes the
user story — without it, `smithy-plan-review` exists but is never
called. Landing it last means every previous slice is already
testable in isolation and the wiring can be reviewed across all five
commands in a single PR that only touches the command prompts and
their tests.

**Addresses**: FR-017, FR-021, FR-022; Acceptance Scenarios 4.1,
4.2, 4.3, 4.4

### Tasks

- [ ] **Add a plan-review phase to each planning command**

  Update each of the five planning-command prompts
  (`smithy.strike.prompt`, `smithy.ignite.prompt`,
  `smithy.mark.prompt`, `smithy.render.prompt`,
  `smithy.cut.prompt`) to invoke `smithy-plan-review` after artifact
  writing and before PR creation, and to process the returned
  findings. High-confidence findings are applied on disk by the
  parent command; Low-confidence findings are appended to the
  artifact's `## Specification Debt` section (continuing SD-NNN
  numbering from whatever the command already wrote). The invocation
  block and findings-processing description are consistent across
  all five commands.

  _Acceptance criteria:_
  - Each planning-command prompt dispatches `smithy-plan-review`
    with the artifact paths and artifact type from the contracts
  - Invocation is positioned after artifact write and before PR
    create in every command
  - Each command describes applying High-confidence `proposed_fix`
    values to disk itself (satisfies AS 4.1, 4.2)
  - Each command describes appending Low-confidence findings to the
    `## Specification Debt` section (satisfies AS 4.3)
  - Each command describes flagging drift findings per AS 4.4
  - None of the five commands invoke the review agent to edit files

- [ ] **Assert plan-review wiring in template tests**

  Extend `src/templates.test.ts` with assertions that each of the
  five planning commands dispatches `smithy-plan-review` and that
  the dispatch appears before the command's PR-creation step.

  _Acceptance criteria:_
  - Assertion for each planning command: composed body references
    `smithy-plan-review`
  - Assertion that the reference appears before the PR-create step
    in each composed command body
  - Assertion that no planning command grants the review agent
    write tools
  - Tests fail if a future change removes plan-review dispatch from
    any of the five planning commands

**PR Outcome**: All five planning commands invoke
`smithy-plan-review` as the last step before PR creation, apply
High-confidence proposed fixes on disk, and record Low-confidence
findings as specification debt. US4 is fully delivered: both review
agents follow the same read-only pattern, `smithy-plan-review`
catches planning-artifact inconsistencies end-to-end, and parent
commands own all artifact edits.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | The contracts define a shared `Finding` structure but do not specify a machine-readable schema — each review agent emits findings in prose per the shared snippet. Whether the parent commands parse a canonical Markdown block or rely on the sub-agent returning structured text is deferred to implementation. | Domain & Data Model | Medium | Medium | open | — |
| SD-002 | SC-005 requires `smithy-plan-review` to catch ≥80% of intentionally introduced inconsistencies, but no test fixtures exist yet to measure that threshold. Slice 2 lands the agent itself but not the measurement harness — the eval-framework work to exercise plan-review against seeded inconsistencies is out of scope for this tasks file. | Non-Functional Quality | Medium | Low | open | — |
| SD-003 | Forge's existing error-handling gates (test failure, blocked task, complex-fix escalation) are preserved in Slice 3, but the exact behavior when an applied High-confidence fix causes a test regression is not pinned down. Historically `smithy-review` reverted and reclassified as Low confidence; the new return-findings model needs an equivalent rule. Implementation should mirror the old protocol unless a better pattern emerges. | Edge Cases | Medium | Medium | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Shared Review Finding Protocol Snippet | — | — |
| S2 | `smithy-plan-review` Sub-Agent | S1 | — |
| S3 | Rename and Refactor `smithy-review` to `smithy-implementation-review` | S1 | — |
| S4 | Wire `smithy-plan-review` Into Planning Commands | S2 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Relax Critical Decision Blocking | depends on | US1's triage model (High confidence → apply, non-High → debt) is the pattern plan-review findings follow when the parent command processes them. Story 4 reuses the same severity × confidence triage rules for review findings per the contracts. |
| User Story 2: Track Specification Debt | depends on | US2 introduced the `## Specification Debt` section in every planning artifact and the SD-NNN numbering convention. Story 4 appends Low-confidence plan-review findings to that section, so the section must already exist and be writable by parent commands before Slice 4 can wire plan-review. |
| User Story 3: One-Shot Planning Workflows | depends on | US3 converted all five planning commands to one-shot execution with an artifact-write → PR-create sequence. Story 4's Slice 4 inserts `smithy-plan-review` between those two steps, which requires US3's one-shot structure to be in place. If Story 4 lands before Story 3, Slice 4's wiring cannot find a stable insertion point. |

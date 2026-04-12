# Feature Specification: Reduce Interaction Friction

**Spec Folder**: `2026-04-08-003-reduce-interaction-friction`
**Branch**: `claude/fix-smithy-mark-117-VJPpC`
**Created**: 2026-04-08
**Status**: Draft
**Input**: GitHub issue #117 — Reduce interaction friction across Smithy planning workflows by relaxing decision blocking, introducing specification debt, enabling one-shot execution, and adding automated plan review.

## Clarifications

### Session 2026-04-08

- Q: Should command-level artifact review gates be kept or removed? → A: Remove all gates from planning commands. Write artifacts to disk, create PR, output summary + PR link. No intermediate stops.
- Q: Should forge/fix be included in one-shot scope? → A: No. Forge and fix are excluded — their stops are error-handling gates for blocked tasks and test failures, not friction gates.
- Q: What should the debt circuit breaker threshold be? → A: Scope-based, not count-based. Measure how much of the planning artifact would be hollowed out by debt. If key entities are undefined or core stories can't be specified, bail out with a debt summary and prompt for expanded information.
- Q: What does the user see as terminal output in one-shot mode? → A: Summary of what was produced, then assumptions, then debt summary, then PR link. Create a snippet defining the output format. Full clarification log stays in the artifact on disk.
- Q: Should clarify/refine support both interactive and one-shot modes? → A: No. Clarify and refine are only used by planning commands. Since all planning commands become one-shot, clarify and refine simply become non-interactive — no mode flag, no dual behavior.
- Q: Does strike skip Phase 3 (Refine) in one-shot? → A: Yes. Phase 2 output is treated as implicitly approved; proceed directly to writing the strike document.
- Q: How does debt flow across pipeline stages? → A: Downstream commands (e.g., cut consuming mark output) inherit debt as warnings in their own `## Specification Debt` section, flagged as "inherited from spec." Downstream commands also generate their own new debt items from new ambiguities.
- Q: What should the new self-consistency review agent be named? → A: `smithy-plan-review` — parallels `smithy-review` (potentially renamed `smithy-code-review`). Both are review steps and the naming should make that immediately obvious.

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

## User Scenarios & Testing

### User Story 1: Relax Critical Decision Blocking (Priority: P1)

As a developer using Smithy planning workflows, I want Critical+High-confidence
clarification items to be treated as assumptions rather than mandatory questions,
so that I am not interrupted by decisions the agent is already confident about.

**Why this priority**: This is the smallest, most contained change and directly
addresses the core friction complaint. It is also a prerequisite for one-shot
mode — if Critical items always block, one-shot can never fully proceed.

**Independent Test**: Run smithy-clarify with a feature description that
produces a mix of Critical and non-Critical candidates at varying confidence
levels. Verify that Critical+High items appear as `[Critical Assumption]` in
the assumptions list, not as interactive questions.

**Acceptance Scenarios**:

1. **Given** a feature with 3 clarify candidates (1 Critical+High, 1 High+High,
   1 Medium+Low), **When** clarify runs its triage, **Then** the Critical+High
   item appears in the assumptions list with a `[Critical Assumption]`
   annotation, the High+High item appears as a regular assumption, and the
   Medium+Low item becomes a debt item.

2. **Given** all clarify candidates are High confidence including Critical items,
   **When** triage completes, **Then** all items become assumptions (with
   Critical ones annotated) and zero debt items are produced.

3. **Given** a single Critical+Low-confidence candidate, **When** clarify runs,
   **Then** it becomes a debt item (not an assumption) because confidence is Low.

4. **Given** a Critical+High item is promoted to assumption, **When** the
   assumption turns out to be wrong during downstream review, **Then** the user
   can challenge it via the artifact's Clarifications section and trigger a
   targeted revision.

---

### User Story 2: Track Specification Debt (Priority: P1)

As a developer reviewing Smithy planning artifacts, I want unresolved
ambiguities formally recorded as specification debt in the artifact, so that I
can see what gaps exist, assess their scope, and address them in future passes.

**Why this priority**: Debt tracking is foundational for one-shot mode — without
it, unresolved items are silently dropped. Debt replaces the interactive
questions that one-shot removes.

**Independent Test**: Run smithy-clarify with a feature description that
produces candidates at varying confidence levels. Verify that Low-confidence
items appear in the artifact's `## Specification Debt` section with structured
metadata (description, source_category, impact, confidence, status).

**Acceptance Scenarios**:

1. **Given** clarify identifies 5 candidates where 2 are High confidence and 3
   are Low confidence, **When** triage completes, **Then** 2 become assumptions
   and 3 become debt items with structured metadata (description,
   source_category, impact, confidence, status: open).

2. **Given** a spec artifact is produced with 3 debt items, **When** viewing the
   artifact, **Then** a `## Specification Debt` section appears after
   `## Assumptions` and before `## Out of Scope`, listing each item with its
   metadata.

3. **Given** mark produces a spec with debt items, **When** cut later consumes
   that spec, **Then** cut's tasks artifact inherits the debt flagged as
   "inherited from spec: \<item\>" and also records any new debt from its own
   ambiguities.

4. **Given** a debt item is resolved by the user in a subsequent pass, **When**
   the artifact is re-processed (Phase 0), **Then** the item's status changes
   from `open` to `resolved` with a resolution note.

5. **Given** debt items cover enough scope to hollow out the artifact (key
   entities undefined, core stories unspecifiable), **When** the scope-based
   threshold is exceeded, **Then** the pipeline bails out with a debt summary
   and prompts the user for expanded information to restart.

---

### User Story 3: One-Shot Planning Workflows (Priority: P1)

As a developer running Smithy planning commands, I want the pipeline to proceed
from prompt to PR without intermediate approval stops, so that I can review the
complete output holistically rather than approving each phase individually.

**Why this priority**: This is the core friction-reduction change requested in
issue #117. It depends on Stories 1 and 2 (relaxed triage and debt tracking)
to ensure quality is maintained without human gates.

**Independent Test**: Run `smithy.mark` with a clear feature description.
Verify that the command produces spec artifacts, creates a PR, and outputs a
terminal summary (assumptions → debt → PR link) with zero interactive stops.

**Acceptance Scenarios**:

1. **Given** a developer runs `smithy.mark` with a feature description, **When**
   the pipeline completes, **Then** spec artifacts are written to disk, a PR is
   created, and the terminal shows: summary of what was produced, assumptions
   list, debt summary, and PR link.

2. **Given** a developer runs `smithy.strike`, **When** the pipeline reaches
   Phase 3 (Refine), **Then** Phase 3 is skipped entirely and the agent
   proceeds directly to writing the strike document.

3. **Given** clarify runs, **When** it encounters candidates, **Then** it runs
   scan and triage as normal but returns all items as resolved (assumptions or
   debt) without presenting them interactively. Clarify is non-interactive by
   default — there is no interactive mode.

4. **Given** refine runs during a Phase 0 review loop, **When** it identifies
   findings, **Then** it applies refinements directly (or records as debt if
   uncertain) and returns its summary without per-question interaction.

5. **Given** forge or fix is invoked downstream, **When** it encounters
   error-handling stops or complex-fix approval, **Then** those gates are
   retained unchanged. One-shot changes are scoped to planning commands and
   their sub-agents (clarify, refine) only.

6. **Given** all commands produce one-shot output, **When** the terminal output
   is rendered, **Then** a shared output snippet defines the consistent format:
   phase summary → assumptions → specification debt → PR link.

---

### User Story 4: Unified Review Pattern (Priority: P2)

As a developer receiving one-shot planning artifacts, I want an automated
self-consistency review before PR creation, and I want both review agents
(plan and implementation) to follow the same read-only pattern, so that the
review architecture is consistent and predictable.

**Why this priority**: P2 because the first three stories deliver immediate
friction reduction. This story adds quality assurance that makes one-shot safer
and aligns the review architecture, but is not strictly required for the
friction-reduction value.

**Independent Test**: Run smithy-plan-review on a spec artifact that contains
an intentional inconsistency (e.g., an entity referenced in requirements but
not defined in the data model). Verify that the inconsistency is caught and
returned as a finding for the parent command to act on.

**Acceptance Scenarios**:

1. **Given** mark has written a spec where an entity is referenced in FR but not
   defined in Key Entities, **When** smithy-plan-review runs, **Then** it
   returns the inconsistency as a finding. The parent command applies the fix
   (High confidence) or records it as specification debt (Low confidence).

2. **Given** smithy-plan-review runs on a strike document, **When** it finds a
   High-confidence issue (e.g., a requirement that contradicts an acceptance
   scenario), **Then** it returns the finding with a proposed fix. The parent
   command applies the fix to the artifact before PR creation.

3. **Given** smithy-plan-review runs and finds Low-confidence issues, **When**
   triage completes, **Then** findings become debt items in the artifact's
   `## Specification Debt` section.

4. **Given** a spec has assumptions that drift from the artifact content (e.g.,
   an assumption says "webhook support is HTTP-only" but the spec describes
   WebSocket endpoints), **When** smithy-plan-review checks for
   assumption-output drift, **Then** the drift is flagged.

5. **Given** smithy-plan-review is invoked by a planning command, **When** it
   runs, **Then** it uses read-only tools only (Read, Grep, Glob) and does not
   modify the artifact directly — it returns findings that the parent command
   applies or records as debt.

6. **Given** the existing `smithy-review` is renamed to
   `smithy-implementation-review`, **When** forge invokes it, **Then** it
   returns findings using the same read-only pattern as smithy-plan-review.
   Forge applies fixes based on the returned findings rather than the review
   agent modifying code directly.

7. **Given** both review agents produce findings, **When** the parent command
   processes them, **Then** the finding structure (category, severity,
   confidence, description, proposed fix) is identical between
   smithy-plan-review and smithy-implementation-review.

---

### Edge Cases

- A feature description so vague that ALL clarify candidates are Low confidence
  — the scope-based debt threshold should trigger a bail-out.
- A pipeline stage inherits debt from upstream AND generates its own debt —
  both categories must be visible and distinguishable in the artifact.
- One-shot mode is active but the agent's initial scan produces zero candidates
  (the feature is perfectly clear) — clarify returns an empty
  assumptions/debt summary and the pipeline proceeds normally.
- A `[Critical Assumption]` is wrong and discovered during plan-review —
  plan-review should flag it as a high-priority finding, not silently correct
  it, since Critical assumptions represent deliberate decisions.
- Phase 0 review loop on an existing artifact in one-shot mode — refine
  runs non-interactively, applies changes, creates a new PR with the
  diff from the previous version.

## Story Dependency Order

Recommended implementation sequence:

- [x] **User Story 1: Relax Critical Decision Blocking** — Smallest, most contained change; prerequisite for one-shot mode since Critical items always blocking prevents one-shot from fully proceeding. → `specs/2026-04-08-003-reduce-interaction-friction/01-relax-critical-decision-blocking.tasks.md`
- [x] **User Story 2: Track Specification Debt** — Foundational for one-shot mode; without it, unresolved items would be silently dropped. Depends on US1 triage matrix update. → `specs/2026-04-08-003-reduce-interaction-friction/02-track-specification-debt.tasks.md`
- [ ] **User Story 3: One-Shot Planning Workflows** — Core friction-reduction change; depends on US1 (relaxed triage) and US2 (debt tracking) to maintain quality without gates.
- [ ] **User Story 4: Unified Review Pattern** — Quality assurance layer for one-shot; depends on US3 (one-shot mode existing) to add the automated review before PR creation.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST allow Critical+High-confidence clarify candidates
  to be triaged as assumptions rather than mandatory questions.
- **FR-002**: Critical items promoted to assumptions MUST carry a
  `[Critical Assumption]` annotation visible in the assumptions block and
  in the artifact's Clarifications section.
- **FR-003**: The system MUST introduce a "specification debt" triage category
  in smithy-clarify alongside assumptions and questions.
- **FR-004**: Each debt item MUST carry structured metadata: description,
  source_category, impact level, confidence level, and status (open/resolved).
- **FR-005**: All planning artifact templates (spec, strike, RFC, feature map,
  tasks) MUST include a `## Specification Debt` section for recording debt
  items.
- **FR-006**: The `## Specification Debt` section MUST appear after
  `## Assumptions` and before `## Out of Scope` in artifact templates.
- **FR-007**: Downstream pipeline commands MUST inherit upstream debt items,
  flagged as "inherited from \<source artifact type\>: \<item\>."
- **FR-008**: Downstream commands MUST also record their own new debt items
  separately from inherited debt.
- **FR-009**: The system MUST implement a scope-based debt threshold that
  triggers a bail-out when debt would hollow out the artifact (key entities
  undefined, core stories unspecifiable).
- **FR-010**: On bail-out, the system MUST output a structured debt summary and
  prompt the user for expanded information to restart.
- **FR-011**: Planning commands (strike, ignite, mark, render, cut) MUST
  execute in one-shot mode by default — no intermediate STOP gates between
  prompt and PR creation.
- **FR-012**: smithy-clarify MUST operate non-interactively — running
  scan/triage and returning all items as resolved assumptions or debt with
  no user interaction. There is no interactive mode.
- **FR-013**: smithy-refine MUST operate non-interactively — applying
  refinements directly (or recording as debt) with no per-question
  interaction. There is no interactive mode.
- **FR-014**: Strike MUST skip Phase 3 (Refine iteration loop), treating
  Phase 2 output as implicitly approved.
- **FR-015**: Forge and fix MUST retain their existing interactive gates
  (error-handling stops, complex-fix approval). One-shot scope is limited
  to planning commands.
- **FR-016**: One-shot terminal output MUST follow a consistent format defined
  by a shared snippet: phase summary → assumptions → specification debt
  summary → PR link.
- **FR-017**: Both review sub-agents (`smithy-plan-review` and
  `smithy-implementation-review`) MUST follow the same pattern: read-only
  tools (Read, Grep, Glob), return structured findings, parent command
  applies fixes or records debt. Neither review agent modifies artifacts
  or code directly.
- **FR-018**: A `smithy-plan-review` sub-agent MUST be created for automated
  self-consistency review of planning artifacts.
- **FR-019**: smithy-plan-review MUST check for: internal contradictions,
  logical gaps (requirements without stories, stories without scenarios),
  assumption-output drift, debt completeness, and brittle references
  (line numbers instead of stable section/header references).
- **FR-020**: The existing `smithy-review` agent MUST be renamed to
  `smithy-implementation-review` and refactored to return findings instead
  of auto-fixing directly. Forge applies the fixes based on returned findings.
- **FR-021**: Review findings from both agents MUST be triaged: High-confidence
  findings are returned for auto-fix by the parent command; Low-confidence
  findings become debt items.
- **FR-022**: smithy-plan-review MUST be invoked by planning commands after
  artifact generation but before PR creation.

### Key Entities

- **Debt Item**: A formally tracked unresolved ambiguity in a planning artifact,
  carrying structured metadata and a lifecycle (open → resolved/inherited).
- **Assumption**: An existing concept, extended with a `[Critical Assumption]`
  annotation for promoted Critical+High-confidence items.
- **Triage Matrix**: The updated decision table mapping Impact × Confidence to
  disposition (assumption or debt). Questions are eliminated as a category.
- **One-Shot Output**: The standardized terminal output format for planning
  commands.

## Assumptions

- One-shot is the only mode for planning commands and their sub-agents
  (clarify, refine). There is no interactive mode or flag to opt into one.
- PR creation for planning commands reuses forge's existing `gh pr create`
  pattern — each command's final phase becomes "Write & PR."
- The existing `smithy-review` agent is renamed to `smithy-implementation-review`
  and aligned to the same read-only pattern as `smithy-plan-review`: it returns
  findings for forge to apply, rather than auto-fixing directly.
- The clarify sub-agent's "never skip clarification" rule (see "Rules" section
  in `smithy.clarify.prompt`) remains intact — the change is to triage rules
  and interaction removal, not to whether clarify runs at all.
- Debt item status transitions (open → resolved, inherited) are convention-based
  in this iteration, not enforced by tooling.

## Specification Debt

_None — all ambiguities resolved._

## Out of Scope

- Further changes to forge's implementation workflow beyond the review agent rename.
- Modifying forge or fix interaction patterns.
- Tooling to enforce debt lifecycle transitions (open → resolved → promoted).
- Promoting debt items to GitHub issues automatically.
- Splitting smithy-clarify into multiple sub-agents (scan, triage, interact).

## Success Criteria

### Measurable Outcomes

- **SC-001**: All 5 planning commands (strike, ignite, mark, render, cut) execute
  from prompt to PR with zero intermediate STOP gates.
- **SC-002**: smithy-clarify produces a two-category triage output (assumptions
  and debt) with no interactive questions.
- **SC-003**: Every planning artifact contains a `## Specification Debt` section
  (even if empty).
- **SC-004**: Critical+High-confidence items appear as `[Critical Assumption]` in
  artifact output, not as interactive questions.
- **SC-005**: smithy-plan-review catches at least 80% of intentionally introduced
  inconsistencies in test artifacts (internal contradictions, missing entity
  references, assumption-output drift).
- **SC-006**: Terminal output for one-shot commands follows the shared snippet
  format: summary → assumptions → debt → PR link.
- **SC-007**: When debt scope exceeds the threshold (artifact would be hollowed
  out), the pipeline bails out with a structured debt summary instead of
  producing a low-quality artifact.

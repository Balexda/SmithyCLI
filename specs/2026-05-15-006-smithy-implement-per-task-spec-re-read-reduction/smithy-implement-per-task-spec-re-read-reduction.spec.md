# Feature Specification: smithy.implement Per-Task Spec Re-Read Reduction

**Spec Folder**: `2026-05-15-006-smithy-implement-per-task-spec-re-read-reduction`
**Branch**: `2026-05-15-006-smithy-implement-per-task-spec-re-read-reduction`
**Created**: 2026-05-15
**Status**: Draft
**Input**: Feature map `docs/rfcs/2026-001-token-savings/02-architectural-cost-reductions.features.md` — Feature 2.3: smithy.implement Per-Task Spec Re-Read Reduction
**Source Feature Map**: `docs/rfcs/2026-001-token-savings/02-architectural-cost-reductions.features.md` — Feature 2.3: smithy.implement Per-Task Spec Re-Read Reduction

## Clarifications

### Session 2026-05-15

- M1 per-case token totals and forge baselines for both JS and JVM fixtures exist before this feature's implementation PR is allowed to merge. `[Critical Assumption]`
- The feature must compare parent pre-paste of relevant acceptance excerpts against a generated per-task brief before selecting the context-delivery mechanism. `[Critical Assumption]`
- The selected mechanism must reduce repeated artifact reads by each implementation sub-agent without reducing acceptance-scenario fidelity or task isolation.
- The implementation sub-agent remains on its existing model assignment for this feature; model downgrade analysis is explicitly deferred outside this feature.
- The build-output protocol and test-command output handling are owned by another feature and remain out of scope here.

## Artifact Hierarchy

RFC -> Milestone -> Feature -> User Story -> Slice -> Tasks

## User Scenarios & Testing *(mandatory)*

### User Story 1: Select the bounded context-delivery mechanism (Priority: P1)

As a Smithy maintainer, I want the feature to choose between parent pre-pasted excerpts and a generated per-task brief using captured forge evidence, so that the implemented reduction is based on measured token and quality behavior rather than intuition.

**Why this priority**: The RFC and feature map both make measurement the gate for M2. Implementation cannot proceed safely until the team knows which bounded-context strategy preserves task quality with the lower token cost.

**Independent Test**: Run the JS and JVM forge baseline scenarios with both candidate strategies enabled in isolation, then verify the decision record names the selected strategy, the per-slice token delta for each fixture, and the quality result for each fixture.

**Acceptance Scenarios**:

1. **Given** M1 forge baselines exist for the JS and JVM fixtures, **When** both candidate context-delivery strategies are measured against the same task slice shape, **Then** the decision record captures input tokens, output tokens, total tokens, and delta from baseline for each strategy and fixture.
2. **Given** one candidate has a lower token cost but loses required acceptance detail, **When** the decision is recorded, **Then** that candidate is rejected or deferred even if it has the better token delta.
3. **Given** both candidates preserve quality within the same structural-eval pass rate, **When** the selected mechanism is recorded, **Then** the lower-token candidate is chosen unless the record identifies a concrete maintainability or reliability reason not to choose it.

---

### User Story 2: Supply task-specific acceptance context without full artifact re-reads (Priority: P1)

As a contributor running `smithy.forge`, I want each implementation sub-agent to receive only the task-relevant specification context it needs, so that repeated cold-context reads of the full spec artifact set are eliminated for multi-task slices.

**Why this priority**: This is the direct cost-reduction behavior. Without it, the feature only measures alternatives and does not change the expensive per-task context shape called out by the RFC.

**Independent Test**: Run a multi-task forge scenario and inspect the implementation dispatches. Each task dispatch receives the selected bounded context packet and no longer needs to load the full spec, data model, and contracts only to recover the acceptance scenarios for that one task.

**Acceptance Scenarios**:

1. **Given** a forge slice with multiple implementation tasks mapped to one user story, **When** each task is dispatched, **Then** the implementation agent receives the task description, slice goal, branch, and a bounded context packet containing the relevant acceptance scenarios, requirements, and interface/data notes for that task.
2. **Given** a task depends on a contract or data-model note, **When** its context packet is assembled, **Then** the packet includes the relevant contract or entity summary needed to implement the task without requiring a full artifact re-read.
3. **Given** a task has no relevant data-model or contract details, **When** its context packet is assembled, **Then** the packet explicitly records that no additional data or contract context is required instead of forcing the agent to rediscover that fact from full artifacts.

---

### User Story 3: Preserve implementation quality and task isolation (Priority: P1)

As a Smithy maintainer, I want the reduced context path to keep implementation behavior equivalent to the full-read path, so that token savings do not create missed acceptance criteria, cross-task bleed, or lower quality.

**Why this priority**: Quality is a program-wide non-negotiable gate. The savings are only useful if each implementation agent still satisfies the same task and user-story contract.

**Independent Test**: Run the committed forge evals on the selected mechanism and compare structural pass rate plus at least two sampled implementation outputs against the M1 full-read baseline.

**Acceptance Scenarios**:

1. **Given** the selected context mechanism is enabled, **When** the committed forge eval scenarios run, **Then** structural-eval pass rate does not regress against the M1 baseline.
2. **Given** at least two sampled implementation outputs are reviewed, **When** they are compared to baseline outputs for acceptance-scenario fidelity, **Then** reviewers find no missing acceptance criteria caused by bounded context.
3. **Given** an implementation task discovers work outside its task scope, **When** it reports completion or blockage, **Then** the bounded context path preserves the existing rule that the task notes the discovery without implementing unrelated work.

---

### User Story 4: Report the token delta in the implementation PR (Priority: P2)

As a maintainer reviewing the token-savings change, I want the PR to state the measured token delta and quality result, so that I can evaluate whether the reduction satisfies the RFC without rerunning all evals locally.

**Why this priority**: The program requires every optimization PR to carry a defensible cost signal. This story is lower priority than the behavior itself but required before merge.

**Independent Test**: Open the implementation PR and verify its description includes the selected strategy, JS and JVM token deltas, structural-eval result, and sampled quality-review result.

**Acceptance Scenarios**:

1. **Given** the selected mechanism has been implemented, **When** the PR description is authored, **Then** it includes a token-delta line for each forge fixture compared with the M1 baseline.
2. **Given** a structural eval failed or a sampled output regressed, **When** the PR is prepared, **Then** the PR is blocked or explicitly marked unmergeable until the regression is fixed.
3. **Given** the feature lands after the shared PR-description protocol exists, **When** the token delta is reported, **Then** it follows that protocol's expected wording and fields.

### Edge Cases

- A task may need acceptance scenarios from one user story and a contract summary shared with another story; the bounded context packet must include only the relevant shared contract details, not the entire unrelated story.
- A task may be created from a spec with open specification debt; the packet must include debt items that materially affect the task's acceptance or implementation boundary.
- A generated brief can drift from the source artifacts; the decision and validation flow must catch drift before implementation work begins.
- Large user stories can still produce context packets that are too large; the mechanism must keep packets bounded and report when the task cannot be reduced safely.
- The implementation sub-agent may still need to open source files and tests during TDD. This feature only reduces repeated planning-artifact reads, not normal codebase exploration.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Select the bounded context-delivery mechanism | — | specs/2026-05-15-006-smithy-implement-per-task-spec-re-read-reduction/01-select-the-bounded-context-delivery-mechanism.tasks.md |
| US2 | Supply task-specific acceptance context without full artifact re-reads | US1 | — |
| US3 | Preserve implementation quality and task isolation | US2 | — |
| US4 | Report the token delta in the implementation PR | US2, US3 | — |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The feature MUST compare parent pre-pasted acceptance excerpts and generated per-task briefs before selecting the context-delivery mechanism.
- **FR-002**: The comparison MUST use the M1 forge baselines for both JS and JVM fixtures.
- **FR-003**: The comparison MUST record input tokens, output tokens, total tokens, and delta from baseline for each candidate strategy and fixture.
- **FR-004**: The selected mechanism MUST provide every implementation task with task-relevant acceptance scenarios, functional requirements, and dependency notes needed to perform the task.
- **FR-005**: The selected mechanism MUST include task-relevant data-model and contract summaries when those artifacts affect the task.
- **FR-006**: The selected mechanism MUST explicitly state when no data-model or contract context is needed for a task.
- **FR-007**: Implementation dispatches MUST avoid requiring each task agent to re-read the full spec, data-model, and contracts solely to recover task acceptance context.
- **FR-008**: The selected mechanism MUST preserve the existing single-task scope rule for implementation agents.
- **FR-009**: The selected mechanism MUST preserve the existing blocked-state behavior when required context is missing or contradictory.
- **FR-010**: The selected mechanism MUST preserve structural-eval pass rate on the committed forge scenarios.
- **FR-011**: The selected mechanism MUST pass at least two human-reviewed sampled output checks per affected forge path with no acceptance-scenario fidelity regression.
- **FR-012**: The implementation PR MUST report token deltas against the M1 forge baselines for both JS and JVM fixtures.
- **FR-013**: The feature MUST NOT change build-output handling, test-command output protocol, or CI-log bounding behavior.
- **FR-014**: The feature MUST NOT change the implementation sub-agent's model assignment.
- **FR-015**: The feature MUST NOT edit the shared TDD protocol body.

### Key Entities

- **Context Delivery Decision**: The recorded comparison between pre-pasted excerpts and per-task briefs, including cost and quality evidence.
- **Task Context Packet**: The bounded task-specific context supplied to an implementation dispatch, containing acceptance scenarios, relevant requirements, and data/contract notes.
- **Forge Baseline Measurement**: The M1 token and quality baseline used as the comparator for candidate strategies and the final implementation.
- **Quality Review Sample**: A human-reviewed implementation output used to confirm acceptance-scenario fidelity under the reduced context path.

## Assumptions

- M1 produces enough token data to compare both candidate context-delivery strategies on the JS and JVM forge fixtures.
- The implementation task list already maps tasks clearly enough to their source user story and acceptance scenarios.
- The selected mechanism can be expressed as orchestration and prompt-context changes without changing public Smithy CLI behavior.
- The source artifacts remain the authoritative requirements; any generated packet or brief is a bounded derivative, not a replacement source of truth.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | The exact selected strategy cannot be finalized in this spec without the M1 JS and JVM forge baselines and side-by-side candidate measurements. | Dependency Relationships | High | High | open | — |
| SD-002 | The maximum acceptable size for a task context packet depends on observed task and artifact sizes from the M1 forge fixtures. Implementation must set and document a bound before merge. | Non-Functional Quality | Medium | Medium | open | — |

## Out of Scope

- Changing the shared TDD protocol body.
- Adding the build-output protocol around test commands.
- Changing forge Phase 6 orchestration or inlining cleanup helpers.
- Skipping implementation review for trivial slices.
- Downgrading the implementation sub-agent model.
- Modifying M1 forge or JVM eval scenarios except to consume their committed baselines and captured outputs.
- Changing public Smithy CLI command syntax or user-facing slash-command invocation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The selected mechanism reduces total tokens for the measured multi-task forge slice against the M1 JS fixture baseline.
- **SC-002**: The selected mechanism reduces total tokens for the measured multi-task forge slice against the M1 JVM fixture baseline.
- **SC-003**: Structural-eval pass rate for committed forge scenarios is unchanged from the M1 baseline.
- **SC-004**: At least two human-reviewed sampled implementation outputs per affected forge path show no acceptance-scenario fidelity regression.
- **SC-005**: The implementation PR reports the selected strategy and fixture-specific token deltas in its description.

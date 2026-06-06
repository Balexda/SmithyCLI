# Feature Specification: Forge-JVM Eval Scenario + M1 Baseline-Set Completeness Gate

**Spec Folder**: `2026-06-06-012-forge-jvm-eval-scenario-m1-baseline-set-completeness-gate`
**Branch**: `2026-06-06-012-forge-jvm-eval-scenario-m1-baseline-set-completeness-gate`
**Created**: 2026-06-06
**Status**: Draft
**Input**: `docs/rfcs/2026-001-token-savings/token-savings.rfc.md` - Milestone 1 measurement-foundation feature for the JVM forge eval scenario and baseline-set completion gate.
**Source Feature Map**: `docs/rfcs/2026-001-token-savings/01-measurement-foundation.features.md` - Feature 1.7: Forge-JVM Eval Scenario + M1 Baseline-Set Completeness Gate

## Clarifications

### Session 2026-06-06

- This specification targets the Dependency Order row `F6`, which corresponds to Feature 1.7 in the measurement-foundation feature map. `[Critical Assumption]`
- The JVM scenario consumes the F1.5 forge scenario contract and the F1.6 `fixture: jvm` substrate; it does not redefine the forge-JS scenario, runner git initialization, fixture resolver, or JVM fixture contents.
- The JVM coverage is specified as a separate scenario named `forge-tdd-slice-jvm` so the JavaScript and JVM baselines remain independently addressable in reports and PR descriptions.
- M1 closure is bounded to the strike, smithy.fix, smithy.forge-JS, and smithy.forge-JVM committed baselines. Planning-command baselines from the expand-evals dependency do not gate this feature.
- The baseline-set audit records planning-command baseline status as informational context only, so late expand-evals scenario merges remain visible without blocking M1 completion.
- The M1-close `.claude/` and `.smithy/` snapshot refresh remains a separate chore PR and is out of scope for this feature.

## Artifact Hierarchy

RFC -> Milestone -> Feature -> User Story -> Slice -> Tasks

## User Scenarios & Testing *(mandatory)*

### User Story 1: Add the Forge-JVM Eval Scenario (Priority: P1)

As a Smithy maintainer, I want a JVM variant of the forge eval scenario so that forge behavior is measured against the non-JavaScript fixture before downstream cost-reduction work relies on it.

**Why this priority**: The baseline-set gate cannot close until there is a JVM forge scenario capable of producing the fourth required M1 baseline.

**Independent Test**: Load and run only the JVM forge scenario against the committed JVM fixture, verifying that it selects `fixture: jvm`, requires git setup, exercises the forge workflow, and emits the same structural evidence categories as the forge-JS scenario.

**Acceptance Scenarios**:

1. **Given** the F1.6 JVM fixture exists, **When** the JVM forge scenario is loaded, **Then** it declares `fixture: jvm` and is accepted by the scenario loader.
2. **Given** the JVM forge scenario runs, **When** the runner prepares the temp copy, **Then** it applies the F1.5 git-initialization contract before forge needs repository operations.
3. **Given** the JVM forge scenario completes, **When** structural validation runs, **Then** it verifies forge slice-completion markers equivalent in intent to the JavaScript forge scenario without re-owning F1.5's structural expectation design.
4. **Given** the JVM fixture contains its intentional failing test, **When** forge repairs the scenario, **Then** the scenario proves the JVM fixture can drive an end-to-end forge slice.

---

### User Story 2: Commit the Forge-JVM Token Baseline (Priority: P1)

As a contributor, I want a committed forge-JVM baseline so that future prompt and sub-agent changes can compute token deltas without rerunning the entire historical suite.

**Why this priority**: M2 and M3 token-delta reporting depends on committed baselines, and the JVM scenario is the final M1-owned baseline.

**Independent Test**: Generate and compare the forge-JVM baseline for the JVM scenario, then verify `npm run eval -- --case forge-tdd-slice-jvm` reports a passing baseline comparison using the token-aware schema.

**Acceptance Scenarios**:

1. **Given** the JVM forge scenario has a successful run, **When** the baseline is committed, **Then** `evals/baselines/forge-tdd-slice-jvm.json` exists in the token-aware schema established by F1.3a.
2. **Given** the committed JVM baseline exists, **When** the JVM scenario runs again, **Then** baseline comparison reports structural compatibility and token-envelope status for the JVM case.
3. **Given** a future prompt edit changes JVM forge token usage, **When** the report compares against the committed baseline, **Then** the token delta can be read from the normal eval report without hand-curating historical values.
4. **Given** baseline generation produces volatile fields, **When** the baseline is reviewed, **Then** only stable, schema-owned fields are committed.

---

### User Story 3: Audit M1 Baseline-Set Completeness (Priority: P1)

As an M2 or M3 contributor, I want an explicit M1 baseline-set audit so that I know which committed baselines are guaranteed inputs to token-delta reporting.

**Why this priority**: This feature is the M1 completion gate. Without a visible audit, downstream contributors must infer whether the measurement substrate is complete.

**Independent Test**: Run the baseline audit and verify it checks for strike, smithy.fix, forge-JS, and forge-JVM baseline presence and shape, while treating planning-command baselines as informational.

**Acceptance Scenarios**:

1. **Given** the M1 baseline-set audit runs, **When** strike, smithy.fix, forge-JS, or forge-JVM baseline files are missing, **Then** the audit fails and names each missing required baseline.
2. **Given** all four required baseline files exist, **When** the audit checks their shape, **Then** each file is validated against the token-aware baseline contract.
3. **Given** planning-command baselines from expand-evals exist, **When** the audit reports baseline status, **Then** they are listed as informational additions and do not affect the pass/fail gate.
4. **Given** planning-command baselines have not merged yet, **When** the audit runs, **Then** M1 closure still passes if the four required M1 baselines are present and valid.

---

### User Story 4: Preserve Milestone Ownership Boundaries (Priority: P2)

As a reviewer, I want the M1 closer to avoid unrelated source or snapshot changes so that the final measurement patch remains easy to review and does not conflict with dedicated chore work.

**Why this priority**: F1.7 fans in earlier M1 work. It must close the baseline substrate without taking over upstream feature contracts or derived snapshot refreshes.

**Independent Test**: Review the F1.7 diff and verify it limits changes to the JVM scenario, JVM baseline, baseline audit/reporting support needed for the gate, and tests.

**Acceptance Scenarios**:

1. **Given** F1.5 owns the forge-JS scenario shape, **When** F1.7 lands, **Then** the JavaScript scenario remains semantically unchanged except for shared audit compatibility if required.
2. **Given** F1.6 owns the JVM fixture and fixture selector, **When** F1.7 lands, **Then** the JVM fixture contents and fixture-resolution contract are not reworked.
3. **Given** `.claude/` and `.smithy/` snapshots are derived artifacts, **When** F1.7 lands, **Then** those snapshots are not regenerated in the feature PR.
4. **Given** planning-command baselines are owned by expand-evals scenario-merge PRs, **When** F1.7 lands, **Then** they are not required for M1 closure.

### Edge Cases

- The JVM scenario must fail clearly if `fixture: jvm` is unavailable rather than silently falling back to the JavaScript fixture.
- The JVM scenario must not rely on a live network, live GitHub state, or uncommitted local files.
- Baseline audit failures must identify the baseline name and the missing or malformed field so M1 closure blockers are actionable.
- Token-envelope comparison must tolerate expected per-run variation only within the schema's allowed envelope, not by disabling token checks.
- Planning-command baseline rows must remain informational even if some are present and others are absent.
- Snapshot-refresh chores must remain separate even though F1.7 closes M1.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Add the Forge-JVM Eval Scenario | — | — |
| US2 | Commit the Forge-JVM Token Baseline | US1 | — |
| US3 | Audit M1 Baseline-Set Completeness | US2 | — |
| US4 | Preserve Milestone Ownership Boundaries | US1, US2, US3 | — |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The eval suite MUST include a JVM forge scenario named `forge-tdd-slice-jvm`.
- **FR-002**: The JVM forge scenario MUST select the JVM fixture using the F1.6 scenario-level fixture contract.
- **FR-003**: The JVM forge scenario MUST opt into the F1.5 git-initialization behavior required by forge.
- **FR-004**: The JVM forge scenario MUST exercise an end-to-end smithy.forge slice against the JVM fixture.
- **FR-005**: The JVM forge scenario MUST validate forge completion with structural expectations equivalent in intent to the JavaScript forge scenario.
- **FR-006**: The feature MUST commit `evals/baselines/forge-tdd-slice-jvm.json`.
- **FR-007**: The forge-JVM baseline MUST use the token-aware baseline schema established by F1.3a.
- **FR-008**: Baseline comparison MUST report structural status and token-envelope status for the JVM forge scenario.
- **FR-009**: The M1 baseline-set audit MUST require valid committed baselines for strike, smithy.fix, smithy.forge-JS, and smithy.forge-JVM.
- **FR-010**: The M1 baseline-set audit MUST fail when any required M1 baseline is missing or malformed.
- **FR-011**: Planning-command baselines from the expand-evals dependency MUST NOT gate M1 closure.
- **FR-012**: The baseline-set audit SHOULD record planning-command baseline status as informational context when those baselines are present or absent.
- **FR-013**: F1.7 MUST NOT regenerate `.claude/` or `.smithy/` snapshots.
- **FR-014**: F1.7 MUST NOT rework the F1.5 forge-JS scenario contract or the F1.6 JVM fixture contract except where shared compatibility tests require additive assertions.
- **FR-015**: Tests MUST cover JVM scenario loading, JVM scenario execution or deterministic validation, forge-JVM baseline comparison, and the required-vs-informational baseline audit behavior.

### Key Entities

- **Forge-JVM Scenario**: The eval case that runs smithy.forge against the JVM fixture.
- **Forge-JVM Baseline**: The committed token-aware baseline for the JVM forge scenario.
- **M1 Required Baseline Set**: The four baseline files required for M1 closure: strike, smithy.fix, forge-JS, and forge-JVM.
- **Planning-Command Baseline Status**: Informational audit entries for baselines delivered by the expand-evals dependency.
- **Baseline-Set Audit**: The validation surface that confirms required baseline presence and schema compatibility.

## Assumptions

- F1.3a has landed the token-aware baseline schema and comparison surface.
- F1.4 has landed the smithy.fix scenario and baseline.
- F1.5 has landed the forge-JS scenario, baseline, and git-initialization opt-in contract.
- F1.6 has landed `fixture: jvm` support and the JVM fixture.
- `forge-tdd-slice-jvm` is the canonical scenario and baseline stem for the JVM forge eval.
- Planning-command baselines remain owned by their expand-evals scenario-merge PRs.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | The baseline-set audit format is specified functionally but not tied to a specific implementation surface. Implementers may extend an existing eval/baseline test, add a dedicated audit helper, or encode the gate in scenario-level tests, provided missing required baselines fail clearly and planning-command baselines remain informational. | Integration | Medium | Medium | open | — |
| SD-002 | The feature map allows the JVM forge scenario to be either a second YAML file or a fixture-parameterized run of the existing forge scenario. This spec chooses the separate `forge-tdd-slice-jvm` scenario for independent baseline identity; if implementation discovers the runner already supports parameterized cases more cleanly, preserve the canonical scenario/baseline identity in reports. | Functional Scope | Low | Medium | open | — |

## Out of Scope

- Editing the F1.5 forge-JS scenario's structural expectation design.
- Editing the F1.6 JVM fixture contents or fixture-selection contract.
- Changing smithy.forge prompt behavior for M2 cost reductions.
- Implementing the M3 build-output protocol.
- Committing or requiring planning-command baselines from expand-evals.
- Regenerating `.claude/` or `.smithy/` snapshots.
- Adding non-JVM language fixtures or non-forge JVM scenarios.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `forge-tdd-slice-jvm` loads as a JVM-fixture forge scenario.
- **SC-002**: The JVM forge scenario can produce a passing structural eval run against the JVM fixture.
- **SC-003**: `evals/baselines/forge-tdd-slice-jvm.json` is committed in the token-aware schema.
- **SC-004**: Baseline comparison succeeds for the JVM forge scenario against its committed baseline.
- **SC-005**: The baseline-set audit requires strike, smithy.fix, forge-JS, and forge-JVM baselines.
- **SC-006**: Planning-command baselines are reported, if visible, without gating M1 closure.
- **SC-007**: No `.claude/` or `.smithy/` snapshot refresh is included in the feature implementation.

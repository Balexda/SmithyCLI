# Feature Specification: smithy.fix End-to-End Eval Scenario

**Spec Folder**: `2026-05-21-009-smithy-fix-end-to-end-eval-scenario`
**Branch**: `2026-05-21-009-smithy-fix-end-to-end-eval-scenario`
**Created**: 2026-05-21
**Status**: Draft
**Input**: `docs/rfcs/2026-001-token-savings/token-savings.rfc.md` - Milestone 1 measurement foundation feature for deterministic smithy.fix eval coverage.
**Source Feature Map**: `docs/rfcs/2026-001-token-savings/01-measurement-foundation.features.md` - Feature 1.4: smithy.fix End-to-End Eval Scenario

## Clarifications

### Session 2026-05-21

- This specification targets Dependency Order row `F3`, which corresponds to Feature 1.4 in the measurement-foundation feature map. `[Critical Assumption]`
- Feature 1.3a is the prerequisite token baseline substrate; this feature consumes its token-aware baseline schema instead of redefining it.
- The eval scenario must be fully offline and deterministic. It must not call live GitHub issue, pull request, or Actions APIs during the scenario run.
- The F1.4 fixture layout is settled here: the offline issue and CI-log payloads are separate committed fixtures so either can be refreshed independently.
- smithy.fix discovers the offline inputs through scenario-provided prompt context and fixture files, not through a new public command-line option.
- The scenario represents the high-cost CI-log path of smithy.fix and intentionally excludes the later CI-log failure-extraction optimization owned by Milestone 3.

## Artifact Hierarchy

RFC -> Milestone -> Feature -> User Story -> Slice -> Tasks

## User Scenarios & Testing *(mandatory)*

### User Story 1: Provide Offline fix Inputs (Priority: P1)

As a Smithy maintainer, I want a committed issue fixture and CI-log fixture for smithy.fix so that the eval can exercise the expensive fix path without network access.

**Why this priority**: The scenario cannot be deterministic until its GitHub issue and CI-log dependencies are replaced with committed local inputs.

**Independent Test**: Load the fix eval scenario in an environment with no GitHub network access and verify that the prompt references only committed fixture inputs.

**Acceptance Scenarios**:

1. **Given** a fix scenario is loaded, **When** its prompt is prepared, **Then** it identifies a committed issue fixture as the source issue context.
2. **Given** a fix scenario is loaded, **When** its prompt is prepared, **Then** it identifies a committed CI-log fixture as the source failure context.
3. **Given** GitHub network access is unavailable, **When** the fix scenario runs, **Then** the scenario still has all required issue and CI-log context.

---

### User Story 2: Run smithy.fix End to End (Priority: P1)

As a Smithy contributor, I want smithy.fix covered by an end-to-end eval scenario so that changes near fix can be judged by measured structural output and token cost.

**Why this priority**: smithy.fix is one of the highest-frequency cost drivers called out by the RFC. Measurement coverage for fix is required before later token-saving changes can claim a credible delta.

**Independent Test**: Run the fix scenario against the standard eval fixture and verify it produces the expected fix workflow output without invoking live GitHub commands.

**Acceptance Scenarios**:

1. **Given** the offline issue and CI-log fixtures are present, **When** the fix scenario invokes smithy.fix, **Then** the run completes using the fixture context.
2. **Given** smithy.fix produces its expected response, **When** structural validation runs, **Then** required fix output markers are present.
3. **Given** the scenario runs in a clean temp copy, **When** the run completes, **Then** source fixtures outside the temp copy remain unchanged.

---

### User Story 3: Verify fix Helper Evidence (Priority: P2)

As a Smithy maintainer, I want the fix eval to verify helper-agent evidence so that orchestration regressions in fix are visible in the eval report.

**Why this priority**: The scenario should catch both output-shape regressions and missing helper dispatch behavior, but structural fix coverage is the prerequisite.

**Independent Test**: Run the scenario against a captured stream with expected helper output and verify the sub-agent evidence checks pass.

**Acceptance Scenarios**:

1. **Given** smithy.fix dispatches helper agents for the CI-log path, **When** sub-agent evidence validation runs, **Then** the configured helper evidence patterns pass.
2. **Given** an expected helper dispatch is absent, **When** sub-agent evidence validation runs, **Then** the scenario fails with a clear missing-evidence check.
3. **Given** helper wording varies while retaining the configured stable marker, **When** evidence validation runs, **Then** the scenario remains stable.

---

### User Story 4: Commit the fix Token Baseline (Priority: P2)

As a Smithy maintainer, I want a committed token-aware baseline for the fix scenario so that future fix changes can report token drift against a known-good envelope.

**Why this priority**: The token-savings program needs a baseline for fix before M3 can demonstrate savings from CI-log failure extraction.

**Independent Test**: Run the fix scenario after the baseline is committed and verify the report shows a passing baseline marker plus per-case token totals.

**Acceptance Scenarios**:

1. **Given** the fix baseline is committed in the token-aware schema, **When** the fix scenario runs within the accepted token envelope, **Then** its baseline check passes.
2. **Given** the fix baseline is committed in the token-aware schema, **When** structural expectations drift, **Then** the baseline check fails even if token totals remain within the envelope.
3. **Given** the fix scenario produces materially higher token totals than the envelope, **When** baseline comparison runs, **Then** the token baseline check fails with expected and actual totals visible.

### Edge Cases

- The CI log may be long enough to dominate prompt size; the scenario must preserve enough log content to exercise fix behavior without requiring live log retrieval.
- The offline issue may describe a failing check whose log fixture is missing; scenario validation must fail before invoking smithy.fix.
- The scenario may run in an environment where GitHub credentials exist; the scenario contract still forbids live GitHub access for issue or CI-log context.
- smithy.fix may produce a blocked or diagnostic result instead of a patch when the fixture intentionally lacks enough context; structural expectations must target the intended high-cost CI-log workflow result.
- The committed token envelope may need tolerance for model/provider variance while still catching material prompt-size regressions.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Provide Offline fix Inputs | — | — |
| US2 | Run smithy.fix End to End | US1 | — |
| US3 | Verify fix Helper Evidence | US2 | — |
| US4 | Commit the fix Token Baseline | US2 | — |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST include a committed offline issue fixture for the fix scenario.
- **FR-002**: The system MUST include a committed offline CI-log fixture for the fix scenario.
- **FR-003**: The fix scenario prompt MUST provide enough context for smithy.fix to use the committed issue and CI-log fixtures without live GitHub calls.
- **FR-004**: The fix scenario MUST be loadable by the existing eval scenario loader as a deterministic scenario.
- **FR-005**: The fix scenario MUST run against a temp fixture copy and MUST NOT mutate the committed source fixture inputs.
- **FR-006**: The fix scenario MUST validate stable structural markers from the smithy.fix high-cost CI-log workflow.
- **FR-007**: The fix scenario MUST include sub-agent evidence patterns for the helper behavior expected on the CI-log path.
- **FR-008**: Missing required offline fixture inputs MUST fail the scenario deterministically before a misleading successful eval can be reported.
- **FR-009**: Live GitHub issue, pull request, or Actions API calls MUST NOT be required for the scenario to pass.
- **FR-010**: The fix scenario MUST produce per-case token totals through the F1.3a report substrate.
- **FR-011**: The system MUST commit a token-aware baseline for the fix scenario after the scenario shape is stable.
- **FR-012**: The fix baseline MUST preserve structural expectations and token-envelope checks together.
- **FR-013**: Tests MUST cover scenario loading, fixture availability validation, no-network prompt behavior, structural checks, helper evidence checks, and token-aware baseline comparison.

### Key Entities

- **Fix Eval Scenario**: The declarative scenario that invokes smithy.fix against offline issue and CI-log context.
- **Offline Issue Fixture**: The committed issue body and metadata used as the fix input.
- **Offline CI Log Fixture**: The committed failing-check log used to exercise the high-cost fix path.
- **Fix Baseline**: The committed token-aware known-good baseline for the fix scenario.
- **Sub-Agent Evidence Pattern**: A stable marker used to verify expected helper behavior during the scenario.

## Assumptions

- Feature 1.3a has already introduced token-aware baselines and per-case token reporting before this feature lands.
- Prompt-level fixture context is sufficient for smithy.fix eval coverage; adding a new public `--from-file` command option is unnecessary for M1.
- The offline CI-log fixture should be realistic enough to exercise fix reasoning but small enough to keep eval runtime practical.
- The fix eval should measure the current high-cost behavior, not pre-apply M3's CI-log extraction optimization.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| — | None — all ambiguities resolved. | — | — | — | — | — |

## Out of Scope

- Implementing the M3 CI-log failure-extraction grep or reducing the fix prompt size.
- Adding a public smithy.fix file-input option solely for this scenario.
- Live GitHub issue, pull request, or Actions API integration inside the eval run.
- Multi-issue, multi-check, or non-CI-log fix scenarios.
- Changing smithy.fix template behavior beyond what is necessary to consume scenario-provided offline context.
- Forge eval scenarios, JVM fixtures, or baseline-set completeness audits owned by other M1 features.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The eval suite includes a deterministic smithy.fix scenario for the high-cost CI-log path.
- **SC-002**: The scenario passes without live GitHub network access.
- **SC-003**: The scenario validates stable structural markers for smithy.fix output.
- **SC-004**: The scenario validates expected helper evidence for the fix workflow.
- **SC-005**: The fix scenario has a committed token-aware baseline.
- **SC-006**: Future eval reports display token totals and a baseline marker for the fix scenario.

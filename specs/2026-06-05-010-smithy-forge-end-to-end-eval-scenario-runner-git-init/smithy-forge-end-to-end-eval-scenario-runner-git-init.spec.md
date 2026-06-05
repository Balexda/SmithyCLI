# Feature Specification: smithy.forge End-to-End Eval Scenario + Runner git-init

**Spec Folder**: `2026-06-05-010-smithy-forge-end-to-end-eval-scenario-runner-git-init`
**Branch**: `2026-06-05-010-smithy-forge-end-to-end-eval-scenario-runner-git-init`
**Created**: 2026-06-05
**Status**: Draft
**Input**: `docs/rfcs/2026-001-token-savings/token-savings.rfc.md` - Milestone 1 measurement-foundation feature for deterministic smithy.forge end-to-end eval coverage and temp-copy git initialization.
**Source Feature Map**: `docs/rfcs/2026-001-token-savings/01-measurement-foundation.features.md` - Feature 1.5: smithy.forge End-to-End Eval Scenario + Runner git-init (RFC SD-002)

## Clarifications

### Session 2026-06-05

- This specification targets the Dependency Order row `F4`, which corresponds to Feature 1.5 in the measurement-foundation feature map. `[Critical Assumption]`
- The scenario targets the existing JavaScript fixture. The JVM fixture and JVM forge scenario are owned by F1.6 and F1.7.
- Feature 1.3a is the prerequisite token-baseline substrate; this feature consumes its token-aware baseline schema instead of redefining token extraction or comparison.
- The runner git initialization must make the temp fixture copy a working repository with a HEAD commit before forge starts. This closes RFC SD-002 for forge-shaped scenarios.
- The current runner already initializes every temp copy as a git repository for planning-command evals. This feature tightens that into an explicit `requires_git: true` contract so git setup is requested by scenario metadata instead of by runner-wide assumption.
- The forge scenario must be deterministic, offline, and path-stable. It must not rely on live GitHub operations, a developer's global git identity, or source fixture mutation.

## Artifact Hierarchy

RFC -> Milestone -> Feature -> User Story -> Slice -> Tasks

## User Scenarios & Testing *(mandatory)*

### User Story 1: Declare Forge Scenarios That Require Git (Priority: P1)

As a Smithy maintainer, I want forge eval scenarios to declare that they need a git-backed temp copy so that runner behavior is explicit instead of inferred from command failure.

**Why this priority**: smithy.forge performs branch and commit operations. The scenario cannot be stable until the runner knows the temp copy must be a real git repository.

**Independent Test**: Load a forge scenario YAML with `requires_git: true` and verify the scenario loader preserves the flag without affecting scenarios that omit it.

**Acceptance Scenarios**:

1. **Given** a scenario YAML includes `requires_git: true`, **When** `loadScenarios` parses it, **Then** the loaded scenario exposes the git requirement to the runner.
2. **Given** existing scenarios omit `requires_git`, **When** they are loaded, **Then** they remain valid and keep their current non-git behavior.
3. **Given** a malformed `requires_git` value is present, **When** scenario loading validates the YAML, **Then** the scenario is rejected or skipped with a field-specific validation error.

---

### User Story 2: Initialize the Temp Fixture Copy for Forge (Priority: P1)

As a Smithy contributor, I want the eval runner to initialize the scenario temp copy as a clean git repository before forge starts so that forge can run its normal branch and commit workflow.

**Why this priority**: Without a git repository and baseline commit, forge fails before any meaningful eval output can be captured, leaving M2 without a forge baseline.

**Independent Test**: Run a `requires_git` scenario through the runner and verify the spawned agent sees a git worktree with a clean HEAD commit and repo-local identity.

**Acceptance Scenarios**:

1. **Given** a scenario requires git, **When** the runner copies the fixture into a temp directory, **Then** it initializes a git repository before spawning the agent.
2. **Given** the temp repository is initialized, **When** forge starts, **Then** `git status`, `git checkout -b`, and `git commit` can run without requiring the developer's global git config.
3. **Given** Smithy skills are deployed into the temp copy before execution, **When** the agent is spawned, **Then** the temp repository has a clean post-init baseline commit so forge starts from a deterministic working tree.
4. **Given** the temp repository is prepared for forge, **When** the baseline commit is created, **Then** it sits on a deterministic non-default working branch so forge's branch-creation behavior is exercised from the same starting state each run.
5. **Given** a scenario does not require git, **When** the runner executes it, **Then** the runner does not perform git setup for that scenario and existing source-fixture checksum and cleanup behavior remains unchanged.

---

### User Story 3: Run smithy.forge Against the JavaScript Fixture (Priority: P1)

As a Smithy maintainer, I want a committed forge eval scenario against the existing JavaScript fixture so that forge changes have end-to-end structural and token coverage.

**Why this priority**: M2's forge cost reductions need a measured baseline for the high-frequency forge workflow before any prompt or orchestration optimization lands.

**Independent Test**: Run only the forge scenario against the JavaScript fixture and verify it completes the slice workflow, produces a forge-shaped terminal summary, and leaves the source fixture unchanged.

**Acceptance Scenarios**:

1. **Given** the forge scenario is loaded, **When** the runner invokes it against the JavaScript fixture, **Then** it exercises `/smithy.forge` on a deterministic single-slice task file.
2. **Given** forge completes successfully, **When** structural validation runs, **Then** the output includes stable slice-completion, validation, and PR-delivery markers.
3. **Given** the source fixture checksum is recorded before execution, **When** forge modifies files inside the temp copy, **Then** the source fixture checksum remains unchanged after the scenario.
4. **Given** GitHub credentials are absent, **When** the forge scenario runs, **Then** it can still complete to the documented PR-created or PR-creation-failed terminal path without live network requirements.

---

### User Story 4: Validate Forge Sub-Agent Evidence (Priority: P1)

As a Smithy maintainer, I want the forge eval to verify the expected implementation and review helper path so that token numbers stay paired with a quality signal.

**Why this priority**: A lower token count is not useful if forge stops dispatching the work needed to implement and review the slice.

**Independent Test**: Run the forge scenario and verify sub-agent evidence checks pass for the helper agents actually required by the current forge workflow.

**Acceptance Scenarios**:

1. **Given** forge dispatches the implementation helper for a task, **When** sub-agent evidence validation runs, **Then** the report records passing evidence for `smithy-implement`.
2. **Given** forge dispatches implementation review for the slice, **When** sub-agent evidence validation runs, **Then** the report records passing evidence for `smithy-implementation-review`.
3. **Given** forge wording changes while preserving helper behavior, **When** validation runs, **Then** evidence patterns rely on stable dispatch descriptions or template markers rather than full-output snapshots.

---

### User Story 5: Commit the smithy.forge Token-Aware Baseline (Priority: P1)

As a Smithy maintainer, I want a committed forge baseline in the token-aware schema so that downstream forge optimization work can compare prompt changes against a known cost envelope.

**Why this priority**: M2's per-task reread, inline helper, and review-skip work all depend on a committed forge baseline from M1.

**Independent Test**: Run the forge scenario after F1.3a lands, refresh its baseline, and verify a subsequent eval run reports structural and token baseline checks.

**Acceptance Scenarios**:

1. **Given** the forge scenario has completed successfully, **When** its baseline is refreshed, **Then** the committed baseline records structural expectations and the token envelope for the scenario.
2. **Given** the committed forge baseline exists, **When** the scenario runs again within the token envelope, **Then** the eval report shows a passing baseline marker for the case.
3. **Given** a later forge prompt change materially increases tokens or breaks structure, **When** the scenario is compared to the baseline, **Then** the baseline checks expose the drift in the report.

### Edge Cases

- Git initialization must not read, write, or depend on the developer's global or system git config.
- Git hooks must not run inside eval temp copies.
- The temp copy may already contain files ignored by checksum logic; `.git/` must not cause source-fixture checksum drift.
- Forge can create commits and branches only inside the temp copy; source fixture content and repository metadata remain untouched.
- PR creation may fail in offline or unauthenticated environments; the scenario should accept the existing one-shot failure path when artifacts are left on disk.
- If F1.3a's token-aware baseline schema changes during implementation, this feature consumes the landed schema and does not introduce a competing baseline shape.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Declare Forge Scenarios That Require Git | — | — |
| US2 | Initialize the Temp Fixture Copy for Forge | US1 | — |
| US3 | Run smithy.forge Against the JavaScript Fixture | US2 | — |
| US4 | Validate Forge Sub-Agent Evidence | US3 | — |
| US5 | Commit the smithy.forge Token-Aware Baseline | US3, US4 | — |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The scenario schema MUST support an optional `requires_git` boolean.
- **FR-002**: Existing scenarios that omit `requires_git` MUST continue to load and run.
- **FR-003**: Malformed `requires_git` values MUST produce a clear scenario-validation error.
- **FR-004**: The forge scenario MUST declare `requires_git: true`.
- **FR-005**: The runner MUST ensure the execution temp copy is a git repository with a HEAD commit before spawning a scenario that requires git.
- **FR-006**: The runner MUST use repo-local git identity and hook-neutralizing configuration for temp-copy commits.
- **FR-007**: The runner MUST keep source-fixture checksum validation and temp-directory cleanup intact when git initialization is enabled.
- **FR-008**: Git initialization MUST be gated by the scenario's `requires_git` flag; scenarios that omit the flag MUST NOT receive git setup merely because they are loaded by the same runner.
- **FR-009**: The temp repository baseline commit MUST be created on a deterministic non-default working branch before forge is spawned.
- **FR-010**: The forge scenario MUST use the existing JavaScript fixture and a deterministic single-slice task input.
- **FR-011**: The forge scenario MUST be runnable without live GitHub credentials or network access.
- **FR-012**: Structural expectations MUST validate stable forge completion, validation, and PR-delivery markers.
- **FR-013**: Sub-agent evidence MUST validate `smithy-implement` and `smithy-implementation-review` for the observed forge path.
- **FR-014**: The system MUST commit a token-aware baseline for the forge scenario after the F1.3a baseline schema is available.
- **FR-015**: The committed baseline MUST preserve structural expectations and include a token envelope compatible with the F1.3a schema.
- **FR-016**: Unit tests MUST cover scenario loading for `requires_git`, malformed flag rejection, gated git initialization, non-default branch setup, clean post-init worktree behavior, source-fixture immutability, forge scenario loading, structural checks, sub-agent evidence checks, and baseline loading.

### Key Entities

- **Forge Eval Scenario**: The scenario definition that invokes smithy.forge against the JavaScript fixture.
- **Git Requirement Flag**: The optional scenario metadata that tells the runner the temp copy must support git operations.
- **Temp Git Repository**: The per-scenario copied fixture after git initialization and baseline commits.
- **Forge Task Input**: The deterministic single-slice task file consumed by smithy.forge.
- **Forge Baseline**: The committed token-aware baseline for the forge scenario.
- **Forge Helper Evidence Check**: The sub-agent evidence assertion proving the implementation and review helper path still ran.

## Assumptions

- Feature 1.3a lands before the forge baseline is committed, so this feature can consume the established token-envelope schema.
- The existing JavaScript fixture is sufficient for the first forge baseline; JVM coverage is deliberately deferred to F1.6/F1.7.
- The current runner's temp-copy git initialization can be reused after it is reconciled with this feature's explicit `requires_git` gating contract.
- The forge scenario should assert terminal behavior and helper evidence, not a brittle exact diff shape.
- Offline PR creation failure is acceptable only when the standard terminal output makes the artifact location and failure reason visible.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | The current runner initializes every temp copy as a git repository to support planning-command evals. This feature introduces an explicit `requires_git` scenario contract. Implementers must move forge and any other git-dependent scenarios onto the flag without regressing existing planning-command evals, and must document which existing scenarios require the flag. | Integration Points | Medium | High | open | - |
| SD-002 | The exact single-slice forge task input path is finalized at implementation time. It should reuse the existing JavaScript fixture and avoid planting unrelated language fixtures or multi-slice stories. | Scope Within Milestone | Medium | Medium | open | - |
| SD-003 | The initial token envelope for the forge baseline cannot be calibrated until F1.3a's token-aware baseline schema is available and the scenario has a clean captured run. Implementers should choose a conservative initial envelope and document the captured totals in the implementation PR. | Non-Functional Quality | Medium | Medium | open | - |

## Out of Scope

- JVM fixture creation or JVM forge scenario coverage.
- Editing F1.6's future `fixture:` scenario-selection mechanism.
- Any per-task spec reread reduction, inline helper change, or review-skip heuristic.
- Any edit to `smithy.implement.prompt`, `smithy.implementation-review.prompt`, or `smithy.forge.prompt` for cost reduction.
- New scenarios for smithy.fix, planning commands, or additional languages.
- Per-sub-agent token attribution or per-agent token baselines.
- Refreshing `.claude/` or `.smithy/` deployed snapshots.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A committed `smithy.forge` eval scenario runs against the JavaScript fixture in a git-backed temp copy.
- **SC-002**: The runner provides a clean temp git repository without relying on global git identity or hooks.
- **SC-003**: The source fixture checksum remains unchanged after forge modifies the temp copy.
- **SC-004**: Scenarios without `requires_git` continue to run without runner git setup.
- **SC-005**: The eval report includes structural pass/fail checks for forge completion, validation, and PR-delivery markers.
- **SC-006**: The eval report includes sub-agent evidence checks for `smithy-implement` and `smithy-implementation-review`.
- **SC-007**: A token-aware `forge-tdd-slice` baseline is committed and passes against a clean scenario run.
- **SC-008**: Unit tests cover the scenario loader, runner git behavior, offline scenario behavior, validation checks, and baseline compatibility paths.

# Tasks: Add the Forge-JVM Eval Scenario

**Source**: `specs/2026-06-06-012-forge-jvm-eval-scenario-m1-baseline-set-completeness-gate/forge-jvm-eval-scenario-m1-baseline-set-completeness-gate.spec.md` — User Story 1
**Data Model**: `specs/2026-06-06-012-forge-jvm-eval-scenario-m1-baseline-set-completeness-gate/forge-jvm-eval-scenario-m1-baseline-set-completeness-gate.data-model.md`
**Contracts**: `specs/2026-06-06-012-forge-jvm-eval-scenario-m1-baseline-set-completeness-gate/forge-jvm-eval-scenario-m1-baseline-set-completeness-gate.contracts.md`
**Story Number**: 01

---

## Slice 1: Load Forge Scenarios With Fixture Metadata
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: The eval scenario model, YAML loader, and runner preserve the fixture selector and git-init opt-in required by Forge-JVM scenarios.

**Justification**: This slice is a standalone platform increment: after it lands, scenario files can declare `fixture: jvm` and `requires_git: true` without being silently downgraded to default behavior. It does not author the JVM forge scenario yet, so the fixture and git contracts become observable through loader/runner coverage before the end-to-end forge case is introduced.

**Addresses**: FR-002, FR-003; AS 1.1, AS 1.2

### Tasks

- [ ] **Extend scenario metadata for fixture selection**

  Update the eval scenario types and loader in `evals/lib/types.ts` and `evals/lib/scenario-loader.ts` so YAML declarations may carry the Forge-JVM scenario fields from the Forge-JVM Scenario entity. Keep existing scenarios valid when they omit optional fields, while rejecting invalid metadata clearly for AS 1.1.

  _Acceptance criteria:_
  - Scenario loading preserves a valid `fixture: jvm` declaration.
  - Scenario loading preserves a valid `requires_git: true` declaration.
  - Existing committed YAML scenarios still load without fixture fields.
  - Invalid fixture metadata fails with a named scenario-file validation error.
  - Loader coverage includes the JVM fixture metadata path.

- [ ] **Route runner preparation through scenario metadata**

  Update `evals/lib/runner.ts` so scenario preparation consumes fixture and git metadata when building the temp execution context. Preserve the F1.5 git initialization behavior for forge scenarios and make unavailable JVM fixture selection fail clearly for AS 1.2.

  _Acceptance criteria:_
  - Runner preparation uses scenario fixture metadata instead of silently falling back to the JavaScript fixture.
  - A missing or unsupported JVM fixture produces an actionable preparation failure.
  - `requires_git` scenarios enter the agent invocation with an initialized repository.
  - Scenarios that omit `requires_git` keep their existing runner behavior.
  - Runner coverage exercises both metadata-driven fixture selection and git preparation.

**PR Outcome**: Eval scenario loading and temp-copy preparation understand the Forge-JVM scenario metadata, preserving the F1.6 fixture selector and F1.5 git-init opt-in without changing existing scenario behavior.

---

## Slice 2: Declare the Forge-JVM Eval Case
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: `forge-tdd-slice-jvm` exists as a loadable YAML eval scenario that targets the JVM fixture and forge workflow.

**Justification**: This slice adds the user-visible JVM forge scenario once the loader and runner understand the metadata it needs. It is independently reviewable because the observable deliverable is one canonical case plus focused load/selection coverage, not a committed baseline or M1 audit gate.

**Addresses**: FR-001, FR-002, FR-003, FR-004; AS 1.1, AS 1.2, AS 1.4

### Tasks

- [ ] **Author the JVM forge scenario YAML**

  Add `evals/cases/forge-tdd-slice-jvm.yaml` following the Forge-JVM Scenario Declaration contract and the existing eval case conventions. The scenario should invoke `/smithy.forge`, select the JVM fixture, opt into git setup, and use a forge task-file prompt that exercises the committed JVM fixture for AS 1.1, AS 1.2, and AS 1.4.

  _Acceptance criteria:_
  - `evals/cases/forge-tdd-slice-jvm.yaml` declares `name: forge-tdd-slice-jvm`.
  - The scenario selects `fixture: jvm` and opts into git setup.
  - The scenario uses the slash-command forge skill form required by the contract.
  - The prompt targets a JVM-fixture forge slice rather than the JavaScript fixture.
  - `loadScenarios` discovers the new scenario without warnings.

- [ ] **Cover JVM scenario loading and selection**

  Add focused tests around the committed Forge-JVM YAML case and scenario selection path. The tests should verify the case loads with JVM metadata and remains independently selectable by `npm run eval -- --case forge-tdd-slice-jvm` for AS 1.1.

  _Acceptance criteria:_
  - The committed YAML case is included in loader coverage.
  - The loaded case preserves the JVM fixture selector and git requirement.
  - Case filtering can select `forge-tdd-slice-jvm` without selecting forge-JS.
  - Existing strike, cut, mark, render, ignite, spark, and audit scenario loads remain unchanged.

**PR Outcome**: The eval suite has a canonical, independently addressable Forge-JVM case that loads as `forge-tdd-slice-jvm` and targets the JVM fixture with forge-ready git setup.

---

## Slice 3: Validate Forge-JVM Structural Completion
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: The Forge-JVM scenario verifies forge slice completion with structural and helper evidence equivalent in intent to the JavaScript forge scenario.

**Justification**: This slice closes the behavior of US1 by making the JVM scenario prove an end-to-end forge repair against the JVM fixture. It stays separate from the baseline commit so the scenario's runtime and structural evidence can stabilize before US2 snapshots token data.

**Addresses**: FR-004, FR-005, FR-015; AS 1.3, AS 1.4

### Tasks

- [ ] **Add JVM forge structural expectations**

  Extend `evals/cases/forge-tdd-slice-jvm.yaml` with structural expectations and sub-agent evidence aligned with the JavaScript forge scenario's intent. Keep the checks focused on forge slice-completion markers and expected helper evidence, leaving F1.5's structural expectation design owned by the existing forge-JS contract for AS 1.3.

  _Acceptance criteria:_
  - Structural expectations cover forge slice completion for AS 1.3.
  - Sub-agent evidence covers the expected forge helper path for the JVM scenario.
  - The expectations do not redesign or weaken the JavaScript forge scenario contract.
  - Pattern checks remain structural markers rather than long prose snapshots.

- [ ] **Exercise the JVM fixture end to end**

  Add or update eval tests so the Forge-JVM scenario can run against the committed JVM fixture and validate the deterministic evidence available from the runner. Keep this work scoped to scenario execution and validation; do not commit a Forge-JVM baseline in this slice because US2 owns the baseline artifact.

  _Acceptance criteria:_
  - `npm run eval -- --case forge-tdd-slice-jvm` exercises only the JVM forge scenario.
  - A successful run demonstrates the JVM fixture can drive an end-to-end forge slice for AS 1.4.
  - Failure output names the missing JVM fixture, git setup, or structural marker when preparation or validation fails.
  - No `evals/baselines/forge-tdd-slice-jvm.json` file is committed by this story.
  - `.claude/` and `.smithy/` snapshots remain unchanged.

**PR Outcome**: `forge-tdd-slice-jvm` runs as a JVM-fixture forge eval and validates forge completion evidence, ready for US2 to capture the token-aware baseline.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: The baseline-set audit format is specified functionally but not tied to a specific implementation surface. Implementers may extend an existing eval/baseline test, add a dedicated audit helper, or encode the gate in scenario-level tests, provided missing required baselines fail clearly and planning-command baselines remain informational. | Integration | Medium | Medium | inherited | — |
| SD-002 | inherited from spec: The feature map allows the JVM forge scenario to be either a second YAML file or a fixture-parameterized run of the existing forge scenario. This spec chooses the separate `forge-tdd-slice-jvm` scenario for independent baseline identity; if implementation discovers the runner already supports parameterized cases more cleanly, preserve the canonical scenario/baseline identity in reports. | Functional Scope | Low | Medium | inherited | — |

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Load Forge Scenarios With Fixture Metadata | — | — |
| S2 | Declare the Forge-JVM Eval Case | S1 | — |
| S3 | Validate Forge-JVM Structural Completion | S2 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Commit the Forge-JVM Token Baseline | depended upon by | US2 depends on a successful `forge-tdd-slice-jvm` scenario from this story before it can generate and commit the token-aware baseline. |
| User Story 3: Audit M1 Baseline-Set Completeness | depended upon by | US3 depends on the Forge-JVM scenario and the US2 baseline before the M1 required-baseline audit can gate on forge-JVM. |
| User Story 4: Preserve Milestone Ownership Boundaries | depended upon by | US4 reviews the aggregate feature diff after US1, US2, and US3 establish the scenario, baseline, and audit scope. |

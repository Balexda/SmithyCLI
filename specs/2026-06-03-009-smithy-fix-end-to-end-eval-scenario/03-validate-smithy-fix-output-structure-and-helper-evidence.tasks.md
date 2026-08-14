# Tasks: Validate smithy.fix Output Structure and Helper Evidence

**Source**: `specs/2026-06-03-009-smithy-fix-end-to-end-eval-scenario/smithy-fix-end-to-end-eval-scenario.spec.md` — User Story 3
**Data Model**: `specs/2026-06-03-009-smithy-fix-end-to-end-eval-scenario/smithy-fix-end-to-end-eval-scenario.data-model.md`
**Contracts**: `specs/2026-06-03-009-smithy-fix-end-to-end-eval-scenario/smithy-fix-end-to-end-eval-scenario.contracts.md`
**Story Number**: 03

---

## Slice 1: Calibrated smithy.fix Validation Checks
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Strengthen the `fix-from-issue` eval so its report verifies diagnosis, fix, verification, and any observed helper-agent evidence from the offline smithy.fix path.

**Justification**: US2 made the scenario runnable from local fixtures. This slice turns that run into a durable quality signal while avoiding brittle full-output snapshots and avoiding fabricated helper checks when the exercised path dispatches none.

**Addresses**: FR-007, FR-008, FR-013; Acceptance Scenarios 3.1, 3.2, 3.3

### Tasks

- [ ] **Calibrate structural workflow markers**

  Update the `fix-from-issue` scenario expectations so validation checks stable diagnosis, fix-action, and verification evidence produced by the offline run. Keep markers tied to workflow sections, labels, or fixture-specific evidence instead of a complete response snapshot.

  _Acceptance criteria:_
  - The scenario report can pass structural validation for AS 3.1.
  - Required markers cover diagnosis, fix action, and verification result evidence.
  - The checks remain resilient to wording changes that preserve the workflow for AS 3.3.
  - Existing local fixture declaration and invocation behavior remains unchanged.

- [ ] **Calibrate helper evidence from observed dispatches**

  Run or inspect the offline `fix-from-issue` path and record helper evidence only for helpers that actually dispatch. If the current error-description path dispatches no helpers, leave helper evidence empty or omitted and document that choice on the scenario surface.

  _Acceptance criteria:_
  - Helper evidence validation passes for each observed helper for AS 3.2.
  - A no-helper offline path does not fail because of fabricated expectations.
  - Helper patterns use stable dispatch or result evidence rather than agent-name-only matches.
  - The inherited helper-set uncertainty from spec SD-001 is resolved by observed behavior.

- [ ] **Lock scenario validation coverage**

  Add focused coverage that exercises the `fix-from-issue` structural expectations and the helper-evidence branch selected during calibration. The coverage should prove the report path emits the expected pass/fail checks without requiring live GitHub credentials.

  _Acceptance criteria:_
  - Unit or integration coverage exercises structural checks for AS 3.1.
  - Coverage exercises helper evidence checks when helpers are declared, or the empty-helper path when none are declared.
  - The scenario remains runnable without `GH_TOKEN`, `GITHUB_TOKEN`, or live GitHub CLI access.
  - Baseline data remains out of scope for US4.

**PR Outcome**: The `fix-from-issue` eval report carries calibrated structural checks and empirically grounded helper evidence for the offline smithy.fix workflow.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

_None — no specification debt was recorded._

---

## Open Implementation Questions
<!-- audience: builder; mode: reference; length: one table row per question; diagram: optional; examples: discouraged -->

| ID | Question | Slice | Settled By | Origin |
|----|----------|-------|------------|--------|
| IQ-001 | Which helper agents, if any, does the offline fix path dispatch? | S1 | testing | spec:SD-001 |

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Calibrated smithy.fix Validation Checks | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Provide Offline smithy.fix Fixtures | depends on | US3 validates output produced from the committed issue and CI-log fixture files authored by US1. |
| User Story 2: Run smithy.fix Against Local Failure Evidence | depends on | US3 strengthens the `fix-from-issue` scenario and runner behavior delivered by US2. |
| User Story 4: Commit the smithy.fix Token-Aware Baseline | depended upon by | US4 captures a token-aware baseline after US3's structural and helper checks are calibrated. |

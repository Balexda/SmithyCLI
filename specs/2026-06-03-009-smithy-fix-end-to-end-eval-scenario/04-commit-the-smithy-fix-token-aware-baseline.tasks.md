# Tasks: Commit the smithy.fix Token-Aware Baseline

**Source**: `specs/2026-06-03-009-smithy-fix-end-to-end-eval-scenario/smithy-fix-end-to-end-eval-scenario.spec.md` — User Story 4
**Data Model**: `specs/2026-06-03-009-smithy-fix-end-to-end-eval-scenario/smithy-fix-end-to-end-eval-scenario.data-model.md`
**Contracts**: `specs/2026-06-03-009-smithy-fix-end-to-end-eval-scenario/smithy-fix-end-to-end-eval-scenario.contracts.md`
**Story Number**: 04

---

## Slice 1: fix-from-issue Token-Aware Baseline
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Commit the `fix-from-issue` baseline in the token-aware schema and pin it with coverage so the smithy.fix eval reports structural and token baseline checks on later runs.

**Justification**: US1-US3 provide deterministic local evidence, offline invocation, and calibrated workflow checks. This slice captures the known-good output and token envelope as the final downstream comparison point for M3 token-reduction work.

**Addresses**: FR-011, FR-012, FR-013; Acceptance Scenarios 4.1, 4.2, 4.3

### Tasks

- [x] **Capture a clean smithy.fix baseline run**

  Run the `fix-from-issue` scenario after US3's structural and helper checks are present, using the repository-local issue and CI-log fixtures. Record the structural baseline data and observed token totals from a clean run without relying on live GitHub credentials.

  _Acceptance criteria:_
  - The captured run satisfies the scenario's structural expectations for AS 4.1.
  - Captured token totals include the input and output values required by the token-aware baseline schema.
  - The run uses the local fixture evidence and remains compatible with machines that lack GitHub credentials.
  - Any calibration note needed for the initial token envelope is captured in the implementation PR rather than in deployed prompt templates.

- [x] **Commit the fix-from-issue baseline file**

  Add the `fix-from-issue` baseline under the existing eval baseline directory using the F1.3a token-aware schema. Preserve the scenario name, structural expectations, and a conservative token envelope that passes for the clean captured run while still exposing material token drift.

  _Acceptance criteria:_
  - The committed baseline loads for scenario name `fix-from-issue` for AS 4.1.
  - The baseline includes structural expectations and token envelope bounds for FR-012.
  - The token envelope is compatible with the existing baseline loader and comparator.
  - Scenario name mismatches, malformed token envelopes, and missing baseline data continue to fail or skip according to the baseline contract.

- [x] **Pin baseline compatibility and report behavior**

  Add focused coverage that proves the committed `fix-from-issue` baseline loads, compares successfully against the captured known-good output, and causes the eval report to show a passing baseline marker when the live run remains inside the envelope.

  _Acceptance criteria:_
  - Coverage exercises baseline loading for the committed `fix-from-issue` file for FR-013.
  - Coverage proves the baseline comparison passes against the known-good smithy.fix output for AS 4.2.
  - Coverage proves structural or token drift can produce failing baseline checks for AS 4.3.
  - Existing scenarios without baselines keep the current `baseline: n/a` or no-marker behavior.

**PR Outcome**: The `fix-from-issue` eval has a committed token-aware baseline, and subsequent eval reports can expose both structural and token drift from the known high-cost smithy.fix path.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

_None — no specification debt was recorded._

---

## Open Implementation Questions
<!-- audience: builder; mode: reference; length: one table row per question; diagram: optional; examples: discouraged -->

| ID | Question | Slice | Settled By | Origin |
|----|----------|-------|------------|--------|
| IQ-001 | What token envelope bounds does a clean offline `fix-from-issue` run support? | S1 | testing | spec:SD-002 |

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | fix-from-issue Token-Aware Baseline | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Provide Offline smithy.fix Fixtures | depends on | US4 captures the baseline from the committed issue and CI-log evidence authored by US1. |
| User Story 2: Run smithy.fix Against Local Failure Evidence | depends on | US4 depends on the offline `fix-from-issue` scenario and local fixture injection delivered by US2. |
| User Story 3: Validate smithy.fix Output Structure and Helper Evidence | depends on | US4 preserves the structural and helper expectations calibrated by US3 in the committed baseline. |

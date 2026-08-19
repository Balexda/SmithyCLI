# Tasks: Refresh the Strike Baseline in the Token-Aware Schema

**Source**: `specs/2026-05-18-007-per-case-token-totals-in-evalreport/per-case-token-totals-in-evalreport.spec.md` — User Story 4
**Data Model**: `specs/2026-05-18-007-per-case-token-totals-in-evalreport/per-case-token-totals-in-evalreport.data-model.md`
**Contracts**: `specs/2026-05-18-007-per-case-token-totals-in-evalreport/per-case-token-totals-in-evalreport.contracts.md`
**Story Number**: 04

---

## Slice 1: Token-Aware Strike Baseline
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Refresh the committed `strike-health-check` baseline into the token-aware schema and pin it with coverage so subsequent strike evals report both structural and token baseline checks.

**Justification**: US1-US3 already capture token totals, render them, and compare them against optional token envelopes. The existing strike baseline is the first committed eval baseline in this feature's path, so refreshing it is a data-and-coverage slice that proves the schema works on a real scenario without changing the baseline framework.

**Addresses**: FR-013, FR-014, FR-015; Acceptance Scenarios 4.1, 4.2, 4.3

### Tasks

- [x] **Capture fresh strike baseline evidence**

  Run the `strike-health-check` scenario after the token-aware eval pipeline is present and record the successful text output plus the measured input and output token totals. Preserve the existing scenario setup and structural expectations so the refreshed data remains tied to the current strike eval case for AS 4.1 and AS 4.2.

  _Acceptance criteria:_
  - The captured run satisfies the strike scenario's required structural expectations.
  - The captured run exposes non-negative input and output token totals.
  - The evidence is stored in the existing eval capture locations used by seeded-baseline tests.
  - The implementation PR documents the observed totals and the rationale for the initial envelope bounds.

- [x] **Refresh the strike baseline file**

  Update `evals/baselines/strike-health-check.json` to include the optional token envelope defined by the F1.3a baseline schema. Keep the scenario name, captured timestamp, headings, and tables aligned with the refreshed known-good output so structural comparison continues to validate the same baseline contract.

  _Acceptance criteria:_
  - The committed baseline loads for scenario name `strike-health-check`.
  - The baseline preserves the structural headings and tables required for AS 4.2.
  - The baseline includes a token envelope with valid input and output bounds.
  - The token envelope passes for the refreshed captured totals and is broad enough for normal provider variance.
  - Malformed token envelope behavior remains covered by the existing baseline-loader validation paths.

- [x] **Pin strike baseline comparison and report behavior**

  Extend seeded-baseline and report coverage so the refreshed strike baseline compares successfully against the captured output with live token totals, and so a token-envelope miss fails through the existing baseline check and report-marker path for AS 4.3.

  _Acceptance criteria:_
  - Coverage proves the committed strike baseline includes a token envelope.
  - Coverage proves structural checks still pass against the known-good strike output.
  - Coverage proves live token totals inside the envelope produce a passing token baseline check.
  - Coverage proves live token totals outside the envelope produce a failing token baseline check.
  - Coverage proves the formatted strike report can show token totals and a passing baseline marker together for AS 4.1.

**PR Outcome**: The `strike-health-check` baseline is committed in the token-aware schema, its structural expectations remain intact, and tests prove token envelope drift affects the existing baseline marker path.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

_None — no specification debt was recorded._

---

## Open Implementation Questions
<!-- audience: builder; mode: reference; length: one table row per question; diagram: optional; examples: discouraged -->

| ID | Question | Slice | Settled By | Origin |
|----|----------|-------|------------|--------|
| IQ-001 | What conservative input and output envelope bounds does a clean `strike-health-check` run support? | S1 | testing | spec:SD-002 |

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Token-Aware Strike Baseline | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Capture Per-Case Token Totals | depends on | US4 needs live per-case input and output totals from the strike scenario before a token envelope can be calibrated. |
| User Story 2: Render Token Totals in Eval Reports | depends on | US4 verifies the refreshed strike report line shows token totals alongside the baseline marker. |
| User Story 3: Extend Baselines with Token Envelopes | depends on | US4 consumes the optional token envelope loader and comparator rather than redefining baseline schema behavior. |

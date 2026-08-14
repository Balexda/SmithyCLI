# Tasks: Extend Baselines with Token Envelopes

**Source**: `specs/2026-05-18-007-per-case-token-totals-in-evalreport/per-case-token-totals-in-evalreport.spec.md` — User Story 3
**Data Model**: `specs/2026-05-18-007-per-case-token-totals-in-evalreport/per-case-token-totals-in-evalreport.data-model.md`
**Contracts**: `specs/2026-05-18-007-per-case-token-totals-in-evalreport/per-case-token-totals-in-evalreport.contracts.md`
**Story Number**: 03

---

## Slice 1: Load Optional Token Envelopes from Baselines
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Extend baseline data loading so committed baseline JSON may include an optional token envelope without invalidating structural-only baselines. After this PR, loaded `Baseline` values expose validated token bounds when present and omit them when absent.

**Justification**: Baseline loading owns schema compatibility and validation. Landing the optional envelope first keeps old baselines valid while giving comparison code a typed, trustworthy contract to consume in the next slice.

**Addresses**: FR-001, FR-010, FR-012, FR-015; Acceptance Scenario 3.3

### Tasks

- [ ] **Declare token envelope baseline types**

  Extend the eval baseline model in `evals/lib/types.ts` with the optional token envelope shape from the data model. Reuse the existing token-total terminology so live results and committed bounds describe the same input and output dimensions.

  _Acceptance criteria:_
  - `TokenEnvelope` supports optional input and output ranges.
  - Each present range requires finite non-negative integer `min` and `max` bounds.
  - `Baseline` accepts an optional token envelope without requiring it.
  - Existing type exports remain import-compatible for current eval modules.

- [ ] **Validate token envelopes during baseline loading**

  Update `loadBaseline` in `evals/lib/baseline.ts` so structural-only baselines still load, valid token envelopes are preserved, and malformed token bounds reject the baseline instead of producing misleading drift checks.

  _Acceptance criteria:_
  - Baselines without `token_envelope` continue to load successfully.
  - Valid input-only, output-only, and input-plus-output envelopes load successfully.
  - Missing range bounds, non-numeric, fractional, negative, non-finite, or inverted bounds fail validation.
  - Unknown baseline fields remain ignored outside the supported schema.
  - Unit coverage verifies structural-only compatibility and valid/invalid envelope loading.

**PR Outcome**: The baseline loader understands optional token envelopes while preserving existing structural-only baseline behavior.

---

## Slice 2: Compare Live Tokens Against Baseline Envelopes
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Emit token baseline check results when a loaded baseline defines token bounds, using live per-case token totals carried by `EvalResult` assembly. After this PR, token drift contributes to existing baseline markers without replacing structural checks.

**Justification**: Token comparison is independently useful only after envelopes load correctly. This slice wires the already captured live totals into baseline comparison and keeps report status behavior under the existing check-result mechanism.

**Addresses**: FR-010, FR-011, FR-012, FR-015; Acceptance Scenarios 3.1, 3.2, 3.3

### Tasks

- [ ] **Emit token envelope check results**

  Extend `compareToBaseline` so a baseline with a token envelope produces one baseline check for the live token totals. The check must pass only when every defined input and output range contains the corresponding live total, and it must include expected bounds and actual totals when it fails.

  _Acceptance criteria:_
  - Baselines without token envelopes emit only structural checks.
  - Token-aware baselines emit an additional token check result.
  - Live totals inside every defined range produce a passing token check.
  - Live totals below `min` or above `max` produce a failing token check.
  - Missing live tokens for a token-aware baseline produce a failing token check.
  - Existing structural heading, table, and summary checks keep their ordering and behavior.
  - Unit coverage verifies passing, failing, skipped, and missing-live-token paths.

- [ ] **Pass scenario tokens into baseline comparison**

  Update the eval runner/report assembly boundary so `run-evals` passes each scenario output's token totals into `compareToBaseline`. Preserve existing baseline marker rendering and status precedence so token check failures flow through the current baseline-check failure path.

  _Acceptance criteria:_
  - `run-evals` supplies live token totals when comparing a token-aware baseline.
  - Structural-only baselines remain compatible and do not require live token data.
  - A failing token check makes the scenario result fail through existing baseline check precedence.
  - Timeout and non-zero-exit results still preserve available live token totals before comparison.
  - Unit coverage verifies token baseline failures affect result status through existing baseline wiring.

**PR Outcome**: Baseline comparison can flag token drift alongside structural drift, while structural-only baselines remain loadable and comparable.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Title | Source Category | Impact | Confidence | Origin |
|----|-------|-----------------|--------|------------|--------|
| SD-001 | Stream usage placement | Integration | High | Medium | spec:SD-001 |
| SD-002 | Token envelope tolerance | Non-Functional Quality | Medium | Medium | spec:SD-002 |
| SD-003 | RFC touched-files matrix | Integration | Medium | High | spec:SD-003 |

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Load Optional Token Envelopes from Baselines | — | — |
| S2 | Compare Live Tokens Against Baseline Envelopes | S1 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Capture Per-Case Token Totals | depends on | US3 compares committed envelopes against the live token totals captured and carried by US1. |
| User Story 2: Render Token Totals in Eval Reports | independent sibling | US2 controls formatted per-case token rendering. US3 only affects baseline checks and markers. |
| User Story 4: Refresh the Strike Baseline in the Token-Aware Schema | depended upon by | US4 should refresh the strike baseline only after token-aware loading and comparison are implemented. |

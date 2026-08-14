# Tasks: Render Token Totals in Eval Reports

**Source**: `specs/2026-05-18-007-per-case-token-totals-in-evalreport/per-case-token-totals-in-evalreport.spec.md` — User Story 2
**Data Model**: `specs/2026-05-18-007-per-case-token-totals-in-evalreport/per-case-token-totals-in-evalreport.data-model.md`
**Contracts**: `specs/2026-05-18-007-per-case-token-totals-in-evalreport/per-case-token-totals-in-evalreport.contracts.md`
**Story Number**: 02

---

## Slice 1: Render Per-Case Token Totals in Reports
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Display each scenario's measured input and output token totals on the formatted eval report case line. After this PR, contributors can see per-case token cost in stdout for passing, failing, timeout, and error cases without changing aggregate pass/fail summary semantics.

**Justification**: User Story 1 already carries token totals through `EvalResult` and `EvalReport`. Rendering is the remaining user-facing report surface, and it can land as one focused slice in `formatReport` plus report documentation because it does not require revisiting stream extraction, result assembly, or baseline comparison.

**Addresses**: FR-007, FR-008, FR-009, FR-015; Acceptance Scenarios 2.1, 2.2, 2.3

### Tasks

- [ ] **Render token totals on every case line**

  Update `evals/lib/report.ts` so `formatReport` includes each result's token totals on every per-case line in the contract shape `input: <N>, output: <N>`. Preserve the existing status token, scenario name, duration, final elapsed line, and final result line behavior for AS 2.1 and AS 2.2.

  _Acceptance criteria:_
  - Passing case lines display their input and output token counts.
  - Failing, timeout, and error case lines display token counts without changing their status tokens.
  - The aggregate `Total elapsed:` and `Result:` lines remain unchanged.
  - Empty reports remain well formed and do not invent case lines.
  - Unit coverage verifies per-case token rendering for pass, fail, timeout, and error results.

- [ ] **Keep baseline markers visible with token totals**

  Extend the report-formatting coverage for baseline-enabled reports so token totals and baseline markers both appear on the relevant case lines. Keep the existing rule that baseline markers render for all cases only when at least one result carries baseline checks.

  _Acceptance criteria:_
  - Token totals render for cases with passing baseline checks.
  - Token totals render for cases with failing baseline checks.
  - Token totals render for no-baseline cases when another case enables baseline marker rendering.
  - Existing `baseline: PASS`, `baseline: FAIL`, and `baseline: n/a` marker semantics remain unchanged.
  - Unit coverage verifies AS 2.3 without depending on token-aware baseline envelopes from User Story 3.

- [ ] **Refresh eval report documentation examples**

  Update `evals/README.md` report examples and surrounding prose so contributors see the token-total line shape when reading the eval workflow documentation. Keep the documentation scoped to formatted report output; do not document token envelopes or token-delta workflows owned by other stories.

  _Acceptance criteria:_
  - README report examples include `input: <N>, output: <N>` on per-case lines.
  - Documentation still explains the existing status tokens and baseline marker behavior.
  - Documentation does not imply aggregate summary status or baseline comparison behavior changed in this slice.

**PR Outcome**: Formatted eval reports expose per-case input and output token totals alongside the existing duration and baseline marker fields, with status and summary rendering protected by focused tests.

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
| S1 | Render Per-Case Token Totals in Reports | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Capture Per-Case Token Totals | depends on | US2 renders the per-case token totals already captured and carried through report data by US1. |
| User Story 3: Extend Baselines with Token Envelopes | independent sibling | US2 preserves existing baseline marker visibility but does not implement token envelope loading or comparison. |
| User Story 4: Refresh the Strike Baseline in the Token-Aware Schema | depended upon by | US4 expects report lines to show token totals after the strike baseline is refreshed. |

# Tasks: Cost and Time Transparency

**Source**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md` — User Story 11
**Data Model**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md`
**Contracts**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md`
**Story Number**: 11

---

## Slice 1: Surface Per-Case and Total Durations in Eval Output

**Goal**: Extend `formatReport` in `evals/lib/report.ts` to render per-case durations on each result line and a total elapsed-time line in the aggregate summary, and print a pre-execution "Running N case(s)" line in `evals/run-evals.ts` before scenario execution begins. After this PR, `npm run eval` shows the number of cases up front and displays per-case plus total wall-clock timings in the final summary.

**Justification**: US9 Slice 2 already captures every value US11 needs — `total_duration_ms` is stored on `EvalReport` and per-case `duration_ms` is stored on each `EvalResult`. This slice is purely presentational: it reveals existing data. All behavior is localized to two files (`report.ts` and `run-evals.ts`), sits entirely atop stable interfaces, and ships as a single PR with unit-test coverage on the formatter. No new types, no new data flow, no orchestrator restructuring — the smallest possible diff that delivers both acceptance scenarios.

**Addresses**: FR-009; Acceptance Scenarios 11.1, 11.2

### Tasks

- [x] **Render per-case and total durations in `formatReport`**

  Extend the pure `formatReport` function in `evals/lib/report.ts` so the returned string exposes wall-clock timings the caller already provides on `EvalReport`. Each per-case line must include the result's `duration_ms`, and the aggregate section must include a total elapsed-time line sourced from `report.total_duration_ms`. Output must remain deterministic and stable — existing status-token placement (`PASS`/`FAIL`/`TIMEOUT`/`ERROR`) and the existing `Result: …` aggregate line must be preserved so that prior snapshot-style assertions in `report.test.ts` continue to locate their anchors. The function remains pure: no `console.log`, no mutation of `report`.

  _Acceptance criteria:_
  - `formatReport` reads `duration_ms` from every `EvalResult` in `report.results` and renders it on that case's line alongside the status token and scenario name
  - `formatReport` reads `total_duration_ms` from the top-level `EvalReport` and renders it on a total-elapsed line in the aggregate section
  - Duration values are displayed with a clear unit suffix (milliseconds or seconds — pick one convention and apply it uniformly to per-case and total lines)
  - The existing overall-result line (`Result: PASS (N/M passed, …)`) remains present and parseable by existing tests
  - Output ordering within `report.results` is unchanged — per-case lines still appear in the order `buildReport` returned them
  - Function remains pure (no I/O, no mutation of the `report` argument)
  - Unit tests cover: (a) single passing case duration rendering, (b) mixed-status report with total-duration rendering, (c) empty `results` array still renders a valid summary with a zero-or-placeholder total
  - Existing `report.test.ts` assertions for `PASS` / `FAIL` / `TIMEOUT` / `ERROR` token placement and the overall-result line continue to pass

- [x] **Print pre-execution case count in `run-evals.ts`**

  Emit a "Running N case(s)" status line from `evals/run-evals.ts` before invoking `runScenario`, satisfying AS 11.1. The count must be derived from an explicit variable — not hardcoded to `1` — so that US7's YAML scenario loading can replace the single scenario with an N-element list and this line automatically reports the correct count with no further change. The existing per-scenario intro block (`Running scenario: …`, `Skill:`, `Prompt:`, `Fixture:`, `Timeout:`) remains unchanged below the new line. Preflight and fixture-validation failures must still short-circuit before the count is printed — the count line only appears after the runner has committed to executing at least one case.

  _Acceptance criteria:_
  - A new line appears before the existing `Running scenario: …` block showing the total number of cases to run (for now, always 1; after US7 it will reflect the loaded YAML count)
  - The count is sourced from an explicit variable or expression (e.g., `scenarios.length` or equivalent), not a hardcoded literal, so US7 needs zero edits to this line
  - Placement is after successful `preflight()` and fixture-directory validation — failures in either still exit before the count is printed
  - Existing per-scenario intro output (`Running scenario`, `Skill`, `Prompt`, `Fixture`, `Timeout`) is preserved unchanged below the new line
  - `npm run eval` output shows the new line in the expected position; `npm run test:evals` remains green
  - No new imports or module-level state beyond what's required to express the count

**PR Outcome**: `npm run eval` prints a "Running N case(s)" line up front and the final summary shows each case with its individual duration plus a total elapsed-time line. Both acceptance scenarios of US11 are satisfied additively — no existing behavior is removed or restructured. US7's future YAML scenario loading needs zero changes to this output path because the case count is already variable-driven and the summary already reads `total_duration_ms` from `EvalReport`.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

| ID | Title                                                       | Depends On | Artifact |
|----|-------------------------------------------------------------|------------|----------|
| S1 | Surface Per-Case and Total Durations in Eval Output         | —          | —        |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 9: Eval Summary Report | depends on | US9 Slice 2 already wires `scenarioRunToResult`, `buildReport`, and `formatReport` into `run-evals.ts` and captures `total_duration_ms` plus per-case `duration_ms`. US11 is purely additive presentation on top of that infrastructure. |
| User Story 7: Define Eval Scenarios Declaratively | depended upon by | US7 will replace the single-scenario array fed to `buildReport` with an N-element array loaded from YAML. The "Running N case(s)" line authored here must source its count from a variable (not a hardcoded `1`) so US7 needs no edits to this output path. |

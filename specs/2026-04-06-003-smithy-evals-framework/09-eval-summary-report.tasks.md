# Tasks: Eval Summary Report

**Source**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md` — User Story 9
**Data Model**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md`
**Contracts**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md`
**Story Number**: 09

---

## Slice 1: Report Library — Types, Status Derivation, Aggregation, Formatting

**Goal**: Ship a pure, fully unit-testable `evals/lib/report.ts` module plus the `EvalReport` type declaration in `evals/lib/types.ts`. The module exports `scenarioRunToResult` (status precedence), `buildReport` (aggregation over `EvalResult[]`), and `formatReport` (stdout string rendering). No orchestrator changes yet.

**Justification**: The report library has no I/O, no process exit, no CLI parsing — it can be verified end-to-end via unit tests before the orchestrator is touched. Every behavioral requirement of US9 is exercised here through tests over synthetic `EvalResult[]` inputs. This mirrors the US4 pattern (`structural.ts` tested standalone before being wired into `run-evals.ts`) and gives Slice 2 a stable module to import. Centralizing status derivation in `scenarioRunToResult` also eliminates the precedence rule duplication risk US5/US6/US7 would otherwise inherit.

**Addresses**: FR-009; Acceptance Scenarios 9.1, 9.2, 9.3

### Tasks

- [x] **Declare `EvalReport` aggregate type in `types.ts`**

  Add an `EvalReport` interface to `evals/lib/types.ts` matching the data model entity. It must expose enough shape for `buildReport` and `formatReport` to satisfy AS 9.1 and 9.2 — an ISO 8601 timestamp, total/passed/failed counts, overall status, the underlying `EvalResult[]`, and total wall-clock duration in milliseconds.

  _Acceptance criteria:_
  - Exported from `evals/lib/types.ts` alongside existing `EvalResult` and `CheckResult`
  - Fields match the data-model entity table (see `smithy-evals-framework.data-model.md` §EvalReport)
  - `overall_status` is typed as `'pass' | 'fail'` (not `string`)
  - No runtime logic introduced; existing exports unchanged
  - Type is importable from `./types.js` by both `report.ts` and `run-evals.ts`

- [x] **Implement `scenarioRunToResult` status-derivation helper**

  Create `evals/lib/report.ts` and export a pure function that assembles an `EvalResult` from a `RunOutput`, the scenario, and the computed check arrays. Status precedence (required by AS 9.3): `timed_out` → `timeout`; otherwise non-zero `exit_code` → `error`; otherwise any failing check → `fail`; otherwise `pass`.

  _Acceptance criteria:_
  - Pure function — no I/O, no console output, no mutation of inputs
  - Precedence order `timeout > error > fail > pass` holds in all combinations
  - Populates `scenario_name`, `extracted_text`, `duration_ms`, and `structural_checks` from the inputs
  - `sub_agent_checks` is omitted from the returned object when the argument is empty or undefined
  - `error` field is populated with a descriptive message on `timeout`/`error` status and absent on `pass`/`fail`
  - All imports (`EvalScenario`, `RunOutput`, `CheckResult`, `EvalResult`) come from `./types.js`

- [ ] **Implement `buildReport` aggregator over `EvalResult[]`**

  Add a pure `buildReport(results: EvalResult[], totalDurationMs: number): EvalReport` function to `evals/lib/report.ts` that tallies per-status counts and assembles a complete `EvalReport`. Accepting an array today — even a one-element one — preserves the US7 contract where YAML loading will pass N scenarios without further changes to the report API (AS 9.1, 9.2).

  _Acceptance criteria:_
  - Pure function; does not mutate `results`
  - `total_cases` equals `results.length`; `passed` counts `status === 'pass'`; `failed` counts every non-`pass` status (including `timeout` and `error`)
  - `overall_status` is `'pass'` only when every result is `'pass'`, otherwise `'fail'`
  - `timestamp` is a valid ISO 8601 string set at call time
  - `total_duration_ms` equals the passed-in argument
  - Zero-length `results` input returns a well-formed empty report with `overall_status: 'pass'` and zero counts

- [ ] **Implement `formatReport` pure string formatter**

  Add a pure `formatReport(report: EvalReport): string` function to `evals/lib/report.ts` returning a multi-line stdout-ready summary. Each per-case line carries the scenario name and a status label; timeout cases display a distinct `TIMEOUT` token (AS 9.3), error cases a distinct `ERROR` token, and the final aggregate line shows `PASS` or `FAIL` with the total case count (AS 9.1, 9.2).

  _Acceptance criteria:_
  - Returns a `string`; no `console.log` calls inside
  - Every `EvalResult` in `report.results` produces a line containing its `scenario_name`
  - Status labels distinguish `PASS`, `FAIL`, `TIMEOUT`, and `ERROR` as separate tokens
  - Final line contains the overall result (`PASS` or `FAIL`) and the total case count
  - Output remains stable (deterministic ordering) so snapshot-style assertions are feasible
  - Unit tests cover all-pass, mixed 2-pass/1-fail, and timeout-included reports to lock in AS 9.1–9.3

**PR Outcome**: `evals/lib/report.ts` is present, fully tested, and importable. `EvalReport` is declared in `types.ts`. `npm run test:evals` exercises the new report library end-to-end. `run-evals.ts` is unchanged — no user-visible output change yet.

---

## Slice 2: Wire `EvalReport` Summary into the Orchestrator

**Goal**: Update `evals/run-evals.ts` to capture a start timestamp, construct a single `EvalResult` via `scenarioRunToResult`, build an `EvalReport` from a one-element array via `buildReport`, and print `formatReport(report)` in place of the current `Result: PASS/FAIL` line. Existing per-check inline `[PASS]`/`[FAIL]` output is preserved unchanged.

**Justification**: Slice 1 delivers the library; this slice connects it to the execution pipeline. The change is localized to the final block of `run-evals.ts` (the status-derivation and final-result print) and adds no new logic — all behavior is already verified in Slice 1. Retaining the per-check inline output keeps the diff minimal and additive; the summary becomes supplemental rather than a rewrite.

**Addresses**: FR-009; Acceptance Scenarios 9.1, 9.2, 9.3 (integration path)

### Tasks

- [ ] **Wire `scenarioRunToResult`, `buildReport`, and `formatReport` into `run-evals.ts`**

  Import the three functions and the `EvalReport` type from `./lib/report.js` and `./lib/types.js`. Capture a start timestamp before calling `runScenario`, compute `totalDurationMs` after it returns, then call `scenarioRunToResult` with the scenario, `output`, structural checks, and sub-agent checks to produce one `EvalResult`. Pass a one-element array plus `totalDurationMs` to `buildReport` and print the result of `formatReport` in place of the current `Result: PASS/FAIL` line. Exit code is `0` when `report.overall_status === 'pass'`, otherwise `1`.

  _Acceptance criteria:_
  - Per-check `[PASS]`/`[FAIL]` inline output from the existing `Checks:` block is preserved unchanged
  - The `Result: PASS/FAIL` console line is replaced by `console.log(formatReport(report))`
  - Process exit code is `0` when `report.overall_status === 'pass'`, otherwise `1`
  - Timeout path (`output.timed_out === true`) surfaces `TIMEOUT` in the summary and exits `1` (satisfies AS 9.3)
  - Non-zero `exit_code` path surfaces `ERROR` in the summary and exits `1`
  - No duplication of the status precedence rule — orchestrator delegates to `scenarioRunToResult` rather than re-deriving inline
  - `npm run test:evals` and the smoke path through `npm run eval` remain functional

**PR Outcome**: `npm run eval` output includes the existing per-check inline lines followed by the formatted `EvalReport` summary section showing each case with its status (`PASS` / `FAIL` / `TIMEOUT` / `ERROR`), total count, and overall result. The orchestrator is now shaped for US7 to drop in an N-element scenario loop with no changes to the summary code path.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

| ID | Title                                                                  | Depends On | Artifact |
|----|------------------------------------------------------------------------|------------|----------|
| S1 | Report Library — Types, Status Derivation, Aggregation, Formatting     | —          | —        |
| S2 | Wire `EvalReport` Summary into the Orchestrator                        | S1         | —        |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 3: Execute a Skill Headlessly and Capture Output | depends on | `RunOutput` (from `runner.ts`) and `EvalScenario` types are inputs to `scenarioRunToResult`. Both are already available from US3. |
| User Story 4: Validate Output Structure | depends on | `CheckResult` arrays from `validateStructure` and `verifySubAgents` are inputs to `scenarioRunToResult`. Both are already available from US4. |
| User Story 5: Verify Strike End-to-End Output | depended upon by | US5 consumes `scenarioRunToResult` when asserting that strike eval cases produce the correct final status; its strike scenario becomes an additional element in the `buildReport` array. |
| User Story 6: Verify Sub-Agent Invocation | depended upon by | US6 passes sub-agent check results into `scenarioRunToResult` so they flow into the summary via `formatReport`. |
| User Story 7: Define Eval Scenarios Declaratively | depended upon by | US7 replaces the one-element array fed to `buildReport` with an N-element array sourced from YAML scenarios; no changes to the report library required. |
| User Story 11: Cost and Time Transparency | depended upon by | US11 extends `formatReport` output with per-case duration and total elapsed time — the `total_duration_ms` field is already captured here so US11 is purely additive. |

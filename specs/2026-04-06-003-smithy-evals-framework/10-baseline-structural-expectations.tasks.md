# Tasks: Baseline Structural Expectations

**Source**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md` — User Story 10
**Data Model**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md`
**Contracts**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md`
**Story Number**: 10

---

## Slice 1: Baseline Library — Types, Loader, Comparator

**Goal**: Ship a pure, fully unit-testable `evals/lib/baseline.ts` module plus the type extensions needed to carry baseline results through the pipeline. The module exports `loadBaseline` (convention-based JSON loader returning `null` when no file exists), `compareToBaseline` (pure structural diff returning `CheckResult[]`), and a `Baseline` type. `EvalResult` grows an optional `baseline_checks` field. No orchestrator changes yet.

**Justification**: Baselines are additive, optional regression detection (AS 10.3 makes the feature explicitly opt-in per scenario). The loader and comparator have no I/O beyond a single readFileSync and no process exit, so every behavioral requirement of US10 is verifiable through unit tests over synthetic `Baseline` and output strings. Landing the library first — in the same shape as US4's `structural.ts` and US9's `report.ts` — gives Slice 2 a stable import surface and lets reviewers evaluate the comparator's semantics (what counts as "substantially matches" and what regressions look like) separately from orchestrator plumbing.

**Addresses**: Acceptance Scenarios 10.1, 10.2, 10.3

### Tasks

- [x] **Declare `Baseline` type and extend `EvalResult` with `baseline_checks`**

  Add a `Baseline` interface to `evals/lib/types.ts` capturing the persisted snapshot shape: `scenario_name`, `captured_at` (ISO 8601 timestamp), `headings` (ordered string array of ATX headings observed in the known-good output), and `tables` (array of `{ columns: string[] }` objects matching the existing `StructuralExpectations.required_tables` shape for consistency). Extend `EvalResult` with an optional `baseline_checks?: CheckResult[] | undefined` field so baseline results can flow through the report library without colliding with `structural_checks` or `sub_agent_checks`. Mirror the new entity into `smithy-evals-framework.data-model.md` under a new `### 5) Baseline` subsection and update the `EvalResult` table to list `baseline_checks`.

  _Acceptance criteria:_
  - `Baseline` interface exported from `evals/lib/types.ts` alongside existing `CheckResult`, `EvalResult`
  - `EvalResult.baseline_checks` is declared `baseline_checks?: CheckResult[] | undefined` and omitted when empty, matching `sub_agent_checks`
  - Data model file updated so the data model remains the single source of truth
  - No runtime logic introduced; existing exports unchanged
  - `npm run typecheck` passes

- [x] **Implement `loadBaseline` convention-based JSON loader**

  Create `evals/lib/baseline.ts` and export `loadBaseline(scenarioName: string, baselinesDir?: string): Baseline | null`. Look up `<baselinesDir ?? 'evals/baselines'>/<scenarioName>.json`; return `null` when the file does not exist (satisfies AS 10.3 — baselines are optional); throw a descriptive error when the file exists but is not valid JSON or is missing required `Baseline` fields. The loader is convention-based so scenarios do not need a new YAML field and US7 YAML loading lands unaffected.

  _Acceptance criteria:_
  - Missing file returns `null` (not throw, not `undefined`)
  - Malformed JSON throws with a message naming the file path
  - Missing required fields (`scenario_name`, `captured_at`, `headings`) throw with a clear validation message; `tables` is optional and defaults to `[]` when absent
  - Extra unknown fields are ignored (forward compatible)
  - Default directory is `evals/baselines` relative to the current working directory; caller can override for tests
  - Unit tests cover missing-file, malformed-JSON, missing-field, and happy-path cases

- [x] **Implement `compareToBaseline` pure structural comparator**

  Add `compareToBaseline(output: string, baseline: Baseline): CheckResult[]` to `evals/lib/baseline.ts`. Extract the current output's ATX headings (per-line, matching the `validateStructure` convention in `structural.ts`) and pipe-delimited table column lists, then diff them against the baseline. Emit one check per baseline heading (`has baseline heading '<text>'`) that fails when the heading is absent, one check per baseline table (`has baseline table with columns: <list>`), and one aggregate regression-summary check (`baseline regression summary`) whose `actual` field enumerates any missing items so a reviewer can read the failure without correlating multiple lines. Additions present in the output but absent from the baseline are **not** failures — baselines are a regression signal, not a content lock.

  _Acceptance criteria:_
  - Pure function — no I/O, no mutation of inputs
  - Returns a `CheckResult[]`, one entry per baseline heading, one per baseline table, plus one aggregate summary entry
  - AS 10.1 — an output that contains every baseline heading and table produces all-pass results (including the summary entry)
  - AS 10.2 — an output missing one or more baseline headings produces failures, and the aggregate summary entry's `actual` lists every missing heading/table name so "what changed" is visible in a single line
  - Extra headings/tables not present in the baseline are ignored (no failure, no warning)
  - Empty output string against a non-empty baseline fails every per-element check and the aggregate summary
  - Unit tests cover: full match, missing single heading, missing multiple headings, missing table, empty output, and baseline with zero entries (degenerate all-pass)

**PR Outcome**: `evals/lib/baseline.ts` is present, fully tested, and importable. `Baseline` type is declared in `types.ts` and mirrored in the data model. `EvalResult.baseline_checks` is an available optional field. `npm run test:evals` exercises the new baseline library end-to-end. `run-evals.ts` is unchanged — no user-visible output change yet.

---

## Slice 2: Wire Baseline Comparison into the Orchestrator

**Goal**: Update `evals/run-evals.ts` to call `loadBaseline(scenario.name)` after structural and sub-agent checks, run `compareToBaseline` only when a baseline file is present, pass the resulting checks through `scenarioRunToResult` so they land on `EvalResult.baseline_checks` and flow into the formatted report. Extend `scenarioRunToResult` to accept baseline checks, `formatReport` to render a baseline section, and commit a seeded `evals/baselines/strike-health-check.json` captured from a known-good strike run so the feature has at least one live exercise.

**Justification**: Slice 1 delivers the pure library; this slice connects it to the execution pipeline. Baseline-check presence must be optional end-to-end (AS 10.3) so the orchestrator branch is a single `if (baseline)` guard and the report library only renders a baseline section when at least one baseline check exists. Seeding the strike baseline in the same PR prevents Slice 2 from landing as dormant code and gives the strike scenario immediate regression coverage — the most-used command is also the highest-risk for silent drift. The baseline file itself is data, not code, so it will not block the typecheck and can be regenerated manually without further code changes (manual regeneration is in-scope per Out of Scope §"Automatic baseline generation or updating").

**Addresses**: FR-009; Acceptance Scenarios 10.1, 10.2, 10.3 (integration path)

### Tasks

- [ ] **Thread baseline checks through `scenarioRunToResult` and `formatReport`**

  Extend `scenarioRunToResult` in `evals/lib/report.ts` to accept an additional optional `baselineChecks` argument and populate `EvalResult.baseline_checks` when the array is non-empty (mirroring the existing handling of `sub_agent_checks`). Extend the status-precedence rule so that a failing baseline check rolls into `fail` status alongside structural and sub-agent failures — timeout/error precedence from US9 is unchanged. Update `formatReport` so that when any `EvalResult` has populated `baseline_checks`, the per-case line expands to include a compact baseline marker (e.g., `baseline: PASS` / `baseline: FAIL`) and the final summary line still exposes the single overall status from US9. Do not remove or reshape any existing output produced by US9 — additions only.

  _Acceptance criteria:_
  - `scenarioRunToResult` remains pure and preserves the US9 precedence order `timeout > error > fail > pass` with baseline failures contributing to `fail`
  - `sub_agent_checks` behavior is unchanged when `baselineChecks` is undefined or empty
  - `EvalResult.baseline_checks` is omitted from the returned object when the argument is empty or undefined (matches the existing `sub_agent_checks` convention)
  - `formatReport` renders the baseline marker only when at least one result in the report has non-empty `baseline_checks` (AS 10.3 — absence of a baseline must not clutter output)
  - Existing US9 unit tests in `evals/lib/report.test.ts` continue to pass; new tests cover baseline-pass, baseline-fail, and baseline-absent paths

- [ ] **Invoke `loadBaseline` and `compareToBaseline` from `run-evals.ts`**

  In `evals/run-evals.ts`, after the existing `validateStructure` / `verifySubAgents` block and before the `scenarioRunToResult` call, attempt `loadBaseline(scenario.name)`. When the loader returns `null`, set `baselineChecks = []` and proceed (AS 10.3). When it returns a `Baseline`, call `compareToBaseline(output.extracted_text, baseline)` and capture the resulting check array. Print the baseline results into the existing `Checks:` block using the same `[PASS]` / `[FAIL]` formatting and pass the array as the new fifth argument to `scenarioRunToResult`. Loader errors (malformed JSON, missing required fields) must surface through the existing "Validation error" exit path — they are a scenario authoring bug, not a runtime failure.

  _Acceptance criteria:_
  - When no baseline file exists for the active scenario, `npm run eval` produces byte-identical output to the pre-slice run for the pass case (AS 10.3)
  - When a baseline file exists and matches, baseline checks appear in the `Checks:` block as `[PASS]` lines and contribute to an overall `PASS`
  - When a baseline file exists and the output is missing a baseline heading, the run exits `1` and the formatted report's baseline marker shows `FAIL`
  - Loader errors (malformed JSON) route through the existing `console.error('Validation error: …')` branch and exit `1`
  - No duplication of the status precedence rule — orchestrator continues to delegate to `scenarioRunToResult`
  - `npm run test:evals` and the smoke path through `npm run eval` remain functional

- [ ] **Seed `evals/baselines/strike-health-check.json` from a known-good strike run**

  Create the `evals/baselines/` directory and commit an initial baseline JSON for the strike scenario. The file must conform to the `Baseline` type declared in Slice 1 and should capture the headings and tables observed in the known-good strike output already documented in `evals/spike/FINDINGS.md` and exercised by `strike-scenario.ts`. Populate `headings` from the structural markers `strikeScenario.structural_expectations.required_headings` already asserts (e.g., `## Summary`, `## Approach`, `## Risks`) augmented with any additional stable headings visible in the spike capture. Populate `captured_at` with a real ISO 8601 timestamp reflecting when the baseline was authored. This file is data, not code — it is expected to be regenerated manually whenever the strike template legitimately changes.

  _Acceptance criteria:_
  - `evals/baselines/strike-health-check.json` is present and parseable by `loadBaseline`
  - `scenario_name` field exactly matches `strikeScenario.name`
  - `headings` includes every entry from `strikeScenario.structural_expectations.required_headings` at minimum
  - The committed file is small enough to hand-edit (no serialized binary blobs, no raw stream events)
  - A follow-up `npm run eval` against the fixture with the committed baseline exits `0` when strike output still matches the known-good structure

**PR Outcome**: `npm run eval` now runs baseline comparison whenever a baseline file exists for the active scenario. Strike gains regression coverage beyond YAML structural expectations via the committed `strike-health-check.json`. Scenarios without a baseline file (the vast majority) produce unchanged output. The orchestrator is shaped for US7 to drop in an N-element scenario loop where each scenario independently opts into baselines via the convention-based lookup.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

| ID | Title                                         | Depends On | Artifact |
|----|-----------------------------------------------|------------|----------|
| S1 | Baseline Library — Types, Loader, Comparator  | —          | —        |
| S2 | Wire Baseline Comparison into the Orchestrator | S1         | —        |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 4: Validate Output Structure | depends on | `CheckResult` type and the heading-extraction convention in `structural.ts` inform `compareToBaseline`'s output shape. Already available. |
| User Story 5: Verify Strike End-to-End Output | depends on | The committed strike baseline (Slice 2) is seeded from the strike scenario's known-good structure. `strikeScenario` and its spike capture must exist. Already available. |
| User Story 9: Eval Summary Report | depends on | `scenarioRunToResult`, `buildReport`, and `formatReport` are extended in Slice 2 to carry `baseline_checks`. Already available. |
| User Story 7: Define Eval Scenarios Declaratively | depended upon by | US7 YAML loading does not need new fields — baselines are convention-based (`evals/baselines/<scenario-name>.json`). US7 merely ensures `scenario.name` stays stable across YAML authoring. |

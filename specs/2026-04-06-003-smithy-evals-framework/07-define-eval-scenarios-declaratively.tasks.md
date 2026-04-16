# Tasks: Define Eval Scenarios Declaratively

**Source**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md` — User Story 7
**Data Model**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md`
**Contracts**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md`
**Story Number**: 07

---

## Slice 1: YAML Scenario Loader and Strike Scenario Migration

**Goal**: Introduce YAML as the declarative source for eval scenarios, ship a reusable loader module, and migrate the existing strike scenario to a YAML file without touching `run-evals.ts`. Because `strike-scenario.ts` is rewired as a thin re-export, the pre-existing spike-capture test (`strike-scenario.test.ts`) transitively validates the YAML round-trip end-to-end.

**Justification**: `run-evals.ts` imports `strikeScenario` by name; as long as that symbol continues to resolve to an equivalent `EvalScenario`, the orchestrator keeps working unchanged. That makes "loader + YAML migration" a complete, independently shippable increment whose regression coverage is already in place via the spike-capture test — not disconnected scaffolding.

**Addresses**: FR-007, SC-006; Acceptance Scenarios 7.1, 7.3

### Tasks

- [ ] **Promote `yaml` to a direct runtime dependency.** Add the `yaml` package to `dependencies` (not `devDependencies`) in `package.json` since `npm run eval` is a runtime script. The package is already present transitively via `dotprompt`, so the lockfile should be stable and no new top-level install occurs. Pick the same major version that dotprompt resolves to in order to avoid a second copy in the tree.
  - **Acceptance criteria**: `yaml` appears in `dependencies` in `package.json`; lockfile changes are minimal; `npm run build`, `npm run typecheck`, `npm test`, and `npm run test:evals` all succeed.

- [ ] **Create `evals/cases/strike-health-check.yaml`.** Author the first declarative case file under `evals/cases/`, encoding the same scenario fields currently hardcoded in `evals/lib/strike-scenario.ts` (`name`, `skill`, `prompt`, `structural_expectations.required_headings`, `structural_expectations.required_patterns`, `structural_expectations.forbidden_patterns`). The YAML schema must match the `EvalScenario` shape defined in `evals/lib/types.ts` and the data model (§1). Regex patterns must survive YAML quoting — backslash escapes, leading `^`, and `\r?\n` in `forbidden_patterns` must round-trip unchanged.
  - **Acceptance criteria**: File exists at `evals/cases/strike-health-check.yaml` and parses as valid YAML; structural fields are byte-equivalent to the current `strikeScenario` constant after parse; includes a top-of-file comment identifying the spec, data model, and contracts artifact paths.

- [ ] **Implement `evals/lib/scenario-loader.ts` with `loadScenarios(casesDir)`.** Create a new module exporting a pure function that reads every `*.yaml` file in `casesDir`, parses each with the `yaml` package, validates required `EvalScenario` fields per the data model (`name`, `skill`, `prompt`, and `structural_expectations.required_headings` containing at least one entry), rejects duplicate `name` values across files (the data model requires `name` to be unique — duplicates would make `--case <name>` ambiguous), and returns an array of valid scenarios sorted for deterministic order. Invalid or unparseable files must be skipped with a clear stderr message naming the file and the failure reason — they must NOT cause the whole run to abort (AS 7.3). The loader must be pure: no `process.exit`, no stdout writes on the happy path, so both the orchestrator and tests can consume it cleanly.
  - **Acceptance criteria**: Returns `EvalScenario[]` in deterministic order; malformed YAML, missing required fields, non-object roots, empty `required_headings`, and duplicate `name` values are each reported to stderr and skipped (AS 7.3); an empty directory or a directory with no `.yaml` files returns `[]` without error; a non-existent `casesDir` produces a single clear error (the caller decides exit behavior); function performs no side effects beyond reading files and writing validation errors to stderr.

- [ ] **Rewire `evals/lib/strike-scenario.ts` as a thin YAML re-export.** Replace the hardcoded `EvalScenario` literal in `strike-scenario.ts` with a load of `evals/cases/strike-health-check.yaml` via the new loader (or a minimal equivalent), and re-export the resulting object under the existing `strikeScenario` name so `run-evals.ts` and `strike-scenario.test.ts` continue to import it unchanged. The existing spike-capture test must pass untouched — it is the regression guard verifying the YAML round-trip preserves the scenario's behavioral contract. Remove the stale doc comments in `strike-scenario.ts` that reference "US7 will migrate the declaration into `evals/cases/*.yaml`" and rewrite the header to describe the current YAML-backed state.
  - **Acceptance criteria**: `strike-scenario.test.ts` passes without modification; `run-evals.ts` continues to import `strikeScenario` by name in this slice (no orchestrator changes); no duplicated scenario definition remains in TypeScript; stale "US7 will" forward-references are removed from `strike-scenario.ts`.

**PR Outcome**: A reusable `scenario-loader` module ships alongside the first YAML case file, the strike scenario is declaratively defined in YAML, and `strike-scenario.ts` re-exports the YAML-loaded value so that `run-evals.ts` and the spike-capture test continue to work end-to-end unchanged. A developer can add a new eval case to `evals/cases/` via YAML alone, though the orchestrator does not yet discover new files — that wiring lands in Slice 2.

---

## Slice 2: Orchestrator YAML Integration and `--case` Filter

**Goal**: Replace the hardcoded `strikeScenario` import in `run-evals.ts` with a directory-driven `loadScenarios` call, add the `--case <name>` CLI filter flag, and iterate all discovered scenarios through the existing run / validate / report pipeline. Completes FR-007 and FR-008 end-to-end.

**Justification**: With the loader and YAML file already shipped in Slice 1, this slice is a focused orchestrator change plus CLI argument handling. It delivers the observable `npm run eval --case <name>` behavior that AS 7.2 requires, and can be reverted independently of Slice 1 without losing the loader module.

**Addresses**: FR-007, FR-008; Acceptance Scenarios 7.1, 7.2

### Tasks

- [ ] **Wire `loadScenarios` into `run-evals.ts`.** Replace the direct `strikeScenario` import with a `loadScenarios('evals/cases')` call executed after `preflight()` and fixture validation. Iterate the returned scenarios through the existing `runScenario` → `validateStructure` → `verifySubAgents` → `scenarioRunToResult` pipeline, accumulating an N-element `EvalResult[]` before calling `buildReport`. The existing `--timeout` override logic must layer onto each loaded scenario the same way it currently layers onto the single imported scenario (FR-004). If `evals/cases/` is empty or the loader returns zero valid scenarios, exit 1 with a clear message per the contracts (§Orchestrator CLI error conditions).
  - **Acceptance criteria**: `run-evals.ts` no longer imports `strikeScenario` directly; each loaded scenario flows through the full pipeline; `--timeout` override applies per scenario (FR-004); an empty `evals/cases/` directory (or all-invalid files) exits 1 with a descriptive message; the US9 report-summary path produces a correct N-element report for multi-scenario runs.

- [ ] **Add `--case <name>` filter flag to the orchestrator.** Extend `parseArgs` in `run-evals.ts` with a `case` string option. When provided, filter the scenarios returned by `loadScenarios` by exact `name` match after the loader completes (filtering happens post-load for simplicity). An unrecognised `--case` value must exit 1 with a clear message naming the requested case and listing the available case names, per the contracts' Orchestrator CLI error conditions (AS 7.2, FR-008). When `--case` is omitted, every loaded scenario runs.
  - **Acceptance criteria**: `npm run eval -- --case strike-health-check` runs only that scenario (AS 7.2); an unknown `--case` value exits 1 with a message naming the requested case and listing known names; omitting `--case` runs every loaded scenario (AS 7.1); `parseArgs` options include `case: { type: 'string' }`.

- [ ] **Refresh stale documentation referencing US7 pending status.** Remove or rewrite the "US7 will replace..." JSDoc header and inline comment block in `evals/run-evals.ts` that describe the pre-US7 hardcoded scenario pattern. Update the Tier 3 status line in `CLAUDE.md` that currently reads "YAML scenario loading (US7) pending" to reflect the shipped state. Ensure any remaining inline comments in the orchestrator accurately describe the new YAML-driven flow.
  - **Acceptance criteria**: No "US7 will..." or "US7 pending" forward-references remain in `run-evals.ts` or `CLAUDE.md`; the orchestrator header comment accurately describes the YAML loader flow; `npm run test:evals` passes after the doc updates.

**PR Outcome**: `npm run eval` discovers every YAML case file in `evals/cases/`, runs them all by default, supports `--case <name>` to target a single scenario, and produces a single aggregate report via the existing US9 summary. SC-006 is fully satisfied end-to-end — adding a new eval case requires only creating a YAML file.

---

## Specification Debt

None — all ambiguities resolved.

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | YAML Scenario Loader and Strike Scenario Migration | — | — |
| S2 | Orchestrator YAML Integration and `--case` Filter | S1 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 5: Verify Strike End-to-End Output | depends on | US5 established `strikeScenario` and `strike-scenario.test.ts` as the spike-capture regression guard. Slice 1 preserves that test by keeping `strike-scenario.ts` as a thin re-export of the YAML-loaded value. |
| User Story 9: Eval Summary Report | depends on | US9 already wired `buildReport` / `formatReport` to accept an N-element `EvalResult[]`. Slice 2 relies on that N-element path existing so multi-scenario runs produce a single aggregate report with no changes to the report layer. |

# Tasks: Validate Output Structure

**Source**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md` — User Story 4
**Data Model**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md`
**Contracts**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md`
**Story Number**: 04

---

## Slice 1: StructuralValidator and SubAgentVerifier Library

**Goal**: Create `evals/lib/structural.ts` exporting `validateStructure` and `verifySubAgents` as pure, fully-tested functions; establish a dedicated evals vitest config so all evals unit tests are runnable via `npm run test:evals` without touching `npm test`.

**Justification**: Both functions operate solely on in-memory strings and typed data — no runtime dependency on the runner, orchestrator, or `claude` CLI. Delivering this as a standalone slice gives Slice 2 a stable, reviewable module to import. The vitest config is included here because `evals/lib/structural.test.ts` is the first test file that needs it; the existing `evals/lib/*.test.ts` and `evals/fixture.test.ts` will also benefit.

**Addresses**: FR-005, FR-006, FR-012, FR-016; Acceptance Scenarios 4.1, 4.2, 4.3

### Tasks

- [x] Create `evals/lib/structural.ts` exporting `validateStructure(output: string, expectations: StructuralExpectations): CheckResult[]`. The function must satisfy the StructuralValidator contract in `smithy-evals-framework.contracts.md`: (a) **`required_headings`** — split the output into lines and check whether any line, when trimmed of trailing whitespace, exactly equals the required heading string (e.g., `## Plan`). This is per-line ATX matching, not a substring search — prose containing the heading text must not produce a false positive, and a heading at a different level must not match. (b) **`required_patterns`** — test each entry as a `RegExp` against the full output string; a check passes if it matches. (c) **`forbidden_patterns`** — test each entry as a `RegExp` against the full output string; a check passes if it does NOT match. (d) **`required_tables`** — for each entry, verify the output contains a Markdown table line (a pipe-delimited line) that includes all specified column names from `entry.columns`; a simple single-line check is sufficient for v1. Each check produces one `CheckResult`: `check_name` is human-readable (e.g., `"has '## Plan' heading"`, `"required pattern present"`, `"forbidden pattern absent"`, `"has table with columns: Col1, Col2"`), `expected` is the heading string or pattern string or column list, `actual` is descriptive context (`"found"` / `"not found"` / matched text for patterns). When `output` is an empty string, all checks fail. When a pattern string in `required_patterns` or `forbidden_patterns` is not a valid regex, throw an `Error` immediately (fail-fast, do not collect errors). All imports (`StructuralExpectations`, `CheckResult`) come from `./types.js`.

- [ ] Add `verifySubAgents(text: string, dispatches: AgentDispatch[], evidence: SubAgentEvidence[]): CheckResult[]` to `evals/lib/structural.ts`. The function must satisfy the SubAgentVerifier contract in `smithy-evals-framework.contracts.md`: for each `SubAgentEvidence` entry, compile `entry.pattern` as a `RegExp` and test it against (a) the full `text`, (b) each `AgentDispatch.description`, and (c) each `AgentDispatch.resultText`. A check **passes** if the pattern matches at least one of those three sources — agent-name presence alone in a dispatch without the configured pattern matching is NOT a pass criterion (FR-016). Each check produces a `CheckResult`: `check_name` is human-readable (e.g., `"smithy-plan evidence present"`), `expected` is the pattern string, `actual` indicates the source that matched (e.g., `"matched in extracted text"`, `"matched in dispatch description"`) or `"no match found"`. When `evidence` is empty, return an empty array. All imports (`AgentDispatch`, `SubAgentEvidence`, `CheckResult`) come from `./types.js`.

- [ ] Create `evals/vitest.config.ts` with an include pattern of `evals/**/*.test.ts` so that `evals/lib/structural.test.ts` (and the existing `evals/lib/parse-stream.test.ts`, `evals/lib/runner.test.ts`, `evals/fixture.test.ts`) are all picked up. Add `"test:evals": "vitest run --config evals/vitest.config.ts"` to `scripts` in `package.json`. Do NOT modify the root `vitest.config.ts` (which includes only `src/**/*.test.ts`) — keeping evals tests out of `npm test` is required by FR-010. Note: `evals/fixture.test.ts` executes `node dist/cli.js`, so `npm run build` must precede `npm run test:evals` for that test to pass; document this in the config file or a comment near the script.

**PR Outcome**: `evals/lib/structural.ts` is present, fully tested, and importable. `npm run test:evals` runs all evals-directory unit tests (structural, parse-stream, runner, fixture). `npm test` runs only `src/` tests — no change to the main test suite.

---

## Slice 2: Wire Validator into the Orchestrator

**Goal**: Update `evals/run-evals.ts` to call `validateStructure` (and `verifySubAgents` when applicable) on the output from `runScenario`, then print per-check pass/fail results to stdout and set the exit code based on check outcomes.

**Justification**: Slice 1 delivers the validator as a library; this slice connects it to the execution pipeline. The orchestrator already holds `RunOutput` from `runScenario` — the wiring is a narrow addition to the existing try/catch block. This makes US4's acceptance scenarios observable via `npm run eval`, not just via unit tests.

**Addresses**: FR-005, FR-006; Acceptance Scenarios 4.1, 4.2, 4.3 (integration path)

### Tasks

- [ ] Update `evals/run-evals.ts` to import `validateStructure` and `verifySubAgents` from `./lib/structural.js` and `extractSubAgentDispatches` from `./lib/parse-stream.js`. After `runScenario` returns, call `validateStructure(output.extracted_text, scenario.structural_expectations)` to obtain `structuralChecks: CheckResult[]`. If `scenario.sub_agent_evidence` is defined and non-empty, call `extractSubAgentDispatches(output.stream_events)` then `verifySubAgents(output.extracted_text, dispatches, scenario.sub_agent_evidence)` to obtain `subAgentChecks: CheckResult[]`. Print each `CheckResult` to stdout using the format `  [PASS] <check_name>` or `  [FAIL] <check_name> — expected: <expected>, actual: <actual>`. Determine the final exit code as `1` if (a) the process exited with a non-zero code, (b) it timed out, or (c) any `CheckResult` has `passed: false`; otherwise `0`. The existing hardcoded smoke-test scenario (`required_headings: ['## Plan']`) remains unchanged — updating it to reflect actual strike output is a US5 concern, and the `[FAIL]` from a missing `## Plan` heading demonstrates the validator is working correctly.

**PR Outcome**: `npm run eval` prints per-check structural results alongside the scenario status. Structural regressions surface as named `[FAIL]` entries with actionable context. Exit code reflects both process health and validation outcomes.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1: StructuralValidator and SubAgentVerifier Library** — pure module with no runtime dependencies; establishes the vitest config for all evals tests; Slice 2 imports from it.
2. **Slice 2: Wire Validator into the Orchestrator** — depends on Slice 1 exports; narrow orchestrator change that delivers the user-visible outcome.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 3: Execute a Skill Headlessly and Capture Output | depends on | `RunOutput` (from `runner.ts`) is the input to the validator in Slice 2. The shared types (`StructuralExpectations`, `CheckResult`, `AgentDispatch`, `SubAgentEvidence`) were defined as part of US3 Slice 1 and are available now. |
| User Story 5: Verify Strike End-to-End Output | depended upon by | US5 imports `validateStructure` from `structural.ts` and extends the orchestrator with strike-specific structural expectations. |
| User Story 6: Verify Sub-Agent Invocation | depended upon by | US6 imports `verifySubAgents` from `structural.ts` and adds `sub_agent_evidence` entries to eval scenarios. |
| User Story 7: Define Eval Scenarios Declaratively | depended upon by | US7 replaces the hardcoded smoke-test scenario in `run-evals.ts` with YAML loading; it calls `validateStructure` and `verifySubAgents` for each loaded scenario. |

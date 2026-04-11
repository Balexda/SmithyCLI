# Tasks: Execute a Skill Headlessly and Capture Output

**Source**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md` — User Story 3
**Data Model**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md`
**Contracts**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md`
**Story Number**: 03

---

## Slice 1: Stream Parser and Shared Types

**Goal**: Port the spike's stream-json parser to TypeScript and define the shared data model types that the runner and all downstream stories depend on.

**Justification**: A pure-function library with no external dependencies, independently testable before any process-spawning code exists. Slice 2 imports directly from it.

**Addresses**: FR-015; Acceptance Scenario 3.1

### Tasks

- [x] Create `evals/lib/types.ts` defining the shared types for the framework per the data model spec: `StreamEvent`, `ResultSummary`, `ToolUse`, `ToolResult`, `AgentDispatch`, `EventSummary`, `StructuralExpectations`, `SubAgentEvidence`, `EvalScenario`, `RunOutput`, `CheckResult`, `EvalResult`. Type `StreamEvent` loosely (a base interface with optional fields, not a discriminated union) so the parser tolerates new claude CLI event types without code changes.

- [x] Create `evals/lib/parse-stream.ts` as a TypeScript port of `evals/spike/parse-stream.mjs`, exporting all seven FR-015 functions: `parseStreamString`, `extractText`, `extractResult`, `extractToolUses`, `extractToolResults`, `extractSubAgentDispatches`, `summarizeEvents`. Drop `parseStreamFile` (file I/O is the runner's concern, not the parser's). Inline `countEventTypes` — it is not a required export.

- [x] Add `extractCanonicalText(events: StreamEvent[]): string` as an eighth export on `parse-stream.ts`. It implements the FR-001 precedence rule: return `result.text` if a `result` event is present with non-empty text; otherwise return the concatenation of assistant text blocks. This must never combine both sources — the duplicate-output issue documented in FINDINGS.md item 6 means naïve concatenation produces false double-matches.

- [x] Write unit tests at `evals/lib/parse-stream.test.ts` covering: empty input, single valid event, malformed JSON line error, `extractCanonicalText` preferring `result.text`, `extractCanonicalText` falling back when no result event, `extractCanonicalText` falling back when `result.text` is empty, correct `extractSubAgentDispatches` pairing, and unknown event types passing through without error.

- [x] Verify `npm test` passes and `npm run typecheck` passes.

**PR Outcome**: A fully-typed, unit-tested stream-json parser that is the single source of truth for interpreting `claude --output-format stream-json` output across the entire evals framework.

---

## Slice 2: Runner with Fixture Management

**Goal**: Implement `runScenario()` — invokes `claude --output-format stream-json -p` against a temp copy of the fixture, enforces a timeout, extracts canonical text, verifies fixture integrity, and cleans up regardless of outcome.

**Justification**: The primary deliverable of US3. All four acceptance scenarios are covered here and are unit-testable with a mocked child process — no live claude invocations required for the PR.

**Addresses**: FR-001, FR-002, FR-003, FR-004, FR-011, FR-013; Acceptance Scenarios 3.1, 3.2, 3.3, 3.4

### Tasks

- [x] Create `evals/lib/runner.ts` and implement `runScenario(scenario: EvalScenario, fixtureDir: string): Promise<RunOutput>` per the Runner contract. The implementation must: copy the fixture to a unique temp directory (FR-002); compute a SHA-256 checksum of the source fixture before execution (FR-011); spawn `claude --output-format stream-json -p "<invocation>"` where `<invocation>` is `scenario.skill` and `scenario.prompt` composed into the full slash-command string (e.g. skill `/smithy.strike` + prompt `add a health check endpoint` → `-p "/smithy.strike 'add a health check endpoint'"`) with `cwd` set to the temp copy; enforce the per-case timeout and record whether it was exceeded (FR-004); extract `extracted_text` via `extractCanonicalText`; re-verify the source fixture checksum after execution and error if it changed (FR-011); clean up the temp directory in a `finally` block so cleanup always runs regardless of outcome (FR-013).

- [x] Export `preflight(): void` from `runner.ts`. It must (a) validate that the `claude` CLI is functional (not just present in PATH — run it to confirm) and throw with a clear, actionable message if not; and (b) verify that at least one auth path is configured: if `ANTHROPIC_API_KEY` is set, accept it; otherwise probe whether OAuth is active (e.g. via `claude auth status` or equivalent) and throw with a clear message if neither is configured (FR-003). A run with no API key and no active OAuth login must be caught here, before any scenario executes — not at first invocation.

- [x] Write unit tests at `evals/lib/runner.test.ts` with a mocked child process covering: successful run with NDJSON stdout produces correct `RunOutput`; non-zero exit code is surfaced; timeout is detected and `timed_out: true` is returned; fixture source directory is unchanged after the run; temp directory is removed after the run (including on error); `preflight` throws when the CLI is unavailable; `preflight` passes when `ANTHROPIC_API_KEY` is set; `preflight` passes when no API key but OAuth is active; `preflight` throws when neither API key nor OAuth is configured.

- [ ] Verify `npm test` passes and `npm run typecheck` passes.

**PR Outcome**: A working, fully-tested `runScenario()` satisfying all four US3 acceptance scenarios. Downstream stories (US4, US5) can import and use it immediately.

---

## Slice 3: Entry Point and Build Tooling

**Goal**: Wire the runner into an executable `npm run eval` CLI, add TypeScript execution support, and restrict vitest to `src/` only to enforce FR-010 decoupling.

**Justification**: Without this slice the runner is a library only — no developer can invoke it. This slice proves the full pipeline end-to-end and establishes the `evals/run-evals.ts` entry point that US7 (YAML loading) and US9 (summary report) will extend.

**Addresses**: FR-003 (fail-fast on startup), FR-010; Acceptance Scenario 3.3

### Tasks

- [ ] Add `tsx` to `devDependencies` in `package.json` and add `"eval": "tsx evals/run-evals.ts"` to `scripts`. Confirm the `eval` script does not appear in the `pretest` or `test` chains (FR-010).

- [ ] Create `vitest.config.ts` restricting vitest discovery to `src/**/*.test.ts` only. This prevents any future `evals/` test file from running under `npm test`. Verify `npm test` still passes and evals tests are excluded.

- [ ] Create `evals/run-evals.ts` as the minimal orchestrator entry point: accept `--fixture` and `--timeout` CLI flags; call `preflight()` and exit 1 with the error message on failure; validate the fixture directory exists; run a single hardcoded smoke-test scenario via `runScenario` (with `skill` and `prompt` as separate fields, composed by the runner into the full `-p` invocation) and print a brief result summary. This entry point is intentionally minimal — US7 replaces the hardcoded scenario with YAML loading.

- [ ] Verify end-to-end: `npm run typecheck` covers `evals/run-evals.ts`; running `npm run eval` without `claude` in PATH exits 1 with an actionable error; running `npm test` does not invoke any live `claude -p` calls.

**PR Outcome**: The evals framework is runnable via `npm run eval` with pre-flight gating. Eval execution is fully decoupled from the test suite (FR-010).

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1: Stream Parser and Shared Types** — no upstream dependencies; must land before Slice 2 can import from it.
2. **Slice 2: Runner with Fixture Management** — depends on Slice 1; delivers the core US3 capability.
3. **Slice 3: Entry Point and Build Tooling** — depends on Slice 2; wires everything into a runnable CLI.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Reference Fixture Exists and Is Deployable | depends on | The runner is unit-testable with synthetic temp dirs. Full end-to-end smoke testing (Slice 3) requires the actual `evals/fixture/` created by US2. |
| User Story 4: Validate Output Structure | depended upon by | US4's structural validator consumes `RunOutput.extracted_text` and the shared types from Slice 1. |
| User Story 7: Define Eval Scenarios Declaratively | depended upon by | US7 replaces the hardcoded scenario in `evals/run-evals.ts` with YAML loading. |
| User Story 9: Eval Summary Report | depended upon by | US9 extends `evals/run-evals.ts` to aggregate results and print an `EvalReport`. |

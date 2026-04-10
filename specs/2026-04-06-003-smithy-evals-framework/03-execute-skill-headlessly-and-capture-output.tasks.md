# Tasks: Execute a Skill Headlessly and Capture Output

**Source**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md` — User Story 3
**Data Model**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md`
**Contracts**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md`
**Story Number**: 03

---

## Slice 1: Stream Parser and Shared Types

**Goal**: Provide the single source of truth for interpreting `claude --output-format stream-json` output — a typed TypeScript library promoted from the spike, with full test coverage and a new `extractCanonicalText` function encoding the FR-001 precedence rule.

**Justification**: Pure-function library with no external dependencies; independently testable; foundation that Slice 2 (runner) imports directly. Shipping this as a standalone PR validates the parsing logic before any process-spawning code is involved.

**Addresses**: FR-015; Acceptance Scenario 3.1 (output captured as string — parser is the core mechanism)

### Tasks

- [ ] Create `evals/lib/types.ts` with shared type definitions consumed across the evals framework:
  - `StreamEvent` — loose typing for forward-compatibility with new Claude CLI event types: `{ type: string; message?: { role?: string; content?: unknown[] }; result?: string; subtype?: string; duration_ms?: number; num_turns?: number }`. Do NOT use a discriminated union; the claude CLI may introduce new event types in future versions.
  - `ResultSummary` — `{ text: string; subtype: string; duration_ms: number; num_turns: number }`
  - `ToolUse` — `{ name: string; id: string; input: Record<string, unknown> }`
  - `ToolResult` — `{ tool_use_id: string; content: string; is_error: boolean }`
  - `AgentDispatch` — `{ id: string; description: string; prompt: string; resultText: string }`
  - `EventSummary` — `{ eventCounts: Record<string, number>; toolUseCount: number; toolNames: string[]; resultSubtype: string; durationMs: number; numTurns: number; textLength: number }`
  - `StructuralExpectations` — `{ required_headings: string[]; required_tables?: Array<{ columns: string[] }>; forbidden_patterns?: string[]; required_patterns?: string[] }`
  - `SubAgentEvidence` — `{ agent: string; pattern: string }`
  - `EvalScenario` — full data-model shape: `{ name: string; skill: string; prompt: string; model?: string; timeout?: number; structural_expectations: StructuralExpectations; sub_agent_evidence?: SubAgentEvidence[] }`
  - `RunOutput` — from contracts: `{ extracted_text: string; stream_events: StreamEvent[]; duration_ms: number; exit_code: number; timed_out: boolean }`
  - `CheckResult` — `{ check_name: string; passed: boolean; expected?: string; actual?: string }`
  - `EvalResult` — `{ scenario_name: string; status: 'pass' | 'fail' | 'timeout' | 'error'; extracted_text: string; duration_ms: number; structural_checks: CheckResult[]; sub_agent_checks?: CheckResult[]; error?: string }`

- [ ] Create `evals/lib/parse-stream.ts` as a TypeScript port of `evals/spike/parse-stream.mjs`, exporting all seven functions required by FR-015: `parseStreamString`, `extractText`, `extractResult`, `extractToolUses`, `extractToolResults`, `extractSubAgentDispatches`, `summarizeEvents`. Implementation notes:
  - Use `/\r?\n/` for line splitting in `parseStreamString` to handle Windows line endings, not just `\n`.
  - Drop `parseStreamFile` (the file-reading async variant from the spike) — the runner receives stdout as a string buffer, not a file path; file I/O is the caller's concern.
  - Inline `countEventTypes` within `summarizeEvents` rather than exporting it — it is not listed in FR-015 and has no other consumers.
  - Import all types from `./types.js` (use `.js` extension per `module: nodenext` resolution).

- [ ] Add `extractCanonicalText(events: StreamEvent[]): string` to `parse-stream.ts` as an additional export. Implementation: if `extractResult(events)` returns a result with non-empty `text`, return that `text`; otherwise return `extractText(events)`. This is NOT naive concatenation of both — it is the single correct implementation of the FR-001 precedence rule. It prevents the duplicate-output bug documented in FINDINGS.md item 6 (headless auto-reply can cause the final result to appear twice in the stream).

- [ ] Create `evals/lib/parse-stream.test.ts` with vitest unit tests using inline NDJSON string fixtures (no disk I/O). Required coverage:
  - `parseStreamString('')` returns `[]`
  - A single valid NDJSON line is parsed into one event object
  - A malformed JSON line throws a `SyntaxError` with line number in the message
  - `extractCanonicalText` returns `result.text` when a `result` event is present with non-empty text
  - `extractCanonicalText` falls back to concatenated assistant text when no `result` event is present
  - `extractCanonicalText` falls back to assistant text when `result.text` is empty string (not just absent)
  - `extractSubAgentDispatches` correctly pairs Agent tool-use blocks with their tool-result responses by `tool_use_id`
  - Unknown event types are passed through by `parseStreamString` without being filtered or erroring

- [ ] Verify `npm test` passes (parser tests are discovered by vitest's default glob from `evals/lib/`) and `npm run typecheck` passes with no errors in `evals/lib/`.

**PR Outcome**: A fully-typed, unit-tested `parse-stream.ts` library that is the single source of truth for interpreting `claude --output-format stream-json` output. All subsequent slices and stories (runner, structural validator, sub-agent verifier) import from this module.

---

## Slice 2: Runner with Fixture Management

**Goal**: Implement `runScenario()` — the core execution unit that copies the fixture to a temp directory, invokes `claude --output-format stream-json -p`, enforces a per-case timeout, extracts canonical text, verifies fixture integrity via SHA-256 checksum, and cleans up regardless of outcome.

**Justification**: This is the primary deliverable of US3. It satisfies all four acceptance scenarios: output captured (3.1), timeout enforcement (3.2), pre-flight fail-fast (3.3), fixture not modified (3.4). Fully unit-testable with mocked child processes — no live `claude` invocations required for the PR.

**Addresses**: FR-001, FR-002, FR-003, FR-004, FR-011, FR-013; Acceptance Scenarios 3.1, 3.2, 3.3, 3.4

### Tasks

- [ ] Create `evals/lib/runner.ts` and implement `runScenario(scenario: EvalScenario, fixtureDir: string): Promise<RunOutput>` using the following ordered steps wrapped in a `try/finally`:
  1. **Fixture copy**: create a unique temp directory via `fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-eval-'))`. Copy the fixture into it with `fs.cpSync(fixtureDir, tempDir, { recursive: true, dereference: true })`. The `dereference: true` resolves any symlinks to real files, preventing broken links in the temp copy (FR-002).
  2. **Pre-copy checksum**: compute `preChecksum` as a SHA-256 hex digest over the sorted list of `(relativePath, fileContent)` pairs for all files under `fixtureDir`, using `crypto.createHash('sha256')`. This establishes the baseline for FR-011.
  3. **Process spawn**: invoke `child_process.spawn('claude', ['--output-format', 'stream-json', '-p', scenario.prompt], { cwd: tempDir, signal: AbortSignal.timeout((scenario.timeout ?? 120) * 1000) })`. Collect stdout chunks in a `Buffer[]`. Record `startTime = Date.now()`.
  4. **Wait for exit**: on the `close` event, decode and join the stdout buffer, parse with `parseStreamString`, apply `extractCanonicalText` for `extracted_text`. Detect timeout by checking for the AbortError signal on the process error event (`err.name === 'AbortError'`); set `timed_out: true` in that case.
  5. **Post-execution checksum**: re-compute `postChecksum` over `fixtureDir` using the same method. If it differs from `preChecksum`, throw an error: `"Fixture source directory was modified during eval run (FR-011 violation). Fixture: <fixtureDir>"` (FR-011).
  6. **Return** `RunOutput`: `{ extracted_text, stream_events, duration_ms: Date.now() - startTime, exit_code, timed_out }`.
  7. **Cleanup** in the `finally` block (always runs): `fs.rmSync(tempDir, { recursive: true, force: true })` (FR-013). Use `force: true` so a missing temp dir (e.g., if creation failed) does not throw.

- [ ] Export `preflight(): void` from `runner.ts`. Checks in order:
  - Validate `claude` is functionally available: call `execFileSync('claude', ['--version'], { stdio: 'pipe' })` in a try/catch. If it throws, re-throw with a clear message: `"claude CLI is not available in PATH or is not functional. Install Claude Code to run evals: https://docs.anthropic.com/en/docs/claude-code"` (FR-003).
  - Check API credentials: if `process.env.ANTHROPIC_API_KEY` is absent, print a warning to `process.stderr`: `"Warning: ANTHROPIC_API_KEY not set. Evals will authenticate via 'claude login' (OAuth). Run 'claude login' if evals fail with auth errors."` Do NOT throw — OAuth via `claude login` is confirmed valid by the spike (FR-003). Hard-fail only on missing CLI, not on missing env var.

- [ ] Create `evals/lib/runner.test.ts` with vitest unit tests. Since live `claude` invocations are out of scope for unit tests, mock `child_process.spawn` using `vi.mock`. Required coverage:
  - Mock process emitting valid NDJSON on stdout, exiting 0: verify `RunOutput` has correct `extracted_text`, `exit_code: 0`, `timed_out: false`, `stream_events` length.
  - Mock process emitting no stdout, exiting 1: verify `exit_code: 1`, `extracted_text: ''`.
  - Mock process that fires the AbortError on the error event (simulating timeout): verify `timed_out: true` and that cleanup still executes (temp dir removed).
  - Fixture integrity: use a real small temp fixture (two known files), run `runScenario` with a mocked process, verify `fixtureDir` contents are unchanged after the call (manual file read, not just checksum).
  - `preflight()` with mocked `execFileSync` throwing: verify the descriptive error message is thrown.
  - `preflight()` with `ANTHROPIC_API_KEY` unset: verify no exception is thrown, only a warning printed to stderr.

- [ ] Verify `npm test` passes (runner tests run under vitest default glob) and `npm run typecheck` passes.

**PR Outcome**: A working, fully-tested `runScenario()` function satisfying all four US3 acceptance scenarios. The orchestrator (Slice 3), structural validator (US4), and strike eval (US5) can import and use this immediately.

---

## Slice 3: Entry Point and Build Tooling

**Goal**: Wire the runner into an executable `npm run eval` CLI entry point, add TypeScript execution support via `tsx`, and enforce FR-010 decoupling by restricting vitest to `src/` only so that future evals-side test files never accidentally run under `npm test`.

**Justification**: Without this slice the runner is a library only — no developer can invoke it. This slice proves the full pipeline end-to-end and establishes the `evals/run-evals.ts` entry point that US7 (YAML loading) and US9 (summary report) will extend.

**Addresses**: FR-003 (fail-fast on startup), FR-010 (decoupled npm run eval); Acceptance Scenario 3.3

### Tasks

- [ ] Add `tsx` to `devDependencies` in `package.json` (latest stable `^4.x`). This enables running `evals/run-evals.ts` as a TypeScript file directly without a separate compile step or build artifact.

- [ ] Add `"eval": "tsx evals/run-evals.ts"` to the `scripts` section of `package.json`. Confirm it does NOT appear in `pretest` or `test` script chains. Verify `npm run eval --help` does not accidentally trigger a test run (FR-010).

- [ ] Create `vitest.config.ts` at the repo root that restricts vitest discovery to `src/` only:
  ```ts
  import { defineConfig } from 'vitest/config';
  export default defineConfig({
    test: {
      include: ['src/**/*.test.ts'],
    },
  });
  ```
  This prevents any future `evals/` test files from running under `npm test`. Verify `npm test` still passes (existing `src/` tests) and no longer picks up `evals/lib/*.test.ts` files. Note: evals unit tests (parse-stream, runner) can still be run with `tsx --test evals/lib/` or a dedicated script if desired, but they are intentionally excluded from `npm test` (FR-010).

- [ ] Create `evals/run-evals.ts` as the minimal orchestrator entry point:
  - Parse `--fixture <path>` (default: `'evals/fixture/'`) and `--timeout <seconds>` (default: `120`) from `process.argv` using a simple manual parser (no Commander dependency — three flags do not justify a CLI framework).
  - Call `preflight()` from `runner.ts`. On failure, print the error message to stderr and `process.exit(1)`.
  - Validate that the resolved fixture directory exists (`fs.existsSync`); if not, print `"Fixture directory not found: <path>. Run 'smithy init -a claude -y' in the fixture directory first."` and `process.exit(1)`.
  - Run a single hardcoded smoke-test scenario via `runScenario`: `{ name: 'smoke-test', skill: '/smithy.strike', prompt: '/smithy.strike "add a health check endpoint"', timeout: parsed timeout, structural_expectations: { required_headings: [] } }`. Print on completion: `"Smoke test complete. extracted_text length: <N> chars, timed_out: <bool>, exit_code: <N>"`. This entry point is intentionally minimal — US7 will replace the hardcoded scenario with YAML loading.
  - Exit 0 on success, 1 on any error or non-zero exit code from the scenario.

- [ ] Verify end-to-end: `npm run typecheck` covers `evals/run-evals.ts` without errors. Running `npm run eval` when `claude` is not in PATH exits 1 with an actionable error message (not an uncaught exception). Running `npm test` does NOT invoke `runScenario` or any live `claude -p` calls.

**PR Outcome**: The evals framework is runnable end-to-end via `npm run eval`. Pre-flight checks gate execution with actionable error messages. Eval cases are fully decoupled from the test suite, satisfying FR-010.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1: Stream Parser and Shared Types** — no upstream code dependencies; validates the parsing layer in isolation; must exist before Slice 2 can import from it.
2. **Slice 2: Runner with Fixture Management** — imports `parse-stream.ts` and `types.ts` from Slice 1; delivers the core US3 capability (all four acceptance scenarios pass).
3. **Slice 3: Entry Point and Build Tooling** — imports `runner.ts` from Slice 2; wires the pipeline into a runnable CLI; required for end-to-end smoke testing.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Reference Fixture Exists and Is Deployable | depends on | US3's runner accepts any `fixtureDir` and is fully unit-testable with synthetic temp dirs. Full end-to-end smoke testing (Slice 3) requires the actual `evals/fixture/` created by US2. Slice 3 should note this dependency in the entry point's error message if the fixture is missing. |
| User Story 4: Validate Output Structure | depended upon by | US4's structural validator (`evals/lib/structural.ts`) consumes `RunOutput.extracted_text` and `CheckResult` types defined in Slice 1. US4 imports from `runner.ts` and `types.ts`. |
| User Story 7: Define Eval Scenarios Declaratively | depended upon by | US7 replaces the hardcoded smoke-test scenario in `evals/run-evals.ts` (Slice 3) with YAML loading from `evals/cases/`. |
| User Story 9: Eval Summary Report | depended upon by | US9 extends `evals/run-evals.ts` to aggregate `EvalResult[]` and print an `EvalReport` to stdout. |

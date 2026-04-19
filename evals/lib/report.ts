/**
 * Eval summary report library.
 *
 * Pure, dependency-free helpers that derive per-scenario `EvalResult`s from
 * runner output, aggregate them into an `EvalReport`, and render the report
 * to a stdout-ready string.
 *
 * No I/O, no console output, no process control — everything is exercised
 * via unit tests in `report.test.ts`. The orchestrator (`run-evals.ts`)
 * imports these functions in Slice 2.
 *
 * Implements FR-009; backs Acceptance Scenarios 9.1, 9.2, 9.3.
 */

import type {
  CheckResult,
  EvalReport,
  EvalResult,
  EvalScenario,
  RunOutput,
} from './types.js';

/**
 * Assemble an `EvalResult` from the scenario, runner output, and the
 * computed structural / sub-agent / baseline check arrays.
 *
 * Status precedence (AS 9.3, extended by US10):
 *   1. `output.timed_out === true`                          → `'timeout'`
 *   2. `output.exit_code !== 0`                             → `'error'`
 *   3. any failing structural / sub-agent / baseline check → `'fail'`
 *   4. otherwise                                            → `'pass'`
 *
 * The function is pure: it does not mutate any of its inputs and performs
 * no I/O. `sub_agent_checks` and `baseline_checks` are omitted from the
 * returned object when the caller passes `undefined` or an empty array.
 * The `error` field is only populated for `'timeout'` and `'error'`
 * statuses.
 */
export function scenarioRunToResult(
  scenario: EvalScenario,
  output: RunOutput,
  structuralChecks: CheckResult[],
  subAgentChecks?: CheckResult[],
  baselineChecks?: CheckResult[],
): EvalResult {
  let status: EvalResult['status'];
  let error: string | undefined;

  if (output.timed_out) {
    status = 'timeout';
    error = `Scenario timed out after ${output.duration_ms}ms`;
  } else if (output.exit_code !== 0) {
    status = 'error';
    error = `claude CLI exited with non-zero status code ${output.exit_code}`;
  } else {
    const structuralFailed = structuralChecks.some((c) => !c.passed);
    const subAgentFailed = subAgentChecks
      ? subAgentChecks.some((c) => !c.passed)
      : false;
    const baselineFailed = baselineChecks
      ? baselineChecks.some((c) => !c.passed)
      : false;
    status =
      structuralFailed || subAgentFailed || baselineFailed ? 'fail' : 'pass';
  }

  const result: EvalResult = {
    scenario_name: scenario.name,
    status,
    extracted_text: output.extracted_text,
    duration_ms: output.duration_ms,
    structural_checks: structuralChecks,
  };

  if (subAgentChecks && subAgentChecks.length > 0) {
    result.sub_agent_checks = subAgentChecks;
  }

  if (baselineChecks && baselineChecks.length > 0) {
    result.baseline_checks = baselineChecks;
  }

  if (error !== undefined) {
    result.error = error;
  }

  return result;
}

/**
 * Aggregate an array of `EvalResult`s into a single `EvalReport`.
 *
 * Tallies `passed` as `status === 'pass'` and `failed` as every non-`pass`
 * status (including `fail`, `timeout`, and `error`). `overall_status` is
 * `'pass'` only when every result passed; an empty `results` array yields a
 * well-formed empty report with `overall_status: 'pass'` and zero counts.
 *
 * The function is pure: it does not mutate `results` and performs no I/O.
 * `timestamp` is set to the current wall-clock time (ISO 8601) at call time;
 * `total_duration_ms` is passed through unchanged from the caller.
 *
 * Backs Acceptance Scenarios 9.1 and 9.2.
 */
export function buildReport(
  results: EvalResult[],
  totalDurationMs: number,
): EvalReport {
  let passed = 0;
  for (const result of results) {
    if (result.status === 'pass') {
      passed += 1;
    }
  }
  const failed = results.length - passed;
  const overall_status: EvalReport['overall_status'] =
    failed === 0 ? 'pass' : 'fail';

  return {
    timestamp: new Date().toISOString(),
    total_cases: results.length,
    passed,
    failed,
    overall_status,
    results: results.slice(),
    total_duration_ms: totalDurationMs,
  };
}

/**
 * Map an `EvalResult` status to its uppercase display token.
 *
 * The four tokens are intentionally distinct strings so that callers can
 * use word-boundary matching to tell `TIMEOUT` and `ERROR` apart from
 * `FAIL` (AS 9.3).
 */
function statusToken(status: EvalResult['status']): string {
  switch (status) {
    case 'pass':
      return 'PASS';
    case 'fail':
      return 'FAIL';
    case 'timeout':
      return 'TIMEOUT';
    case 'error':
      return 'ERROR';
  }
}

/**
 * Render an `EvalReport` to a deterministic, multi-line, stdout-ready
 * string.
 *
 * Output shape:
 *
 *     Eval Summary
 *       [PASS] strike-health-check (1234ms)
 *       [FAIL] plan-standalone (5678ms)
 *       [TIMEOUT] scout-standalone (120000ms)
 *       [ERROR] clarify-standalone (42ms)
 *
 *     Total elapsed: 127000ms
 *     Result: FAIL (1/4 passed, 4 total)
 *
 * When at least one result in the report has populated `baseline_checks`,
 * each per-case line is extended with a compact `baseline: PASS`,
 * `baseline: FAIL`, or `baseline: n/a` marker (AS 10.3 — the marker only
 * appears when at least one case opts into baselines, so scenarios without
 * a baseline never pollute the default output):
 *
 *     Eval Summary
 *       [PASS] strike-health-check (1234ms) baseline: PASS
 *       [FAIL] plan-standalone (5678ms) baseline: FAIL
 *       [PASS] no-baseline-case (789ms) baseline: n/a
 *
 *     Total elapsed: 127000ms
 *     Result: FAIL (1/3 passed, 3 total)
 *
 * The function is pure: no I/O, no `console.log`, no mutation of `report`.
 * Per-case lines are emitted in `report.results` order so the output is
 * stable across calls — making snapshot-style assertions feasible. The four
 * status tokens (`PASS`, `FAIL`, `TIMEOUT`, `ERROR`) are distinct strings,
 * so word-boundary matchers can distinguish a timeout case from a fail
 * case (AS 9.3). The final aggregate line carries the overall result
 * (`PASS` or `FAIL`) plus the total case count (AS 9.1, 9.2); the
 * `Total elapsed:` line precedes it so the `Result:` line remains last
 * (US11 AS 11.2, FR-009). Durations render as integer milliseconds with
 * the `ms` suffix uniformly across per-case and total lines. The
 * `Total elapsed:` and `Result:` summary lines are unchanged regardless
 * of whether baseline markers appear (US10 Slice 2 — additions only).
 */
export function formatReport(report: EvalReport): string {
  const lines: string[] = ['Eval Summary'];

  const anyBaseline = report.results.some(
    (r) => r.baseline_checks && r.baseline_checks.length > 0,
  );

  for (const result of report.results) {
    const token = statusToken(result.status);
    let line = `  [${token}] ${result.scenario_name} (${result.duration_ms}ms)`;
    if (anyBaseline) {
      line += ` baseline: ${baselineMarker(result)}`;
    }
    lines.push(line);
  }

  const overallToken = report.overall_status === 'pass' ? 'PASS' : 'FAIL';
  lines.push('');
  lines.push(`Total elapsed: ${report.total_duration_ms}ms`);
  lines.push(
    `Result: ${overallToken} (${report.passed}/${report.total_cases} passed, ${report.total_cases} total)`,
  );

  return lines.join('\n');
}

/**
 * Compute the compact baseline marker token for a single result.
 *
 * Returns `'PASS'` when `baseline_checks` is present and every check
 * passed, `'FAIL'` when it is present and at least one check failed, and
 * `'n/a'` when the result has no baseline checks (undefined or empty).
 * The caller is responsible for deciding whether to render the marker
 * at all — this function is only consulted when the enclosing report
 * has at least one result with non-empty `baseline_checks`.
 */
function baselineMarker(result: EvalResult): string {
  const checks = result.baseline_checks;
  if (!checks || checks.length === 0) {
    return 'n/a';
  }
  return checks.every((c) => c.passed) ? 'PASS' : 'FAIL';
}

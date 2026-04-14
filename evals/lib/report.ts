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
  EvalResult,
  EvalScenario,
  RunOutput,
} from './types.js';

/**
 * Assemble an `EvalResult` from the scenario, runner output, and the
 * computed structural / sub-agent check arrays.
 *
 * Status precedence (AS 9.3):
 *   1. `output.timed_out === true`              → `'timeout'`
 *   2. `output.exit_code !== 0`                 → `'error'`
 *   3. any failing structural / sub-agent check → `'fail'`
 *   4. otherwise                                → `'pass'`
 *
 * The function is pure: it does not mutate any of its inputs and performs
 * no I/O. `sub_agent_checks` is omitted from the returned object when the
 * caller passes `undefined` or an empty array. The `error` field is only
 * populated for `'timeout'` and `'error'` statuses.
 */
export function scenarioRunToResult(
  scenario: EvalScenario,
  output: RunOutput,
  structuralChecks: CheckResult[],
  subAgentChecks?: CheckResult[],
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
    status = structuralFailed || subAgentFailed ? 'fail' : 'pass';
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

  if (error !== undefined) {
    result.error = error;
  }

  return result;
}

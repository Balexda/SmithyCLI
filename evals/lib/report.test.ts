import { describe, it, expect, vi } from 'vitest';
import { scenarioRunToResult, buildReport, formatReport } from './report.js';
import type {
  CheckResult,
  EvalResult,
  EvalScenario,
  RunOutput,
} from './types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeScenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    name: 'sample-scenario',
    skill: '/smithy.strike',
    prompt: 'do a thing',
    structural_expectations: {
      required_headings: ['## Plan'],
    },
    ...overrides,
  };
}

function makeOutput(overrides: Partial<RunOutput> = {}): RunOutput {
  return {
    extracted_text: '## Plan\n\nDetails here.',
    stream_events: [],
    duration_ms: 1234,
    exit_code: 0,
    timed_out: false,
    ...overrides,
  };
}

const passingCheck: CheckResult = {
  check_name: "has '## Plan' heading",
  passed: true,
  actual: 'found',
};

const failingCheck: CheckResult = {
  check_name: "has '## Summary' heading",
  passed: false,
  actual: 'not found',
};

// ---------------------------------------------------------------------------
// scenarioRunToResult
// ---------------------------------------------------------------------------

describe('scenarioRunToResult', () => {
  // -----------------------------------------------------------------------
  // Status: pass
  // -----------------------------------------------------------------------
  describe('pass status', () => {
    it('returns pass when output is clean and all structural checks pass', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const result = scenarioRunToResult(scenario, output, [passingCheck]);

      expect(result.status).toBe('pass');
      expect(result.error).toBeUndefined();
    });

    it('omits sub_agent_checks when not provided', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const result = scenarioRunToResult(scenario, output, [passingCheck]);

      expect('sub_agent_checks' in result).toBe(false);
    });

    it('omits sub_agent_checks when provided as an empty array', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const result = scenarioRunToResult(scenario, output, [passingCheck], []);

      expect('sub_agent_checks' in result).toBe(false);
    });

    it('returns pass when both structural and sub-agent checks pass', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const subAgentCheck: CheckResult = {
        check_name: 'smithy-plan evidence present',
        passed: true,
        actual: 'matched in extracted text',
      };
      const result = scenarioRunToResult(
        scenario,
        output,
        [passingCheck],
        [subAgentCheck],
      );

      expect(result.status).toBe('pass');
      expect(result.sub_agent_checks).toEqual([subAgentCheck]);
      expect(result.error).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Status: fail
  // -----------------------------------------------------------------------
  describe('fail status', () => {
    it('returns fail when at least one structural check fails', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const result = scenarioRunToResult(scenario, output, [
        passingCheck,
        failingCheck,
      ]);

      expect(result.status).toBe('fail');
      expect(result.error).toBeUndefined();
    });

    it('returns fail when at least one sub-agent check fails', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const failingSubAgent: CheckResult = {
        check_name: 'smithy-plan evidence present',
        passed: false,
        actual: 'no match found',
      };
      const result = scenarioRunToResult(
        scenario,
        output,
        [passingCheck],
        [failingSubAgent],
      );

      expect(result.status).toBe('fail');
      expect(result.error).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Status: error
  // -----------------------------------------------------------------------
  describe('error status', () => {
    it('returns error when exit_code is non-zero', () => {
      const scenario = makeScenario();
      const output = makeOutput({ exit_code: 1 });
      const result = scenarioRunToResult(scenario, output, [passingCheck]);

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it('error status takes precedence over failing checks', () => {
      const scenario = makeScenario();
      const output = makeOutput({ exit_code: 2 });
      const result = scenarioRunToResult(scenario, output, [failingCheck]);

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });

    it('includes the exit code in the error message', () => {
      const scenario = makeScenario();
      const output = makeOutput({ exit_code: 42 });
      const result = scenarioRunToResult(scenario, output, [passingCheck]);

      expect(result.error).toContain('42');
    });
  });

  // -----------------------------------------------------------------------
  // Status: timeout
  // -----------------------------------------------------------------------
  describe('timeout status', () => {
    it('returns timeout when timed_out is true', () => {
      const scenario = makeScenario();
      const output = makeOutput({ timed_out: true });
      const result = scenarioRunToResult(scenario, output, [passingCheck]);

      expect(result.status).toBe('timeout');
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
      expect(result.error!.length).toBeGreaterThan(0);
    });

    it('timeout takes precedence over non-zero exit_code AND failing checks', () => {
      const scenario = makeScenario();
      const output = makeOutput({ timed_out: true, exit_code: 137 });
      const result = scenarioRunToResult(scenario, output, [failingCheck]);

      expect(result.status).toBe('timeout');
      expect(result.error).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Field population
  // -----------------------------------------------------------------------
  describe('field population', () => {
    it('populates scenario_name from scenario.name', () => {
      const scenario = makeScenario({ name: 'my-special-case' });
      const output = makeOutput();
      const result = scenarioRunToResult(scenario, output, [passingCheck]);

      expect(result.scenario_name).toBe('my-special-case');
    });

    it('populates extracted_text from output.extracted_text', () => {
      const scenario = makeScenario();
      const output = makeOutput({ extracted_text: 'unique extracted body' });
      const result = scenarioRunToResult(scenario, output, [passingCheck]);

      expect(result.extracted_text).toBe('unique extracted body');
    });

    it('populates duration_ms from output.duration_ms', () => {
      const scenario = makeScenario();
      const output = makeOutput({ duration_ms: 9876 });
      const result = scenarioRunToResult(scenario, output, [passingCheck]);

      expect(result.duration_ms).toBe(9876);
    });

    it('populates structural_checks from the input array', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const checks = [passingCheck, failingCheck];
      const result = scenarioRunToResult(scenario, output, checks);

      expect(result.structural_checks).toEqual(checks);
    });
  });

  // -----------------------------------------------------------------------
  // Purity
  // -----------------------------------------------------------------------
  describe('purity', () => {
    it('does not mutate the structural_checks input array', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const checks: CheckResult[] = [passingCheck];
      const before = JSON.stringify(checks);
      scenarioRunToResult(scenario, output, checks);
      expect(JSON.stringify(checks)).toBe(before);
    });

    it('does not mutate the sub_agent_checks input array', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const subChecks: CheckResult[] = [
        {
          check_name: 'smithy-plan evidence present',
          passed: true,
          actual: 'matched',
        },
      ];
      const before = JSON.stringify(subChecks);
      scenarioRunToResult(scenario, output, [passingCheck], subChecks);
      expect(JSON.stringify(subChecks)).toBe(before);
    });

    it('does not mutate the scenario or output inputs', () => {
      const scenario = makeScenario();
      const output = makeOutput({ exit_code: 1 });
      const scenarioBefore = JSON.stringify(scenario);
      const outputBefore = JSON.stringify(output);
      scenarioRunToResult(scenario, output, [passingCheck]);
      expect(JSON.stringify(scenario)).toBe(scenarioBefore);
      expect(JSON.stringify(output)).toBe(outputBefore);
    });
  });
});

// ---------------------------------------------------------------------------
// buildReport
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<EvalResult> = {}): EvalResult {
  return {
    scenario_name: 'sample',
    status: 'pass',
    extracted_text: '## Plan\n\nDetails.',
    duration_ms: 100,
    structural_checks: [passingCheck],
    ...overrides,
  };
}

describe('buildReport', () => {
  // -----------------------------------------------------------------------
  // Aggregate counts and overall status
  // -----------------------------------------------------------------------
  describe('aggregate counts and overall status', () => {
    it('returns overall_status pass with all-pass results (3 cases)', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'a' }),
        makeResult({ scenario_name: 'b' }),
        makeResult({ scenario_name: 'c' }),
      ];
      const report = buildReport(results, 5000);

      expect(report.overall_status).toBe('pass');
      expect(report.total_cases).toBe(3);
      expect(report.passed).toBe(3);
      expect(report.failed).toBe(0);
    });

    it('returns overall_status fail with 2 pass + 1 fail', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'a', status: 'pass' }),
        makeResult({ scenario_name: 'b', status: 'pass' }),
        makeResult({ scenario_name: 'c', status: 'fail' }),
      ];
      const report = buildReport(results, 7500);

      expect(report.overall_status).toBe('fail');
      expect(report.total_cases).toBe(3);
      expect(report.passed).toBe(2);
      expect(report.failed).toBe(1);
    });

    it('counts timeout and error as failed (1 pass + 1 timeout + 1 error)', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'a', status: 'pass' }),
        makeResult({
          scenario_name: 'b',
          status: 'timeout',
          error: 'timed out',
        }),
        makeResult({
          scenario_name: 'c',
          status: 'error',
          error: 'exit 1',
        }),
      ];
      const report = buildReport(results, 12000);

      expect(report.overall_status).toBe('fail');
      expect(report.total_cases).toBe(3);
      expect(report.passed).toBe(1);
      expect(report.failed).toBe(2);
    });

    it('returns a well-formed empty report for zero-length results', () => {
      const report = buildReport([], 0);

      expect(report.overall_status).toBe('pass');
      expect(report.total_cases).toBe(0);
      expect(report.passed).toBe(0);
      expect(report.failed).toBe(0);
      expect(report.results).toEqual([]);
      expect(report.total_duration_ms).toBe(0);
      expect(typeof report.timestamp).toBe('string');
    });
  });

  // -----------------------------------------------------------------------
  // Field passthrough and shape
  // -----------------------------------------------------------------------
  describe('field passthrough', () => {
    it('total_duration_ms equals the passed-in argument', () => {
      const report = buildReport([makeResult()], 9876);
      expect(report.total_duration_ms).toBe(9876);
    });

    it('results field contains every input result in order', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'first' }),
        makeResult({ scenario_name: 'second' }),
        makeResult({ scenario_name: 'third' }),
      ];
      const report = buildReport(results, 100);

      expect(report.results).toHaveLength(3);
      expect(report.results[0]?.scenario_name).toBe('first');
      expect(report.results[1]?.scenario_name).toBe('second');
      expect(report.results[2]?.scenario_name).toBe('third');
    });
  });

  // -----------------------------------------------------------------------
  // Timestamp
  // -----------------------------------------------------------------------
  describe('timestamp', () => {
    it('returns a valid ISO 8601 timestamp string', () => {
      const report = buildReport([makeResult()], 100);

      expect(typeof report.timestamp).toBe('string');
      // ISO 8601 with milliseconds and Z suffix, as produced by toISOString()
      expect(report.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(Number.isNaN(Date.parse(report.timestamp))).toBe(false);
    });

    it('sets timestamp at call time (within a small window of now)', () => {
      const before = Date.now();
      const report = buildReport([makeResult()], 100);
      const after = Date.now();

      const ts = Date.parse(report.timestamp);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  // -----------------------------------------------------------------------
  // Purity
  // -----------------------------------------------------------------------
  describe('purity', () => {
    it('does not mutate the input results array', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'a' }),
        makeResult({ scenario_name: 'b', status: 'fail' }),
      ];
      const before = JSON.stringify(results);
      buildReport(results, 1000);
      expect(JSON.stringify(results)).toBe(before);
    });

    it('does not throw when called with a frozen results array', () => {
      const results: EvalResult[] = Object.freeze([
        makeResult({ scenario_name: 'a' }),
        makeResult({ scenario_name: 'b' }),
      ]) as EvalResult[];

      expect(() => buildReport(results, 500)).not.toThrow();
      const report = buildReport(results, 500);
      expect(report.total_cases).toBe(2);
      expect(report.passed).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// formatReport
// ---------------------------------------------------------------------------

describe('formatReport', () => {
  // -----------------------------------------------------------------------
  // Return type and side effects
  // -----------------------------------------------------------------------
  describe('return type and side effects', () => {
    it('returns a string', () => {
      const report = buildReport([makeResult()], 100);
      const out = formatReport(report);

      expect(typeof out).toBe('string');
    });

    it('does not call console.log', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const report = buildReport(
          [
            makeResult({ scenario_name: 'a' }),
            makeResult({ scenario_name: 'b', status: 'fail' }),
          ],
          200,
        );
        formatReport(report);
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });

  // -----------------------------------------------------------------------
  // All-pass report (AS 9.1)
  // -----------------------------------------------------------------------
  describe('all-pass report', () => {
    it('renders each scenario_name with a PASS token and final PASS line with total count', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'alpha' }),
        makeResult({ scenario_name: 'beta' }),
        makeResult({ scenario_name: 'gamma' }),
      ];
      const report = buildReport(results, 1500);
      const out = formatReport(report);
      const lines = out.split('\n');

      // Each scenario has a line with its name and a PASS token
      for (const name of ['alpha', 'beta', 'gamma']) {
        const line = lines.find((l) => l.includes(name));
        expect(line, `expected line for ${name}`).toBeDefined();
        expect(line!).toMatch(/\bPASS\b/);
        expect(line!).not.toMatch(/\b(FAIL|TIMEOUT|ERROR)\b/);
      }

      // Final aggregate line carries PASS and total count
      const finalLine = lines[lines.length - 1] ?? '';
      expect(finalLine).toMatch(/\bPASS\b/);
      expect(finalLine).toContain('3');
    });
  });

  // -----------------------------------------------------------------------
  // Mixed pass/fail report (AS 9.2)
  // -----------------------------------------------------------------------
  describe('mixed 2-pass / 1-fail report', () => {
    it('renders each scenario_name; both PASS and FAIL tokens appear; final line is FAIL', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'alpha', status: 'pass' }),
        makeResult({ scenario_name: 'beta', status: 'pass' }),
        makeResult({ scenario_name: 'gamma', status: 'fail' }),
      ];
      const report = buildReport(results, 2500);
      const out = formatReport(report);
      const lines = out.split('\n');

      const alphaLine = lines.find((l) => l.includes('alpha'));
      const betaLine = lines.find((l) => l.includes('beta'));
      const gammaLine = lines.find((l) => l.includes('gamma'));

      expect(alphaLine).toBeDefined();
      expect(betaLine).toBeDefined();
      expect(gammaLine).toBeDefined();

      expect(alphaLine!).toMatch(/\bPASS\b/);
      expect(betaLine!).toMatch(/\bPASS\b/);
      expect(gammaLine!).toMatch(/\bFAIL\b/);
      expect(gammaLine!).not.toMatch(/\b(PASS|TIMEOUT|ERROR)\b/);

      const finalLine = lines[lines.length - 1] ?? '';
      expect(finalLine).toMatch(/\bFAIL\b/);
      expect(finalLine).toContain('3');
    });
  });

  // -----------------------------------------------------------------------
  // Timeout-included report (AS 9.3)
  // -----------------------------------------------------------------------
  describe('timeout-included report', () => {
    it('renders TIMEOUT as a distinct token, not FAIL or ERROR', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'happy', status: 'pass' }),
        makeResult({
          scenario_name: 'slow-poke',
          status: 'timeout',
          error: 'timed out after 60000ms',
        }),
      ];
      const report = buildReport(results, 60500);
      const out = formatReport(report);
      const lines = out.split('\n');

      const timeoutLine = lines.find((l) => l.includes('slow-poke'));
      expect(timeoutLine).toBeDefined();
      expect(timeoutLine!).toMatch(/\bTIMEOUT\b/);
      expect(timeoutLine!).not.toMatch(/\b(FAIL|ERROR|PASS)\b/);

      const happyLine = lines.find((l) => l.includes('happy'));
      expect(happyLine).toBeDefined();
      expect(happyLine!).toMatch(/\bPASS\b/);

      const finalLine = lines[lines.length - 1] ?? '';
      expect(finalLine).toMatch(/\bFAIL\b/);
      expect(finalLine).toContain('2');
    });
  });

  // -----------------------------------------------------------------------
  // Error-included report
  // -----------------------------------------------------------------------
  describe('error-included report', () => {
    it('renders ERROR as a distinct token, not FAIL or TIMEOUT', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'ok', status: 'pass' }),
        makeResult({
          scenario_name: 'crashy',
          status: 'error',
          error: 'claude CLI exited with non-zero status code 1',
        }),
      ];
      const report = buildReport(results, 1200);
      const out = formatReport(report);
      const lines = out.split('\n');

      const errorLine = lines.find((l) => l.includes('crashy'));
      expect(errorLine).toBeDefined();
      expect(errorLine!).toMatch(/\bERROR\b/);
      expect(errorLine!).not.toMatch(/\b(FAIL|TIMEOUT|PASS)\b/);

      const finalLine = lines[lines.length - 1] ?? '';
      expect(finalLine).toMatch(/\bFAIL\b/);
      expect(finalLine).toContain('2');
    });
  });

  // -----------------------------------------------------------------------
  // Duration rendering (US11 AS 11.2 / FR-009)
  // -----------------------------------------------------------------------
  describe('duration rendering', () => {
    it('renders the per-case duration on a single passing case line', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'alpha', duration_ms: 1234 }),
      ];
      const report = buildReport(results, 1500);
      const out = formatReport(report);
      const lines = out.split('\n');

      const caseLine = lines.find((l) => l.includes('alpha'));
      expect(caseLine).toBeDefined();
      expect(caseLine!).toContain('1234ms');
    });

    it('renders per-case durations and a total elapsed line on a mixed-status report', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'alpha', status: 'pass', duration_ms: 100 }),
        makeResult({ scenario_name: 'beta', status: 'fail', duration_ms: 250 }),
        makeResult({
          scenario_name: 'gamma',
          status: 'timeout',
          duration_ms: 60000,
          error: 'timed out',
        }),
      ];
      const report = buildReport(results, 60500);
      const out = formatReport(report);
      const lines = out.split('\n');

      const alphaLine = lines.find((l) => l.includes('alpha'));
      const betaLine = lines.find((l) => l.includes('beta'));
      const gammaLine = lines.find((l) => l.includes('gamma'));
      expect(alphaLine).toBeDefined();
      expect(betaLine).toBeDefined();
      expect(gammaLine).toBeDefined();
      expect(alphaLine!).toContain('100ms');
      expect(betaLine!).toContain('250ms');
      expect(gammaLine!).toContain('60000ms');

      const totalLine = lines.find((l) => l.startsWith('Total elapsed:'));
      expect(totalLine).toBeDefined();
      expect(totalLine!).toContain('60500ms');
    });

    it('renders a valid summary with a zero total for an empty results array', () => {
      const report = buildReport([], 0);
      const out = formatReport(report);
      const lines = out.split('\n');

      expect(lines[0]).toBe('Eval Summary');
      const totalLine = lines.find((l) => l.startsWith('Total elapsed:'));
      expect(totalLine).toBeDefined();
      expect(totalLine!).toContain('0ms');

      const finalLine = lines[lines.length - 1] ?? '';
      expect(finalLine).toMatch(/\bPASS\b/);
      expect(finalLine).toContain('0');
    });
  });

  // -----------------------------------------------------------------------
  // Determinism
  // -----------------------------------------------------------------------
  describe('determinism', () => {
    it('returns the identical string when called twice on the same report', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'a', status: 'pass' }),
        makeResult({ scenario_name: 'b', status: 'fail' }),
        makeResult({
          scenario_name: 'c',
          status: 'timeout',
          error: 'timed out',
        }),
        makeResult({
          scenario_name: 'd',
          status: 'error',
          error: 'exit 1',
        }),
      ];
      const report = buildReport(results, 9000);

      const first = formatReport(report);
      const second = formatReport(report);

      expect(first).toBe(second);
    });

    it('renders results in input order', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'first-name' }),
        makeResult({ scenario_name: 'second-name' }),
        makeResult({ scenario_name: 'third-name' }),
      ];
      const report = buildReport(results, 300);
      const out = formatReport(report);

      const firstIdx = out.indexOf('first-name');
      const secondIdx = out.indexOf('second-name');
      const thirdIdx = out.indexOf('third-name');

      expect(firstIdx).toBeGreaterThanOrEqual(0);
      expect(secondIdx).toBeGreaterThan(firstIdx);
      expect(thirdIdx).toBeGreaterThan(secondIdx);
    });
  });
});

// ---------------------------------------------------------------------------
// Baseline checks wiring (US10 Slice 2)
// ---------------------------------------------------------------------------

describe('baseline checks wiring', () => {
  const passingBaselineCheck: CheckResult = {
    check_name: "has baseline heading '## Summary'",
    passed: true,
    actual: 'found',
  };

  const failingBaselineCheck: CheckResult = {
    check_name: "has baseline heading '## Approach'",
    passed: false,
    actual: 'not found',
  };

  // -----------------------------------------------------------------------
  // scenarioRunToResult: baseline_checks population
  // -----------------------------------------------------------------------
  describe('scenarioRunToResult baseline_checks population', () => {
    it('populates baseline_checks when given a non-empty array', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const baselineChecks = [passingBaselineCheck];
      const result = scenarioRunToResult(
        scenario,
        output,
        [passingCheck],
        undefined,
        baselineChecks,
      );

      expect(result.baseline_checks).toEqual(baselineChecks);
    });

    it('omits baseline_checks when not provided', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const result = scenarioRunToResult(scenario, output, [passingCheck]);

      expect('baseline_checks' in result).toBe(false);
    });

    it('omits baseline_checks when provided as an empty array', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const result = scenarioRunToResult(
        scenario,
        output,
        [passingCheck],
        undefined,
        [],
      );

      expect('baseline_checks' in result).toBe(false);
    });

    it('omits baseline_checks when provided as undefined explicitly', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const result = scenarioRunToResult(
        scenario,
        output,
        [passingCheck],
        undefined,
        undefined,
      );

      expect('baseline_checks' in result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // scenarioRunToResult: status precedence
  // -----------------------------------------------------------------------
  describe('scenarioRunToResult status precedence with baseline checks', () => {
    it('returns fail when any baseline check fails and no other failure reason', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const result = scenarioRunToResult(
        scenario,
        output,
        [passingCheck],
        undefined,
        [passingBaselineCheck, failingBaselineCheck],
      );

      expect(result.status).toBe('fail');
      expect(result.error).toBeUndefined();
    });

    it('returns pass when all baseline checks pass and structural checks pass', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const result = scenarioRunToResult(
        scenario,
        output,
        [passingCheck],
        undefined,
        [passingBaselineCheck],
      );

      expect(result.status).toBe('pass');
    });

    it('timeout takes precedence over a failing baseline check', () => {
      const scenario = makeScenario();
      const output = makeOutput({ timed_out: true });
      const result = scenarioRunToResult(
        scenario,
        output,
        [passingCheck],
        undefined,
        [failingBaselineCheck],
      );

      expect(result.status).toBe('timeout');
      expect(result.error).toBeDefined();
    });

    it('error (non-zero exit_code) takes precedence over a failing baseline check', () => {
      const scenario = makeScenario();
      const output = makeOutput({ exit_code: 1 });
      const result = scenarioRunToResult(
        scenario,
        output,
        [passingCheck],
        undefined,
        [failingBaselineCheck],
      );

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });

    it('combines structural failure and baseline failure as fail', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const result = scenarioRunToResult(
        scenario,
        output,
        [failingCheck],
        undefined,
        [failingBaselineCheck],
      );

      expect(result.status).toBe('fail');
    });
  });

  // -----------------------------------------------------------------------
  // scenarioRunToResult: purity
  // -----------------------------------------------------------------------
  describe('scenarioRunToResult purity (baseline)', () => {
    it('does not mutate the baseline_checks input array', () => {
      const scenario = makeScenario();
      const output = makeOutput();
      const baselineChecks: CheckResult[] = [passingBaselineCheck];
      const before = JSON.stringify(baselineChecks);
      scenarioRunToResult(
        scenario,
        output,
        [passingCheck],
        undefined,
        baselineChecks,
      );
      expect(JSON.stringify(baselineChecks)).toBe(before);
    });
  });

  // -----------------------------------------------------------------------
  // formatReport: no baseline present anywhere
  // -----------------------------------------------------------------------
  describe('formatReport with no baseline_checks anywhere', () => {
    it('renders per-case lines byte-identical to pre-slice behavior', () => {
      const results: EvalResult[] = [
        makeResult({ scenario_name: 'alpha', duration_ms: 111 }),
        makeResult({ scenario_name: 'beta', duration_ms: 222, status: 'fail' }),
      ];
      const report = buildReport(results, 400);
      const out = formatReport(report);
      const lines = out.split('\n');

      // Per-case lines must not contain 'baseline:' marker.
      const alphaLine = lines.find((l) => l.includes('alpha'));
      const betaLine = lines.find((l) => l.includes('beta'));
      expect(alphaLine).toBeDefined();
      expect(betaLine).toBeDefined();
      expect(alphaLine!).not.toContain('baseline:');
      expect(betaLine!).not.toContain('baseline:');

      // Exact line shape preserved from US9.
      expect(alphaLine!).toBe('  [PASS] alpha (111ms)');
      expect(betaLine!).toBe('  [FAIL] beta (222ms)');
    });
  });

  // -----------------------------------------------------------------------
  // formatReport: at least one result has baseline_checks
  // -----------------------------------------------------------------------
  describe('formatReport with at least one result carrying baseline_checks', () => {
    it('renders baseline: PASS for results with all-passing baseline checks', () => {
      const results: EvalResult[] = [
        makeResult({
          scenario_name: 'alpha',
          baseline_checks: [passingBaselineCheck],
        }),
      ];
      const report = buildReport(results, 500);
      const out = formatReport(report);
      const lines = out.split('\n');

      const alphaLine = lines.find((l) => l.includes('alpha'));
      expect(alphaLine).toBeDefined();
      expect(alphaLine!).toContain('baseline: PASS');
      expect(alphaLine!).not.toContain('baseline: FAIL');
      expect(alphaLine!).not.toContain('baseline: n/a');
    });

    it('renders baseline: FAIL for results with any failing baseline check', () => {
      const results: EvalResult[] = [
        makeResult({
          scenario_name: 'alpha',
          status: 'fail',
          baseline_checks: [passingBaselineCheck, failingBaselineCheck],
        }),
      ];
      const report = buildReport(results, 500);
      const out = formatReport(report);
      const lines = out.split('\n');

      const alphaLine = lines.find((l) => l.includes('alpha'));
      expect(alphaLine).toBeDefined();
      expect(alphaLine!).toContain('baseline: FAIL');
      expect(alphaLine!).not.toContain('baseline: PASS');
    });

    it('renders baseline: n/a for results without baseline_checks when other results have them', () => {
      const results: EvalResult[] = [
        makeResult({
          scenario_name: 'alpha',
          baseline_checks: [passingBaselineCheck],
        }),
        makeResult({ scenario_name: 'beta' }),
      ];
      const report = buildReport(results, 500);
      const out = formatReport(report);
      const lines = out.split('\n');

      const alphaLine = lines.find((l) => l.includes('alpha'));
      const betaLine = lines.find((l) => l.includes('beta'));
      expect(alphaLine).toBeDefined();
      expect(betaLine).toBeDefined();

      expect(alphaLine!).toContain('baseline: PASS');
      expect(betaLine!).toContain('baseline: n/a');
    });

    it('keeps Total elapsed: and Result: summary lines unchanged when baseline markers are present', () => {
      const results: EvalResult[] = [
        makeResult({
          scenario_name: 'alpha',
          baseline_checks: [passingBaselineCheck],
        }),
        makeResult({ scenario_name: 'beta' }),
      ];
      const report = buildReport(results, 750);
      const out = formatReport(report);
      const lines = out.split('\n');

      const totalLine = lines.find((l) => l.startsWith('Total elapsed:'));
      expect(totalLine).toBeDefined();
      expect(totalLine!).toBe('Total elapsed: 750ms');

      const finalLine = lines[lines.length - 1] ?? '';
      expect(finalLine).toBe('Result: PASS (2/2 passed, 2 total)');
    });

    it('renders baseline markers on all per-case lines when any result has baseline_checks', () => {
      const results: EvalResult[] = [
        makeResult({
          scenario_name: 'alpha',
          baseline_checks: [passingBaselineCheck],
        }),
        makeResult({
          scenario_name: 'beta',
          status: 'fail',
          baseline_checks: [failingBaselineCheck],
        }),
        makeResult({ scenario_name: 'gamma' }),
      ];
      const report = buildReport(results, 1000);
      const out = formatReport(report);
      const lines = out.split('\n');

      const alphaLine = lines.find((l) => l.includes('alpha'));
      const betaLine = lines.find((l) => l.includes('beta'));
      const gammaLine = lines.find((l) => l.includes('gamma'));
      expect(alphaLine).toBeDefined();
      expect(betaLine).toBeDefined();
      expect(gammaLine).toBeDefined();

      expect(alphaLine!).toContain('baseline: PASS');
      expect(betaLine!).toContain('baseline: FAIL');
      expect(gammaLine!).toContain('baseline: n/a');
    });
  });
});

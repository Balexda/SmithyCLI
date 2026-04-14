import { describe, it, expect } from 'vitest';
import { scenarioRunToResult, buildReport } from './report.js';
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

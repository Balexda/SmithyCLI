import { describe, it, expect } from 'vitest';
import { scenarioRunToResult } from './report.js';
import type {
  CheckResult,
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

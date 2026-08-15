import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareToBaseline, loadBaseline } from './baseline.js';
import { buildReport, formatReport, scenarioRunToResult } from './report.js';
import { loadScenarioFromFile } from './scenario-loader.js';
import { validateStructure } from './structural.js';
import type { RunOutput } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoEvalsDir = path.resolve(here, '..');
const baselinesDir = path.resolve(repoEvalsDir, 'baselines');
const baselineFile = path.resolve(baselinesDir, 'fix-from-issue.json');
const captureOutputPath = path.resolve(
  repoEvalsDir,
  'captures',
  'fix-from-issue.txt',
);
const scenarioPath = path.resolve(
  repoEvalsDir,
  'cases',
  'fix-from-issue.yaml',
);

const capturedTokens = {
  input: 60200,
  output: 2400,
};

function makeOutput(text: string): RunOutput {
  return {
    extracted_text: text,
    stream_events: [],
    tokens: capturedTokens,
    duration_ms: 100,
    exit_code: 0,
    timed_out: false,
  };
}

describe('fix-from-issue token-aware baseline seed', () => {
  it('exists on disk at evals/baselines/fix-from-issue.json', () => {
    expect(
      fs.existsSync(baselineFile),
      `expected baseline file to exist at ${baselineFile}`,
    ).toBe(true);
  });

  it("loads for scenario_name 'fix-from-issue'", () => {
    const baseline = loadBaseline('fix-from-issue', baselinesDir);

    expect(baseline).not.toBeNull();
    expect(baseline!.scenario_name).toBe('fix-from-issue');
    expect(baseline!.token_envelope).toEqual({
      input: { min: 30000, max: 90000 },
      output: { min: 500, max: 6000 },
    });
  });

  it("preserves the YAML scenario's structural expectations", () => {
    const scenario = loadScenarioFromFile(scenarioPath);
    const baseline = loadBaseline('fix-from-issue', baselinesDir);

    expect(baseline).not.toBeNull();
    for (const heading of scenario.structural_expectations.required_headings) {
      expect(baseline!.headings).toContain(heading);
    }
  });

  it('passes baseline comparison against the captured known-good output', () => {
    const baseline = loadBaseline('fix-from-issue', baselinesDir);
    expect(baseline).not.toBeNull();

    const captureOutput = fs.readFileSync(captureOutputPath, 'utf8');
    const results = compareToBaseline(captureOutput, baseline!, capturedTokens);

    expect(results.filter((check) => !check.passed)).toEqual([]);
    // The comparator emits a single assertion covering every declared range,
    // so a token-aware baseline adds exactly one check — not one per range.
    expect(
      results.filter((check) => check.check_name === 'token envelope'),
    ).toHaveLength(1);
  });

  it('fails baseline checks when structure or token totals drift', () => {
    const baseline = loadBaseline('fix-from-issue', baselinesDir);
    expect(baseline).not.toBeNull();

    const results = compareToBaseline(
      'Verification: npm run build passed.',
      baseline!,
      { input: 95000, output: 6500 },
    );

    expect(
      results.filter((check) => !check.passed).map((check) => check.check_name),
    ).toEqual([
      "has baseline heading '## Diagnosis'",
      'baseline regression summary',
      'token envelope',
    ]);
  });

  it('renders a passing baseline marker for the captured known-good run', () => {
    const scenario = loadScenarioFromFile(scenarioPath);
    const baseline = loadBaseline('fix-from-issue', baselinesDir);
    expect(baseline).not.toBeNull();

    const captureOutput = fs.readFileSync(captureOutputPath, 'utf8');
    const output = makeOutput(captureOutput);
    const structuralChecks = validateStructure(
      captureOutput,
      scenario.structural_expectations,
    );
    const baselineChecks = compareToBaseline(
      captureOutput,
      baseline!,
      output.tokens,
    );
    const result = scenarioRunToResult(
      scenario,
      output,
      structuralChecks,
      [],
      baselineChecks,
    );
    const report = buildReport([result], 100);
    const rendered = formatReport(report);

    expect(result.status).toBe('pass');
    expect(rendered).toContain(
      '[PASS] fix-from-issue (100ms) input: 60200, output: 2400 baseline: PASS',
    );
  });

  it('keeps no-baseline scenarios on the existing n/a marker path', () => {
    const baselineResult = scenarioRunToResult(
      loadScenarioFromFile(scenarioPath),
      makeOutput(fs.readFileSync(captureOutputPath, 'utf8')),
      [{ check_name: 'structural check', passed: true }],
      [],
      [{ check_name: 'baseline check', passed: true }],
    );
    const noBaselineResult = {
      ...baselineResult,
      scenario_name: 'no-baseline-case',
      baseline_checks: undefined,
    };

    const rendered = formatReport(
      buildReport([baselineResult, noBaselineResult], 200),
    );

    expect(rendered).toContain('fix-from-issue');
    expect(rendered).toContain('baseline: PASS');
    expect(rendered).toContain('no-baseline-case');
    expect(rendered).toContain('baseline: n/a');
  });
});

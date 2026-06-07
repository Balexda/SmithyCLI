import { describe, expect, it } from 'vitest';

import {
  buildCandidateMeasurementPlan,
  buildMeasurementResults,
  candidateRunToScenario,
} from './candidate-measurement.js';

describe('candidate measurement plan', () => {
  it('creates isolated runs for both strategies across JS and JVM fixtures', () => {
    const runs = buildCandidateMeasurementPlan(
      {
        tasks_file:
          'specs/example/01-select-the-bounded-context-delivery-mechanism.tasks.md',
        slice_number: 1,
      },
      [
        { fixture: 'js', fixture_dir: 'evals/fixture' },
        { fixture: 'jvm', fixture_dir: 'evals/fixture/jvm' },
      ],
    );

    expect(runs).toHaveLength(4);
    expect(runs.map((r) => `${r.fixture}:${r.strategy}`).sort()).toEqual([
      'js:per_task_brief',
      'js:pre_pasted_excerpts',
      'jvm:per_task_brief',
      'jvm:pre_pasted_excerpts',
    ]);
    for (const run of runs) {
      expect(run.skill).toBe('/smithy.forge');
      expect(run.prompt).toContain(
        '01-select-the-bounded-context-delivery-mechanism.tasks.md 1',
      );
      expect(run.prompt).toContain('Candidate measurement mode:');
      expect(run.prompt).toContain('build-output');
      expect(run.measurement_mode).toBe(true);
    }
  });

  it('converts a candidate run to an eval scenario without changing forge command syntax', () => {
    const runs = buildCandidateMeasurementPlan(
      { tasks_file: 'specs/example/01-story.tasks.md', slice_number: 2 },
      [{ fixture: 'js', fixture_dir: 'evals/fixture' }],
    );
    const run = runs[0]!;

    const scenario = candidateRunToScenario(run);

    expect(scenario.name).toBe('forge-js-pre_pasted_excerpts');
    expect(scenario.skill).toBe('/smithy.forge');
    expect(scenario.prompt).toContain('specs/example/01-story.tasks.md 2');
    expect(scenario.structural_expectations.required_headings).toEqual([
      '## Summary',
    ]);
  });
});

describe('buildMeasurementResults', () => {
  it('maps candidate and fixture runs to MeasurementResult records', () => {
    const results = buildMeasurementResults(
      [
        {
          strategy: 'pre_pasted_excerpts',
          fixture: 'js',
          tokens: { input: 700, output: 200 },
          structural_eval_result: 'pass',
          sampled_review_result: 'pass',
        },
        {
          strategy: 'per_task_brief',
          fixture: 'jvm',
          tokens: { input: 1200, output: 300 },
          structural_eval_result: 'fail',
          sampled_review_result: 'not_reviewed',
        },
      ],
      [
        { fixture: 'js', baseline_total_tokens: 1000 },
        { fixture: 'jvm', baseline_total_tokens: 2000 },
      ],
    );

    expect(results).toEqual([
      {
        strategy: 'pre_pasted_excerpts',
        fixture: 'js',
        baseline_total_tokens: 1000,
        candidate_total_tokens: 900,
        input_tokens: 700,
        output_tokens: 200,
        delta_percent: -10,
        structural_eval_result: 'pass',
        sampled_review_result: 'pass',
      },
      {
        strategy: 'per_task_brief',
        fixture: 'jvm',
        baseline_total_tokens: 2000,
        candidate_total_tokens: 1500,
        input_tokens: 1200,
        output_tokens: 300,
        delta_percent: -25,
        structural_eval_result: 'fail',
        sampled_review_result: 'not_reviewed',
      },
    ]);
  });

  it('computes token deltas from the matching fixture baseline', () => {
    const results = buildMeasurementResults(
      [
        {
          strategy: 'per_task_brief',
          fixture: 'jvm',
          tokens: { input: 1500, output: 500 },
          structural_eval_result: 'pass',
          sampled_review_result: 'pass',
        },
      ],
      [
        { fixture: 'js', baseline_total_tokens: 1000 },
        { fixture: 'jvm', baseline_total_tokens: 4000 },
      ],
    );
    const result = results[0]!;

    expect(result.baseline_total_tokens).toBe(4000);
    expect(result.candidate_total_tokens).toBe(2000);
    expect(result.delta_percent).toBe(-50);
  });

  it('blocks measurement when a matching fixture baseline is missing', () => {
    expect(() =>
      buildMeasurementResults(
        [
          {
            strategy: 'pre_pasted_excerpts',
            fixture: 'jvm',
            tokens: { input: 1, output: 1 },
            structural_eval_result: 'pass',
            sampled_review_result: 'not_reviewed',
          },
        ],
        [{ fixture: 'js', baseline_total_tokens: 10 }],
      ),
    ).toThrow(/missing jvm fixture baseline/);
  });

  it('blocks incomplete candidate token data instead of producing a comparison', () => {
    expect(() =>
      buildMeasurementResults(
        [
          {
            strategy: 'per_task_brief',
            fixture: 'js',
            tokens: { input: 10.5, output: 2 },
            structural_eval_result: 'pass',
            sampled_review_result: 'pass',
          },
        ],
        [{ fixture: 'js', baseline_total_tokens: 20 }],
      ),
    ).toThrow(/input_tokens must be a non-negative integer/);
  });
});

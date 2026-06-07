import type { EvalScenario } from './types.js';

export type CandidateStrategy = 'pre_pasted_excerpts' | 'per_task_brief';
export type ForgeFixture = 'js' | 'jvm';
export type StructuralEvalResult = 'pass' | 'fail';
export type SampledReviewResult = 'pass' | 'fail' | 'not_reviewed';

export interface ForgeSliceShape {
  tasks_file: string;
  slice_number: number;
}

export interface FixtureInput {
  fixture: ForgeFixture;
  fixture_dir: string;
}

export interface CandidateMeasurementRun {
  strategy: CandidateStrategy;
  fixture: ForgeFixture;
  fixture_dir: string;
  tasks_file: string;
  slice_number: number;
  skill: '/smithy.forge';
  prompt: string;
  measurement_mode: true;
}

export interface TokenTotalsInput {
  input: number;
  output: number;
}

export interface CandidateRunResultInput {
  strategy: CandidateStrategy;
  fixture: ForgeFixture;
  tokens: TokenTotalsInput;
  structural_eval_result: StructuralEvalResult;
  sampled_review_result: SampledReviewResult;
}

export interface FixtureBaselineInput {
  fixture: ForgeFixture;
  baseline_total_tokens: number;
}

export interface MeasurementResult {
  strategy: CandidateStrategy;
  fixture: ForgeFixture;
  baseline_total_tokens: number;
  candidate_total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  delta_percent: number;
  structural_eval_result: StructuralEvalResult;
  sampled_review_result: SampledReviewResult;
}

const STRATEGIES: CandidateStrategy[] = [
  'pre_pasted_excerpts',
  'per_task_brief',
];

/**
 * Build isolated smithy.forge eval runs for candidate measurement.
 *
 * The returned scenarios all use the same forge slice arguments and only vary
 * the candidate context strategy and fixture. This keeps candidate measurement
 * outside normal forge dispatch while still letting the eval runner execute
 * each strategy independently against JS and JVM fixtures.
 */
export function buildCandidateMeasurementPlan(
  slice: ForgeSliceShape,
  fixtures: FixtureInput[],
): CandidateMeasurementRun[] {
  if (!Number.isInteger(slice.slice_number) || slice.slice_number <= 0) {
    throw new Error('slice_number must be a positive integer');
  }
  if (slice.tasks_file.length === 0) {
    throw new Error('tasks_file must be a non-empty string');
  }
  if (fixtures.length === 0) {
    throw new Error('at least one fixture is required');
  }

  return fixtures.flatMap((fixture) => {
    assertFixture(fixture.fixture);
    if (fixture.fixture_dir.length === 0) {
      throw new Error(`fixture_dir for ${fixture.fixture} must be non-empty`);
    }

    return STRATEGIES.map((strategy) => ({
      strategy,
      fixture: fixture.fixture,
      fixture_dir: fixture.fixture_dir,
      tasks_file: slice.tasks_file,
      slice_number: slice.slice_number,
      skill: '/smithy.forge' as const,
      prompt: [
        `${slice.tasks_file} ${slice.slice_number}`,
        '',
        `Candidate measurement mode: ${strategy}.`,
        'Keep normal smithy.forge build-output, test-command, TDD-protocol, and model-assignment behavior unchanged.',
      ].join('\n'),
      measurement_mode: true as const,
    }));
  });
}

export function candidateRunToScenario(
  run: CandidateMeasurementRun,
): EvalScenario {
  return {
    name: `forge-${run.fixture}-${run.strategy}`,
    skill: run.skill,
    prompt: run.prompt,
    structural_expectations: {
      required_headings: ['## Summary'],
    },
  };
}

export function buildMeasurementResults(
  candidateRuns: CandidateRunResultInput[],
  baselines: FixtureBaselineInput[],
): MeasurementResult[] {
  if (candidateRuns.length === 0) {
    throw new Error('at least one candidate run result is required');
  }

  const baselinesByFixture = new Map<ForgeFixture, number>();
  for (const baseline of baselines) {
    assertFixture(baseline.fixture);
    assertNonNegativeInteger(
      baseline.baseline_total_tokens,
      `${baseline.fixture} baseline_total_tokens`,
    );
    if (baseline.baseline_total_tokens === 0) {
      throw new Error(
        `${baseline.fixture} baseline_total_tokens must be greater than zero`,
      );
    }
    baselinesByFixture.set(baseline.fixture, baseline.baseline_total_tokens);
  }

  return candidateRuns.map((run) => {
    assertStrategy(run.strategy);
    assertFixture(run.fixture);
    assertStructuralResult(run.structural_eval_result);
    assertSampledReviewResult(run.sampled_review_result);
    if (run.tokens === undefined || run.tokens === null) {
      throw new Error(
        `${run.strategy}/${run.fixture} is missing token totals`,
      );
    }
    assertNonNegativeInteger(
      run.tokens.input,
      `${run.strategy}/${run.fixture} input_tokens`,
    );
    assertNonNegativeInteger(
      run.tokens.output,
      `${run.strategy}/${run.fixture} output_tokens`,
    );

    const baselineTotal = baselinesByFixture.get(run.fixture);
    if (baselineTotal === undefined) {
      throw new Error(`missing ${run.fixture} fixture baseline`);
    }

    const candidateTotal = run.tokens.input + run.tokens.output;
    const deltaPercent =
      ((candidateTotal - baselineTotal) / baselineTotal) * 100;

    return {
      strategy: run.strategy,
      fixture: run.fixture,
      baseline_total_tokens: baselineTotal,
      candidate_total_tokens: candidateTotal,
      input_tokens: run.tokens.input,
      output_tokens: run.tokens.output,
      delta_percent: deltaPercent,
      structural_eval_result: run.structural_eval_result,
      sampled_review_result: run.sampled_review_result,
    };
  });
}

function assertStrategy(strategy: CandidateStrategy): void {
  if (!STRATEGIES.includes(strategy)) {
    throw new Error(`unsupported candidate strategy: ${String(strategy)}`);
  }
}

function assertFixture(fixture: ForgeFixture): void {
  if (fixture !== 'js' && fixture !== 'jvm') {
    throw new Error(`unsupported fixture: ${String(fixture)}`);
  }
}

function assertStructuralResult(result: StructuralEvalResult): void {
  if (result !== 'pass' && result !== 'fail') {
    throw new Error(`unsupported structural_eval_result: ${String(result)}`);
  }
}

function assertSampledReviewResult(result: SampledReviewResult): void {
  if (result !== 'pass' && result !== 'fail' && result !== 'not_reviewed') {
    throw new Error(`unsupported sampled_review_result: ${String(result)}`);
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

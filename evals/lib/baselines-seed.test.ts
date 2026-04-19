/**
 * Tests for the seeded baseline file `evals/baselines/strike-health-check.json`.
 *
 * These tests pin the committed baseline against the checked-in spike capture
 * (`evals/spike/output-strike.txt`) and the strike YAML scenario's structural
 * expectations, so drift in any of the three surfaces fails immediately under
 * `npm run test:evals`:
 *   - the on-disk baseline JSON,
 *   - `strike-health-check.yaml`'s `required_headings`,
 *   - the spike capture.
 *
 * The baseline is data, not code — it is expected to be regenerated manually
 * when the strike template legitimately changes.
 *
 * Addresses: FR-009; Acceptance Scenario 10.1; Slice 2 Task 3.
 *
 * Spec:       specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md
 * Data model: specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md §5
 * Tasks:      specs/2026-04-06-003-smithy-evals-framework/10-baseline-structural-expectations.tasks.md
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareToBaseline, loadBaseline } from './baseline.js';
import { loadScenarioFromFile } from './scenario-loader.js';
import type { Baseline } from './types.js';

// Resolve paths relative to this source file so tests pass regardless of cwd
// (same approach used in strike-scenario.ts and strike-scenario.test.ts).
const here = path.dirname(fileURLToPath(import.meta.url));
const repoEvalsDir = path.resolve(here, '..');
const baselinesDir = path.resolve(repoEvalsDir, 'baselines');
const baselineFile = path.resolve(baselinesDir, 'strike-health-check.json');
const strikeCasePath = path.resolve(
  repoEvalsDir,
  'cases',
  'strike-health-check.yaml',
);
const spikeOutputPath = path.resolve(
  repoEvalsDir,
  'spike',
  'output-strike.txt',
);

describe('strike-health-check baseline seed', () => {
  it('exists on disk at evals/baselines/strike-health-check.json', () => {
    expect(
      fs.existsSync(baselineFile),
      `expected baseline file to exist at ${baselineFile}`,
    ).toBe(true);
  });

  it('is parseable by loadBaseline and does not throw', () => {
    // Use explicit `baselinesDir` so the test is independent of process.cwd().
    const baseline = loadBaseline('strike-health-check', baselinesDir);
    expect(baseline).not.toBeNull();
  });

  it("scenario_name exactly matches 'strike-health-check'", () => {
    const baseline = loadBaseline('strike-health-check', baselinesDir);
    expect(baseline).not.toBeNull();
    expect(baseline!.scenario_name).toBe('strike-health-check');
  });

  it('captured_at is a non-empty string', () => {
    const baseline = loadBaseline('strike-health-check', baselinesDir);
    expect(baseline).not.toBeNull();
    expect(typeof baseline!.captured_at).toBe('string');
    expect(baseline!.captured_at.length).toBeGreaterThan(0);
  });

  it("headings is a superset of the YAML scenario's required_headings", () => {
    // Derive expected headings from the YAML scenario, so a single
    // edit to the YAML flows through without hand-syncing this test.
    const strikeScenario = loadScenarioFromFile(strikeCasePath);
    const requiredHeadings =
      strikeScenario.structural_expectations.required_headings;

    const baseline = loadBaseline('strike-health-check', baselinesDir);
    expect(baseline).not.toBeNull();

    for (const heading of requiredHeadings) {
      expect(
        baseline!.headings,
        `baseline.headings is missing '${heading}' required by the strike YAML scenario`,
      ).toContain(heading);
    }
  });

  it('compareToBaseline against the spike capture produces an all-pass result (AS 10.1)', () => {
    const baseline = loadBaseline(
      'strike-health-check',
      baselinesDir,
    ) as Baseline;
    expect(baseline).not.toBeNull();

    const spikeOutput = fs.readFileSync(spikeOutputPath, 'utf8');
    const results = compareToBaseline(spikeOutput, baseline);

    const failed = results.filter((r) => !r.passed);
    expect(
      failed,
      `expected every baseline check to pass against the known-good spike output, got:\n${JSON.stringify(failed, null, 2)}`,
    ).toHaveLength(0);

    // Sanity-check: the aggregate summary entry is also present and passed.
    const summary = results.find(
      (r) => r.check_name === 'baseline regression summary',
    );
    expect(summary).toBeDefined();
    expect(summary!.passed).toBe(true);
  });

  it('each baseline table entry matches a row in the spike output', () => {
    const baseline = loadBaseline(
      'strike-health-check',
      baselinesDir,
    ) as Baseline;
    expect(baseline).not.toBeNull();

    const spikeOutput = fs.readFileSync(spikeOutputPath, 'utf8');
    const results = compareToBaseline(spikeOutput, baseline);

    const tableChecks = results.filter((r) =>
      r.check_name.startsWith('has baseline table with columns:'),
    );
    // Seed must carry at least one table to exercise the per-table branch.
    expect(tableChecks.length).toBeGreaterThan(0);
    for (const check of tableChecks) {
      expect(check.passed, `table check failed: ${check.check_name}`).toBe(true);
    }
  });
});

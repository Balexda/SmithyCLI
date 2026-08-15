import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadScenarioFromFile } from './scenario-loader.js';
import { validateStructure, verifySubAgents } from './structural.js';
import { scenarioRunToResult } from './report.js';
import type { RunOutput } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const scenarioPath = path.join(repoRoot, 'evals/cases/fix-from-issue.yaml');

function makeOutput(text: string): RunOutput {
  return {
    extracted_text: text,
    stream_events: [],
    tokens: { input: 0, output: 0 },
    duration_ms: 100,
    exit_code: 0,
    timed_out: false,
  };
}

describe('fix-from-issue scenario validation', () => {
  it('passes calibrated structural checks and the no-helper branch offline', () => {
    const scenario = loadScenarioFromFile(scenarioPath);
    const outputText = [
      '## Diagnosis',
      '',
      '- **Error**: the smoke check receives 404 for GET /health.',
      '- **Cause**: src/index.ts mounts /api/users but no health endpoint.',
      '- **Fix**: add a minimal /health route in src/index.ts.',
      '',
      'Verification: npm run build passed.',
    ].join('\n');

    const structuralChecks = validateStructure(
      outputText,
      scenario.structural_expectations,
    );
    const helperChecks = verifySubAgents(
      outputText,
      [],
      scenario.sub_agent_evidence ?? [],
    );
    const result = scenarioRunToResult(
      scenario,
      makeOutput(outputText),
      structuralChecks,
      helperChecks,
    );

    expect(scenario.name).toBe('fix-from-issue');
    expect(scenario.sub_agent_evidence).toBeUndefined();
    expect(structuralChecks.every((check) => check.passed)).toBe(true);
    expect(helperChecks).toEqual([]);
    expect(result.status).toBe('pass');
    expect(result.sub_agent_checks).toBeUndefined();
  });

  it('fails when verification result evidence is absent', () => {
    const scenario = loadScenarioFromFile(scenarioPath);
    const outputText = [
      '## Diagnosis',
      '',
      '- **Error**: the smoke check receives 404 for GET /health.',
      '- **Cause**: src/index.ts mounts /api/users but no health endpoint.',
      '- **Fix**: add a minimal /health route in src/index.ts.',
    ].join('\n');

    const structuralChecks = validateStructure(
      outputText,
      scenario.structural_expectations,
    );
    const result = scenarioRunToResult(
      scenario,
      makeOutput(outputText),
      structuralChecks,
      [],
    );

    expect(
      structuralChecks.filter((check) => !check.passed).map((check) => check.expected),
    ).toEqual([
      '(npm run build|npm test|[Vv]erification)',
      '([Pp]ass|[Pp]assed|[Pp]asses|successful|succeeded)',
    ]);
    expect(result.status).toBe('fail');
  });
});

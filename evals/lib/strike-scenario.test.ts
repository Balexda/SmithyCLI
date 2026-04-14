import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { strikeScenario } from './strike-scenario.js';
import { validateStructure } from './structural.js';
import type { CheckResult } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const spikeOutput = fs.readFileSync(
  path.resolve(__dirname, '..', 'spike', 'output-strike.txt'),
  'utf8',
);

const forbiddenPatterns = strikeScenario.structural_expectations.forbidden_patterns!;
const FRONTMATTER_PATTERN = forbiddenPatterns[0]!;
const REFUSAL_PATTERN = forbiddenPatterns[1]!;

function findForbiddenCheck(results: CheckResult[], pattern: string): CheckResult | undefined {
  return results.find((r) => r.expected === pattern && r.check_name.startsWith('forbidden pattern'));
}

describe('strikeScenario against captured spike output', () => {
  it('passes every structural check on the unmodified spike sample', () => {
    const results = validateStructure(
      spikeOutput,
      strikeScenario.structural_expectations,
    );

    expect(results.length).toBeGreaterThan(0);
    const failed = results.filter((r) => !r.passed);
    expect(failed, `unexpected failing checks: ${JSON.stringify(failed, null, 2)}`).toEqual([]);
  });

  it('flags the leading-frontmatter case (AS 5.2)', () => {
    const withFrontmatter = `---\nname: leaked\n---\n${spikeOutput}`;

    const results = validateStructure(
      withFrontmatter,
      strikeScenario.structural_expectations,
    );

    const check = findForbiddenCheck(results, FRONTMATTER_PATTERN);
    expect(check, 'frontmatter forbidden_pattern check missing').toBeDefined();
    expect(check!.passed).toBe(false);
  });

  it('flags a generic-refusal output (FR-012)', () => {
    // Use the configured refusal phrase verbatim so the test stays in sync
    // with whatever the scenario declares.
    const refusal = `${REFUSAL_PATTERN} you add a health check endpoint. Could you tell me more?`;

    const results = validateStructure(
      refusal,
      strikeScenario.structural_expectations,
    );

    const check = findForbiddenCheck(results, REFUSAL_PATTERN);
    expect(check, 'refusal forbidden_pattern check missing').toBeDefined();
    expect(check!.passed).toBe(false);
  });
});

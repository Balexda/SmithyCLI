/**
 * Unit tests for the strike eval scenario.
 *
 * Pins `strikeScenario` against the checked-in spike capture
 * (`evals/spike/output-strike.txt`) so drift in either the structural
 * expectations or the real-world strike sample surfaces immediately under
 * `npm run test:evals`, without requiring a live `claude` invocation.
 *
 * Addresses: FR-005, FR-006, FR-012; Acceptance Scenarios 5.1, 5.2, 5.3
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateStructure } from './structural.js';
import { strikeScenario } from './strike-scenario.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const spikeOutputPath = path.resolve(here, '..', 'spike', 'output-strike.txt');
const spikeOutput = fs.readFileSync(spikeOutputPath, 'utf8');

describe('strikeScenario', () => {
  it('passes every structural check against the checked-in spike capture', () => {
    // AS 5.1 / AS 5.3: the real strike output should satisfy the scenario's
    // structural expectations end-to-end.
    const results = validateStructure(
      spikeOutput,
      strikeScenario.structural_expectations,
    );

    const failed = results.filter((r) => !r.passed);
    expect(failed, `expected zero failing checks, got:\n${JSON.stringify(failed, null, 2)}`)
      .toHaveLength(0);

    // Sanity: confirm the scenario actually runs the checks we expect so a
    // future edit that drops an assertion is caught here.
    const names = results.map((r) => r.check_name);
    expect(names).toContain("has '## Summary' heading");
    expect(names).toContain("has '## Approach' heading");
    expect(names).toContain("has '## Risks' heading");
    expect(names.some((n) => n.startsWith('required pattern present:'))).toBe(true);
    expect(names.some((n) => n.startsWith('forbidden pattern absent:'))).toBe(true);
  });

  it('flags leading YAML frontmatter as a failure (AS 5.2)', () => {
    // Prefix the real spike capture with synthetic frontmatter. The scenario's
    // `^---\r?\n` forbidden pattern must catch this even though the unmodified
    // capture also contains `---` as a mid-document separator.
    const withFrontmatter =
      '---\ntitle: Strike\nmodel: sonnet\n---\n\n' + spikeOutput;

    const results = validateStructure(
      withFrontmatter,
      strikeScenario.structural_expectations,
    );

    const frontmatterCheck = results.find((r) =>
      r.check_name.includes('forbidden pattern absent: ^---'),
    );
    expect(frontmatterCheck).toBeDefined();
    expect(frontmatterCheck!.passed).toBe(false);
  });

  it('flags leading YAML frontmatter with CRLF line endings (AS 5.2)', () => {
    // Windows-captured output may use CRLF. The `\r?\n` in the forbidden
    // pattern keeps the check portable across platforms.
    const withCrlfFrontmatter =
      '---\r\ntitle: Strike\r\nmodel: sonnet\r\n---\r\n\r\n' + spikeOutput;

    const results = validateStructure(
      withCrlfFrontmatter,
      strikeScenario.structural_expectations,
    );

    const frontmatterCheck = results.find((r) =>
      r.check_name.includes('forbidden pattern absent: ^---'),
    );
    expect(frontmatterCheck).toBeDefined();
    expect(frontmatterCheck!.passed).toBe(false);
  });

  it('flags a generic-refusal response as a failure (FR-012)', () => {
    // Replace the sample with a canonical refusal string. The scenario must
    // flag the refusal via forbidden_patterns AND report missing structural
    // headings — together that is how a non-triggered skill surfaces.
    const refusal =
      "I'd be happy to help you add a health check endpoint. Could you share more details about your project?";

    const results = validateStructure(
      refusal,
      strikeScenario.structural_expectations,
    );

    const refusalCheck = results.find((r) =>
      r.check_name.includes("forbidden pattern absent: I'd be happy to help"),
    );
    expect(refusalCheck).toBeDefined();
    expect(refusalCheck!.passed).toBe(false);

    // And the structural headings should also be missing, reinforcing the
    // "skill did not trigger" signal.
    const summaryCheck = results.find(
      (r) => r.check_name === "has '## Summary' heading",
    );
    expect(summaryCheck!.passed).toBe(false);
  });
});

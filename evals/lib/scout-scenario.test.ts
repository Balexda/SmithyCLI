/**
 * Unit tests for the scout eval scenario.
 *
 * Pins `scoutScenario` against synthetic scout outputs so drift in either the
 * structural expectations or the expected report shape surfaces immediately
 * under `npm run test:evals`, without requiring a live `claude` invocation.
 * Scout has no checked-in spike capture (the scenario is exercised end-to-end
 * via `npm run eval`), so positive and negative samples are constructed inline.
 *
 * Addresses: FR-005, FR-006, FR-012, FR-016; Acceptance Scenarios 8.1, 8.2
 */

import { describe, it, expect } from 'vitest';

import { validateStructure, verifySubAgents } from './structural.js';
import { scoutScenario } from './scout-scenario.js';
import type { AgentDispatch } from './types.js';

// ---------------------------------------------------------------------------
// Synthetic samples
// ---------------------------------------------------------------------------

/**
 * A structurally complete Scout Report containing all four required headings,
 * the template-driven `**Depth**:` metadata line that follows the top heading,
 * and populated Warnings and Conflicts tables. Each table has at least one
 * data row whose first cell begins with a lowercase file path, satisfying the
 * `\n\| \`?[a-z./]` required-pattern regex (AS 8.1). The `**Depth**:` line is
 * required for the `sub_agent_evidence` pattern to match — its anchor
 * (`## Scout Report\n\n\*\*Depth\*\*`) targets scout's template output marker
 * (see scout-scenario.ts).
 */
const positiveSample = `## Scout Report

**Depth**: shallow
**Files scanned**: 3 (cap reached: no)

### Clean

No clean findings to report at shallow depth.

### Warnings

| File | Line | Warning | Details |
|------|------|---------|---------|
| src/routes/users.ts | 25 | TODO marker | TODO: add health check endpoint once users route stabilizes |

### Conflicts

| File | Line | Conflict | Details |
|------|------|----------|---------|
| src/routes/users.ts | 14 | Doc/signature mismatch | Doc comment describes a sync API but the handler is async |
`;

/**
 * Same shape as `positiveSample` but with no data rows in the Warnings or
 * Conflicts tables — only the header and separator rows remain. This is the
 * sample that locks AS 8.1: without at least one finding row the scenario
 * must fail, even if every heading is present.
 */
const emptyTablesSample = `## Scout Report

### Clean

No clean findings to report at shallow depth.

### Warnings

| File | Line | Warning | Details |
|------|------|---------|---------|

### Conflicts

| File | Line | Conflict | Details |
|------|------|----------|---------|
`;

/**
 * Scout-ish content that is missing the top-level `## Scout Report` heading
 * entirely. The required-heading check for `## Scout Report` must fail even
 * though the sub-section headings are present.
 */
const missingTopHeadingSample = `### Clean

No clean findings to report at shallow depth.

### Warnings

| File | Line | Warning | Details |
|------|------|---------|---------|
| src/routes/users.ts | 25 | TODO marker | TODO: add health check endpoint |

### Conflicts

| File | Line | Conflict | Details |
|------|------|----------|---------|
| src/routes/users.ts | 14 | Doc/signature mismatch | Handler is async but doc says sync |
`;

/**
 * A canonical generic-refusal string (FR-012). Scout must flag this via the
 * `I'd be happy to help` forbidden pattern so a non-triggered sub-agent
 * surfaces as a failure rather than a silent pass.
 */
const refusalSample =
  "I'd be happy to help you scan this fixture. Could you share more details?";

describe('scoutScenario', () => {
  it('passes every structural check for a populated Scout Report (AS 8.1 / AS 8.2)', () => {
    const results = validateStructure(
      positiveSample,
      scoutScenario.structural_expectations,
    );

    const failed = results.filter((r) => !r.passed);
    expect(
      failed,
      `expected zero failing checks, got:\n${JSON.stringify(failed, null, 2)}`,
    ).toHaveLength(0);

    // Sanity: confirm the scenario actually runs the checks we expect so a
    // future edit that drops an assertion is caught here.
    const names = results.map((r) => r.check_name);
    expect(names).toContain("has '## Scout Report' heading");
    expect(names).toContain("has '### Clean' heading");
    expect(names).toContain("has '### Warnings' heading");
    expect(names).toContain("has '### Conflicts' heading");
    expect(names.some((n) => n.startsWith('required pattern present:'))).toBe(true);
    expect(names.some((n) => n.startsWith('forbidden pattern absent:'))).toBe(true);

    // Sub-agent evidence: dispatch phrasing in assistant text should satisfy
    // the `smithy-scout` entry in `sub_agent_evidence` (FR-016).
    const dispatches: AgentDispatch[] = [
      {
        id: 'toolu_01_synthetic',
        description: 'dispatching the smithy-scout sub-agent against src/',
        prompt:
          'Scan src/index.ts, src/types.ts, src/routes/users.ts at shallow depth.',
        resultText: positiveSample,
      },
    ];
    const evidenceResults = verifySubAgents(
      positiveSample,
      dispatches,
      scoutScenario.sub_agent_evidence!,
    );
    const evidenceFailed = evidenceResults.filter((r) => !r.passed);
    expect(
      evidenceFailed,
      `expected zero failing evidence checks, got:\n${JSON.stringify(evidenceFailed, null, 2)}`,
    ).toHaveLength(0);
  });

  it('fails the "at least one finding row" check when Warnings and Conflicts tables are empty (locks AS 8.1)', () => {
    const results = validateStructure(
      emptyTablesSample,
      scoutScenario.structural_expectations,
    );

    const rowCheck = results.find((r) =>
      r.check_name.startsWith('required pattern present:'),
    );
    expect(rowCheck).toBeDefined();
    expect(rowCheck!.passed).toBe(false);

    // The heading checks should still pass — this test is narrowly about the
    // row-detection requirement, not overall template conformance.
    for (const heading of scoutScenario.structural_expectations.required_headings) {
      const headingCheck = results.find(
        (r) => r.check_name === `has '${heading}' heading`,
      );
      expect(headingCheck, `missing heading check for ${heading}`).toBeDefined();
      expect(headingCheck!.passed).toBe(true);
    }
  });

  it("fails the required-heading check when '## Scout Report' is absent", () => {
    const results = validateStructure(
      missingTopHeadingSample,
      scoutScenario.structural_expectations,
    );

    const topHeadingCheck = results.find(
      (r) => r.check_name === "has '## Scout Report' heading",
    );
    expect(topHeadingCheck).toBeDefined();
    expect(topHeadingCheck!.passed).toBe(false);
  });

  it('flags a generic-refusal response via forbidden_patterns (FR-012)', () => {
    const results = validateStructure(
      refusalSample,
      scoutScenario.structural_expectations,
    );

    const refusalCheck = results.find((r) =>
      r.check_name.includes("forbidden pattern absent: I'd be happy to help"),
    );
    expect(refusalCheck).toBeDefined();
    expect(refusalCheck!.passed).toBe(false);
  });

  it('fails sub-agent evidence when dispatch is absent and output is a refusal (FR-016)', () => {
    const dispatches: AgentDispatch[] = [];
    const evidenceResults = verifySubAgents(
      refusalSample,
      dispatches,
      scoutScenario.sub_agent_evidence!,
    );

    const scoutEvidenceCheck = evidenceResults.find(
      (r) => r.check_name === 'smithy-scout evidence present',
    );
    expect(scoutEvidenceCheck).toBeDefined();
    expect(scoutEvidenceCheck!.passed).toBe(false);
  });
});

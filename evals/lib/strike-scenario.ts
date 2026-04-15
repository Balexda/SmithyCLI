/**
 * Strike end-to-end eval scenario.
 *
 * Captures the structural expectations that `/smithy.strike` output must
 * satisfy when invoked against the reference fixture. Exported as a typed
 * `EvalScenario` so both the orchestrator (`run-evals.ts`) and the scenario
 * unit test (`strike-scenario.test.ts`) share a single source of truth.
 *
 * US6 will extend this scenario with `sub_agent_evidence`; US7 will migrate
 * the declaration into `evals/cases/*.yaml`.
 *
 * Addresses: FR-005, FR-006, FR-012; Acceptance Scenarios 5.1, 5.2, 5.3
 *
 * Spec:         specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md
 * Data model:   specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md
 * Contracts:    specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md
 */

import type { EvalScenario } from './types.js';

/**
 * Strike scenario: invokes `/smithy.strike` with a feature description and
 * checks the output for strike-specific structural markers.
 *
 * Structural expectations (derived from the spec's US5 Clarifications and
 * FR-012):
 *
 * - `required_headings`: the three top-level sections strike always emits
 *   when producing a reconciled plan — `## Summary`, `## Approach`, `## Risks`
 *   (AS 5.3). Note: `# Strike:` is deliberately NOT asserted; the spike
 *   confirmed that heading does not appear in real strike output.
 *
 * - `required_patterns`: one regex matching the `**Phase N: <Label>**` bold
 *   workflow-stage markers strike emits between phases (e.g.,
 *   `**Phase 1: Branch**`). FR-012 and AS 5.3 call these out as the primary
 *   positive signal that the strike skill actually triggered.
 *
 * - `forbidden_patterns`: generic refusal patterns listed in FR-012
 *   ("I'd be happy to help", "Sure, here's") and a leading YAML frontmatter
 *   marker (`^---\n`) covering AS 5.2. Matching any of these indicates the
 *   skill did not trigger or frontmatter leaked through.
 *
 * `timeout` is intentionally unset so the framework default (120s, per
 * FR-004) applies and the orchestrator's `--timeout` CLI override takes
 * effect unchanged.
 */
export const strikeScenario: EvalScenario = {
  name: 'strike-health-check',
  skill: '/smithy.strike',
  prompt: 'add a health check endpoint',
  structural_expectations: {
    required_headings: ['## Summary', '## Approach', '## Risks'],
    required_patterns: [
      // `**Phase N: <Label>**` — bold workflow-stage markers.
      // `\d+` locks the phase number to digits only, and `[^*]+` forbids
      // nested asterisks in the label so prose like "Phase 1 of the rollout"
      // can't accidentally satisfy the check.
      '\\*\\*Phase \\d+: [^*]+\\*\\*',
    ],
    forbidden_patterns: [
      // Generic refusals / non-skill responses (FR-012).
      "I'd be happy to help",
      "Sure, here's",
      // Leading YAML frontmatter (AS 5.2). Anchored to string start so a
      // `---` separator mid-output does not false-trigger. `\r?\n` tolerates
      // CRLF line endings so Windows-captured output is also covered.
      '^---\\r?\\n',
    ],
  },
};

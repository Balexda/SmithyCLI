/**
 * Strike end-to-end eval scenario.
 *
 * Strike's actual output does NOT contain a `# Strike:` top-level heading —
 * the spike (`evals/spike/output-strike.txt`) confirms the canonical top-level
 * section is `## Summary`. Do not add a `# Strike:` heading expectation.
 */

import type { EvalScenario } from './types.js';

export const strikeScenario: EvalScenario = {
  name: 'strike-health-check',
  skill: '/smithy.strike',
  prompt: 'add a health check endpoint',
  structural_expectations: {
    required_headings: ['## Summary', '## Approach', '## Risks'],
    required_patterns: ['\\*\\*Phase \\d+: [^*\\n]+\\*\\*'],
    forbidden_patterns: [
      '^---\\n',
      "I'd be happy to help",
      "Sure, here's",
    ],
  },
};

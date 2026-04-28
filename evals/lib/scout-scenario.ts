/**
 * Scout standalone eval scenario.
 *
 * Captures the structural expectations that smithy-scout's Scout Report must
 * satisfy when the agent is dispatched against the reference fixture at
 * shallow depth. Exported as a typed `EvalScenario` so both the orchestrator
 * (`run-evals.ts`) and the scenario unit test (`scout-scenario.test.ts`)
 * share a single source of truth.
 *
 * Scout remains a TypeScript declaration because its empty `skill` field is
 * rejected by the YAML loader's non-empty-string validation. Migrating scout
 * to YAML would require loosening that rule and is deferred to a later slice.
 *
 * Addresses: FR-005, FR-006, FR-012, FR-016; Acceptance Scenarios 8.1, 8.2
 *
 * Spec:         specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md
 * Data model:   specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md
 * Contracts:    specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md
 */

import type { EvalScenario } from './types.js';

/**
 * Scout scenario: dispatches the `smithy-scout` sub-agent against the fixture
 * `src/` tree at shallow depth with a concrete planning context, then checks
 * the resulting Scout Report for both template conformance and at least one
 * detected finding.
 *
 * `skill` is deliberately empty: `/smithy.scout` is NOT a user-invocable slash
 * command — the scout sub-agent is only dispatched by other smithy skills
 * (render, mark, cut) before their clarification phase. To trigger it in
 * headless mode without a parent skill, the `prompt` directly instructs Claude
 * to use its Agent/Task tool to dispatch `smithy-scout`. The runner composes
 * the invocation as `${skill} ${prompt}` (see `runner.ts`), so an empty
 * `skill` leaves the prompt intact (aside from a leading space) and the
 * headless agent interprets the natural-language dispatch instruction.
 * FR-014's spike already confirmed sub-agent dispatch works in headless mode.
 *
 * Structural expectations (derived from `smithy.scout.prompt` Output section
 * and US8 Acceptance Scenarios):
 *
 * - `required_headings`: the four headings scout's report template always
 *   emits when the sub-agent runs to completion — `## Scout Report`,
 *   `### Clean`, `### Warnings`, and `### Conflicts` (see the Output section
 *   of `src/templates/agent-skills/agents/smithy.scout.prompt`).
 *
 * - `required_patterns`: one regex matching at least one data row in either
 *   the Warnings or Conflicts markdown table (AS 8.1). A data row starts with
 *   `|`, a single space, an optional Markdown inline-code backtick, and then
 *   a file path — which always begins with a lowercase letter, `.`, or `/`.
 *   The optional backtick is required because scout wraps file paths in
 *   inline code spans by default (e.g., `` | `/tmp/.../users.ts` | ``),
 *   captured at /tmp/eval-captures/scout-fixture-shallow.txt. Header rows
 *   begin with `File` (capital F) and separator rows begin with `-`, so
 *   neither can false-trigger the check. Anchoring on `\n\|` (newline +
 *   pipe) keeps the match working without the multiline flag
 *   (`validateStructure` compiles patterns via `new RegExp(pattern)` with no
 *   flags — see `structural.ts`). Because the regex matches *any* row shape
 *   rather than specific planted text, AS 8.2 holds automatically: adding
 *   new plants later extends coverage without requiring a scenario edit.
 *
 * - `forbidden_patterns`: generic refusal patterns listed in FR-012
 *   ("I'd be happy to help", "Sure, here's") and a leading YAML frontmatter
 *   marker (`^---\r?\n`) matching the strike-scenario convention. Matching
 *   any of these indicates scout did not trigger or frontmatter leaked
 *   through.
 *
 * - `sub_agent_evidence`: a single entry for `smithy-scout`. The 2026-04
 *   spike's "dispatching the smithy-scout" narration is no longer emitted
 *   in current claude output (verified at
 *   /tmp/eval-captures/scout-fixture-shallow.events.jsonl — the dispatch
 *   happens via the Agent tool but is not narrated in assistant text).
 *   The pattern instead targets scout's template-driven report header
 *   (`## Scout Report\n\n**Depth**:`), which appears in the dispatch
 *   resultText (cleaned-up by `extractToolResults` to preserve real
 *   newlines) and also in the extracted text when scout's report surfaces
 *   to the parent agent's output. Per FR-016 the pattern still requires a
 *   match somewhere — the framework does not auto-pass on subagent_type
 *   alone.
 *
 * `timeout` is intentionally unset so the framework default (120s, per
 * FR-004) applies and the orchestrator's `--timeout` CLI override takes
 * effect unchanged.
 */
export const scoutScenario: EvalScenario = {
  name: 'scout-fixture-shallow',
  skill: '',
  prompt:
    'Use your Agent/Task tool to dispatch the smithy-scout sub-agent against ' +
    'this repository. Pass scope = ["src/index.ts", "src/types.ts", ' +
    '"src/routes/users.ts"], depth = shallow, and context = "planning a ' +
    'health check endpoint for this Express API fixture". Return the full ' +
    'Scout Report from the sub-agent verbatim.',
  structural_expectations: {
    required_headings: [
      '## Scout Report',
      '### Clean',
      '### Warnings',
      '### Conflicts',
    ],
    required_patterns: [
      // At least one data row in the Warnings or Conflicts markdown table.
      // A data row starts with `\n|`, a single space, an optional inline-code
      // backtick, and a file-path lead character (lowercase letter, `.`, or
      // `/`). Scout wraps file paths in inline code spans by default — see
      // /tmp/eval-captures/scout-fixture-shallow.txt for the captured
      // formatting. Header rows start with `File` (capital F) and separator
      // rows start with `-`, so neither satisfies the character class.
      // `validateStructure` compiles patterns without the multiline flag, so
      // the explicit `\n` anchor is required to avoid matching mid-cell text.
      '\\n\\| `?[a-z./]',
    ],
    forbidden_patterns: [
      // Generic refusals / non-skill responses (FR-012).
      "I'd be happy to help",
      "Sure, here's",
      // Leading YAML frontmatter. Anchored to string start so a `---`
      // separator mid-output does not false-trigger. `\r?\n` tolerates
      // CRLF line endings so Windows-captured output is also covered.
      '^---\\r?\\n',
    ],
  },
  sub_agent_evidence: [
    {
      agent: 'smithy-scout',
      // Matches scout's template-driven report header. Appears in the
      // dispatch resultText (now cleaned up by extractToolResults to
      // preserve real newlines) and in the extracted text when the report
      // surfaces verbatim to the parent agent. The previous spike-era
      // pattern (`[Dd]ispatching the[\s\S]*smithy-scout`) is no longer
      // emitted by current claude output — see scout-fixture-shallow.txt
      // and .events.jsonl in the captures directory.
      pattern: '## Scout Report\\n\\n\\*\\*Depth\\*\\*',
    },
  ],
};

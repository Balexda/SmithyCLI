/**
 * Unit tests for the strike eval scenario.
 *
 * Pins `strikeScenario` against the checked-in spike capture
 * (`evals/spike/output-strike.txt`) so drift in either the structural
 * expectations or the real-world strike sample surfaces immediately under
 * `npm run test:evals`, without requiring a live `claude` invocation.
 *
 * The `sub_agent_evidence` block added for US6 is locked by two additional
 * assertions: a shape check over the scenario constant (all three agents
 * present, every pattern is a compilable regex) and a behavioral check that
 * each pattern fires against the spike capture via the same `verifySubAgents`
 * entrypoint the orchestrator uses. Together they catch both "someone dropped
 * an entry" and "someone authored a pattern that never matches real output".
 *
 * Addresses: FR-005, FR-006, FR-012, FR-016; Acceptance Scenarios 5.1, 5.2,
 * 5.3, 6.2, 6.3, 6.4
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateStructure, verifySubAgents } from './structural.js';
import { strikeScenario } from './strike-scenario.js';
import {
  parseStreamString,
  extractSubAgentDispatches,
} from './parse-stream.js';

// Pin the scenario against the most recent live capture, not the 2026-04-09
// spike. The spike is frozen ground-truth for FR-014 (the architectural
// validation pass) and predates the post-2026-04 strike template overhaul
// that dropped `## Approach` / `## Risks` / `**Phase N:**` in favor of
// `## Summary` / `## Assumptions` / `## Specification Debt` / `## PR`.
// `evals/captures/` carries the rolling canonical capture refreshed each
// time prompt-template drift forces a scenario refresh — see the
// "Maintenance — when patterns drift" section of evals/README.md.
const here = path.dirname(fileURLToPath(import.meta.url));
const capturesDir = path.resolve(here, '..', 'captures');
const captureTextPath = path.resolve(capturesDir, 'strike-health-check.txt');
const captureEventsPath = path.resolve(
  capturesDir,
  'strike-health-check.events.jsonl',
);
const captureText = fs.readFileSync(captureTextPath, 'utf8');
const captureEvents = parseStreamString(
  fs.readFileSync(captureEventsPath, 'utf8'),
);
const captureDispatches = extractSubAgentDispatches(captureEvents);

describe('strikeScenario', () => {
  it('passes every structural check against the checked-in capture', () => {
    // AS 5.1 / AS 5.3: the real strike output should satisfy the scenario's
    // structural expectations end-to-end.
    const results = validateStructure(
      captureText,
      strikeScenario.structural_expectations,
    );

    const failed = results.filter((r) => !r.passed);
    expect(failed, `expected zero failing checks, got:\n${JSON.stringify(failed, null, 2)}`)
      .toHaveLength(0);

    // Sanity: confirm the scenario actually runs the checks we expect so a
    // future edit that drops an assertion is caught here.
    const names = results.map((r) => r.check_name);
    expect(names).toContain("has '## Summary' heading");
    expect(names).toContain("has '## Assumptions' heading");
    expect(names).toContain("has '## Specification Debt' heading");
    expect(names).toContain("has '## PR' heading");
    expect(names.some((n) => n.startsWith('required pattern present:'))).toBe(true);
    expect(names.some((n) => n.startsWith('forbidden pattern absent:'))).toBe(true);
  });

  it('flags leading YAML frontmatter as a failure (AS 5.2)', () => {
    // Prefix the real spike capture with synthetic frontmatter. The scenario's
    // `^---\r?\n` forbidden pattern must catch this even though the unmodified
    // capture also contains `---` as a mid-document separator.
    const withFrontmatter =
      '---\ntitle: Strike\nmodel: sonnet\n---\n\n' + captureText;

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
      '---\r\ntitle: Strike\r\nmodel: sonnet\r\n---\r\n\r\n' + captureText;

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

  it('declares sub-agent evidence for plan, reconcile, and clarify (FR-016; AS 6.2, 6.3, 6.4)', () => {
    // Shape check: all three strike sub-agents that the spike confirmed
    // dispatch must carry an evidence entry, and each pattern must be a
    // compilable regex. scout is intentionally excluded — strike does not
    // dispatch it (AS 6.1 is covered by the standalone scout scenario).
    const evidence = strikeScenario.sub_agent_evidence;
    expect(evidence, 'strikeScenario.sub_agent_evidence must be defined').toBeDefined();
    expect(evidence!.length).toBe(3);

    const agents = evidence!.map((e) => e.agent).sort();
    expect(agents).toEqual(['smithy-clarify', 'smithy-plan', 'smithy-reconcile']);

    // Every pattern must compile — catches authoring typos (e.g. an unclosed
    // group) before a live `claude -p` run.
    for (const entry of evidence!) {
      expect(
        () => new RegExp(entry.pattern),
        `pattern for ${entry.agent} must compile: ${entry.pattern}`,
      ).not.toThrow();
    }
  });

  it('matches every sub-agent evidence pattern against the captured run', () => {
    // Behavioral check: the configured patterns must actually fire against a
    // real strike run. Current strike output no longer narrates dispatches
    // inline (verified by inspecting the captured assistant text), so the
    // patterns target the dispatch-side surfaces — `description` and the
    // cleaned-up `resultText` — that `extractSubAgentDispatches` exposes from
    // the captured stream-json events. Feeding those dispatches through
    // `verifySubAgents` mirrors the orchestrator's wire-up exactly.
    const results = verifySubAgents(
      captureText,
      captureDispatches,
      strikeScenario.sub_agent_evidence!,
    );

    const failed = results.filter((r) => !r.passed);
    expect(
      failed,
      `expected all sub-agent evidence to match the spike capture, got:\n${JSON.stringify(failed, null, 2)}`,
    ).toHaveLength(0);

    // Sanity: confirm each agent produced a named check so a future edit that
    // drops an entry fails this test immediately instead of silently reducing
    // coverage.
    const checkNames = results.map((r) => r.check_name);
    expect(checkNames).toContain('smithy-plan evidence present');
    expect(checkNames).toContain('smithy-reconcile evidence present');
    expect(checkNames).toContain('smithy-clarify evidence present');
  });
});

/**
 * Minimal orchestrator entry point for the Smithy evals framework.
 *
 * Accepts --fixture and --timeout CLI flags; calls preflight() on startup;
 * runs a single hardcoded smoke-test scenario and prints a brief result summary.
 *
 * US7 will replace the hardcoded scenario with YAML loading.
 * US9 will extend the result summary into a full EvalReport.
 *
 * Addresses: FR-003 (fail-fast on startup), FR-010; Acceptance Scenario 3.3
 */

import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

import { preflight, runScenario } from './lib/runner.js';
import { validateStructure, verifySubAgents } from './lib/structural.js';
import { extractSubAgentDispatches } from './lib/parse-stream.js';
import type { CheckResult, EvalScenario } from './lib/types.js';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const { values } = parseArgs({
  options: {
    fixture: { type: 'string', default: 'evals/fixture' },
    timeout: { type: 'string', default: '120' },
  },
  strict: false,
});

const fixtureDir = path.resolve(process.cwd(), values['fixture'] as string);
const timeoutSec = Number(values['timeout']);

if (Number.isNaN(timeoutSec) || timeoutSec <= 0) {
  console.error(`Error: Invalid timeout value: ${values['timeout']}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Preflight — fail fast before any invocation (FR-003)
// ---------------------------------------------------------------------------

try {
  preflight();
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Validate fixture directory
// ---------------------------------------------------------------------------

const fixtureStat = fs.statSync(fixtureDir, { throwIfNoEntry: false });
if (!fixtureStat) {
  console.error(`Error: Fixture directory not found: ${fixtureDir}`);
  process.exit(1);
}
if (!fixtureStat.isDirectory()) {
  console.error(`Error: Fixture path is not a directory: ${fixtureDir}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Smoke-test scenario (US7 will replace this with YAML loading)
// ---------------------------------------------------------------------------

const scenario: EvalScenario = {
  name: 'strike-health-check',
  skill: '/smithy.strike',
  prompt: 'add a health check endpoint',
  timeout: timeoutSec,
  structural_expectations: {
    required_headings: ['## Plan'],
  },
};

console.log(`Running scenario: ${scenario.name}`);
console.log(`  Skill:   ${scenario.skill}`);
console.log(`  Prompt:  ${scenario.prompt}`);
console.log(`  Fixture: ${fixtureDir}`);
console.log(`  Timeout: ${timeoutSec}s`);
console.log('');

try {
  const output = await runScenario(scenario, fixtureDir);

  const status = output.timed_out
    ? 'TIMEOUT'
    : output.exit_code !== 0
      ? `FAIL (exit ${output.exit_code})`
      : 'OK';

  console.log(`Result: ${status}`);
  console.log(`  Duration:  ${output.duration_ms}ms`);
  console.log(`  Text length: ${output.extracted_text.length} chars`);
  console.log(`  Stream events: ${output.stream_events.length}`);

  // ---------------------------------------------------------------------------
  // Structural validation (FR-005, FR-006)
  // ---------------------------------------------------------------------------

  const structuralChecks: CheckResult[] = validateStructure(
    output.extracted_text,
    scenario.structural_expectations,
  );

  let subAgentChecks: CheckResult[] = [];
  if (scenario.sub_agent_evidence && scenario.sub_agent_evidence.length > 0) {
    const dispatches = extractSubAgentDispatches(output.stream_events);
    subAgentChecks = verifySubAgents(
      output.extracted_text,
      dispatches,
      scenario.sub_agent_evidence,
    );
  }

  const allChecks = [...structuralChecks, ...subAgentChecks];

  console.log('');
  console.log('Checks:');
  for (const check of allChecks) {
    if (check.passed) {
      console.log(`  [PASS] ${check.check_name}`);
    } else {
      console.log(
        `  [FAIL] ${check.check_name} — expected: ${check.expected}, actual: ${check.actual}`,
      );
    }
  }

  const anyCheckFailed = allChecks.some((c) => !c.passed);
  const exitCode =
    output.exit_code !== 0 || output.timed_out || anyCheckFailed ? 1 : 0;

  process.exit(exitCode);
} catch (err) {
  console.error(`Error running scenario: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

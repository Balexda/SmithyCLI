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
import type { EvalScenario } from './lib/types.js';

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
const timeoutSec = parseInt(values['timeout'] as string, 10);

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

if (!fs.existsSync(fixtureDir)) {
  console.error(`Error: Fixture directory not found: ${fixtureDir}`);
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

  process.exit(output.exit_code === 0 && !output.timed_out ? 0 : 1);
} catch (err) {
  console.error(`Error running scenario: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

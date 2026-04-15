/**
 * Minimal orchestrator entry point for the Smithy evals framework.
 *
 * Accepts --fixture and --timeout CLI flags; calls preflight() on startup;
 * runs the imported `strikeScenario`, validates output structure, prints
 * per-check pass/fail results to stdout, and exits with code 1 if any check
 * fails or the process exits non-zero or times out.
 *
 * US7 will replace the imported scenario with YAML loading.
 * US9 will extend the result summary into a full EvalReport.
 *
 * Addresses: FR-003 (fail-fast on startup), FR-005, FR-006, FR-010, FR-012;
 * Acceptance Scenarios 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3
 */

import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

import { preflight, runScenario } from './lib/runner.js';
import { validateStructure, verifySubAgents } from './lib/structural.js';
import { extractSubAgentDispatches } from './lib/parse-stream.js';
import { strikeScenario } from './lib/strike-scenario.js';
import type { CheckResult, EvalScenario } from './lib/types.js';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const { values } = parseArgs({
  options: {
    fixture: { type: 'string', default: 'evals/fixture' },
    timeout: { type: 'string' },
  },
  strict: false,
});

const fixtureDir = path.resolve(process.cwd(), values['fixture'] as string);

// Only treat --timeout as an override when the user explicitly passed it.
// When omitted, `scenario.timeout` stays undefined so the runner's
// DEFAULT_TIMEOUT_MS applies (FR-004).
let timeoutOverrideSec: number | undefined;
if (values['timeout'] !== undefined) {
  const parsed = Number(values['timeout']);
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.error(`Error: Invalid timeout value: ${values['timeout']}`);
    process.exit(1);
  }
  timeoutOverrideSec = parsed;
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
// Scenario (US7 will replace this with YAML loading)
// ---------------------------------------------------------------------------
//
// The scenario definition lives in `./lib/strike-scenario.ts` as a single
// source of truth shared with `strike-scenario.test.ts`. When the user
// passes `--timeout`, layer it on top of the imported constant; otherwise
// leave `scenario.timeout` undefined so the runner's DEFAULT_TIMEOUT_MS
// applies (FR-004).
const scenario: EvalScenario =
  timeoutOverrideSec !== undefined
    ? { ...strikeScenario, timeout: timeoutOverrideSec }
    : { ...strikeScenario };

console.log(`Running scenario: ${scenario.name}`);
console.log(`  Skill:   ${scenario.skill}`);
console.log(`  Prompt:  ${scenario.prompt}`);
console.log(`  Fixture: ${fixtureDir}`);
console.log(
  `  Timeout: ${
    scenario.timeout !== undefined
      ? `${scenario.timeout}s (--timeout override)`
      : 'runner default'
  }`,
);
console.log('');

let output;
try {
  output = await runScenario(scenario, fixtureDir);
} catch (err) {
  console.error(`Error running scenario: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

console.log(`  Duration:  ${output.duration_ms}ms`);
if (output.timed_out) console.log('  Timed out: yes');
if (output.exit_code !== 0) console.log(`  Exit code: ${output.exit_code}`);
console.log(`  Text length: ${output.extracted_text.length} chars`);
console.log(`  Stream events: ${output.stream_events.length}`);

// ---------------------------------------------------------------------------
// Structural validation (FR-005, FR-006)
// ---------------------------------------------------------------------------

let allChecks: CheckResult[];
try {
  const structuralChecks = validateStructure(
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

  allChecks = [...structuralChecks, ...subAgentChecks];
} catch (err) {
  console.error(`Validation error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

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

console.log('');
console.log(`Result: ${exitCode === 0 ? 'PASS' : 'FAIL'}`);

process.exit(exitCode);

/**
 * Minimal orchestrator entry point for the Smithy evals framework.
 *
 * Accepts --fixture and --timeout CLI flags; calls preflight() on startup;
 * runs a single hardcoded smoke-test scenario, validates output structure,
 * prints per-check pass/fail results to stdout, assembles a full
 * `EvalReport` via the report library, prints the formatted summary, and
 * exits with code 1 if the report's `overall_status` is `'fail'`.
 *
 * US7 will replace the hardcoded scenario with YAML loading — the
 * one-element `results` array passed to `buildReport` becomes N-element
 * without changes to the summary code path.
 *
 * Addresses: FR-003 (fail-fast on startup), FR-005, FR-006, FR-009, FR-010;
 * Acceptance Scenarios 3.3, 4.1, 4.2, 4.3, 9.1, 9.2, 9.3
 */

import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

import { preflight, runScenario } from './lib/runner.js';
import { validateStructure, verifySubAgents } from './lib/structural.js';
import { extractSubAgentDispatches } from './lib/parse-stream.js';
import { scenarioRunToResult, buildReport, formatReport } from './lib/report.js';
import type { CheckResult, EvalScenario } from './lib/types.js';

// ---------------------------------------------------------------------------
// Run-wide wall-clock timer — started before any orchestrator work (preflight,
// fixture validation, scenario execution) and stopped immediately before
// `buildReport`. `performance.now()` is a monotonic clock, so the measurement
// survives system clock adjustments. Matches the convention used by
// `runner.ts` for per-scenario durations.
// ---------------------------------------------------------------------------

const runStartPerf = performance.now();

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

let structuralChecks: CheckResult[];
let subAgentChecks: CheckResult[] = [];
try {
  structuralChecks = validateStructure(
    output.extracted_text,
    scenario.structural_expectations,
  );

  if (scenario.sub_agent_evidence && scenario.sub_agent_evidence.length > 0) {
    const dispatches = extractSubAgentDispatches(output.stream_events);
    subAgentChecks = verifySubAgents(
      output.extracted_text,
      dispatches,
      scenario.sub_agent_evidence,
    );
  }
} catch (err) {
  console.error(`Validation error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

console.log('');
console.log('Checks:');
for (const check of [...structuralChecks, ...subAgentChecks]) {
  if (check.passed) {
    console.log(`  [PASS] ${check.check_name}`);
  } else {
    console.log(
      `  [FAIL] ${check.check_name} — expected: ${check.expected}, actual: ${check.actual}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Aggregate summary (FR-009; AS 9.1, 9.2, 9.3)
// ---------------------------------------------------------------------------

const evalResult = scenarioRunToResult(
  scenario,
  output,
  structuralChecks,
  subAgentChecks,
);
const totalDurationMs = Math.round(performance.now() - runStartPerf);
const report = buildReport([evalResult], totalDurationMs);

console.log('');
console.log(formatReport(report));

process.exit(report.overall_status === 'pass' ? 0 : 1);

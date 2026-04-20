/**
 * Minimal orchestrator entry point for the Smithy evals framework.
 *
 * Accepts --fixture, --timeout, and --case CLI flags; calls preflight() on
 * startup; runs each configured scenario (currently the imported
 * `strikeScenario` and `scoutScenario`), validates output structure, prints
 * per-check pass/fail results to stdout, assembles a full `EvalReport` via
 * the report library across ALL scenarios, prints the formatted summary,
 * and exits with code 1 if the report's `overall_status` is `'fail'`.
 *
 * `--case <name>` honors FR-008: the flag filters the scenario list to the
 * single scenario whose `name` matches. Full YAML scenario loading still
 * lands in US7 — this wiring keeps the scenario list as a typed array so the
 * migration to YAML replaces only the list-construction step.
 *
 * Sub-agent verification (FR-016) runs on every scenario whose YAML declares
 * `sub_agent_evidence`: strike carries entries for plan, reconcile, and
 * clarify (AS 6.2–6.4), and the standalone scout scenario carries one for
 * smithy-scout (AS 6.1). Both paths reuse the same
 * `extractSubAgentDispatches` → `verifySubAgents` pipeline below.
 *
 * Addresses: FR-003 (fail-fast on startup), FR-005, FR-006, FR-008, FR-009,
 * FR-010, FR-012, FR-016; Acceptance Scenarios 3.3, 4.1, 4.2, 4.3, 5.1, 5.2,
 * 5.3, 6.1, 6.2, 6.3, 6.4, 8.1, 8.2, 9.1, 9.2, 9.3
 */

import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { preflight, runScenario } from './lib/runner.js';
import { validateStructure, verifySubAgents } from './lib/structural.js';
import { extractSubAgentDispatches } from './lib/parse-stream.js';
import { loadBaseline, compareToBaseline } from './lib/baseline.js';
import { scenarioRunToResult, buildReport, formatReport } from './lib/report.js';
import { strikeScenario } from './lib/strike-scenario.js';
import { scoutScenario } from './lib/scout-scenario.js';
import type { CheckResult, EvalResult, EvalScenario } from './lib/types.js';

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
    timeout: { type: 'string' },
    case: { type: 'string' },
  },
  strict: false,
});

const fixtureDir = path.resolve(process.cwd(), values['fixture'] as string);

// Resolve the baselines directory relative to this source file so baseline
// lookups work regardless of process cwd (matching the pattern used by
// `strike-scenario.ts` for YAML loading). Without this, invoking the
// orchestrator via `tsx evals/run-evals.ts` from outside the repo root would
// silently skip baseline checks because `loadBaseline`'s default resolves
// `evals/baselines/` against `process.cwd()`.
const baselinesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'baselines',
);

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
// Scenario list (US7 will replace this with YAML loading)
// ---------------------------------------------------------------------------
//
// Scenario definitions live in `./lib/{strike,scout}-scenario.ts` as a single
// source of truth shared with each scenario's unit test. Strike is listed
// first so log output ordering stays stable for anyone reading eval runs.
// The `--case` filter below narrows this list to a single entry; the
// `--timeout` override is layered on every remaining scenario.

const baseScenarios: EvalScenario[] = [strikeScenario, scoutScenario];

// --case filter (FR-008). Fails fast — before preflight — when the requested
// name matches none of the configured scenarios, because a typo'd case name
// should never trigger a real claude invocation.
let selectedScenarios: EvalScenario[] = baseScenarios;
const caseFilter = values['case'];
if (caseFilter !== undefined) {
  // `parseArgs` runs with `strict: false`, so `--case` passed without a value
  // yields the boolean `true` rather than throwing. Require a non-empty
  // string here so a bare `--case` flag fails fast instead of silently
  // running every scenario against a live `claude` invocation.
  if (typeof caseFilter !== 'string' || caseFilter.length === 0) {
    const available = baseScenarios.map((s) => s.name).join(', ');
    console.error(
      `Error: --case requires a scenario name. Available scenarios: ${available}`,
    );
    process.exit(1);
  }
  const matched = baseScenarios.filter((s) => s.name === caseFilter);
  if (matched.length === 0) {
    const available = baseScenarios.map((s) => s.name).join(', ');
    console.error(
      `Error: No scenario matches --case "${caseFilter}". Available scenarios: ${available}`,
    );
    process.exit(1);
  }
  selectedScenarios = matched;
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
// Apply --timeout override (if any) to every selected scenario.
// ---------------------------------------------------------------------------
//
// `finalScenarios.length` is also the source of truth for the pre-execution
// case count (US11 AS 11.1). When US7 swaps in a YAML-loaded array, this
// count line continues to work unchanged.

const finalScenarios: EvalScenario[] = selectedScenarios.map((s) =>
  timeoutOverrideSec !== undefined ? { ...s, timeout: timeoutOverrideSec } : { ...s },
);

console.log(`Running ${finalScenarios.length} case(s)`);
console.log('');

// ---------------------------------------------------------------------------
// Run each scenario in order, collecting per-scenario EvalResults.
// ---------------------------------------------------------------------------
//
// Error-handling choice: on `runScenario` throw we keep the pre-US8 behavior
// and `process.exit(1)` immediately. The task brief explicitly calls for the
// conservative wire-up — "the orchestrator's existing structural and
// sub-agent validation pipeline ... must continue to operate unchanged — only
// the scenario list grows." Aggregating runScenario errors across scenarios
// would be a behavioral change beyond the stated scope, so we defer it.

const results: EvalResult[] = [];

for (const scenario of finalScenarios) {
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

  // -------------------------------------------------------------------------
  // Structural validation (FR-005, FR-006)
  // -------------------------------------------------------------------------

  let structuralChecks: CheckResult[];
  let subAgentChecks: CheckResult[] = [];
  let baselineChecks: CheckResult[] = [];
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

    // Baseline comparison (FR-009; AS 10.1, 10.2, 10.3). Convention-based: the
    // loader returns `null` when `evals/baselines/<scenario.name>.json` does
    // not exist, which keeps this feature opt-in per scenario. Loader errors
    // (malformed JSON, missing required fields) propagate to the existing
    // "Validation error" branch below — they indicate a scenario authoring
    // bug, not a runtime failure.
    const baseline = loadBaseline(scenario.name, baselinesDir);
    if (baseline !== null) {
      baselineChecks = compareToBaseline(output.extracted_text, baseline);
    }
  } catch (err) {
    console.error(`Validation error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  console.log('');
  console.log('Checks:');
  for (const check of [...structuralChecks, ...subAgentChecks, ...baselineChecks]) {
    if (check.passed) {
      console.log(`  [PASS] ${check.check_name}`);
    } else {
      console.log(
        `  [FAIL] ${check.check_name} — expected: ${check.expected}, actual: ${check.actual}`,
      );
    }
  }
  console.log('');

  results.push(
    scenarioRunToResult(scenario, output, structuralChecks, subAgentChecks, baselineChecks),
  );
}

// ---------------------------------------------------------------------------
// Aggregate summary (FR-009; AS 9.1, 9.2, 9.3)
// ---------------------------------------------------------------------------

const totalDurationMs = Math.round(performance.now() - runStartPerf);
const report = buildReport(results, totalDurationMs);

console.log(formatReport(report));

process.exit(report.overall_status === 'pass' ? 0 : 1);

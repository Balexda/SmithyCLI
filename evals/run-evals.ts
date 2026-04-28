/**
 * Minimal orchestrator entry point for the Smithy evals framework.
 *
 * Accepts --fixture, --timeout, and --case CLI flags; calls preflight() on
 * startup; loads every `*.yaml` scenario from `evals/cases/` via
 * `loadScenarios`, iterates each scenario through the runner + structural
 * validator + sub-agent verifier pipeline, assembles a full `EvalReport` via
 * the report library across ALL scenarios, prints the formatted summary,
 * and exits with code 1 if the report's `overall_status` is `'fail'`.
 *
 * `--case <name>` honors FR-008: the flag filters the scenario list to the
 * single scenario whose `name` matches, after the loader completes. An
 * unknown name exits 1 with a message listing the available case names.
 *
 * Sub-agent verification (FR-016) runs on every scenario whose YAML declares
 * `sub_agent_evidence`: strike carries entries for plan, reconcile, and
 * clarify (AS 6.2–6.4), and the standalone scout scenario carries one for
 * smithy-scout (AS 6.1). Both paths reuse the same
 * `extractSubAgentDispatches` → `verifySubAgents` pipeline below.
 *
 * Scout's scenario is imported directly from `./lib/scout-scenario.ts` rather
 * than declared in YAML. Scout uses an empty `skill` field (because
 * `/smithy.scout` is not a user-invocable slash command) which the loader's
 * non-empty-string validation rejects; migrating scout to YAML would require
 * loosening that rule and is deliberately out of scope for this slice. The
 * list-combination step below (`[...loaded, scoutScenario]`) is the single
 * point where scout joins the YAML-loaded scenarios, so a later slice can
 * drop this line when scout migrates.
 *
 * Addresses: FR-003 (fail-fast on startup), FR-005, FR-006, FR-007, FR-008,
 * FR-009, FR-010, FR-012, FR-016; Acceptance Scenarios 3.3, 4.1, 4.2, 4.3,
 * 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 8.1, 8.2, 9.1, 9.2, 9.3
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
import { loadScenarios } from './lib/scenario-loader.js';
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
    dump: { type: 'string' },
  },
  strict: false,
});

// Optional output capture directory. When set, after each scenario completes
// the orchestrator writes the canonical extracted text and the raw stream-json
// events to `<dir>/<scenario>.txt` and `<dir>/<scenario>.events.jsonl`. This
// is the supported way to inspect what a skill actually emitted when triaging
// drift between authored expectations and live model output (see the
// "Maintenance — when patterns drift" section of evals/README.md).
let dumpDir: string | undefined;
const dumpFlag = values['dump'];
if (dumpFlag !== undefined) {
  if (typeof dumpFlag !== 'string' || dumpFlag.length === 0) {
    console.error(
      'Error: --dump requires a directory path (e.g. --dump /tmp/eval-captures).',
    );
    process.exit(1);
  }
  dumpDir = path.resolve(process.cwd(), dumpFlag);
  fs.mkdirSync(dumpDir, { recursive: true });
}

const fixtureDir = path.resolve(process.cwd(), values['fixture'] as string);
const casesDir = path.resolve(process.cwd(), 'evals/cases');

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
// Load scenarios from YAML (FR-007)
// ---------------------------------------------------------------------------
//
// `loadScenarios` reads every `*.yaml` file in the cases directory, skipping
// malformed entries with a stderr note (AS 7.3). If the directory is empty or
// every file was skipped the contracts require exit 1 — a dev invoking
// `npm run eval` with no discoverable cases has a misconfigured checkout, not
// a silent no-op. Scout is appended from its TypeScript declaration because
// its empty `skill` field is incompatible with the loader's validation; this
// is the single remaining TS-declared scenario and the only place outside the
// loader where a scenario enters the pipeline.

let loadedScenarios: EvalScenario[];
try {
  loadedScenarios = loadScenarios(casesDir);
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

if (loadedScenarios.length === 0) {
  console.error(
    `Error: No valid scenarios found in ${casesDir}. Add at least one valid *.yaml case file and re-run. Scenario files may have been skipped as invalid or duplicates; check stderr for skip reasons.`,
  );
  process.exit(1);
}

// Scout is appended unless a YAML case has already claimed its name. Without
// the guard, a future `evals/cases/scout-fixture-shallow.yaml` would coexist
// with the TS-declared scout and `--case scout-fixture-shallow` would match
// (and run) both — making case selection ambiguous and double-billing the
// report. Skipping the append (rather than skipping the YAML) lets a future
// scout-in-YAML migration take precedence over the TS shim with no further
// orchestrator changes.
const baseScenarios: EvalScenario[] = loadedScenarios.some(
  (s) => s.name === scoutScenario.name,
)
  ? loadedScenarios
  : [...loadedScenarios, scoutScenario];

// --case filter (FR-008, AS 7.2). Filtering happens post-load so the filter
// operates over the same concrete scenario list the default run would
// execute.
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
// Apply --timeout override (if any) to every selected scenario.
// ---------------------------------------------------------------------------
//
// `finalScenarios.length` is also the source of truth for the pre-execution
// case count (US11 AS 11.1).

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

  // --dump <dir>: persist the canonical text and raw NDJSON events for triage.
  // No-op when --dump was not supplied. Failures here are logged but do not
  // abort the run — a write error in a debug capture must not mask scenario
  // results.
  //
  // The scenario loader only requires `name` to be a non-empty string; path
  // separators, `..` segments, and absolute paths could escape `dumpDir` or
  // silently skip the write. Reject those before composing the path. Same
  // rule the baseline loader applies in `evals/lib/baseline.ts`.
  if (dumpDir !== undefined) {
    const name = scenario.name;
    const unsafe =
      name.includes('/') ||
      name.includes('\\') ||
      name.split(/[\\/]/).some((seg) => seg === '..') ||
      path.isAbsolute(name);
    if (unsafe) {
      console.error(
        `  Skipping --dump for "${name}": scenario name must not contain path separators, parent-directory segments, or be absolute.`,
      );
    } else {
      const textPath = path.join(dumpDir, `${name}.txt`);
      const eventsPath = path.join(dumpDir, `${name}.events.jsonl`);
      try {
        fs.writeFileSync(textPath, output.extracted_text, 'utf8');
        fs.writeFileSync(
          eventsPath,
          output.stream_events.map((e) => JSON.stringify(e)).join('\n') + '\n',
          'utf8',
        );
        console.log(`  Dumped:    ${textPath}`);
        console.log(`             ${eventsPath}`);
      } catch (err) {
        console.error(
          `  Dump failed for ${name}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

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

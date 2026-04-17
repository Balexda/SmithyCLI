/**
 * YAML scenario loader for the Smithy evals framework.
 *
 * Reads every `*.yaml` file in a directory, parses each with the `yaml`
 * package, validates required `EvalScenario` fields, rejects duplicate
 * `name` values, and returns the accumulated scenarios sorted
 * alphabetically by filename for deterministic ordering.
 *
 * The loader is pure by design: it never calls `process.exit`, never writes
 * to stdout on the happy path, and only writes to stderr to report files
 * that were skipped due to validation or parse failures. This lets the
 * orchestrator and tests consume it identically — the caller decides
 * whether a zero-result load should exit non-zero.
 *
 * Addresses: FR-007; Acceptance Scenario 7.3
 *
 * Spec:         specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md
 * Data model:   specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md
 * Contracts:    specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

import type {
  EvalScenario,
  StructuralExpectations,
  SubAgentEvidence,
} from './types.js';

/**
 * Load every valid `*.yaml` scenario in `casesDir`.
 *
 * Behavior:
 * - Filters directory entries to files ending in `.yaml` (exact match; `.yml`
 *   is deliberately excluded to align with the spec clarification that
 *   scenarios live in YAML files named `*.yaml`).
 * - Iterates filenames alphabetically so the returned array is stable across
 *   operating systems and filesystems.
 * - Per file, reads → parses → validates; any failure is reported via a
 *   single `console.error` line naming the file and the reason, and the file
 *   is skipped. Other files continue to load.
 * - Deduplicates by `name`: when a subsequent file declares a `name` already
 *   claimed, the later file is skipped with a stderr note.
 *
 * Throws only when `casesDir` cannot be opened (e.g. does not exist, is not
 * a directory, or permissions error). Validation errors never throw — they
 * surface via stderr and skip the offending file.
 */
export function loadScenarios(casesDir: string): EvalScenario[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(casesDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: unknown }).code)
        : undefined;
    const details = code ? `${code}: ${msg}` : msg;
    throw new Error(
      `loadScenarios: unable to read cases directory: ${casesDir} (${details})`,
    );
  }

  const yamlFiles = entries
    .filter((entry) => entry.endsWith('.yaml'))
    .sort();

  const scenarios: EvalScenario[] = [];
  const seenNames = new Map<string, string>(); // name -> first filename that claimed it

  for (const filename of yamlFiles) {
    const full = path.join(casesDir, filename);
    const skip = (reason: string): void => {
      console.error(
        `loadScenarios: skipping ${filename} — ${reason}`,
      );
    };

    let raw: string;
    try {
      raw = fs.readFileSync(full, 'utf8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      skip(`failed to read file: ${msg}`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseYaml(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      skip(`YAML parse error: ${msg}`);
      continue;
    }

    const scenario = validateScenario(parsed, skip);
    if (!scenario) continue;

    const prior = seenNames.get(scenario.name);
    if (prior !== undefined) {
      skip(
        `duplicate scenario name '${scenario.name}' (already defined in ${prior})`,
      );
      continue;
    }

    seenNames.set(scenario.name, filename);
    scenarios.push(scenario);
  }

  return scenarios;
}

/**
 * Load a single scenario file by exact path, bypassing the directory scan.
 *
 * Unlike `loadScenarios`, this helper does not depend on alphabetical
 * filename ordering or the duplicate-name skip policy — it binds one
 * consumer (e.g. the `strikeScenario` re-export) to one specific YAML file,
 * so the consumer can never be silently redirected to a different file that
 * happens to share a `name`.
 *
 * Throws on read, parse, or validation failure. Validation errors are
 * aggregated into a single thrown `Error` (not stderr-logged) because the
 * caller treats the scenario as required.
 */
export function loadScenarioFromFile(filePath: string): EvalScenario {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`loadScenarioFromFile: failed to read ${filePath}: ${msg}`);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`loadScenarioFromFile: YAML parse error in ${filePath}: ${msg}`);
  }

  const errors: string[] = [];
  const scenario = validateScenario(parsed, (reason) => errors.push(reason));
  if (!scenario) {
    throw new Error(
      `loadScenarioFromFile: ${filePath} failed validation: ${errors.join('; ')}`,
    );
  }
  return scenario;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validate a parsed YAML value against the EvalScenario shape.
 *
 * Returns a typed EvalScenario on success, or `null` after calling `skip`
 * with a human-readable reason on failure.
 */
function validateScenario(
  value: unknown,
  skip: (reason: string) => void,
): EvalScenario | null {
  if (value === null || value === undefined) {
    skip('YAML document is empty or null');
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    skip('root must be a mapping (object), got array or primitive');
    return null;
  }

  const obj = value as Record<string, unknown>;

  if (!isNonEmptyString(obj['name'])) {
    skip("missing or invalid required field 'name' (must be a non-empty string)");
    return null;
  }
  const name = obj['name'];

  if (!isNonEmptyString(obj['skill'])) {
    skip("missing or invalid required field 'skill' (must be a non-empty string)");
    return null;
  }
  const skill = obj['skill'];

  if (!isNonEmptyString(obj['prompt'])) {
    skip("missing or invalid required field 'prompt' (must be a non-empty string)");
    return null;
  }
  const prompt = obj['prompt'];

  const rawExpectations = obj['structural_expectations'];
  if (
    rawExpectations === null ||
    typeof rawExpectations !== 'object' ||
    Array.isArray(rawExpectations)
  ) {
    skip("missing or invalid 'structural_expectations' (must be a mapping)");
    return null;
  }
  const exp = rawExpectations as Record<string, unknown>;

  const rawHeadings = exp['required_headings'];
  if (!Array.isArray(rawHeadings) || rawHeadings.length === 0) {
    skip(
      "'structural_expectations.required_headings' must be a non-empty array",
    );
    return null;
  }
  if (!rawHeadings.every((h) => typeof h === 'string')) {
    skip(
      "'structural_expectations.required_headings' entries must all be strings",
    );
    return null;
  }
  const required_headings = rawHeadings as string[];

  const structural_expectations: StructuralExpectations = { required_headings };

  // Optional: required_patterns (string[])
  if (exp['required_patterns'] !== undefined) {
    const v = exp['required_patterns'];
    if (!Array.isArray(v) || !v.every((p) => typeof p === 'string')) {
      skip(
        "'structural_expectations.required_patterns' must be an array of strings",
      );
      return null;
    }
    structural_expectations.required_patterns = v as string[];
  }

  // Optional: forbidden_patterns (string[])
  if (exp['forbidden_patterns'] !== undefined) {
    const v = exp['forbidden_patterns'];
    if (!Array.isArray(v) || !v.every((p) => typeof p === 'string')) {
      skip(
        "'structural_expectations.forbidden_patterns' must be an array of strings",
      );
      return null;
    }
    structural_expectations.forbidden_patterns = v as string[];
  }

  // Optional: required_tables ([{ columns: string[] }])
  if (exp['required_tables'] !== undefined) {
    const v = exp['required_tables'];
    if (!Array.isArray(v)) {
      skip(
        "'structural_expectations.required_tables' must be an array of { columns: string[] }",
      );
      return null;
    }
    const tables: { columns: string[] }[] = [];
    for (const entry of v) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        skip(
          "'structural_expectations.required_tables' entries must be objects with a 'columns' string array",
        );
        return null;
      }
      const cols = (entry as Record<string, unknown>)['columns'];
      if (!Array.isArray(cols) || !cols.every((c) => typeof c === 'string')) {
        skip(
          "'structural_expectations.required_tables' entries must have a 'columns' string array",
        );
        return null;
      }
      tables.push({ columns: cols as string[] });
    }
    structural_expectations.required_tables = tables;
  }

  const scenario: EvalScenario = {
    name,
    skill,
    prompt,
    structural_expectations,
  };

  // Optional: model (string)
  if (obj['model'] !== undefined) {
    if (typeof obj['model'] !== 'string') {
      skip("'model' must be a string when provided");
      return null;
    }
    scenario.model = obj['model'];
  }

  // Optional: timeout (positive number, in seconds)
  if (obj['timeout'] !== undefined) {
    if (
      typeof obj['timeout'] !== 'number' ||
      !Number.isFinite(obj['timeout']) ||
      obj['timeout'] <= 0
    ) {
      skip("'timeout' must be a positive finite number (seconds) when provided");
      return null;
    }
    scenario.timeout = obj['timeout'];
  }

  // Optional: sub_agent_evidence ([{ agent: string, pattern: string }])
  if (obj['sub_agent_evidence'] !== undefined) {
    const v = obj['sub_agent_evidence'];
    if (!Array.isArray(v)) {
      skip(
        "'sub_agent_evidence' must be an array of { agent: string, pattern: string }",
      );
      return null;
    }
    const evidence: SubAgentEvidence[] = [];
    for (const entry of v) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        skip(
          "'sub_agent_evidence' entries must be objects with 'agent' and 'pattern' strings",
        );
        return null;
      }
      const rec = entry as Record<string, unknown>;
      if (!isNonEmptyString(rec['agent']) || !isNonEmptyString(rec['pattern'])) {
        skip(
          "'sub_agent_evidence' entries must have non-empty 'agent' and 'pattern' strings",
        );
        return null;
      }
      evidence.push({ agent: rec['agent'], pattern: rec['pattern'] });
    }
    scenario.sub_agent_evidence = evidence;
  }

  return scenario;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

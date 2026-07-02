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
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

import type {
  EvalScenario,
  LocalFixtureSet,
  StructuralExpectations,
  SubAgentEvidence,
} from './types.js';

const localFixtureFields = ['issue', 'ci_log'] as const;
const localFixtureAreas: Record<(typeof localFixtureFields)[number], string> = {
  issue: 'evals/fixture/issues',
  ci_log: 'evals/fixture/ci-logs',
};

// Repository root derived from this module's own location, not `process.cwd()`.
// The eval helpers resolve scenario files via `import.meta.url` so they stay
// CWD-independent; fixture resolution must do the same, otherwise a scenario
// loaded from an absolute path while the process runs outside the checkout
// would reject valid fixtures with a misleading "file is not readable" error.
// `evals/lib/scenario-loader.ts` -> `../../` is the repository root.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

  // Optional: fixture selector (relative path under evals/fixture)
  if (obj['fixture'] !== undefined) {
    if (!isValidFixtureSelector(obj['fixture'])) {
      skip(
        "'fixture' must be a non-empty relative path without absolute roots or '..' segments",
      );
      return null;
    }
    scenario.fixture = obj['fixture'];
  }

  // Optional scenario metadata: requires_git (boolean)
  if (obj['requires_git'] !== undefined) {
    if (typeof obj['requires_git'] !== 'boolean') {
      skip("'requires_git' must be a boolean when provided");
      return null;
    }
    scenario.requires_git = obj['requires_git'];
  }

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

  // Optional: local_fixtures ({ issue: string, ci_log: string })
  if (obj['local_fixtures'] !== undefined) {
    const localFixtures = validateLocalFixtures(obj['local_fixtures'], skip);
    if (!localFixtures) return null;
    scenario.local_fixtures = localFixtures;
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

function validateLocalFixtures(
  value: unknown,
  skip: (reason: string) => void,
): LocalFixtureSet | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    skip("'local_fixtures' must be a mapping with 'issue' and 'ci_log' strings");
    return null;
  }

  const rec = value as Record<string, unknown>;
  const allowed = new Set<string>(localFixtureFields);
  for (const key of Object.keys(rec)) {
    if (!allowed.has(key)) {
      skip(`'local_fixtures.${key}' is not supported`);
      return null;
    }
  }

  const fixtures: Partial<LocalFixtureSet> = {};
  for (const field of localFixtureFields) {
    const rawPath = rec[field];
    if (!isNonEmptyString(rawPath)) {
      skip(`'local_fixtures.${field}' must be a non-empty string`);
      return null;
    }

    const normalized = normalizeFixturePath(rawPath);
    if (normalized === null) {
      skip(
        `'local_fixtures.${field}' must be a repository-relative path without parent-directory segments`,
      );
      return null;
    }

    const allowedArea = localFixtureAreas[field];
    if (!isPathUnderArea(normalized, allowedArea)) {
      skip(`'local_fixtures.${field}' must be under '${allowedArea}/'`);
      return null;
    }

    const repoPath = path.resolve(repoRoot, normalized);
    let stats: fs.Stats;
    try {
      stats = fs.statSync(repoPath);
      fs.accessSync(repoPath, fs.constants.R_OK);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      skip(`'local_fixtures.${field}' file is not readable: ${normalized} (${msg})`);
      return null;
    }

    if (!stats.isFile()) {
      skip(`'local_fixtures.${field}' must point to a readable file: ${normalized}`);
      return null;
    }

    // The declared-string check above only constrains the path *text*. Resolve
    // the real paths and confirm the fixture still lies under the real
    // allowed-area directory, so a symlink inside the area cannot redirect to a
    // file outside the repository / allowed directory.
    let realFixturePath: string;
    let realAreaPath: string;
    try {
      realFixturePath = fs.realpathSync(repoPath);
      realAreaPath = fs.realpathSync(path.resolve(repoRoot, allowedArea));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      skip(`'local_fixtures.${field}' could not be resolved: ${normalized} (${msg})`);
      return null;
    }

    if (!isContainedIn(realFixturePath, realAreaPath)) {
      skip(
        `'local_fixtures.${field}' resolves outside '${allowedArea}/' (symlink escape): ${normalized}`,
      );
      return null;
    }

    fixtures[field] = normalized;
  }

  return fixtures as LocalFixtureSet;
}

function normalizeFixturePath(rawPath: string): string | null {
  if (path.isAbsolute(rawPath)) return null;

  const parts = rawPath.split(/[\\/]+/);
  if (parts.some((part) => part === '' || part === '..')) return null;

  const normalized = path.posix.normalize(parts.join('/'));
  if (normalized === '.' || normalized.startsWith('../')) return null;
  return normalized;
}

function isPathUnderArea(repoPath: string, allowedArea: string): boolean {
  return repoPath.startsWith(`${allowedArea}/`) && repoPath.length > allowedArea.length + 1;
}

/** True when `childAbs` is a strict descendant of `parentAbs` (both absolute). */
function isContainedIn(childAbs: string, parentAbs: string): boolean {
  const rel = path.relative(parentAbs, childAbs);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isValidFixtureSelector(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    return false;
  }
  // Reject Windows drive-letter prefixes (e.g. `C:tmp`). These are
  // drive-relative rather than absolute, so `win32.isAbsolute` returns false,
  // yet they escape the fixture root on Windows.
  if (/^[a-zA-Z]:/.test(value)) {
    return false;
  }
  return !value.split(/[\\/]+/).some((segment) => segment === '..');
}

/**
 * Baseline library — convention-based JSON loader for persisted known-good
 * output snapshots used to detect structural regressions, plus a pure
 * structural comparator that diffs a live output against a baseline.
 *
 * Exports:
 *   - `loadBaseline`      — file-system loader (convention-based JSON lookup)
 *   - `compareToBaseline` — pure structural diff (no I/O, no mutation)
 *
 * Contract / data model:
 *   specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md §5
 *   specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md User Story 10
 */

import fs from 'node:fs';
import path from 'node:path';

import type { Baseline, CheckResult } from './types.js';

/** Default directory (relative to cwd) where baselines are looked up. */
const DEFAULT_BASELINES_DIR = 'evals/baselines';

/**
 * Load a baseline snapshot for the given scenario name.
 *
 * Convention-based: looks up `<baselinesDir ?? 'evals/baselines'>/<scenarioName>.json`.
 * Returns `null` when the file does not exist — baselines are optional (AS 10.3).
 * Throws a descriptive error when the file exists but is unreadable, not valid
 * JSON, or is missing required `Baseline` fields. The error message names the
 * offending file path so failures are debuggable from a CI log.
 *
 * `tables` defaults to `[]` when absent; unknown extra fields are ignored so
 * the on-disk format stays forward compatible.
 *
 * @param scenarioName  The `EvalScenario.name` used as the filename stem.
 * @param baselinesDir  Optional directory override (primarily for tests).
 *                      Defaults to `evals/baselines` relative to the current
 *                      working directory.
 * @returns The parsed `Baseline`, or `null` if no file exists.
 * @throws {Error} When the file exists but is malformed or missing required fields.
 */
export function loadBaseline(
  scenarioName: string,
  baselinesDir?: string,
): Baseline | null {
  // Reject names that could escape the baselines directory — `scenarioName` is
  // interpolated straight into the resolved path, so path separators, `..`
  // segments, or absolute paths (including Windows `C:\...`) would let a
  // malformed scenario read an unintended file.
  if (
    scenarioName === '' ||
    scenarioName.includes('/') ||
    scenarioName.includes('\\') ||
    scenarioName.split(/[\\/]/).some((seg) => seg === '..') ||
    path.isAbsolute(scenarioName)
  ) {
    throw new Error(
      `Invalid scenarioName "${scenarioName}": must not contain path separators, parent-directory segments, or be absolute`,
    );
  }

  const dir = baselinesDir ?? DEFAULT_BASELINES_DIR;
  const filePath = path.resolve(dir, `${scenarioName}.json`);

  // Missing file -> null (AS 10.3). Check existence up front so we can
  // distinguish "no baseline configured" from "baseline exists but is broken".
  if (!fs.existsSync(filePath)) {
    return null;
  }

  // Read and parse. Any JSON syntax error surfaces as a validation error
  // tagged with the file path so a developer can find the offending file.
  const raw = fs.readFileSync(filePath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Invalid baseline file ${filePath}: not valid JSON (${detail})`,
    );
  }

  // Top-level value must be a plain object.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Invalid baseline file ${filePath}: expected a JSON object at the top level`,
    );
  }

  const record = parsed as Record<string, unknown>;

  // Required fields: scenario_name, captured_at, headings. `tables` is
  // optional and coerced to [] when absent.
  if (typeof record['scenario_name'] !== 'string') {
    throw new Error(
      `Invalid baseline file ${filePath}: missing required field "scenario_name"`,
    );
  }
  if (record['scenario_name'] !== scenarioName) {
    throw new Error(
      `Invalid baseline file ${filePath}: field "scenario_name" must match "${scenarioName}" (found "${record['scenario_name']}")`,
    );
  }
  if (typeof record['captured_at'] !== 'string') {
    throw new Error(
      `Invalid baseline file ${filePath}: missing required field "captured_at"`,
    );
  }
  if (
    !Array.isArray(record['headings']) ||
    !record['headings'].every((h): h is string => typeof h === 'string')
  ) {
    throw new Error(
      `Invalid baseline file ${filePath}: missing required field "headings" (must be an array of strings)`,
    );
  }

  // `tables` is optional; default to [] when absent. When present, validate
  // each entry has a `columns` array of strings so callers can rely on the
  // shape without redundant guards.
  let tables: { columns: string[] }[] = [];
  if (record['tables'] !== undefined) {
    if (!Array.isArray(record['tables'])) {
      throw new Error(
        `Invalid baseline file ${filePath}: field "tables" must be an array when present`,
      );
    }
    tables = record['tables'].map((entry, idx) => {
      if (
        entry === null ||
        typeof entry !== 'object' ||
        !Array.isArray((entry as Record<string, unknown>)['columns']) ||
        !((entry as Record<string, unknown>)['columns'] as unknown[]).every(
          (c) => typeof c === 'string',
        )
      ) {
        throw new Error(
          `Invalid baseline file ${filePath}: tables[${idx}] must have a "columns" array of strings`,
        );
      }
      return {
        columns: (entry as { columns: string[] }).columns.slice(),
      };
    });
  }

  // Construct the Baseline explicitly so unknown extra fields do not leak
  // through. This keeps the returned shape exactly matching the interface.
  return {
    scenario_name: record['scenario_name'],
    captured_at: record['captured_at'],
    headings: (record['headings'] as string[]).slice(),
    tables,
  };
}

/**
 * Compare a live skill output against a persisted baseline and emit one
 * `CheckResult` per baseline heading, one per baseline table, and a final
 * aggregate summary entry.
 *
 * The comparator is intentionally a regression signal, not a content lock —
 * additional headings or tables in `output` that are not recorded in
 * `baseline` are treated as neutral and do not produce failures. Only items
 * present in the baseline but missing from the output count as drift.
 *
 * Heading matching mirrors `validateStructure` in `structural.ts`: lines are
 * split, right-trimmed, and compared for exact equality. Table matching also
 * mirrors `structural.ts`: a baseline table is "present" when some output
 * line contains a pipe and includes every one of that table's column names
 * as a substring.
 *
 * Emit order (stable, for predictable report rendering):
 *   1. one check per baseline heading, in baseline order
 *   2. one check per baseline table, in baseline order
 *   3. exactly one `'baseline regression summary'` aggregate check
 *
 * The summary's `actual` field enumerates every missing item on a single line
 * so a reviewer can see "what changed" without correlating the per-item
 * checks. When nothing is missing, `actual` is `'no regressions'`.
 *
 * This function is pure: no I/O, no mutation of `baseline` or `output`.
 *
 * @param output    The live extracted skill-output string to evaluate.
 * @param baseline  The persisted `Baseline` snapshot to compare against.
 * @returns A `CheckResult[]` with per-heading, per-table, and aggregate entries.
 */
export function compareToBaseline(
  output: string,
  baseline: Baseline,
): CheckResult[] {
  const results: CheckResult[] = [];

  // Match the per-line, right-trimmed heading convention in structural.ts so
  // the baseline comparator and validateStructure agree on what counts as a
  // heading line.
  const lines = output.split('\n').map((line) => line.trimEnd());

  const missingHeadings: string[] = [];
  const missingTables: string[] = [];

  // (1) Per-heading checks, in baseline order.
  for (const heading of baseline.headings) {
    const found = lines.some((line) => line === heading);
    if (!found) {
      missingHeadings.push(heading);
    }
    results.push({
      check_name: `has baseline heading '${heading}'`,
      passed: found,
      expected: heading,
      actual: found ? 'found' : 'not found',
    });
  }

  // (2) Per-table checks, in baseline order. A table is present when some
  // pipe-bearing line contains every column name as a substring — identical
  // to the required_tables heuristic in structural.ts.
  for (const table of baseline.tables) {
    const cols = table.columns;
    const colList = cols.join(', ');
    const found = lines.some(
      (line) => line.includes('|') && cols.every((col) => line.includes(col)),
    );
    if (!found) {
      missingTables.push(colList);
    }
    results.push({
      check_name: `has baseline table with columns: ${colList}`,
      passed: found,
      expected: colList,
      actual: found ? 'found' : 'not found',
    });
  }

  // (3) Aggregate regression summary. `actual` is a compact one-line
  // enumeration of everything that is missing so the reviewer can read the
  // failure at a glance. When nothing is missing, `actual` is 'no regressions'.
  const summaryParts: string[] = [];
  if (missingHeadings.length > 0) {
    summaryParts.push(`missing headings: ${missingHeadings.join(', ')}`);
  }
  if (missingTables.length > 0) {
    summaryParts.push(`missing tables: ${missingTables.join('; ')}`);
  }
  const passed = summaryParts.length === 0;
  results.push({
    check_name: 'baseline regression summary',
    passed,
    expected: `${baseline.headings.length} headings, ${baseline.tables.length} tables`,
    actual: passed ? 'no regressions' : summaryParts.join('; '),
  });

  return results;
}

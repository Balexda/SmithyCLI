/**
 * Baseline library — convention-based JSON loader for persisted known-good
 * output snapshots used to detect structural regressions.
 *
 * Exports `loadBaseline` (this file); `compareToBaseline` lands in a follow-up
 * task.
 *
 * Contract / data model:
 *   specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md §5
 *   specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md User Story 10
 */

import fs from 'node:fs';
import path from 'node:path';

import type { Baseline } from './types.js';

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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { compareToBaseline, loadBaseline } from './baseline.js';
import type { Baseline } from './types.js';

// ---------------------------------------------------------------------------
// Test-isolation helpers
// ---------------------------------------------------------------------------

/**
 * Create an isolated temporary `evals/baselines/`-like directory so tests do
 * not touch the real `evals/baselines/` tree. Returns the directory path and
 * a cleanup function.
 */
function createTempBaselinesDir(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-baseline-test-'));
  return {
    dir,
    cleanup: () => {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Write a JSON file at `<dir>/<name>.json` with the supplied payload (object
 * or raw string) and return the absolute file path.
 */
function writeBaselineFile(
  dir: string,
  name: string,
  payload: unknown | string,
): string {
  const file = path.join(dir, `${name}.json`);
  const body =
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  fs.writeFileSync(file, body, 'utf-8');
  return file;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmp: { dir: string; cleanup: () => void };

beforeEach(() => {
  tmp = createTempBaselinesDir();
});

afterEach(() => {
  tmp.cleanup();
});

// ---------------------------------------------------------------------------
// loadBaseline tests
// ---------------------------------------------------------------------------

describe('loadBaseline', () => {
  // -----------------------------------------------------------------------
  // Missing file — returns null (AS 10.3: baselines are optional)
  // -----------------------------------------------------------------------
  describe('missing file', () => {
    it('returns null when no baseline file exists for the scenario', () => {
      const result = loadBaseline('nonexistent-scenario', tmp.dir);
      expect(result).toBeNull();
    });

    it('returns null (not undefined) for missing files', () => {
      const result = loadBaseline('nonexistent-scenario', tmp.dir);
      // Strict: must be null literal, not undefined.
      expect(result).toBe(null);
      expect(result).not.toBeUndefined();
    });

    it('returns null when the baselines directory itself does not exist', () => {
      const missingDir = path.join(tmp.dir, 'does-not-exist');
      const result = loadBaseline('whatever', missingDir);
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------
  describe('valid baseline file', () => {
    it('loads and returns a fully-formed baseline', () => {
      const payload: Baseline = {
        scenario_name: 'strike-health-check',
        captured_at: '2026-04-17T00:00:00Z',
        headings: ['## Summary', '## Approach', '## Risks'],
        tables: [{ columns: ['Step', 'Action'] }],
      };
      writeBaselineFile(tmp.dir, 'strike-health-check', payload);

      const result = loadBaseline('strike-health-check', tmp.dir);
      expect(result).not.toBeNull();
      expect(result).toEqual(payload);
    });

    it('defaults missing `tables` field to empty array', () => {
      writeBaselineFile(tmp.dir, 'no-tables', {
        scenario_name: 'no-tables',
        captured_at: '2026-04-17T00:00:00Z',
        headings: ['## Plan'],
        // tables omitted — loader must coerce to []
      });

      const result = loadBaseline('no-tables', tmp.dir);
      expect(result).not.toBeNull();
      expect(result!.tables).toEqual([]);
      expect(result!.headings).toEqual(['## Plan']);
    });

    it('ignores unknown extra fields (forward compatible)', () => {
      writeBaselineFile(tmp.dir, 'extras', {
        scenario_name: 'extras',
        captured_at: '2026-04-17T00:00:00Z',
        headings: ['## A'],
        tables: [],
        // Future/unknown fields — loader must ignore without throwing.
        future_field: 'some-value',
        another_one: { nested: true },
      });

      const result = loadBaseline('extras', tmp.dir);
      expect(result).not.toBeNull();
      expect(result!.scenario_name).toBe('extras');
      expect(result!.headings).toEqual(['## A']);
      // Unknown fields should not appear on the returned Baseline object.
      expect(result as unknown as Record<string, unknown>).not.toHaveProperty(
        'future_field',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Malformed JSON
  // -----------------------------------------------------------------------
  describe('malformed JSON', () => {
    it('throws with a descriptive error naming the file path', () => {
      const filePath = writeBaselineFile(
        tmp.dir,
        'broken',
        '{ this is : not valid JSON',
      );

      expect(() => loadBaseline('broken', tmp.dir)).toThrow(
        new RegExp(filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
    });

    it('throws when file contains an empty string', () => {
      writeBaselineFile(tmp.dir, 'empty', '');

      expect(() => loadBaseline('empty', tmp.dir)).toThrow(/empty\.json/);
    });
  });

  // -----------------------------------------------------------------------
  // Missing required fields
  // -----------------------------------------------------------------------
  describe('missing required fields', () => {
    it('throws when `scenario_name` is missing', () => {
      writeBaselineFile(tmp.dir, 'no-name', {
        captured_at: '2026-04-17T00:00:00Z',
        headings: ['## A'],
      });

      expect(() => loadBaseline('no-name', tmp.dir)).toThrow(
        /scenario_name/,
      );
    });

    it('throws when `captured_at` is missing', () => {
      writeBaselineFile(tmp.dir, 'no-captured-at', {
        scenario_name: 'no-captured-at',
        headings: ['## A'],
      });

      expect(() => loadBaseline('no-captured-at', tmp.dir)).toThrow(
        /captured_at/,
      );
    });

    it('throws when `headings` is missing', () => {
      writeBaselineFile(tmp.dir, 'no-headings', {
        scenario_name: 'no-headings',
        captured_at: '2026-04-17T00:00:00Z',
      });

      expect(() => loadBaseline('no-headings', tmp.dir)).toThrow(
        /headings/,
      );
    });

    it('error message names the offending file path', () => {
      const filePath = writeBaselineFile(tmp.dir, 'incomplete', {
        scenario_name: 'incomplete',
        // captured_at, headings missing
      });

      expect(() => loadBaseline('incomplete', tmp.dir)).toThrow(
        new RegExp(filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
    });

    it('throws when top-level JSON value is not an object', () => {
      writeBaselineFile(tmp.dir, 'array', '[1, 2, 3]');

      expect(() => loadBaseline('array', tmp.dir)).toThrow(/array\.json/);
    });

    it('throws when `headings` is not an array of strings', () => {
      writeBaselineFile(tmp.dir, 'bad-headings', {
        scenario_name: 'bad-headings',
        captured_at: '2026-04-17T00:00:00Z',
        headings: 'not-an-array',
      });

      expect(() => loadBaseline('bad-headings', tmp.dir)).toThrow(
        /headings/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Default directory
  // -----------------------------------------------------------------------
  describe('default directory', () => {
    it('uses `evals/baselines` relative to cwd when no dir is passed', () => {
      // Move into the temp dir so the default relative path resolves
      // against a known-empty tree (no `evals/baselines/` subdir exists).
      const originalCwd = process.cwd();
      try {
        process.chdir(tmp.dir);
        // Default lookup should return null because no file exists.
        const result = loadBaseline('anything-at-all');
        expect(result).toBeNull();
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('resolves default directory against cwd and reads a file placed there', () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(tmp.dir);

        // Create evals/baselines/<name>.json under the cwd.
        const baselinesDir = path.join(tmp.dir, 'evals', 'baselines');
        fs.mkdirSync(baselinesDir, { recursive: true });
        writeBaselineFile(baselinesDir, 'cwd-scenario', {
          scenario_name: 'cwd-scenario',
          captured_at: '2026-04-17T00:00:00Z',
          headings: ['## Heading'],
          tables: [],
        });

        const result = loadBaseline('cwd-scenario');
        expect(result).not.toBeNull();
        expect(result!.scenario_name).toBe('cwd-scenario');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// compareToBaseline tests
// ---------------------------------------------------------------------------

describe('compareToBaseline', () => {
  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  const makeBaseline = (overrides: Partial<Baseline> = {}): Baseline => ({
    scenario_name: 'test',
    captured_at: '2026-04-17T00:00:00Z',
    headings: [],
    tables: [],
    ...overrides,
  });

  // -----------------------------------------------------------------------
  // AS 10.1 — full match path
  // -----------------------------------------------------------------------
  describe('AS 10.1 — output matches baseline', () => {
    it('produces all-pass results when every heading and table is present', () => {
      const baseline = makeBaseline({
        headings: ['## Summary', '## Approach', '## Risks'],
        tables: [{ columns: ['Step', 'Action'] }],
      });
      const output = [
        '## Summary',
        'some prose',
        '## Approach',
        '| Step | Action |',
        '| 1 | do something |',
        '## Risks',
        '- a risk',
      ].join('\n');

      const results = compareToBaseline(output, baseline);

      // One per heading + one per table + one summary = 3 + 1 + 1 = 5
      expect(results).toHaveLength(5);
      expect(results.every((r) => r.passed)).toBe(true);
    });

    it('summary entry is the last result and passes when nothing is missing', () => {
      const baseline = makeBaseline({
        headings: ['## A'],
        tables: [{ columns: ['Col1'] }],
      });
      const output = ['## A', '| Col1 |', '| v |'].join('\n');

      const results = compareToBaseline(output, baseline);
      const summary = results[results.length - 1];

      expect(summary!.check_name).toBe('baseline regression summary');
      expect(summary!.passed).toBe(true);
    });

    it('emits checks in order: headings, tables, summary', () => {
      const baseline = makeBaseline({
        headings: ['## First', '## Second'],
        tables: [{ columns: ['A', 'B'] }],
      });
      const output = ['## First', '## Second', '| A | B |'].join('\n');

      const results = compareToBaseline(output, baseline);

      expect(results[0]!.check_name).toBe("has baseline heading '## First'");
      expect(results[1]!.check_name).toBe("has baseline heading '## Second'");
      expect(results[2]!.check_name).toBe('has baseline table with columns: A, B');
      expect(results[3]!.check_name).toBe('baseline regression summary');
    });
  });

  // -----------------------------------------------------------------------
  // AS 10.2 — regression signal paths
  // -----------------------------------------------------------------------
  describe('AS 10.2 — output missing baseline items', () => {
    it('fails the per-heading check when a single heading is absent', () => {
      const baseline = makeBaseline({
        headings: ['## Summary', '## Approach', '## Risks'],
      });
      const output = ['## Summary', '## Approach'].join('\n');

      const results = compareToBaseline(output, baseline);
      const risks = results.find(
        (r) => r.check_name === "has baseline heading '## Risks'",
      );

      expect(risks).toBeDefined();
      expect(risks!.passed).toBe(false);
      expect(risks!.actual).toBe('not found');
    });

    it('summary.actual lists the single missing heading', () => {
      const baseline = makeBaseline({
        headings: ['## Summary', '## Risks'],
      });
      const output = '## Summary';

      const results = compareToBaseline(output, baseline);
      const summary = results[results.length - 1]!;

      expect(summary.passed).toBe(false);
      expect(summary.actual).toContain('## Risks');
      expect(summary.actual).toContain('missing headings');
    });

    it('summary.actual enumerates every missing heading when multiple are absent', () => {
      const baseline = makeBaseline({
        headings: ['## A', '## B', '## C', '## D'],
      });
      const output = '## A';

      const results = compareToBaseline(output, baseline);
      const summary = results[results.length - 1]!;

      expect(summary.passed).toBe(false);
      // Every missing heading should appear in the compact single-line summary.
      expect(summary.actual).toContain('## B');
      expect(summary.actual).toContain('## C');
      expect(summary.actual).toContain('## D');
      // The still-present heading should NOT appear as "missing".
      // Check by parsing around the "missing headings:" chunk.
      const missingChunk = summary.actual!;
      expect(missingChunk).not.toMatch(/missing headings:[^;]*## A\b/);
    });

    it('fails the per-table check when a baseline table is absent', () => {
      const baseline = makeBaseline({
        headings: ['## Heading'],
        tables: [
          { columns: ['Step', 'Action'] },
          { columns: ['Other', 'Col'] },
        ],
      });
      // Only the first table is present.
      const output = ['## Heading', '| Step | Action |', '| 1 | go |'].join(
        '\n',
      );

      const results = compareToBaseline(output, baseline);
      const missingTable = results.find(
        (r) => r.check_name === 'has baseline table with columns: Other, Col',
      );

      expect(missingTable).toBeDefined();
      expect(missingTable!.passed).toBe(false);
      expect(missingTable!.actual).toBe('not found');
    });

    it('summary.actual lists missing tables by their column signature', () => {
      const baseline = makeBaseline({
        headings: [],
        tables: [{ columns: ['Step', 'Action'] }],
      });
      const output = 'no table here';

      const results = compareToBaseline(output, baseline);
      const summary = results[results.length - 1]!;

      expect(summary.passed).toBe(false);
      expect(summary.actual).toContain('missing tables');
      // Column list should appear so the reviewer can identify the table.
      expect(summary.actual).toContain('Step');
      expect(summary.actual).toContain('Action');
    });

    it('summary.actual mentions both missing headings and tables when both drift', () => {
      const baseline = makeBaseline({
        headings: ['## Lost'],
        tables: [{ columns: ['Gone', 'Too'] }],
      });
      const output = '';

      const results = compareToBaseline(output, baseline);
      const summary = results[results.length - 1]!;

      expect(summary.passed).toBe(false);
      expect(summary.actual).toContain('missing headings');
      expect(summary.actual).toContain('## Lost');
      expect(summary.actual).toContain('missing tables');
      expect(summary.actual).toContain('Gone');
    });
  });

  // -----------------------------------------------------------------------
  // Extra content is ignored (not a content lock)
  // -----------------------------------------------------------------------
  describe('extra content in output', () => {
    it('ignores extra headings not present in the baseline', () => {
      const baseline = makeBaseline({
        headings: ['## Summary'],
      });
      const output = [
        '## Summary',
        '## Surprise', // extra, should not fail
        '## Bonus', // extra, should not fail
      ].join('\n');

      const results = compareToBaseline(output, baseline);

      expect(results.every((r) => r.passed)).toBe(true);
    });

    it('ignores extra tables not present in the baseline', () => {
      const baseline = makeBaseline({
        tables: [{ columns: ['A'] }],
      });
      const output = ['| A |', '| v |', '| X | Y |', '| 1 | 2 |'].join('\n');

      const results = compareToBaseline(output, baseline);

      expect(results.every((r) => r.passed)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Empty output against non-empty baseline — every check fails
  // -----------------------------------------------------------------------
  describe('empty output', () => {
    it('fails every per-element check and the summary against a non-empty baseline', () => {
      const baseline = makeBaseline({
        headings: ['## A', '## B'],
        tables: [{ columns: ['X', 'Y'] }],
      });
      const results = compareToBaseline('', baseline);

      // 2 heading checks + 1 table check + 1 summary = 4 total
      expect(results).toHaveLength(4);
      expect(results.every((r) => !r.passed)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Degenerate baseline — zero entries everywhere
  // -----------------------------------------------------------------------
  describe('empty baseline', () => {
    it('returns only the summary entry (passing) when baseline has no headings or tables', () => {
      const baseline = makeBaseline({ headings: [], tables: [] });
      const results = compareToBaseline('anything goes', baseline);

      expect(results).toHaveLength(1);
      expect(results[0]!.check_name).toBe('baseline regression summary');
      expect(results[0]!.passed).toBe(true);
    });

    it('passes even when output is also empty', () => {
      const baseline = makeBaseline({ headings: [], tables: [] });
      const results = compareToBaseline('', baseline);

      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Purity — function must not mutate its inputs
  // -----------------------------------------------------------------------
  describe('purity', () => {
    it('does not mutate the baseline argument', () => {
      const baseline = makeBaseline({
        headings: ['## A', '## B'],
        tables: [{ columns: ['Col1', 'Col2'] }],
      });
      const snapshot = JSON.parse(JSON.stringify(baseline));

      compareToBaseline('## A\n## B\n| Col1 | Col2 |', baseline);

      expect(baseline).toEqual(snapshot);
    });
  });
});

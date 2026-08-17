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

    it('loads structural-only baselines without a token envelope', () => {
      writeBaselineFile(tmp.dir, 'structural-only', {
        scenario_name: 'structural-only',
        captured_at: '2026-04-17T00:00:00Z',
        headings: ['## Summary'],
        tables: [],
      });

      const result = loadBaseline('structural-only', tmp.dir);
      expect(result).toEqual({
        scenario_name: 'structural-only',
        captured_at: '2026-04-17T00:00:00Z',
        headings: ['## Summary'],
        tables: [],
      });
      expect(result as unknown as Record<string, unknown>).not.toHaveProperty(
        'token_envelope',
      );
    });

    it('loads a valid input-only token envelope', () => {
      writeBaselineFile(tmp.dir, 'input-envelope', {
        scenario_name: 'input-envelope',
        captured_at: '2026-04-17T00:00:00Z',
        headings: ['## A'],
        tables: [],
        token_envelope: {
          input: { min: 10, max: 20 },
        },
      });

      const result = loadBaseline('input-envelope', tmp.dir);
      expect(result!.token_envelope).toEqual({
        input: { min: 10, max: 20 },
      });
    });

    it('loads a valid output-only token envelope', () => {
      writeBaselineFile(tmp.dir, 'output-envelope', {
        scenario_name: 'output-envelope',
        captured_at: '2026-04-17T00:00:00Z',
        headings: ['## A'],
        tables: [],
        token_envelope: {
          output: { min: 5, max: 15 },
        },
      });

      const result = loadBaseline('output-envelope', tmp.dir);
      expect(result!.token_envelope).toEqual({
        output: { min: 5, max: 15 },
      });
    });

    it('loads a valid input-plus-output token envelope', () => {
      writeBaselineFile(tmp.dir, 'full-envelope', {
        scenario_name: 'full-envelope',
        captured_at: '2026-04-17T00:00:00Z',
        headings: ['## A'],
        tables: [],
        token_envelope: {
          input: { min: 10, max: 20 },
          output: { min: 5, max: 15 },
        },
      });

      const result = loadBaseline('full-envelope', tmp.dir);
      expect(result!.token_envelope).toEqual({
        input: { min: 10, max: 20 },
        output: { min: 5, max: 15 },
      });
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

    it('ignores unsupported token envelope fields', () => {
      writeBaselineFile(tmp.dir, 'envelope-extras', {
        scenario_name: 'envelope-extras',
        captured_at: '2026-04-17T00:00:00Z',
        headings: ['## A'],
        tables: [],
        token_envelope: {
          input: { min: 10, max: 20, midpoint: 15 },
          cache: { min: 1, max: 2 },
        },
      });

      const result = loadBaseline('envelope-extras', tmp.dir);
      expect(result!.token_envelope).toEqual({
        input: { min: 10, max: 20 },
      });
    });

    it.each([
      ['is empty', {}],
      ['declares only unsupported ranges', { cache: { min: 1, max: 2 } }],
    ])(
      'omits the token envelope when it %s',
      (_label, tokenEnvelope) => {
        writeBaselineFile(tmp.dir, 'no-supported-ranges', {
          scenario_name: 'no-supported-ranges',
          captured_at: '2026-04-17T00:00:00Z',
          headings: ['## A'],
          tables: [],
          token_envelope: tokenEnvelope,
        });

        const result = loadBaseline('no-supported-ranges', tmp.dir);
        expect(result!.token_envelope).toBeUndefined();
        expect(result as unknown as Record<string, unknown>).not.toHaveProperty(
          'token_envelope',
        );
      },
    );
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

    it('throws when `scenario_name` does not match the requested name', () => {
      writeBaselineFile(tmp.dir, 'asked-for-this', {
        scenario_name: 'but-recorded-that',
        captured_at: '2026-04-17T00:00:00Z',
        headings: ['## A'],
      });

      expect(() => loadBaseline('asked-for-this', tmp.dir)).toThrow(
        /scenario_name.*must match.*asked-for-this/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Token envelope validation
  // -----------------------------------------------------------------------
  describe('token envelope validation', () => {
    function writeTokenEnvelope(
      name: string,
      tokenEnvelope: unknown,
    ): void {
      writeBaselineFile(tmp.dir, name, {
        scenario_name: name,
        captured_at: '2026-04-17T00:00:00Z',
        headings: ['## A'],
        tables: [],
        token_envelope: tokenEnvelope,
      });
    }

    it.each([
      ['missing min', { input: { max: 10 } }],
      ['missing max', { input: { min: 1 } }],
      ['string min', { input: { min: '1', max: 10 } }],
      ['fractional max', { input: { min: 1, max: 10.5 } }],
      ['negative min', { input: { min: -1, max: 10 } }],
      ['inverted bounds', { input: { min: 10, max: 1 } }],
      ['output missing min', { output: { max: 10 } }],
      ['output inverted bounds', { output: { min: 10, max: 1 } }],
    ])('throws when token envelope has %s', (_label, tokenEnvelope) => {
      writeTokenEnvelope('bad-token-envelope', tokenEnvelope);

      expect(() => loadBaseline('bad-token-envelope', tmp.dir)).toThrow(
        /token_envelope/,
      );
    });

    it('throws when token envelope has a non-finite bound', () => {
      writeBaselineFile(
        tmp.dir,
        'non-finite-token-envelope',
        [
          '{',
          '  "scenario_name": "non-finite-token-envelope",',
          '  "captured_at": "2026-04-17T00:00:00Z",',
          '  "headings": ["## A"],',
          '  "tables": [],',
          '  "token_envelope": {',
          '    "input": { "min": 1, "max": 1e309 }',
          '  }',
          '}',
        ].join('\n'),
      );

      expect(() =>
        loadBaseline('non-finite-token-envelope', tmp.dir),
      ).toThrow(/token_envelope/);
    });

    it.each([
      ['null envelope', null],
      ['array envelope', []],
      ['null input range', { input: null }],
      ['array output range', { output: [] }],
    ])('throws when token envelope has %s', (_label, tokenEnvelope) => {
      writeTokenEnvelope('bad-token-shape', tokenEnvelope);

      expect(() => loadBaseline('bad-token-shape', tmp.dir)).toThrow(
        /token_envelope/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // scenarioName path-safety
  // -----------------------------------------------------------------------
  describe('scenarioName path-safety', () => {
    it.each([
      ['empty string', ''],
      ['forward slash', 'foo/bar'],
      ['backslash', 'foo\\bar'],
      ['parent-directory segment', '../escape'],
      ['unix absolute path', '/etc/passwd'],
    ])('throws when scenarioName is %s', (_label, name) => {
      expect(() => loadBaseline(name, tmp.dir)).toThrow(
        /must not contain path separators/,
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
  // Token envelope comparison
  // -----------------------------------------------------------------------
  describe('token envelope comparison', () => {
    it('skips token checks when the baseline has no token envelope', () => {
      const baseline = makeBaseline({
        headings: ['## A'],
        tables: [{ columns: ['Col1'] }],
      });
      const results = compareToBaseline('## A\n| Col1 |', baseline, {
        input: 10,
        output: 5,
      });

      expect(results.map((r) => r.check_name)).toEqual([
        "has baseline heading '## A'",
        'has baseline table with columns: Col1',
        'baseline regression summary',
      ]);
    });

    it('emits an additional passing token check when live totals are inside every defined range', () => {
      const baseline = makeBaseline({
        headings: ['## A'],
        token_envelope: {
          input: { min: 10, max: 20 },
          output: { min: 4, max: 8 },
        },
      });

      const results = compareToBaseline('## A', baseline, {
        input: 15,
        output: 6,
      });
      const tokenCheck = results[results.length - 1]!;

      expect(results.map((r) => r.check_name)).toEqual([
        "has baseline heading '## A'",
        'baseline regression summary',
        'token envelope',
      ]);
      expect(tokenCheck).toEqual({
        check_name: 'token envelope',
        passed: true,
        expected: 'input 10-20, output 4-8',
        actual: 'input 15, output 6',
      });
    });

    it('passes with input-only and output-only envelopes when the defined range contains the live total', () => {
      const inputOnly = compareToBaseline(
        '',
        makeBaseline({
          token_envelope: { input: { min: 1, max: 3 } },
        }),
        { input: 2, output: 999 },
      );
      const outputOnly = compareToBaseline(
        '',
        makeBaseline({
          token_envelope: { output: { min: 5, max: 7 } },
        }),
        { input: 999, output: 6 },
      );

      expect(inputOnly[inputOnly.length - 1]!.passed).toBe(true);
      expect(inputOnly[inputOnly.length - 1]!.expected).toBe('input 1-3');
      expect(outputOnly[outputOnly.length - 1]!.passed).toBe(true);
      expect(outputOnly[outputOnly.length - 1]!.expected).toBe('output 5-7');
    });

    it('fails when a live input total is below min or above max', () => {
      const baseline = makeBaseline({
        token_envelope: { input: { min: 10, max: 20 } },
      });

      const below = compareToBaseline('', baseline, { input: 9, output: 0 });
      const above = compareToBaseline('', baseline, { input: 21, output: 0 });

      expect(below[below.length - 1]).toMatchObject({
        check_name: 'token envelope',
        passed: false,
        expected: 'input 10-20',
        actual: 'input 9, output 0',
      });
      expect(above[above.length - 1]).toMatchObject({
        check_name: 'token envelope',
        passed: false,
        expected: 'input 10-20',
        actual: 'input 21, output 0',
      });
    });

    it('fails when a live output total is below min or above max', () => {
      const baseline = makeBaseline({
        token_envelope: { output: { min: 5, max: 7 } },
      });

      const below = compareToBaseline('', baseline, { input: 0, output: 4 });
      const above = compareToBaseline('', baseline, { input: 0, output: 8 });

      expect(below[below.length - 1]).toMatchObject({
        check_name: 'token envelope',
        passed: false,
        expected: 'output 5-7',
        actual: 'input 0, output 4',
      });
      expect(above[above.length - 1]).toMatchObject({
        check_name: 'token envelope',
        passed: false,
        expected: 'output 5-7',
        actual: 'input 0, output 8',
      });
    });

    it('fails when a token-aware baseline has no live token totals', () => {
      const baseline = makeBaseline({
        token_envelope: {
          input: { min: 10, max: 20 },
          output: { min: 4, max: 8 },
        },
      });

      const results = compareToBaseline('', baseline);

      expect(results[results.length - 1]).toEqual({
        check_name: 'token envelope',
        passed: false,
        expected: 'input 10-20, output 4-8',
        actual: 'missing live token totals',
      });
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

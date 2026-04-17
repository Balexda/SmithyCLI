import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadBaseline } from './baseline.js';
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

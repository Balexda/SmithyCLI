/**
 * Unit tests for the YAML scenario loader.
 *
 * Covers the validation, deduplication, and deterministic-order behavior
 * documented in the data model (§1) and tasks file for User Story 7, Slice 1.
 *
 * Addresses: FR-007; Acceptance Scenario 7.3
 *
 * Spec:         specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md
 * Data model:   specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md
 * Contracts:    specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadScenarios } from './scenario-loader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const realCasesDir = path.resolve(here, '..', 'cases');

/**
 * Create an isolated temp directory under the OS temp root. Returns its path.
 */
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evals-loader-'));
}

/**
 * Flatten the recorded `console.error` calls (each call is an `unknown[]`)
 * into a single string so tests can assert on substrings without wrestling
 * with the implicit-any on anonymous mock-call parameters.
 */
function joinErrorCalls(spy: ReturnType<typeof vi.spyOn>): string {
  const calls = spy.mock.calls as unknown[][];
  return calls.map((args) => args.map((a) => String(a)).join(' ')).join('\n');
}

describe('loadScenarios', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  let outSpy: ReturnType<typeof vi.spyOn>;
  const tempDirs: string[] = [];

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    outSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errSpy.mockRestore();
    outSpy.mockRestore();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function mkdir(): string {
    const dir = makeTempDir();
    tempDirs.push(dir);
    return dir;
  }

  // -----------------------------------------------------------------------
  // Happy path — real repo cases directory
  // -----------------------------------------------------------------------
  describe('happy path', () => {
    it('loads the strike-health-check scenario from the real cases dir', () => {
      const scenarios = loadScenarios(realCasesDir);
      expect(scenarios.length).toBeGreaterThanOrEqual(1);
      const strike = scenarios.find((s) => s.name === 'strike-health-check');
      expect(strike).toBeDefined();
      expect(strike!.skill).toBe('/smithy.strike');
      expect(strike!.prompt).toBe('add a health check endpoint');
      expect(strike!.structural_expectations.required_headings).toEqual([
        '## Summary',
        '## Approach',
        '## Risks',
      ]);
    });

    it('emits nothing on stdout or stderr for a clean load', () => {
      loadScenarios(realCasesDir);
      expect(outSpy).not.toHaveBeenCalled();
      expect(errSpy).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Empty / non-yaml directories
  // -----------------------------------------------------------------------
  describe('empty or non-yaml directories', () => {
    it('returns [] for an empty directory without error', () => {
      const dir = mkdir();
      const scenarios = loadScenarios(dir);
      expect(scenarios).toEqual([]);
      expect(errSpy).not.toHaveBeenCalled();
    });

    it('returns [] when no .yaml files are present', () => {
      const dir = mkdir();
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'not yaml');
      fs.writeFileSync(path.join(dir, 'config.json'), '{}');
      const scenarios = loadScenarios(dir);
      expect(scenarios).toEqual([]);
      expect(errSpy).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Non-existent directory
  // -----------------------------------------------------------------------
  describe('missing directory', () => {
    it('throws a clear Error when casesDir does not exist', () => {
      const missing = path.join(os.tmpdir(), 'evals-loader-does-not-exist-xyz');
      expect(() => loadScenarios(missing)).toThrow(/cases directory/i);
    });
  });

  // -----------------------------------------------------------------------
  // Malformed YAML
  // -----------------------------------------------------------------------
  describe('malformed YAML', () => {
    it('skips files that fail YAML parsing and reports to stderr', () => {
      const dir = mkdir();
      // `name: [` is intentionally unterminated -> YAML parse error.
      fs.writeFileSync(path.join(dir, 'broken.yaml'), 'name: [\n');
      // Also drop in a valid file alongside to prove the valid one survives.
      const good = [
        'name: good-case',
        'skill: /smithy.strike',
        'prompt: do the thing',
        'structural_expectations:',
        '  required_headings:',
        '    - "## Summary"',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(dir, 'good.yaml'), good);

      const scenarios = loadScenarios(dir);
      expect(scenarios).toHaveLength(1);
      expect(scenarios[0]!.name).toBe('good-case');
      expect(errSpy).toHaveBeenCalled();
      const joined = joinErrorCalls(errSpy);
      expect(joined).toContain('broken.yaml');
    });
  });

  // -----------------------------------------------------------------------
  // Missing / invalid required fields
  // -----------------------------------------------------------------------
  describe('validation failures', () => {
    it('skips a file missing `name` with a stderr message', () => {
      const dir = mkdir();
      const content = [
        'skill: /smithy.strike',
        'prompt: whatever',
        'structural_expectations:',
        '  required_headings:',
        '    - "## Summary"',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(dir, 'nameless.yaml'), content);

      const scenarios = loadScenarios(dir);
      expect(scenarios).toEqual([]);
      expect(errSpy).toHaveBeenCalled();
      const joined = joinErrorCalls(errSpy);
      expect(joined).toContain('nameless.yaml');
      expect(joined).toMatch(/name/i);
    });

    it('skips a file missing `skill` with a stderr message', () => {
      const dir = mkdir();
      const content = [
        'name: skill-less',
        'prompt: whatever',
        'structural_expectations:',
        '  required_headings:',
        '    - "## Summary"',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(dir, 'skill-less.yaml'), content);

      const scenarios = loadScenarios(dir);
      expect(scenarios).toEqual([]);
      expect(errSpy).toHaveBeenCalled();
      const joined = joinErrorCalls(errSpy);
      expect(joined).toContain('skill-less.yaml');
      expect(joined).toMatch(/skill/i);
    });

    it('skips a file missing `prompt` with a stderr message', () => {
      const dir = mkdir();
      const content = [
        'name: prompt-less',
        'skill: /smithy.strike',
        'structural_expectations:',
        '  required_headings:',
        '    - "## Summary"',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(dir, 'prompt-less.yaml'), content);

      const scenarios = loadScenarios(dir);
      expect(scenarios).toEqual([]);
      expect(errSpy).toHaveBeenCalled();
      const joined = joinErrorCalls(errSpy);
      expect(joined).toContain('prompt-less.yaml');
      expect(joined).toMatch(/prompt/i);
    });

    it('skips a file with a non-object YAML root (e.g. a list) and reports it', () => {
      const dir = mkdir();
      fs.writeFileSync(path.join(dir, 'list.yaml'), '- foo\n- bar\n');

      const scenarios = loadScenarios(dir);
      expect(scenarios).toEqual([]);
      expect(errSpy).toHaveBeenCalled();
      const joined = joinErrorCalls(errSpy);
      expect(joined).toContain('list.yaml');
    });

    it('skips a file with an empty required_headings array and reports it', () => {
      const dir = mkdir();
      const content = [
        'name: empty-headings',
        'skill: /smithy.strike',
        'prompt: whatever',
        'structural_expectations:',
        '  required_headings: []',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(dir, 'empty-headings.yaml'), content);

      const scenarios = loadScenarios(dir);
      expect(scenarios).toEqual([]);
      expect(errSpy).toHaveBeenCalled();
      const joined = joinErrorCalls(errSpy);
      expect(joined).toContain('empty-headings.yaml');
      expect(joined).toMatch(/required_headings/i);
    });

    it('skips a file where structural_expectations is missing entirely', () => {
      const dir = mkdir();
      const content = [
        'name: no-expectations',
        'skill: /smithy.strike',
        'prompt: whatever',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(dir, 'no-expectations.yaml'), content);

      const scenarios = loadScenarios(dir);
      expect(scenarios).toEqual([]);
      expect(errSpy).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Duplicate names
  // -----------------------------------------------------------------------
  describe('duplicate names', () => {
    it('keeps the first alphabetically and skips later duplicates with a stderr message', () => {
      const dir = mkdir();
      const yaml = (prompt: string) =>
        [
          'name: dup',
          'skill: /smithy.strike',
          `prompt: ${prompt}`,
          'structural_expectations:',
          '  required_headings:',
          '    - "## Summary"',
          '',
        ].join('\n');
      fs.writeFileSync(path.join(dir, 'a-first.yaml'), yaml('first wins'));
      fs.writeFileSync(path.join(dir, 'b-second.yaml'), yaml('second loses'));

      const scenarios = loadScenarios(dir);
      expect(scenarios).toHaveLength(1);
      expect(scenarios[0]!.prompt).toBe('first wins');
      expect(errSpy).toHaveBeenCalled();
      const joined = joinErrorCalls(errSpy);
      expect(joined).toContain('b-second.yaml');
      expect(joined).toMatch(/duplicate|already|dup/i);
    });
  });

  // -----------------------------------------------------------------------
  // Deterministic order
  // -----------------------------------------------------------------------
  describe('deterministic order', () => {
    it('returns scenarios sorted by filename alphabetically', () => {
      const dir = mkdir();
      const yaml = (name: string) =>
        [
          `name: ${name}`,
          'skill: /smithy.strike',
          'prompt: whatever',
          'structural_expectations:',
          '  required_headings:',
          '    - "## Summary"',
          '',
        ].join('\n');
      fs.writeFileSync(path.join(dir, 'zeta.yaml'), yaml('zeta-case'));
      fs.writeFileSync(path.join(dir, 'alpha.yaml'), yaml('alpha-case'));
      fs.writeFileSync(path.join(dir, 'mu.yaml'), yaml('mu-case'));

      const scenarios = loadScenarios(dir);
      expect(scenarios.map((s) => s.name)).toEqual([
        'alpha-case',
        'mu-case',
        'zeta-case',
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // Non-yaml filtering
  // -----------------------------------------------------------------------
  describe('file extension filtering', () => {
    it('ignores non-.yaml files even when alongside valid cases', () => {
      const dir = mkdir();
      fs.writeFileSync(path.join(dir, 'README.md'), '# Readme\n');
      fs.writeFileSync(path.join(dir, 'legacy.yml'), 'name: ignored\n');
      const yaml = [
        'name: real-case',
        'skill: /smithy.strike',
        'prompt: whatever',
        'structural_expectations:',
        '  required_headings:',
        '    - "## Summary"',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(dir, 'real.yaml'), yaml);

      const scenarios = loadScenarios(dir);
      expect(scenarios).toHaveLength(1);
      expect(scenarios[0]!.name).toBe('real-case');
      expect(errSpy).not.toHaveBeenCalled();
    });
  });
});

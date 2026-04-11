import { describe, it, expect } from 'vitest';
import { validateStructure } from './structural.js';
import type { StructuralExpectations } from './types.js';

describe('validateStructure', () => {
  // -----------------------------------------------------------------------
  // required_headings
  // -----------------------------------------------------------------------
  describe('required_headings', () => {
    it('passes when heading is present on its own line', () => {
      const output = '# Intro\n\n## Plan\n\nSome text here.';
      const expectations: StructuralExpectations = {
        required_headings: ['## Plan'],
      };
      const results = validateStructure(output, expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(true);
      expect(results[0]!.check_name).toBe("has '## Plan' heading");
      expect(results[0]!.actual).toBe('found');
    });

    it('fails when heading is not present', () => {
      const output = '# Intro\n\nSome text here.';
      const expectations: StructuralExpectations = {
        required_headings: ['## Plan'],
      };
      const results = validateStructure(output, expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
      expect(results[0]!.actual).toBe('not found');
    });

    it('fails when heading is at a different level', () => {
      const output = '### Plan\n\nSome text here.';
      const expectations: StructuralExpectations = {
        required_headings: ['## Plan'],
      };
      const results = validateStructure(output, expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
    });

    it('does not false-positive on prose containing the heading text', () => {
      const output = 'The section titled ## Plan is important.\n\nMore text.';
      const expectations: StructuralExpectations = {
        required_headings: ['## Plan'],
      };
      const results = validateStructure(output, expectations);
      // The heading text appears mid-line, not as a standalone heading line
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
    });

    it('matches heading with trailing whitespace trimmed', () => {
      const output = '## Plan   \n\nSome text here.';
      const expectations: StructuralExpectations = {
        required_headings: ['## Plan'],
      };
      const results = validateStructure(output, expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(true);
    });

    it('fails on empty output', () => {
      const expectations: StructuralExpectations = {
        required_headings: ['## Plan'],
      };
      const results = validateStructure('', expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // required_patterns
  // -----------------------------------------------------------------------
  describe('required_patterns', () => {
    it('passes when pattern matches the output', () => {
      const output = 'Status: APPROVED\nDetails follow.';
      const expectations: StructuralExpectations = {
        required_headings: [],
        required_patterns: ['Status:\\s+APPROVED'],
      };
      const results = validateStructure(output, expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(true);
      expect(results[0]!.check_name).toContain('required pattern');
    });

    it('fails when pattern does not match', () => {
      const output = 'Status: REJECTED\nDetails follow.';
      const expectations: StructuralExpectations = {
        required_headings: [],
        required_patterns: ['Status:\\s+APPROVED'],
      };
      const results = validateStructure(output, expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
      expect(results[0]!.actual).toBe('not found');
    });

    it('throws immediately on invalid regex', () => {
      const expectations: StructuralExpectations = {
        required_headings: [],
        required_patterns: ['[invalid'],
      };
      expect(() => validateStructure('some output', expectations)).toThrow();
    });

    it('fails on empty output', () => {
      const expectations: StructuralExpectations = {
        required_headings: [],
        required_patterns: ['anything'],
      };
      const results = validateStructure('', expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // forbidden_patterns
  // -----------------------------------------------------------------------
  describe('forbidden_patterns', () => {
    it('passes when forbidden pattern is absent', () => {
      const output = 'All systems nominal.';
      const expectations: StructuralExpectations = {
        required_headings: [],
        forbidden_patterns: ['ERROR|FATAL'],
      };
      const results = validateStructure(output, expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(true);
      expect(results[0]!.check_name).toContain('forbidden pattern');
      expect(results[0]!.actual).toBe('not found');
    });

    it('fails when forbidden pattern is present', () => {
      const output = 'FATAL error encountered.';
      const expectations: StructuralExpectations = {
        required_headings: [],
        forbidden_patterns: ['ERROR|FATAL'],
      };
      const results = validateStructure(output, expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
    });

    it('throws immediately on invalid regex', () => {
      const expectations: StructuralExpectations = {
        required_headings: [],
        forbidden_patterns: ['(unclosed'],
      };
      expect(() => validateStructure('some output', expectations)).toThrow();
    });

    it('passes on empty output (forbidden pattern absent)', () => {
      const expectations: StructuralExpectations = {
        required_headings: [],
        forbidden_patterns: ['something'],
      };
      const results = validateStructure('', expectations);
      expect(results).toHaveLength(1);
      // Empty output means the forbidden pattern is absent, so it passes
      expect(results[0]!.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // required_tables
  // -----------------------------------------------------------------------
  describe('required_tables', () => {
    it('passes when table with all columns is found', () => {
      const output = [
        '## Data',
        '',
        '| Name | Age | City |',
        '|------|-----|------|',
        '| Alice | 30 | NYC |',
      ].join('\n');
      const expectations: StructuralExpectations = {
        required_headings: [],
        required_tables: [{ columns: ['Name', 'Age'] }],
      };
      const results = validateStructure(output, expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(true);
      expect(results[0]!.check_name).toContain('table with columns');
    });

    it('fails when a required column is missing from table', () => {
      const output = [
        '| Name | City |',
        '|------|------|',
        '| Alice | NYC |',
      ].join('\n');
      const expectations: StructuralExpectations = {
        required_headings: [],
        required_tables: [{ columns: ['Name', 'Age'] }],
      };
      const results = validateStructure(output, expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
    });

    it('fails when there is no table at all', () => {
      const output = 'Just plain text with no table.';
      const expectations: StructuralExpectations = {
        required_headings: [],
        required_tables: [{ columns: ['Name', 'Age'] }],
      };
      const results = validateStructure(output, expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
    });

    it('fails on empty output', () => {
      const expectations: StructuralExpectations = {
        required_headings: [],
        required_tables: [{ columns: ['Col1'] }],
      };
      const results = validateStructure('', expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Empty output — all checks fail
  // -----------------------------------------------------------------------
  describe('empty output', () => {
    it('all checks fail when output is empty', () => {
      const expectations: StructuralExpectations = {
        required_headings: ['## Plan', '## Summary'],
        required_patterns: ['\\d+'],
        required_tables: [{ columns: ['A', 'B'] }],
        // forbidden_patterns pass on empty (pattern is absent)
        forbidden_patterns: ['something'],
      };
      const results = validateStructure('', expectations);
      // 2 headings + 1 pattern + 1 table + 1 forbidden = 5 checks
      expect(results).toHaveLength(5);

      const headingChecks = results.filter((r) =>
        r.check_name.includes('heading'),
      );
      expect(headingChecks).toHaveLength(2);
      expect(headingChecks.every((r) => r.passed === false)).toBe(true);

      const patternCheck = results.find((r) =>
        r.check_name.includes('required pattern'),
      );
      expect(patternCheck?.passed).toBe(false);

      const tableCheck = results.find((r) =>
        r.check_name.includes('table'),
      );
      expect(tableCheck?.passed).toBe(false);

      // Forbidden pattern passes on empty output
      const forbiddenCheck = results.find((r) =>
        r.check_name.includes('forbidden'),
      );
      expect(forbiddenCheck?.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Mixed expectations
  // -----------------------------------------------------------------------
  describe('mixed expectations', () => {
    it('returns one CheckResult per individual check', () => {
      const output = [
        '## Plan',
        '',
        'Implementation details with ID-42.',
        '',
        '| Step | Action |',
        '|------|--------|',
        '| 1 | Code |',
      ].join('\n');
      const expectations: StructuralExpectations = {
        required_headings: ['## Plan'],
        required_patterns: ['ID-\\d+'],
        forbidden_patterns: ['BLOCKED'],
        required_tables: [{ columns: ['Step', 'Action'] }],
      };
      const results = validateStructure(output, expectations);
      expect(results).toHaveLength(4);
      expect(results.every((r) => r.passed)).toBe(true);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { validateStructure, verifySubAgents } from './structural.js';
import type {
  StructuralExpectations,
  AgentDispatch,
  SubAgentEvidence,
} from './types.js';

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

    it('fails on empty output (contract: all checks fail)', () => {
      const expectations: StructuralExpectations = {
        required_headings: [],
        forbidden_patterns: ['something'],
      };
      const results = validateStructure('', expectations);
      expect(results).toHaveLength(1);
      expect(results[0]!.passed).toBe(false);
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

      const forbiddenCheck = results.find((r) =>
        r.check_name.includes('forbidden'),
      );
      expect(forbiddenCheck?.passed).toBe(false);
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

// ---------------------------------------------------------------------------
// verifySubAgents
// ---------------------------------------------------------------------------
describe('verifySubAgents', () => {
  const makeDispatch = (
    overrides: Partial<AgentDispatch> = {},
  ): AgentDispatch => ({
    id: 'dispatch-1',
    description: 'Run smithy-plan agent',
    prompt: 'Do planning',
    resultText: 'Plan completed successfully',
    ...overrides,
  });

  it('returns empty array when evidence is empty', () => {
    const results = verifySubAgents('some text', [makeDispatch()], []);
    expect(results).toEqual([]);
  });

  it('passes when pattern matches in extracted text', () => {
    const evidence: SubAgentEvidence[] = [
      { agent: 'smithy-plan', pattern: 'plan.*output' },
    ];
    const results = verifySubAgents(
      'The plan has output here',
      [],
      evidence,
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(true);
    expect(results[0]!.check_name).toBe('smithy-plan evidence present');
    expect(results[0]!.expected).toBe('plan.*output');
    expect(results[0]!.actual).toBe('matched in extracted text');
  });

  it('passes when pattern matches in dispatch description', () => {
    const evidence: SubAgentEvidence[] = [
      { agent: 'smithy-plan', pattern: 'planning\\s+agent' },
    ];
    const dispatch = makeDispatch({
      description: 'Invoke the planning agent for analysis',
    });
    const results = verifySubAgents('unrelated text', [dispatch], evidence);
    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(true);
    expect(results[0]!.actual).toBe('matched in dispatch description');
  });

  it('passes when pattern matches in dispatch resultText', () => {
    const evidence: SubAgentEvidence[] = [
      { agent: 'smithy-plan', pattern: 'risk\\s+assessment' },
    ];
    const dispatch = makeDispatch({
      resultText: 'Completed risk assessment for the feature',
    });
    const results = verifySubAgents('unrelated text', [dispatch], evidence);
    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(true);
    expect(results[0]!.actual).toBe('matched in dispatch result');
  });

  it('fails when pattern does not match anywhere', () => {
    const evidence: SubAgentEvidence[] = [
      { agent: 'smithy-plan', pattern: 'nonexistent_pattern_xyz' },
    ];
    const dispatch = makeDispatch();
    const results = verifySubAgents('some text', [dispatch], evidence);
    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.actual).toBe('no match found');
    expect(results[0]!.expected).toBe('nonexistent_pattern_xyz');
  });

  it('does not pass based solely on agent name in dispatch', () => {
    // The dispatch description mentions "smithy-plan" but the configured
    // pattern requires something specific that is NOT present anywhere.
    const evidence: SubAgentEvidence[] = [
      { agent: 'smithy-plan', pattern: 'specific_marker_abc' },
    ];
    const dispatch = makeDispatch({
      description: 'smithy-plan sub-agent invocation',
      resultText: 'smithy-plan finished',
    });
    const results = verifySubAgents('smithy-plan ran', [dispatch], evidence);
    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.actual).toBe('no match found');
  });

  it('handles multiple evidence entries with mixed results', () => {
    const evidence: SubAgentEvidence[] = [
      { agent: 'smithy-plan', pattern: 'plan.*completed' },
      { agent: 'smithy-review', pattern: 'review_marker_missing' },
      { agent: 'smithy-implement', pattern: 'TDD.*cycle' },
    ];
    const dispatches: AgentDispatch[] = [
      makeDispatch({
        id: 'd1',
        description: 'planning',
        resultText: 'plan was completed',
      }),
      makeDispatch({
        id: 'd2',
        description: 'implementation',
        resultText: 'TDD red-green cycle done',
      }),
    ];
    const results = verifySubAgents('unrelated', dispatches, evidence);
    expect(results).toHaveLength(3);

    // smithy-plan: matches in dispatch resultText
    expect(results[0]!.check_name).toBe('smithy-plan evidence present');
    expect(results[0]!.passed).toBe(true);

    // smithy-review: no match anywhere
    expect(results[1]!.check_name).toBe('smithy-review evidence present');
    expect(results[1]!.passed).toBe(false);

    // smithy-implement: matches in dispatch resultText
    expect(results[2]!.check_name).toBe('smithy-implement evidence present');
    expect(results[2]!.passed).toBe(true);
  });

  it('prefers extracted text match over dispatch matches', () => {
    // When the pattern matches in the full text AND in dispatches,
    // the actual should report "matched in extracted text" (first source checked)
    const evidence: SubAgentEvidence[] = [
      { agent: 'smithy-plan', pattern: 'found_everywhere' },
    ];
    const dispatch = makeDispatch({
      description: 'found_everywhere in desc',
      resultText: 'found_everywhere in result',
    });
    const results = verifySubAgents(
      'found_everywhere in text',
      [dispatch],
      evidence,
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.passed).toBe(true);
    expect(results[0]!.actual).toBe('matched in extracted text');
  });
});

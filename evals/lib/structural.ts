/**
 * Structural validation for eval output.
 *
 * Exports `validateStructure` (StructuralValidator contract) and
 * `verifySubAgents` (SubAgentVerifier contract) as pure functions.
 *
 * Contract definitions:
 *   specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md
 */

import type {
  StructuralExpectations,
  CheckResult,
  AgentDispatch,
  SubAgentEvidence,
} from './types.js';

/**
 * Validate a skill output string against structural expectations.
 *
 * Returns one CheckResult per individual check. Throws immediately if a
 * pattern string in `required_patterns` or `forbidden_patterns` is not a
 * valid regex (fail-fast).
 */
export function validateStructure(
  output: string,
  expectations: StructuralExpectations,
): CheckResult[] {
  const results: CheckResult[] = [];

  // (a) required_headings — per-line ATX matching
  const lines = output.split('\n').map((line) => line.trimEnd());
  for (const heading of expectations.required_headings) {
    const found = lines.some((line) => line === heading);
    results.push({
      check_name: `has '${heading}' heading`,
      passed: found,
      expected: heading,
      actual: found ? 'found' : 'not found',
    });
  }

  // (b) required_patterns — regex against full output
  if (expectations.required_patterns) {
    for (const patternStr of expectations.required_patterns) {
      const re = new RegExp(patternStr);
      const match = re.exec(output);
      results.push({
        check_name: `required pattern present: ${patternStr}`,
        passed: match !== null,
        expected: patternStr,
        actual: match !== null ? match[0] : 'not found',
      });
    }
  }

  // (c) forbidden_patterns — regex against full output (passes if NOT matched)
  if (expectations.forbidden_patterns) {
    for (const patternStr of expectations.forbidden_patterns) {
      const re = new RegExp(patternStr);
      const match = re.exec(output);
      const absent = match === null;
      const passed = absent && output.length > 0;
      results.push({
        check_name: `forbidden pattern absent: ${patternStr}`,
        passed,
        expected: patternStr,
        actual: absent ? 'not found' : match[0],
      });
    }
  }

  // (d) required_tables — pipe-delimited line with all specified columns
  if (expectations.required_tables) {
    for (const table of expectations.required_tables) {
      const cols = table.columns;
      const found = lines.some(
        (line) =>
          line.includes('|') &&
          cols.every((col) => line.includes(col)),
      );
      const colList = cols.join(', ');
      results.push({
        check_name: `has table with columns: ${colList}`,
        passed: found,
        expected: colList,
        actual: found ? 'found' : 'not found',
      });
    }
  }

  return results;
}

/**
 * Verify sub-agent evidence in skill output and dispatch records.
 *
 * For each SubAgentEvidence entry, compile its pattern as a RegExp and test
 * it against (a) the full extracted text, (b) each AgentDispatch description,
 * and (c) each AgentDispatch resultText. A check passes if the pattern
 * matches at least one source. Agent-name presence alone (without the
 * configured pattern matching) is NOT sufficient (FR-016).
 *
 * Returns an empty array when `evidence` is empty.
 */
export function verifySubAgents(
  text: string,
  dispatches: AgentDispatch[],
  evidence: SubAgentEvidence[],
): CheckResult[] {
  const results: CheckResult[] = [];

  for (const entry of evidence) {
    const re = new RegExp(entry.pattern);
    let passed = false;
    let actual = 'no match found';

    // (a) Check full extracted text
    if (re.test(text)) {
      passed = true;
      actual = 'matched in extracted text';
    }

    // (b) Check each dispatch description
    if (!passed) {
      for (const dispatch of dispatches) {
        if (re.test(dispatch.description)) {
          passed = true;
          actual = 'matched in dispatch description';
          break;
        }
      }
    }

    // (c) Check each dispatch resultText
    if (!passed) {
      for (const dispatch of dispatches) {
        if (re.test(dispatch.resultText)) {
          passed = true;
          actual = 'matched in dispatch result';
          break;
        }
      }
    }

    results.push({
      check_name: `${entry.agent} evidence present`,
      passed,
      expected: entry.pattern,
      actual,
    });
  }

  return results;
}

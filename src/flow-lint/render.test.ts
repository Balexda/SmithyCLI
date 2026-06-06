import { describe, expect, it } from 'vitest';

import { renderJson, renderResult } from './render.js';
import type { FlowLintResult } from './types.js';

function result(overrides: Partial<FlowLintResult> = {}): FlowLintResult {
  return {
    findings: [],
    errorCount: 0,
    warningCount: 0,
    ok: true,
    strict: false,
    flowsScanned: 2,
    screensScanned: 3,
    maestroScanned: 2,
    ...overrides,
  };
}

describe('renderResult', () => {
  it('renders a passing summary with the scan counts', () => {
    const out = renderResult(result(), { noColor: true });
    expect(out).toContain('flow-lint passed');
    expect(out).toContain('scanned 2 flows, 3 screens, 2 Maestro flows');
  });

  it('singularizes a one-of count', () => {
    const out = renderResult(result({ flowsScanned: 1, maestroScanned: 1 }), { noColor: true });
    expect(out).toContain('1 flow,');
    expect(out).toContain('1 Maestro flow');
  });

  it('lists findings with severity tag, code, and message', () => {
    const out = renderResult(
      result({
        ok: false,
        errorCount: 1,
        warningCount: 1,
        findings: [
          {
            severity: 'error',
            code: 'flow-screen-missing',
            path: 'design/flows/AddTitle.flow.md',
            ref: 'design/screens/AddTitle.design.md',
            message: 'design/flows/AddTitle.flow.md: severed → design/screens/AddTitle.design.md',
          },
          {
            severity: 'warning',
            code: 'screen-composable-missing',
            path: 'design/screens/Library.design.md',
            message: 'design/screens/Library.design.md: composable missing',
          },
        ],
      }),
      { noColor: true },
    );
    expect(out).toContain('✖ error [flow-screen-missing]');
    expect(out).toContain('▲ warning [screen-composable-missing]');
    expect(out).toContain('flow-lint failed');
    expect(out).toContain('1 error, 1 warning');
  });

  it('marks strict in the failure line', () => {
    const out = renderResult(
      result({ ok: false, warningCount: 1, strict: true }),
      { noColor: true },
    );
    expect(out).toContain('(--strict)');
  });

  it('notes non-fatal warnings on a pass', () => {
    const out = renderResult(result({ warningCount: 1 }), { noColor: true });
    expect(out).toContain('flow-lint passed');
    expect(out).toContain('1 warning');
  });
});

describe('renderJson', () => {
  it('serializes the full result shape', () => {
    const parsed = JSON.parse(renderJson(result({ warningCount: 1 })));
    expect(parsed).toMatchObject({
      ok: true,
      warningCount: 1,
      flowsScanned: 2,
      findings: [],
    });
  });
});

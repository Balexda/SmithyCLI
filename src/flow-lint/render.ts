/**
 * Human-facing rendering for `flow-lint` results. Pure string-building; the
 * command layer owns printing and exit codes. Colour is opt-out via the
 * `noColor` flag (and the ambient `NO_COLOR` env var, honoured by the caller).
 */

import pc from 'picocolors';

import type { FlowLintResult } from './types.js';

export interface RenderOptions {
  noColor?: boolean;
}

interface Painter {
  red: (s: string) => string;
  yellow: (s: string) => string;
  green: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
}

function painter(noColor: boolean): Painter {
  if (noColor) {
    const id = (s: string) => s;
    return { red: id, yellow: id, green: id, dim: id, bold: id };
  }
  return {
    red: (s) => pc.red(s),
    yellow: (s) => pc.yellow(s),
    green: (s) => pc.green(s),
    dim: (s) => pc.dim(s),
    bold: (s) => pc.bold(s),
  };
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Render a {@link FlowLintResult} as the default human-readable report. The
 * final line is always a one-line summary so CI logs surface the verdict even
 * when truncated.
 */
export function renderResult(result: FlowLintResult, opts: RenderOptions = {}): string {
  const noColor = opts.noColor ?? false;
  const c = painter(noColor);
  const lines: string[] = [];

  for (const f of result.findings) {
    const tag =
      f.severity === 'error' ? c.red('✖ error') : c.yellow('▲ warning');
    const code = c.dim(`[${f.code}]`);
    lines.push(`${tag} ${code} ${f.message}`);
  }

  if (result.findings.length > 0) lines.push('');

  const scanned = c.dim(
    `scanned ${pluralize(result.flowsScanned, 'flow')}, ` +
      `${pluralize(result.screensScanned, 'screen')}, ` +
      `${pluralize(result.maestroScanned, 'Maestro flow')}`,
  );

  if (result.ok && result.warningCount === 0) {
    lines.push(`${c.green('✓ flow-lint passed')} — ${scanned}`);
  } else if (result.ok) {
    // Warnings present but not fatal (non-strict).
    lines.push(
      `${c.green('✓ flow-lint passed')} with ${pluralize(result.warningCount, 'warning')} — ${scanned}`,
    );
  } else {
    const counts =
      `${pluralize(result.errorCount, 'error')}` +
      (result.warningCount > 0 ? `, ${pluralize(result.warningCount, 'warning')}` : '') +
      (result.strict ? ' (--strict)' : '');
    lines.push(`${c.red(c.bold('✖ flow-lint failed'))} — ${counts} — ${scanned}`);
  }

  return lines.join('\n');
}

/**
 * Serialize a result as the stable JSON contract for `--format json`. Mirrors
 * {@link FlowLintResult} verbatim so machine consumers depend on the typed
 * shape, not the text report.
 */
export function renderJson(result: FlowLintResult): string {
  return JSON.stringify(result, null, 2);
}

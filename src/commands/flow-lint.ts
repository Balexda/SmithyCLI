/**
 * `smithy flow-lint` subcommand — thin CLI wiring around the flow-lint engine.
 *
 * A deterministic, Smithy-state-free check that guarantees the UI flow/screen
 * graph in an app repo resolves. No agent calls, no manifest reads — fast
 * enough to run on every CI push, and runnable outside any forge invocation.
 *
 * Exit codes:
 *   0  the graph resolves (no errors; no warnings either under `--strict`).
 *   1  one or more dangling references / lint errors were found.
 *   2  a usage error (e.g. `--root` does not exist, bad `--format`).
 *
 * See `docs/flow-lint.md` for the CI wiring example and the
 * `smithy.helper-flow-definition` skill for the authoring contract enforced.
 */

import fs from 'node:fs';
import path from 'node:path';

import { lintFlows, renderJson, renderResult } from '../flow-lint/index.js';
import type { FlowLintOptions as LintOptions } from '../flow-lint/index.js';

export interface FlowLintOptions {
  root?: string;
  designDir?: string;
  maestroDir?: string;
  format?: string;
  strict?: boolean;
  color?: boolean;
}

const VALID_FORMATS = ['text', 'json'] as const;

export function flowLintAction(opts: FlowLintOptions = {}): void {
  const format = opts.format ?? 'text';
  if (!VALID_FORMATS.includes(format as (typeof VALID_FORMATS)[number])) {
    console.error(
      `smithy flow-lint: invalid --format value '${format}'. Valid values: ${VALID_FORMATS.join(', ')}`,
    );
    process.exitCode = 2;
    return;
  }

  const rawRoot = opts.root ?? process.cwd();
  const resolvedRoot = path.resolve(rawRoot);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedRoot);
  } catch (error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
    const message =
      code === 'ENOENT'
        ? `smithy flow-lint: --root path does not exist: ${rawRoot}`
        : code === 'EACCES' || code === 'EPERM'
          ? `smithy flow-lint: cannot access --root path: ${rawRoot}`
          : `smithy flow-lint: failed to inspect --root path: ${rawRoot}`;
    console.error(message);
    process.exitCode = 2;
    return;
  }
  if (!stat.isDirectory()) {
    console.error(`smithy flow-lint: --root path is not a directory: ${rawRoot}`);
    process.exitCode = 2;
    return;
  }

  const lintOpts: LintOptions = { root: resolvedRoot, strict: opts.strict ?? false };
  if (opts.designDir !== undefined) lintOpts.designDir = opts.designDir;
  if (opts.maestroDir !== undefined) lintOpts.maestroDir = opts.maestroDir;
  const result = lintFlows(lintOpts);

  if (format === 'json') {
    console.log(renderJson(result));
  } else {
    // `--no-color` (Commander sets `color: false`) and the ambient `NO_COLOR`
    // env var both suppress ANSI styling.
    const noColor = opts.color === false || process.env.NO_COLOR !== undefined;
    console.log(renderResult(result, { noColor }));
  }

  process.exitCode = result.ok ? 0 : 1;
}

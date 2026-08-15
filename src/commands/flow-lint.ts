import fs from 'node:fs';
import path from 'node:path';

import { lintFlowGraph, type FlowLintFinding } from '../flow-lint.js';

export interface FlowLintOptions {
  /** Directory or subpath to scan. Defaults to `process.cwd()`. */
  root?: string;
  /** Optional repo-relative root used for orphan test-body detection. */
  flowTestRoot?: string;
}

export function flowLintAction(inputPath?: string, opts: FlowLintOptions = {}): void {
  if (inputPath !== undefined && opts.root !== undefined) {
    process.stderr.write(
      'smithy flow-lint: pass either a path argument or --root, not both.\n',
    );
    process.exitCode = 2;
    return;
  }

  const rawRoot = inputPath ?? opts.root ?? process.cwd();
  const resolvedRoot = path.resolve(rawRoot);

  try {
    fs.statSync(resolvedRoot);
  } catch (error: unknown) {
    const errorCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : undefined;

    const message =
      errorCode === 'ENOENT'
        ? `smithy flow-lint: path does not exist: ${rawRoot}\n`
        : errorCode === 'EACCES' || errorCode === 'EPERM'
          ? `smithy flow-lint: cannot access path: ${rawRoot}\n`
          : `smithy flow-lint: failed to inspect path: ${rawRoot}\n`;

    process.stderr.write(message);
    process.exitCode = 2;
    return;
  }

  const lintOptions: { flowTestRoot?: string } = {};
  if (opts.flowTestRoot !== undefined) lintOptions.flowTestRoot = opts.flowTestRoot;

  let findings: FlowLintFinding[];
  try {
    ({ findings } = lintFlowGraph(resolvedRoot, lintOptions));
  } catch (error: unknown) {
    // A malformed artifact or an unreadable directory means the scan could not
    // run at all — that is a broken input tree, not a graph finding. Report it
    // as a command input error so exit 1 stays unambiguously "graph findings"
    // for CI and is never confused with "flow-lint could not read the repo".
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `smithy flow-lint: failed to scan UI artifacts under ${rawRoot}: ${detail}\n`,
    );
    process.exitCode = 2;
    return;
  }

  if (findings.length === 0) return;

  for (const finding of findings) {
    process.stderr.write(`${formatFlowLintFinding(finding)}\n`);
  }
  process.exitCode = 1;
}

export function formatFlowLintFinding(finding: FlowLintFinding): string {
  switch (finding.type) {
    case 'missing-screen':
      return `missing screen: flow ${finding.flowId} (${finding.flowPath}) references ScreenId ${finding.screenId}, but no matching screen annotation was found.`;
    case 'missing-test-body':
      return `missing test body: flow ${finding.flowId} (${finding.flowPath}) declares test-body ${finding.testBodyPath}, but the file does not exist.`;
    case 'orphan-test-body':
      return `orphan test body: ${finding.testBodyPath} exists under the flow-test root, but no flow definition declares it.`;
    case 'duplicate-test-body':
      return `duplicate test-body ${finding.testBodyPath}: ${finding.paths.join(', ')}`;
    case 'duplicate-screen-id':
      return `duplicate ScreenId ${finding.screenId}: ${finding.paths.join(', ')}`;
    case 'duplicate-flow-id':
      return `duplicate FlowId ${finding.flowId}: ${finding.paths.join(', ')}`;
  }
}

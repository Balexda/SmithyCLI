/**
 * Public surface of the `flow-lint` module. The command layer
 * (`src/commands/flow-lint.ts`) and tests import from here.
 */

export { lintFlows } from './linter.js';
export { parseFrontMatter, parseFlowDoc, parseScreenDoc } from './parser.js';
export { renderResult, renderJson } from './render.js';
export type { RenderOptions } from './render.js';
export type {
  Finding,
  FindingCode,
  FlowDoc,
  FlowLintOptions,
  FlowLintResult,
  ScreenDoc,
  Severity,
} from './types.js';

/**
 * Public entry point for the status scanner module.
 *
 * Downstream modules and tests should import from `src/status/` (resolved
 * to this file) rather than reaching into individual sub-modules, so the
 * type surface has a single stable import path.
 */

export * from './types.js';
export {
  extractSourceHeader,
  parseArtifact,
  parseDependencyTable,
  type ParsedDependencyTable,
} from './parser.js';
export { classifyRecord } from './classifier.js';
export { scan } from './scanner.js';
export { buildTree, BROKEN_LINKS_PATH, ORPHANED_SPECS_PATH } from './tree.js';
export { renderTree, type RenderTreeOptions } from './render.js';

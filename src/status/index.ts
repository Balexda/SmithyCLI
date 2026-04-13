/**
 * Public entry point for the status scanner module.
 *
 * Downstream modules and tests should import from `src/status/` (resolved
 * to this file) rather than reaching into individual sub-modules, so the
 * type surface has a single stable import path.
 */

export * from './types.js';
export {
  parseArtifact,
  parseDependencyTable,
  type ParsedDependencyTable,
} from './parser.js';

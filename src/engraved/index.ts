/**
 * Engraved-knowledge read path: the inventory behind `smithy status
 * --engraved`.
 *
 * Separate from `src/status/` because engraved records are graph roots with no
 * `## Dependency Order` lineage — see `types.ts` for why they get their own
 * scanner rather than a new `ArtifactType`.
 */
export {
  ENGRAVED_LEVELS,
  type EngravedDomain,
  type EngravedKind,
  type EngravedLevel,
  type EngravedLevelReport,
  type EngravedRecord,
  type EngravedScan,
  type LedgerRow,
  type LedgerSeverity,
  type LedgerSummary,
} from './types.js';

export {
  displayPath,
  isValidProjectSlug,
  listProjectSlugs,
  projectRoot,
  resolveEngravedRoots,
  resolveProject,
  userEngravedRoot,
  type EngravedDir,
  type EngravedLevelRoots,
} from './roots.js';

export { levelFromId, parseEngravedRecord, parseLedger } from './parser.js';

export { scanEngraved, type EngravedScanOptions } from './scanner.js';

export {
  hasStatusDrift,
  renderEngraved,
  serializeEngravedForJson,
  type EngravedJsonPayload,
  type EngravedJsonRecord,
} from './render.js';

/**
 * Types for the engraved-knowledge read path.
 *
 * Engraved records — decisions, invariants, and principles — are graph
 * *roots*: they carry no `M<N>` / `F<N>` / `US<N>` / `S<N>` id, never appear in
 * a `## Dependency Order` table, and so are invisible to the planning-artifact
 * scanner in `src/status/`. They get their own scanner rather than a new
 * artifact type there, because nothing about the planning lineage applies to
 * them and forcing them into `ArtifactRecord` would mean a record shape whose
 * lineage half is permanently empty.
 */

/**
 * How widely a record's commitment holds. The level is the store a record
 * lives in — it is never read from a frontmatter field, because a field could
 * disagree with the file's location and then neither would be authoritative.
 */
export type EngravedLevel = 'user' | 'repo' | 'project';

/** Ordered broadest → narrowest. Precedence runs the other way. */
export const ENGRAVED_LEVELS: readonly EngravedLevel[] = ['user', 'repo', 'project'];

export type EngravedKind = 'decision' | 'invariant' | 'principle';

/** Ownership / recall partition: engineering (`system`) vs. design. */
export type EngravedDomain = 'system' | 'design';

export type LedgerDisposition = 'accepted' | 'temporary' | 'placeholder';

export type LedgerSeverity = 'low' | 'medium' | 'high';

/** One row of an invariant's Known-Exceptions ledger. */
export interface LedgerRow {
  where: string;
  whatDiverges: string;
  disposition: LedgerDisposition;
  /** `#NNN` when a drift-tracking issue exists, else null. */
  trackingIssue: string | null;
  severity: LedgerSeverity | null;
}

/** Roll-up of an invariant's ledger, used to check its declared `status`. */
export interface LedgerSummary {
  rows: LedgerRow[];
  accepted: number;
  temporary: number;
  /** Highest severity across non-placeholder rows, or null when there are none. */
  maxSeverity: LedgerSeverity | null;
  /**
   * The alignment the ledger implies: `drifting` with at least one
   * `Temporary:` row, `aligned` otherwise. Compared against the record's
   * declared `status` to surface derivation drift.
   */
  derivedStatus: 'aligned' | 'drifting';
}

export interface EngravedRecord {
  id: string;
  kind: EngravedKind;
  level: EngravedLevel;
  domain: EngravedDomain;
  title: string;
  /** Declared lifecycle status, verbatim from frontmatter. */
  status: string;
  /** Path relative to the record's own level store root. */
  path: string;
  /** Absolute path on disk. */
  absPath: string;
  topics: string[];
  scope: string[];
  appliesTo: string[];
  excepts: string[];
  establishes: string[];
  establishedBy: string[];
  supersedes: string[];
  supersededBy: string[];
  /** Present for invariants only. */
  ledger: LedgerSummary | null;
  /**
   * Set when the `id` prefix names a level other than the store the record was
   * read from. The store wins — this flags the record for repair rather than
   * relocating it.
   */
  idLevelMismatch: boolean;
}

/** One level's contribution to a scan, present or not. */
export interface EngravedLevelReport {
  level: EngravedLevel;
  /** Absolute store root. */
  root: string;
  /** Display form — tilde-anchored for home stores, absolute otherwise. */
  displayRoot: string;
  /** Whether any of the level's record directories exist on disk. */
  present: boolean;
  recordCount: number;
  /** Project slug, for the `project` level only. */
  project?: string;
}

export interface EngravedScan {
  levels: EngravedLevelReport[];
  /** Resolved project slug, or null when no project level was in play. */
  project: string | null;
  /** Every record found, ordered by level then kind then id. */
  records: EngravedRecord[];
}

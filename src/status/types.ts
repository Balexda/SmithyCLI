/**
 * Status scanner type surface.
 *
 * Entities declared here mirror `smithy-status-skill.data-model.md`. They are
 * the in-memory record set produced by a single scan pass and consumed by the
 * renderer, the filter, and the JSON emitter. No persistence, no schema
 * evolution — the records exist only for the lifetime of one `smithy status`
 * invocation.
 *
 * This module intentionally contains only the entities needed by User Story 1
 * (Slice 1). Later stories (US2, US10) introduce `DependencyGraph`,
 * `DependencyNode`, `StatusTree`, and `TreeNode`.
 */

/**
 * The four artifact file types the scanner recognizes. Derived from the
 * filename suffix (`.rfc.md`, `.features.md`, `.spec.md`, `.tasks.md`).
 */
export type ArtifactType = 'rfc' | 'features' | 'spec' | 'tasks';

/**
 * Rolled-up lifecycle status for an artifact record. Computed freshly on
 * each scan. Under the final classifier (Slice 2+), `unknown` implies at
 * least one parse-failure warning on the record. During Slice 1 the
 * parser uses `unknown` as a placeholder on every record it returns
 * because classification has not yet been wired; the Slice 2 classifier
 * overwrites it.
 */
export type Status = 'done' | 'in-progress' | 'not-started' | 'unknown';

/**
 * One row of an artifact's `## Dependency Order` table, parsed
 * deterministically from its 4-column Markdown representation.
 */
export interface DependencyRow {
  /**
   * Canonical per-level ID (`M1`, `F2`, `US3`, `S4`). Matches
   * `^(M|F|US|S)[1-9][0-9]*$`. No leading zeros. Unique within the
   * containing `DependencyOrderTable`.
   */
  id: string;
  /** Human-readable title taken verbatim from the table's Title column. */
  title: string;
  /**
   * List of IDs this row depends on. Empty array when the cell is `—`.
   * Dangling references are dropped during parse and recorded as warnings
   * on the owning `ArtifactRecord`.
   */
  depends_on: string[];
  /**
   * Repo-relative path to the downstream artifact (file or folder), or
   * `null` when the cell is `—`. Null signals "not yet created" — the
   * scanner emits a virtual not-started record for the expected path.
   */
  artifact_path: string | null;
}

/**
 * The full parsed `## Dependency Order` section for a single artifact.
 *
 * `format` distinguishes the new 4-column table from the legacy checkbox
 * layout and from an entirely missing section. Consumers key absence off
 * the `format` field rather than a null check, so every code path sees a
 * concrete `DependencyOrderTable` value.
 */
export interface DependencyOrderTable {
  /** Rows in the order they appear in the source Markdown. */
  rows: DependencyRow[];
  /**
   * Canonical prefix used by rows in this table. Derived from the
   * artifact's type (rfc→M, features→F, spec→US, tasks→S). A mismatch
   * between `id_prefix` and any row's actual prefix produces a warning.
   */
  id_prefix: 'M' | 'F' | 'US' | 'S';
  /**
   * `table` for the new 4-column format, `legacy` for checkbox-based
   * ordering, `missing` when no `## Dependency Order` section exists.
   * `legacy` triggers a `format_legacy` warning and `unknown` status on
   * the owning `ArtifactRecord`.
   */
  format: 'table' | 'legacy' | 'missing';
}

/**
 * The suggested smithy command to run next for a non-done artifact.
 * Populated by the deterministic rule table in the scanner.
 */
export interface NextAction {
  /** The smithy command the user should run. */
  command:
    | 'smithy.mark'
    | 'smithy.cut'
    | 'smithy.forge'
    | 'smithy.render'
    | 'smithy.ignite'
    | 'smithy.strike';
  /** Positional arguments to pass (may be empty). */
  arguments: string[];
  /** One-line human-readable rationale. */
  reason: string;
  /**
   * True when an ancestor artifact is itself not-started, meaning this
   * suggestion was dropped from the rendered output in favor of the
   * ancestor's suggestion. Retained in the record set for JSON consumers.
   */
  suppressed_by_ancestor?: boolean;
}

/**
 * One entry per discovered artifact file, carrying everything needed to
 * render it in the tree and to reason about its status and next action.
 *
 * `parent_path` distinguishes `null` (no parent — top-level RFCs and
 * orphans) from an omitted field (unknown) per the data-model JSON
 * guidance. `dependency_order` is always present; absence is signalled by
 * `format: 'missing'` with `rows: []`, not by a null field.
 */
export interface ArtifactRecord {
  /** Derived from filename suffix. */
  type: ArtifactType;
  /** Repo-relative path to the source file. */
  path: string;
  /**
   * Extracted from the artifact's first H1, handling the canonical
   * `# Feature Specification: <Title>` prefix. Falls back to the
   * filename stem when no H1 exists. (Frontmatter-based title
   * extraction is deliberately not implemented — Smithy planning
   * artifacts use an H1 by convention.)
   */
  title: string;
  /** Rolled-up status per the data-model validation rules. */
  status: Status;
  /**
   * Count of completed children. Omitted for records where counting is
   * not meaningful.
   */
  completed?: number;
  /** Total count of children. Omitted alongside `completed`. */
  total?: number;
  /**
   * Repo-relative path to the parent artifact. `null` means "no parent"
   * (top-level RFCs, orphans); an omitted field means "unknown".
   */
  parent_path?: string | null;
  /**
   * True when `parent_path` was declared by the artifact but the
   * referenced file does not exist. Drives "Broken Links" grouping.
   */
  parent_missing?: boolean;
  /**
   * True for not-started records inferred from a parent's parsed
   * `## Dependency Order` table but not yet present on disk. `virtual`
   * records always have `status: 'not-started'` and their `path` is the
   * expected path, not an existing file.
   */
  virtual?: boolean;
  /**
   * Populated by the suggestion rules; `null` for `done` records.
   * Omitted entirely when not yet computed.
   */
  next_action?: NextAction | null;
  /**
   * Parsed `## Dependency Order` section. Always present — consumers key
   * absence off `format: 'missing'`.
   */
  dependency_order: DependencyOrderTable;
  /**
   * Non-fatal parse issues encountered while reading the file. Empty
   * array when clean.
   */
  warnings: string[];
}

/**
 * Aggregate counts used by the summary header and the JSON output's
 * top-level `summary` field.
 */
export interface ScanSummary {
  /** E.g., `counts.spec['in-progress'] === 3`. */
  counts: Record<ArtifactType, Record<Status, number>>;
  /** Records with no parent (excluding top-level RFCs). */
  orphan_count: number;
  /** Records with `parent_missing === true`. */
  broken_link_count: number;
  /** Records with `status === 'unknown'`. */
  parse_error_count: number;
}

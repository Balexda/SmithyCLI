/**
 * Pure record-level filter applied between {@link scan} and
 * {@link buildTree}. Given the flat {@link ArtifactRecord} array the
 * scanner produces, `filterRecords` retains only those records that
 * satisfy the user-supplied `--status` and `--type` predicates, plus
 * every ancestor reachable from a retained record via `parent_path`.
 * Ancestor retention is what lets the renderer honor US6 AS 6.1 ("only
 * in-progress artifacts and their ancestors appear") and AS 6.3 ("only
 * spec-level artifacts appear — ancestors shown as headers, descendants
 * hidden") without any changes to the renderer itself.
 *
 * This module is side-effect-free: no filesystem I/O, no network, no
 * mutation of its input array or any of the records inside it. Passing
 * the same input twice yields the same output. The function is
 * composed upstream of `buildTree` so downstream modules — the tree
 * projector, renderer, and JSON emitter — see a smaller record set but
 * are otherwise unchanged.
 *
 * ## Semantics
 *
 * - **Identity.** When no filter predicates are supplied (`status` and
 *   `type` both absent), the returned array is equal to the input
 *   array — same records, same order, no copies stripped or
 *   rearranged.
 *
 * - **`--status` projection.** When `opts.status` is set, a record is
 *   retained iff its `status` matches (the "match set") OR it appears
 *   on the `parent_path` chain of some record in the match set. Walks
 *   use only records present in the input array — a `parent_path` that
 *   does not resolve to an input record terminates the walk quietly
 *   (consistent with `buildTree`'s "Broken Links" handling).
 *
 * - **`--type` projection.** Identical to `--status` but keyed off
 *   `record.type`. Ancestor retention still applies so the renderer can
 *   surface them as AS 6.3 headers.
 *
 * - **Intersection.** When both predicates are set, a record must
 *   satisfy both (or be the ancestor of a record that satisfies both)
 *   to survive. Specifically, the match set is the set of records
 *   where status AND type match, and ancestors of that set are
 *   included.
 *
 * - **Virtual records.** Records with `virtual === true` (always
 *   `status: 'not-started'`) are filtered on the same rules as real
 *   records of the same `type` and `status`. No special-casing — a
 *   virtual record participates in ancestor walks identically, and a
 *   virtual record that matches the status/type predicates is retained
 *   just like a real one.
 *
 * - **Root.** `opts.root` is accepted for signature symmetry with the
 *   CLI options surface but has no effect inside the filter. The scan
 *   root is already honored by `statusAction` via `scan(resolvedRoot)`
 *   upstream; narrowing again here would be a no-op that confuses
 *   future readers.
 *
 * - **Order & dedup.** Output preserves input order. When a record is
 *   both a predicate match and an ancestor of another match, it
 *   appears exactly once.
 */

import type { ArtifactRecord, ArtifactType, Status } from './types.js';

/**
 * Options accepted by {@link filterRecords}. Mirrors the three filter
 * flags exposed by `smithy status` (`--status`, `--type`, `--root`).
 * All fields are optional; an empty object yields identity behavior.
 */
export interface FilterRecordsOptions {
  /** Keep records with this status plus their ancestors. */
  status?: Status;
  /** Keep records with this artifact type plus their ancestors. */
  type?: ArtifactType;
  /**
   * Accepted for signature symmetry with the CLI options surface. The
   * scan root is honored upstream by `scan(resolvedRoot)`; this field
   * is a no-op inside the filter.
   */
  root?: string;
}

/**
 * Apply the status / type predicates (with ancestor retention) to a
 * flat record array. See the module-level JSDoc for the full
 * semantics.
 *
 * Pure function: no I/O, no input mutation, stable output for stable
 * input.
 */
export function filterRecords(
  records: ArtifactRecord[],
  opts: FilterRecordsOptions = {},
): ArtifactRecord[] {
  // Identity fast-path: no predicates means the filter is a no-op. We
  // return the input array unchanged (not a shallow copy) because the
  // module-level contract promises `array equals input array` in this
  // case, and downstream consumers already treat the result as
  // read-only.
  if (opts.status === undefined && opts.type === undefined) {
    return records;
  }

  // Index records by path so ancestor walks can jump from a child's
  // `parent_path` to the parent record in O(1). When two records
  // share a path (the scanner flags this as a collision warning), the
  // first wins — matching `buildTree`'s behavior.
  const recordsByPath = new Map<string, ArtifactRecord>();
  for (const record of records) {
    if (!recordsByPath.has(record.path)) {
      recordsByPath.set(record.path, record);
    }
  }

  const retained = new Set<ArtifactRecord>();

  for (const record of records) {
    const statusMatches =
      opts.status === undefined || record.status === opts.status;
    const typeMatches = opts.type === undefined || record.type === opts.type;
    if (!statusMatches || !typeMatches) continue;

    // Direct match: retain the record and walk up its `parent_path`
    // chain, adding every ancestor that lives in the input set. The
    // walk terminates on a null/undefined `parent_path`, on a path
    // that does not resolve to an input record, or on a cycle (a
    // record we have already seen during this walk — defensive, since
    // scanner output should be acyclic).
    let cursor: ArtifactRecord | undefined = record;
    const walkSeen = new Set<ArtifactRecord>();
    while (cursor !== undefined && !walkSeen.has(cursor)) {
      walkSeen.add(cursor);
      retained.add(cursor);
      const parentPath = cursor.parent_path;
      if (parentPath === null || parentPath === undefined) break;
      cursor = recordsByPath.get(parentPath);
    }
  }

  // Preserve input order and dedupe by only emitting each record
  // once — the `retained` set handles the dedup, and a single pass
  // over `records` preserves the order.
  const result: ArtifactRecord[] = [];
  for (const record of records) {
    if (retained.has(record)) {
      result.push(record);
    }
  }
  return result;
}

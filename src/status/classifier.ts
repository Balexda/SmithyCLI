/**
 * Pure status classifier for Smithy artifact records.
 *
 * This module contains a single pure function, `classifyRecord`, that
 * derives a final {@link Status} from an already-parsed {@link ArtifactRecord}
 * and its already-classified children. It performs no filesystem I/O,
 * no network calls, and no parsing — every input required to make a
 * decision must be supplied by the caller. The scanner (Slice 2)
 * orchestrates discovery and child resolution on top of this function,
 * calling it leaf-to-root so each invocation sees finalized child
 * statuses.
 *
 * The classification rules mirror the validation rules in
 * `smithy-status-skill.data-model.md`.
 */

import type { ArtifactRecord, Status } from './types.js';

/**
 * Derive the finalized {@link Status} for a single {@link ArtifactRecord}.
 *
 * Rules:
 *
 * 1. A record with `virtual === true` always resolves to `'not-started'`
 *    regardless of type, children, or dependency_order.
 * 2. A `tasks` record derives its status from `completed` / `total`,
 *    where both numbers count slices (a slice is "done" only when its
 *    `## Slice N:` section contains at least one checkbox and every
 *    checkbox in that section is ticked):
 *    - `completed === total && total > 0` → `'done'`
 *    - `0 < completed < total` → `'in-progress'`
 *    - otherwise (`total === 0` or `completed === 0`) → `'not-started'`
 *    For tasks records, `resolvedChildren` is ignored.
 * 3. A parent record (`spec`, `features`, `rfc`) rolls up from its
 *    `resolvedChildren`:
 *    - If `dependency_order.format` is `'legacy'` or `'missing'`, the
 *      record resolves to `'unknown'`. Children are ignored in this
 *      case — a parse-failure on the parent's own dependency order
 *      blocks rollup entirely.
 *    - Otherwise, with `format === 'table'`:
 *      - Zero resolved children → `'not-started'`.
 *      - Every child `'done'` → `'done'`.
 *      - Every child `'not-started'` → `'not-started'`.
 *      - Any other combination (any `'in-progress'`, any mix of `'done'`
 *        and non-`'done'`, any `'unknown'`) → `'in-progress'`.
 *
 * This function is pure: same inputs always produce the same output.
 *
 * @param record           The record whose status should be derived.
 * @param resolvedChildren Children whose `status` has already been
 *                         finalized, in the same order as the parent's
 *                         `dependency_order.rows`. For `tasks` records
 *                         this argument is ignored and may be an empty
 *                         array.
 */
export function classifyRecord(
  record: ArtifactRecord,
  resolvedChildren: ArtifactRecord[],
): Status {
  // Rule 1: virtual records are always not-started.
  if (record.virtual === true) {
    return 'not-started';
  }

  // Rule 2: tasks records derive status from checkbox counts alone.
  if (record.type === 'tasks') {
    const completed = record.completed ?? 0;
    const total = record.total ?? 0;
    if (total > 0 && completed === total) return 'done';
    if (completed > 0 && completed < total) return 'in-progress';
    return 'not-started';
  }

  // Rule 3: parent records (spec / features / rfc).
  const format = record.dependency_order.format;
  if (format === 'legacy' || format === 'missing') {
    return 'unknown';
  }

  // format === 'table' from here on.
  if (resolvedChildren.length === 0) {
    return 'not-started';
  }

  let allDone = true;
  let allNotStarted = true;
  for (const child of resolvedChildren) {
    if (child.status !== 'done') allDone = false;
    if (child.status !== 'not-started') allNotStarted = false;
  }

  if (allDone) return 'done';
  if (allNotStarted) return 'not-started';
  return 'in-progress';
}

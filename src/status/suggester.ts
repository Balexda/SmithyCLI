/**
 * Pure next-action suggester for Smithy artifact records.
 *
 * This module contains a single pure function, `suggestNextAction`, that
 * derives a {@link NextAction} (or `null`) from an already-classified
 * {@link ArtifactRecord}, its already-classified resolved children, and
 * a boolean flag indicating whether any ancestor in the record's parent
 * chain is itself `not-started`. It performs no filesystem I/O, no
 * network calls, and no mutation of its inputs.
 *
 * The rule table mirrors FR-010 in `smithy-status-skill.spec.md` and
 * Acceptance Scenarios 4.1–4.5:
 *
 * - `rfc` → `smithy.render <rfc-path>`
 * - `features` → `smithy.mark <features-path> <first-not-started-F<N>-digits>`
 * - `spec` → `smithy.cut <dirname(spec-path)> <first-not-started-US<N>-digits>`
 * - `tasks` → `smithy.forge <tasks-path>`
 *
 * `done` records always return `null`. `unknown`-status records (parse
 * failures that made it through classification) also return `null` — the
 * data model treats `unknown` as not actionable. Read-error records
 * skipped by the scanner entirely leave `next_action` omitted and never
 * reach this function.
 *
 * When `ancestorNotStarted` is `true`, the returned `NextAction`
 * carries `suppressed_by_ancestor: true` so FR-011 suppression is visible
 * to JSON consumers. When the flag is `false`, the field is omitted
 * entirely (not set to `false`) so the JSON payload remains sparse.
 *
 * The scanner (Slice 1 Task 2) orchestrates ancestor walks and calls
 * this function once per record after all statuses are finalized.
 */

import path from 'node:path';

import type { ArtifactRecord, NextAction } from './types.js';

/**
 * Extract the numeric suffix from a canonical dep-order row id
 * (`M1`, `F2`, `US3`, `S4`). Returns the digit tail as a string or
 * `undefined` if no trailing digits are present.
 */
function numericIdSuffix(id: string): string | undefined {
  return id.match(/[0-9]+$/)?.[0];
}

/**
 * Find the first resolved child whose `status` is `'not-started'` and
 * return its corresponding row's numeric id suffix. Returns `undefined`
 * if no row matches or if the matching row has no trailing digits.
 *
 * Rows and children are paired by index — the scanner (and the
 * classifier's consumers) already guarantees `resolvedChildren` is in
 * the same order as `record.dependency_order.rows`.
 */
function firstNotStartedRowDigits(
  record: ArtifactRecord,
  resolvedChildren: ArtifactRecord[],
): string | undefined {
  const rows = record.dependency_order.rows;
  const limit = Math.min(rows.length, resolvedChildren.length);
  for (let i = 0; i < limit; i++) {
    if (resolvedChildren[i]!.status === 'not-started') {
      const digits = numericIdSuffix(rows[i]!.id);
      if (digits !== undefined) return digits;
    }
  }
  return undefined;
}

/**
 * Derive a {@link NextAction} (or `null`) for a single classified
 * {@link ArtifactRecord}.
 *
 * Rules:
 *
 * 1. A `done` record returns `null` regardless of type.
 * 2. An `unknown`-status record returns `null` regardless of type — the
 *    data model treats `unknown` as not actionable.
 * 3. Otherwise the record is `not-started` or `in-progress` and the
 *    deterministic rule table from FR-010 applies:
 *    - `rfc` → `smithy.render [record.path]`
 *    - `features` → `smithy.mark [record.path, <first-not-started-row-digits>]`
 *      (fallback `[record.path]` when no row matches)
 *    - `spec` → `smithy.cut [dirname(record.path), <first-not-started-row-digits>]`
 *      (fallback `[dirname(record.path)]` when no row matches)
 *    - `tasks` → `smithy.forge [record.path]`
 * 4. When `ancestorNotStarted` is `true`, the returned `NextAction`
 *    includes `suppressed_by_ancestor: true`. Otherwise the field is
 *    omitted entirely (never serialized as `false`).
 *
 * This function is pure: same inputs always produce the same output and
 * neither the record nor the children array is mutated.
 *
 * @param record             The already-classified record to evaluate.
 * @param resolvedChildren   Children whose `status` is already
 *                           finalized, in the same order as
 *                           `record.dependency_order.rows`. Ignored
 *                           for `rfc` and `tasks` records.
 * @param ancestorNotStarted True when any ancestor in the record's
 *                           parent chain has `status: 'not-started'`.
 *                           Drives `suppressed_by_ancestor`.
 */
export function suggestNextAction(
  record: ArtifactRecord,
  resolvedChildren: ArtifactRecord[],
  ancestorNotStarted: boolean,
): NextAction | null {
  // Rules 1 & 2: done and unknown records are never actionable.
  if (record.status === 'done' || record.status === 'unknown') {
    return null;
  }

  // Rule 3: derive the command + arguments from the record's type.
  let command: NextAction['command'];
  let args: string[];
  let reason: string;

  switch (record.type) {
    case 'rfc': {
      command = 'smithy.render';
      args = [record.path];
      reason = `RFC ${record.title} is ${record.status}; run smithy.render to continue drafting it.`;
      break;
    }
    case 'features': {
      command = 'smithy.mark';
      const digits = firstNotStartedRowDigits(record, resolvedChildren);
      if (digits !== undefined) {
        args = [record.path, digits];
        reason = `Features map ${record.title} has a not-started feature F${digits}; run smithy.mark to produce its spec.`;
      } else {
        args = [record.path];
        reason = `Features map ${record.title} is ${record.status}; run smithy.mark to produce its next spec.`;
      }
      break;
    }
    case 'spec': {
      command = 'smithy.cut';
      const folder = path.dirname(record.path);
      const digits = firstNotStartedRowDigits(record, resolvedChildren);
      if (digits !== undefined) {
        args = [folder, digits];
        reason = `Spec ${record.title} has a not-started user story US${digits}; run smithy.cut to decompose it into tasks.`;
      } else {
        args = [folder];
        reason = `Spec ${record.title} is ${record.status}; run smithy.cut to decompose its stories into tasks.`;
      }
      break;
    }
    case 'tasks': {
      command = 'smithy.forge';
      args = [record.path];
      reason = `Tasks file ${record.title} is ${record.status}; run smithy.forge to implement its next slice.`;
      break;
    }
  }

  const action: NextAction = {
    command,
    arguments: args,
    reason,
  };

  // Rule 4: only emit suppressed_by_ancestor when true, so the JSON
  // payload stays sparse (the field is optional in the NextAction type).
  if (ancestorNotStarted) {
    action.suppressed_by_ancestor = true;
  }

  return action;
}

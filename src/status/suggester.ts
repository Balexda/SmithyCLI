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
 * Acceptance Scenarios 4.1–4.5, extended so every hint represents a
 * command whose on-disk prerequisites are satisfied:
 *
 * - `rfc` → `smithy.render <rfc-path>`
 * - `features` → `smithy.mark <features-path> <first-virtual-F<N>-digits>`
 *   (only when at least one feature row has no spec file on disk; null
 *   otherwise so per-spec hints below the features map drive the work)
 * - `spec` → `smithy.cut <dirname(spec-path)> <first-virtual-US<N>-digits>`
 *   (only when at least one user-story row has no tasks file on disk;
 *   null otherwise so per-task hints below the spec drive the work)
 * - `tasks` → `smithy.forge <tasks-path>` for real tasks files, or
 *   `smithy.cut <spec-folder> <US<N>-digits>` for virtual tasks
 *   records (where the tasks file does not yet exist)
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
 * Resolve the `smithy.cut` target (folder + story digits) for a
 * virtual tasks record. Virtual tasks records carry the parent spec's
 * path in `parent_path` and the canonical `US<N>` row id in
 * `parent_row_id`; both are populated by the scanner whenever it emits
 * a virtual.
 *
 * Returns `null` when `parent_path` is missing or empty — in that
 * case the scanner left us without a spec folder to target, so the
 * caller falls back to the legacy `smithy.forge` shape rather than
 * producing a `smithy.cut` with no arguments. When `parent_path` is
 * present but `parent_row_id` is missing or has no numeric suffix,
 * returns `{ folder, digits: undefined }` so the caller emits a
 * folder-only `smithy.cut <folder>` hint — the same no-digits
 * fallback the spec case uses for zero-row pathological specs. The
 * spec folder is derived via `path.dirname` of the parent spec file —
 * exactly the same transform the real spec case applies at
 * `specFolderFromPath`.
 */
function cutTargetFromVirtualTasks(
  record: ArtifactRecord,
): { folder: string; digits: string | undefined } | null {
  const parentPath = record.parent_path;
  if (typeof parentPath !== 'string' || parentPath.length === 0) {
    return null;
  }
  const folder = specFolderFromPath(parentPath);
  const digits = record.parent_row_id !== undefined
    ? numericIdSuffix(record.parent_row_id)
    : undefined;
  return { folder, digits };
}

/**
 * Derive the `smithy.cut` target folder for a spec record.
 *
 * Real spec records have `record.path` pointing at a `.spec.md` file,
 * so the target folder is `dirname(path)`. Virtual spec records (emitted
 * by the scanner when a features row points at a spec folder with no
 * discovered `.spec.md`) have `record.path` already equal to the folder
 * itself — including a trailing slash. In that case `dirname()` would
 * collapse `specs/webhooks/` to `specs`, breaking the suggestion. Treat
 * trailing-slash paths as the folder itself (stripping trailing slashes)
 * and only use `dirname()` on real file paths.
 */
function specFolderFromPath(specPath: string): string {
  if (specPath.endsWith('/')) {
    return specPath.replace(/\/+$/, '');
  }
  return path.dirname(specPath);
}

/**
 * Find the first resolved child that is both `virtual` (the child
 * artifact file does not yet exist on disk) and `not-started`, and
 * return its corresponding row's numeric id suffix. Returns `undefined`
 * if no row matches or if the matching row has no trailing digits.
 *
 * This is the "cuttable / markable" predicate — the suggester uses it
 * to decide whether a features/spec parent should emit a
 * `smithy.mark`/`smithy.cut` hint. Real (non-virtual) not-started
 * children are deliberately skipped: their artifact file already
 * exists, so the parent does not need to be told to create it again;
 * the child itself will emit its own `smithy.forge` hint.
 *
 * Rows and children are paired by index — the scanner (and the
 * classifier's consumers) already guarantees `resolvedChildren` is in
 * the same order as `record.dependency_order.rows`.
 */
function firstVirtualNotStartedRowDigits(
  record: ArtifactRecord,
  resolvedChildren: ArtifactRecord[],
): string | undefined {
  const rows = record.dependency_order.rows;
  const limit = Math.min(rows.length, resolvedChildren.length);
  for (let i = 0; i < limit; i++) {
    const child = resolvedChildren[i]!;
    if (child.virtual === true && child.status === 'not-started') {
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
 *    deterministic rule table from FR-010 applies, with a
 *    prerequisite check so every suggested command is runnable:
 *    - `rfc` → `smithy.render [record.path]`
 *    - `features` → `smithy.mark [record.path, <first-virtual-row-digits>]`
 *      when a feature has no spec file yet; `smithy.mark [record.path]`
 *      only when the record has zero rows but is itself `not-started`;
 *      `null` otherwise (every declared spec already exists, so the
 *      per-spec hints cover the remaining work).
 *    - `spec` → `smithy.cut [dirname(record.path), <first-virtual-row-digits>]`
 *      when a user story has no tasks file yet; `smithy.cut [dirname(record.path)]`
 *      only when the record has zero rows but is itself `not-started`;
 *      `null` otherwise (every declared tasks file already exists, so
 *      the per-task hints cover the remaining work).
 *    - `tasks` → `smithy.forge [record.path]` for a real tasks record;
 *      `smithy.cut [dirname(parent_path), <parent_row_id-digits>]` for
 *      a virtual tasks record whose file does not yet exist (falling
 *      back to the `smithy.forge` shape when the scanner did not
 *      populate `parent_path`).
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
 *                           for `rfc` records; also ignored for `tasks`
 *                           records (their virtual/real state lives on
 *                           the record itself).
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
      const digits = firstVirtualNotStartedRowDigits(record, resolvedChildren);
      if (digits !== undefined) {
        args = [record.path, digits];
        reason = `Features map ${record.title} has a feature F${digits} with no spec file yet; run smithy.mark to produce it.`;
      } else if (
        record.status === 'not-started' &&
        record.dependency_order.rows.length === 0
      ) {
        // Pathological actionable features record with zero rows —
        // surface the no-digits fallback so the user can still drive
        // the command manually.
        args = [record.path];
        reason = `Features map ${record.title} is ${record.status}; run smithy.mark to produce its next spec.`;
      } else {
        // Every declared feature already has a spec file on disk.
        // Nothing left to mark at this level — per-spec hints below
        // this record cover the remaining work.
        return null;
      }
      break;
    }
    case 'spec': {
      command = 'smithy.cut';
      const folder = specFolderFromPath(record.path);
      const digits = firstVirtualNotStartedRowDigits(record, resolvedChildren);
      if (digits !== undefined) {
        args = [folder, digits];
        reason = `Spec ${record.title} has a user story US${digits} with no tasks file yet; run smithy.cut to decompose it into tasks.`;
      } else if (
        record.status === 'not-started' &&
        record.dependency_order.rows.length === 0
      ) {
        // Pathological actionable spec with zero rows — surface the
        // no-digits fallback so the user can still drive the command
        // manually.
        args = [folder];
        reason = `Spec ${record.title} is ${record.status}; run smithy.cut to decompose its stories into tasks.`;
      } else {
        // Every declared user story already has a tasks file on disk.
        // The spec-level cut hint would be a no-op here; per-task
        // hints below this record drive the remaining work.
        return null;
      }
      break;
    }
    case 'tasks': {
      // Virtual tasks records point at a path that does not yet exist
      // on disk, so `smithy.forge` would fail. Redirect to the
      // `smithy.cut` invocation that would create the file in the
      // first place. Real tasks records keep the existing `forge`
      // hint.
      if (record.virtual === true) {
        const cutTarget = cutTargetFromVirtualTasks(record);
        if (cutTarget !== null) {
          command = 'smithy.cut';
          args = cutTarget.digits !== undefined
            ? [cutTarget.folder, cutTarget.digits]
            : [cutTarget.folder];
          reason = cutTarget.digits !== undefined
            ? `Tasks file ${record.title} does not exist yet; run smithy.cut to create it from user story US${cutTarget.digits}.`
            : `Tasks file ${record.title} does not exist yet; run smithy.cut to create it.`;
          break;
        }
        // Defensive fallback: scanner didn't populate parent fields.
        // Keep the legacy forge shape rather than crashing so the
        // suggester stays total.
      }
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

/**
 * Format a {@link NextAction} as a one-line, copy-pasteable hint string
 * of the form `<arrow> <command> <arg1> <arg2>...`.
 *
 * When `arguments` is empty the result collapses to `<arrow> <command>`
 * with no trailing whitespace. The returned string never contains
 * embedded newlines — it is exactly one line.
 *
 * The arrow defaults to the Unicode rightwards arrow `→` (U+2192)
 * followed by a single ASCII space, matching the original hint style.
 * Callers that need an ASCII fallback (non-UTF-8 terminal) pass the
 * ASCII variant (`-> `) from the theme bundle so no trailing whitespace
 * handling differs between the two bundles.
 *
 * This function is pure and performs no I/O. It is intentionally
 * colocated with {@link suggestNextAction} so downstream callers that
 * need to both derive and render a next action can import from a single
 * module, and so the `render.ts` tree renderer (US2) can reuse the
 * same formatter to attach hints beneath tree nodes (SD-016).
 *
 * @param action The next action to format.
 * @param arrow Optional arrow prefix (including its trailing space).
 * Defaults to `'→ '`.
 * @returns A single-line hint string.
 */
export function formatNextAction(
  action: NextAction,
  arrow: string = '\u2192 ',
): string {
  const args = action.arguments;
  if (args.length === 0) {
    return `${arrow}${action.command}`;
  }
  return `${arrow}${action.command} ${args.join(' ')}`;
}

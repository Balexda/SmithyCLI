/**
 * Implementation-repo defaulting for scanned artifact records.
 *
 * A tasks file states which repository its slices are implemented in via
 * the `**Implementation repo**:` header (and per-slice `**Repo**:`
 * overrides). The parser reads those declarations, but it cannot supply
 * the final fallback in the precedence chain:
 *
 *   slice `**Repo**:`  →  file `**Implementation repo**:`  →  the repo
 *   the command was invoked in
 *
 * Only the CLI layer knows that last one, and the distinction matters in
 * external artifacts mode: the artifact store
 * (`~/.smithy/repos/<repoKey>/`) and the implementation checkout are
 * deliberately different roots, so the directory being scanned is NOT
 * the repo the work lands in. `smithy status` therefore resolves the
 * default from the working directory, not from the scan root.
 *
 * A missing declaration is not an error. Every tasks file authored
 * before the field existed means "the repo you are standing in", which
 * is exactly what this module fills in.
 */

import type { ArtifactRecord } from './types.js';

/**
 * Fill in `repo` on every `tasks` record — and on each of its slices —
 * that did not get one from its own declarations.
 *
 * Declared values always win: a record with `repo_declared === true`
 * keeps its repo, and any slice carrying an override or an inherited
 * header value keeps its own. `repo_declared` is never set here, so a
 * consumer can always tell a declaration from this default.
 *
 * Slices left without a repo by the parser are skipped rather than
 * defaulted: the parser only omits a slice's repo when the slice's own
 * declaration was malformed (and it recorded an `implementation_repo:`
 * warning that already forces the record to `unknown`). Papering over
 * that with the invoking repo would hide the very failure the warning
 * exists to surface.
 *
 * Mutates records in place, matching `applyExternalPrefix` in
 * `src/commands/status.ts` — records are rebuilt by `scan` on every
 * invocation, so nothing outside the current run observes the
 * pre-default shape.
 *
 * @param records  The scanned record set.
 * @param repoName Identity of the repo the command was invoked in
 *                 (`repoKey` from `src/manifest.ts`). An empty name is
 *                 ignored so a failed lookup never writes a blank repo.
 */
export function applyDefaultRepo(
  records: ArtifactRecord[],
  repoName: string,
): void {
  if (repoName === '') return;
  for (const record of records) {
    if (record.type !== 'tasks') continue;
    const hasMalformedDeclaration = record.warnings.some((w) =>
      w.startsWith('implementation_repo:'),
    );
    if (record.repo === undefined && !hasMalformedDeclaration) {
      record.repo = repoName;
    }
    if (record.slices === undefined) continue;
    for (const slice of record.slices) {
      if (slice.repo !== undefined) continue;
      if (hasMalformedDeclaration) continue;
      slice.repo = repoName;
    }
  }
}

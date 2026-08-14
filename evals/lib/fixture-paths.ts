/**
 * Shared repository-relative path validation for eval local fixtures.
 *
 * Two call sites must apply the same containment rules to `local_fixtures`
 * paths: the YAML scenario loader validates declarations against the source
 * checkout, and the runner resolves those declarations inside the temp fixture
 * copy. Keeping the logic here prevents the two from drifting — an earlier copy
 * in the runner rejected Windows drive-letter paths that the loader's local
 * copy accepted.
 */
import path from 'node:path';

export type LocalFixtureField = 'issue' | 'ci_log';

/** Repository-relative directory each local fixture kind must stay within. */
export const LOCAL_FIXTURE_AREAS: Record<LocalFixtureField, string> = {
  issue: 'evals/fixture/issues',
  ci_log: 'evals/fixture/ci-logs',
};

/**
 * Normalize a declared fixture path to a clean repository-relative POSIX path,
 * or return `null` when it is absolute, drive-relative, or escapes via `..`.
 */
export function normalizeRepositoryPath(rawPath: string): string | null {
  if (path.isAbsolute(rawPath) || path.win32.isAbsolute(rawPath)) return null;
  // Reject Windows drive-letter prefixes (e.g. `C:tmp`). These are
  // drive-relative rather than absolute, so `win32.isAbsolute` returns false,
  // yet they escape the fixture root on Windows.
  if (/^[a-zA-Z]:/.test(rawPath)) return null;

  const parts = rawPath.split(/[\\/]+/);
  if (parts.some((part) => part === '' || part === '..')) return null;

  const normalized = path.posix.normalize(parts.join('/'));
  if (normalized === '.' || normalized.startsWith('../')) return null;
  return normalized;
}

/** True when `repoPath` is strictly under `allowedArea` (both repo-relative). */
export function isPathUnderAllowedArea(repoPath: string, allowedArea: string): boolean {
  return repoPath.startsWith(`${allowedArea}/`) && repoPath.length > allowedArea.length + 1;
}

/** True when `childAbs` is a strict descendant of `parentAbs` (both absolute). */
export function isContainedIn(childAbs: string, parentAbs: string): boolean {
  const rel = path.relative(parentAbs, childAbs);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

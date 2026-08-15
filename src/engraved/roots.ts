import fs from 'fs';
import os from 'os';
import path from 'path';

import type { ArtifactsLocation } from '../interactive.js';
import { resolveArtifactsRoot } from '../manifest.js';
import type {
  EngravedDomain,
  EngravedKind,
  EngravedLevel,
} from './types.js';

/**
 * Where engraved records live, per level.
 *
 * Three stores, one per level:
 *
 *   user    → `~/.smithy/`, with records in its `decisions/` / `invariants/` /
 *             `constitution/` children
 *   repo    → the install's artifacts root — the repo itself in the default
 *             in-repo mode, or `~/.smithy/repos/<repoKey>/` when the install
 *             chose an external store — with records under its `docs/`
 *   project → `~/.smithy/projects/<slug>/`, records in its `decisions/` /
 *             `invariants/` / `constitution/` children
 *
 * The repo level rides the same `artifactsRoot` seam as every other planning
 * artifact, so an install that moved its planning out of the repo does not end
 * up with its decisions in one place and its specs in another. It keeps the
 * `docs/` segment the other two drop, because `docs/decisions/` is where
 * in-repo records already live and moving them would break every existing
 * citation.
 *
 * ## The user store is never managed
 *
 * The user store *is* `~/.smithy/`, so its record directories are siblings of
 * Smithy's own managed entries (`smithy-manifest.json`, `templates/`,
 * `repos/`, `projects/`), and the difference matters: everything in the
 * manifest's `files` array is deployed by `init` / `update` and **deleted** by
 * `uninit`. Records the user authored themselves must never take that path.
 *
 * The guarantee is structural, not a convention: nothing in this module or in
 * `init` ever adds an engraved path to a manifest, `uninit` removes only
 * manifest-listed files plus a closed list of legacy filenames (none of which
 * is a record directory), and `removeStaleFiles` iterates the old manifest
 * rather than the directory. `smithy uninit` therefore cannot reach the user's
 * global knowledge, on any code path. `engraved-store.test.ts` locks that.
 *
 * Nothing provisions these directories ahead of time. `smithy.engrave` creates
 * the leaf it is writing into, and until then the level reports itself absent
 * — which is the honest answer, and one the inventory would lose if `init`
 * created empty directories that made every level look present forever.
 */

const PROJECTS_DIR = 'projects';

/**
 * The shared cross-repo project store. Excluded from project-slug discovery:
 * it is where planning done outside any repo lands, not a named workstream a
 * user would scope engraved knowledge to.
 */
const DEFAULT_PROJECT = 'default';

/** Leaf directory per kind. Principles have no suffix, only a home. */
const KIND_DIRS: Record<EngravedKind, string> = {
  decision: 'decisions',
  invariant: 'invariants',
  principle: 'constitution',
};

/** Deterministic emission order, matching the engrave projection block. */
const KIND_ORDER: readonly EngravedKind[] = ['decision', 'invariant', 'principle'];
const DOMAIN_ORDER: readonly EngravedDomain[] = ['system', 'design'];

export interface EngravedDir {
  kind: EngravedKind;
  domain: EngravedDomain;
  /** Absolute path. */
  path: string;
  /** Path relative to the level's store root. */
  relPath: string;
}

export interface EngravedLevelRoots {
  level: EngravedLevel;
  /** Absolute store root. */
  root: string;
  /** Tilde-anchored display form for home stores; absolute otherwise. */
  displayRoot: string;
  dirs: EngravedDir[];
  /** Set for the `project` level only. */
  project?: string;
}

/**
 * Absolute path to the user-level engraved store — `~/.smithy/` itself, whose
 * `decisions/` / `invariants/` / `constitution/` children hold the records.
 */
export function userEngravedRoot(): string {
  return path.join(os.homedir(), '.smithy');
}

/**
 * Whether `slug` is a safe single path segment.
 *
 * The slug reaches us from `--project` and from planning-artifact frontmatter,
 * and it is joined into a filesystem path. `../repos/foo` would resolve a
 * "project store" outside `~/.smithy/projects/` entirely, and `team/foo` would
 * create a nested one that {@link listProjectSlugs} could never discover — so
 * anything that is not one plain segment is rejected rather than normalized.
 */
export function isValidProjectSlug(slug: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(slug) && slug !== '.' && slug !== '..';
}

/**
 * Absolute path to a named project's store. Callers must pass a slug that
 * satisfies {@link isValidProjectSlug}; {@link resolveProject} enforces that.
 */
export function projectRoot(slug: string): string {
  return path.join(os.homedir(), '.smithy', PROJECTS_DIR, slug);
}

/** Render a home-anchored absolute path in its portable tilde form. */
export function displayPath(abs: string): string {
  const home = os.homedir();
  if (abs === home) return '~';
  const prefix = home.endsWith(path.sep) ? home : home + path.sep;
  return abs.startsWith(prefix) ? `~/${abs.slice(prefix.length).split(path.sep).join('/')}` : abs;
}

/**
 * Named project stores under `~/.smithy/projects/`, sorted, excluding the
 * shared `default` store. Returns `[]` when the directory does not exist.
 */
export function listProjectSlugs(): string[] {
  const dir = path.join(os.homedir(), '.smithy', PROJECTS_DIR);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== DEFAULT_PROJECT &&
        isValidProjectSlug(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
}

/**
 * Resolve which project is in play, mirroring the rule the prompts follow:
 * an explicit slug wins, and otherwise a project level exists only when
 * exactly one named store is on disk. Ambiguity resolves to `null` — a wrong
 * guess would silently plan against another workstream's rules, which is worse
 * than planning with no project level at all.
 */
export function resolveProject(explicit?: string | undefined): string | null {
  if (explicit !== undefined && explicit.length > 0) {
    return isValidProjectSlug(explicit) ? explicit : null;
  }
  const slugs = listProjectSlugs();
  return slugs.length === 1 ? (slugs[0] as string) : null;
}

/**
 * The record directories under `storeRoot`, in deterministic order:
 * system decisions / invariants / constitution, then the same three under
 * `design/`. `subtree` is the path between the store root and the record
 * directories — `docs` for the repo store, where in-repo records already live,
 * and empty for the user and project stores, which sit them directly under the
 * store root.
 */
function dirsUnder(storeRoot: string, subtree: string[]): EngravedDir[] {
  const dirs: EngravedDir[] = [];
  for (const domain of DOMAIN_ORDER) {
    for (const kind of KIND_ORDER) {
      const segments = [
        ...subtree,
        ...(domain === 'design' ? ['design'] : []),
        KIND_DIRS[kind],
      ];
      dirs.push({
        kind,
        domain,
        path: path.join(storeRoot, ...segments),
        relPath: segments.join('/'),
      });
    }
  }
  return dirs;
}

export interface ResolveEngravedRootsOptions {
  /** Where this install keeps planning artifacts. Defaults to `'repo'`. */
  artifactsLocation?: ArtifactsLocation;
  /**
   * Project slug. When omitted, {@link resolveProject} decides, and the
   * project level is dropped entirely if it cannot.
   */
  project?: string | undefined;
}

/**
 * Every level's roots for a scan anchored at `targetDir`, ordered broadest
 * first. The `project` level is absent when no project resolves — an absent
 * level and an empty one are different states, and callers report them
 * differently.
 */
export function resolveEngravedRoots(
  targetDir: string,
  opts: ResolveEngravedRootsOptions = {},
): EngravedLevelRoots[] {
  const userRoot = userEngravedRoot();
  const repoRoot = resolveArtifactsRoot(targetDir, opts.artifactsLocation ?? 'repo');

  const levels: EngravedLevelRoots[] = [
    {
      level: 'user',
      root: userRoot,
      displayRoot: displayPath(userRoot),
      dirs: dirsUnder(userRoot, []),
    },
    {
      level: 'repo',
      root: repoRoot,
      displayRoot: displayPath(repoRoot),
      dirs: dirsUnder(repoRoot, ['docs']),
    },
  ];

  const project = resolveProject(opts.project);
  if (project !== null) {
    const root = projectRoot(project);
    levels.push({
      level: 'project',
      root,
      displayRoot: displayPath(root),
      dirs: dirsUnder(root, []),
      project,
    });
  }

  return levels;
}

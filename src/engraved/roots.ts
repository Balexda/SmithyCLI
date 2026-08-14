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
 *   user    → `~/.smithy/engraved/`
 *   repo    → the install's artifacts root — the repo itself in the default
 *             in-repo mode, or `~/.smithy/repos/<repoKey>/` when the install
 *             chose an external store
 *   project → `~/.smithy/projects/<slug>/`
 *
 * The repo level rides the same `artifactsRoot` seam as every other planning
 * artifact, so an install that moved its planning out of the repo does not end
 * up with its decisions in one place and its specs in another.
 *
 * ## The user store is never managed
 *
 * `~/.smithy/engraved/` sits beside Smithy's own managed entries under
 * `~/.smithy/` (`smithy-manifest.json`, `templates/`, `repos/`, `projects/`),
 * and the difference matters: everything in the manifest's `files` array is
 * deployed by `init` / `update` and **deleted** by `uninit`. Records the user
 * authored themselves must never take that path.
 *
 * The guarantee is structural, not a convention: nothing in this module or in
 * `init` ever adds an engraved path to a manifest, `uninit` removes only
 * manifest-listed files plus a closed list of legacy filenames (none of which
 * is under `engraved/`), and `removeStaleFiles` iterates the old manifest
 * rather than the directory. `smithy uninit` therefore cannot reach the user's
 * global knowledge, on any code path. `engraved-store.test.ts` locks that.
 */

/** Reserved segment under `~/.smithy/` holding user-level engraved records. */
const ENGRAVED_DIR = 'engraved';

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

/** Absolute path to the user-level engraved store. */
export function userEngravedRoot(): string {
  return path.join(os.homedir(), '.smithy', ENGRAVED_DIR);
}

/** Absolute path to a named project's store. */
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
    .filter((entry) => entry.isDirectory() && entry.name !== DEFAULT_PROJECT)
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
  if (explicit !== undefined && explicit.length > 0) return explicit;
  const slugs = listProjectSlugs();
  return slugs.length === 1 ? (slugs[0] as string) : null;
}

/**
 * The record directories under `storeRoot`, in deterministic order:
 * system decisions / invariants / constitution, then the same three under
 * `design/`. `subtree` is the path between the store root and the record
 * directories — `docs` for the repo and project stores, empty for the user
 * store, which is already an engraved-only directory.
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
      dirs: dirsUnder(root, ['docs']),
      project,
    });
  }

  return levels;
}

/**
 * Create the user-level engraved store if it is missing. Called by `init` so
 * the store exists to write into on a fresh machine.
 *
 * Never registers anything in a manifest — see the module header. Never
 * throws: a home directory that cannot be written is a reason to skip the
 * store, not to fail an install that has nothing else to do with it.
 */
export function ensureUserEngravedStore(): { root: string; created: boolean; warning?: string } {
  const root = userEngravedRoot();
  try {
    const created = !fs.existsSync(root);
    fs.mkdirSync(root, { recursive: true });
    return { root, created };
  } catch (err) {
    return { root, created: false, warning: (err as Error).message };
  }
}

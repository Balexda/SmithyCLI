import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import type { ArtifactsLocation, DeployLocation } from './interactive.js';
import { removeIfExists } from './utils.js';

const require = createRequire(import.meta.url);
export const { version: smithyVersion } = require('../package.json') as { version: string };

const MANIFEST_FILENAME = 'smithy-manifest.json';

/**
 * Fixed grouping segment under `~/.smithy/` that isolates per-repo external
 * artifact stores from Smithy's own reserved entries (`templates/`,
 * `smithy-manifest.json`, `config.yml`, ...). Keeping it as a dedicated
 * namespace makes the layout collision-proof: a repo literally named
 * `templates` resolves to `~/.smithy/repos/templates/`, never clobbering
 * `~/.smithy/templates/`.
 */
const REPOS_DIR = 'repos';

/**
 * Sibling grouping segment to {@link REPOS_DIR} for work that is *not*
 * anchored to a single repository — planning done from a scratch directory,
 * or an RFC that spans several repos. `repoKey` cannot serve that case: it
 * always resolves to *something* (falling back to the directory basename),
 * so a cross-repo store keyed that way would move every time the user
 * changed directories and could never be found again.
 */
const PROJECTS_DIR = 'projects';

/**
 * The single project store used outside a repo. Fixed for now — there is
 * deliberately no configurable slug and no config file, so the "where did my
 * artifacts go?" answer stays a constant.
 */
const DEFAULT_PROJECT = 'default';

export interface SmithyManifest {
  version: 1;
  smithyVersion: string;
  deployLocation: DeployLocation;
  agents: string[];
  permissions: boolean;
  /** Whether the Claude Code session-title UserPromptSubmit hook was deployed. */
  sessionTitles?: boolean;
  languages?: string[] | undefined;
  /**
   * Platform package managers that were active when the manifest was written
   * (e.g. `['mac']`, `['linux']`). Stored for debugging/introspection only —
   * `update` re-detects from `process.platform` rather than round-tripping.
   */
  platforms?: string[] | undefined;
  /**
   * Where planning artifacts (RFCs, specs, tasks, strikes, PRDs) are written.
   * Omitted when `'repo'` (the default) to keep legacy manifests byte-identical
   * — `readManifest` returns the parsed JSON verbatim, so consumers (e.g.,
   * `update`, `smithy status`) treat a missing value as `'repo'` via
   * `manifest.artifactsLocation ?? 'repo'`.
   */
  artifactsLocation?: ArtifactsLocation;
  files: Record<string, string[]>;  // agent name → relative file paths
}

/**
 * Resolve the directory where the manifest file lives, matching the deploy
 * location convention:
 *   - 'repo' → <targetDir>/.smithy/
 *   - 'user' → ~/.smithy/
 */
export function resolveManifestDir(targetDir: string, location: DeployLocation): string {
  if (location === 'user') {
    return path.join(os.homedir(), '.smithy');
  }
  return path.join(targetDir, '.smithy');
}

export function resolveManifestPath(targetDir: string, location: DeployLocation): string {
  return path.join(resolveManifestDir(targetDir, location), MANIFEST_FILENAME);
}

/**
 * Run `git -C <targetDir> <args...>` and return its trimmed stdout, or
 * `null` if git is unavailable, the directory isn't a repo, or the command
 * produces no output. Stderr is discarded so non-repo dirs fail quietly.
 */
function gitCapture(targetDir: string, args: string[]): string | null {
  try {
    const out = execFileSync('git', ['-C', targetDir, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Make a repo identity filesystem-safe: collapse path separators and any
 * other awkward characters to `-`, trim leading/trailing separators, and
 * fall back to `'repo'` if nothing usable remains. Guarantees the result
 * is a single path segment (no `/` or `\`).
 */
function sanitizeRepoKey(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned.length > 0 ? cleaned : 'repo';
}

/**
 * Derive a **worktree-stable** identity key for the repository containing
 * `targetDir`, used to namespace external artifact stores under
 * `~/.smithy/repos/<repoKey>/`.
 *
 * Every worktree of a repo — and its main checkout — must resolve to the
 * same key so they share one store and `smithy status` agrees from anywhere.
 * We achieve that by consulting git's *shared* git-common-dir rather than the
 * working directory name:
 *
 *   1. `git rev-parse --git-common-dir` → the shared `.git` dir (relative
 *      `.git` from the main worktree root, absolute path from a linked
 *      worktree). It points at the same place for every worktree.
 *   2. The repo root is the common dir's parent when the common dir is the
 *      usual `.git` directory; for a submodule the common dir is instead
 *      `<superproject>/.git/modules/<submodule>`, whose own name is the
 *      stable per-submodule identity (taking the parent would collapse every
 *      submodule onto `modules`). `git init --separate-git-dir` layouts are
 *      handled the same way.
 *   3. `repoKey = basename(repoRoot)`.
 *
 * Fallbacks, in order, when git is unavailable or yields nothing:
 *   4. basename of the `origin` remote URL (with a trailing `.git` stripped).
 *   5. basename of `targetDir` (non-git directories).
 *
 * The result is always sanitized to a single filesystem-safe segment.
 */
export function repoKey(targetDir: string): string {
  const commonDir = gitCapture(targetDir, ['rev-parse', '--git-common-dir']);
  if (commonDir) {
    try {
      const realCommon = fs.realpathSync(path.resolve(targetDir, commonDir));
      // A common dir named `.git` belongs to a normal checkout or a linked
      // worktree, so the repo is its parent. Anything else is already a named
      // git dir — `.git/modules/<submodule>` for submodules, or a detached
      // dir under `--separate-git-dir` — whose basename is the repo identity.
      const key =
        path.basename(realCommon) === '.git'
          ? path.basename(path.dirname(realCommon))
          : path.basename(realCommon);
      if (key.length > 0) return sanitizeRepoKey(key);
    } catch {
      // realpath failed (e.g. the common dir vanished mid-run) — fall through.
    }
  }

  const remote = gitCapture(targetDir, ['config', '--get', 'remote.origin.url']);
  if (remote) {
    const base = path.basename(remote.replace(/\/+$/, '').replace(/\.git$/, ''));
    if (base.length > 0) return sanitizeRepoKey(base);
  }

  return sanitizeRepoKey(path.basename(targetDir));
}

/**
 * Absolute path to the shared project store, `~/.smithy/projects/default/`.
 *
 * {@link resolveArtifactsRoot} already returns this for a target outside a
 * repo, but `smithy status` needs it as a *fallback* while standing inside
 * one — a cross-repo RFC lives here no matter which member repo you ask
 * from. Exported so that lookup doesn't have to rebuild the path by hand.
 */
export function projectStoreRoot(): string {
  return path.join(os.homedir(), '.smithy', PROJECTS_DIR, DEFAULT_PROJECT);
}

/** Tilde form of {@link projectStoreRoot}, for display and prompt paths. */
export function projectStorePrefix(): string {
  return `~/.smithy/${PROJECTS_DIR}/${DEFAULT_PROJECT}/`;
}

/**
 * Whether `dir` sits inside a git working tree — including a linked
 * worktree, a submodule, or any subdirectory of one.
 *
 * This is the signal {@link repoKey} deliberately cannot give: `repoKey`
 * always returns a usable key, falling back to the directory basename for
 * non-git directories, so callers that need to distinguish "this is a repo"
 * from "this is just a folder" have to ask separately. Uses the same
 * `--git-common-dir` probe as `repoKey` so the two agree about what counts
 * as a repo, and inherits `gitCapture`'s quiet failure: a missing git binary
 * reads the same as "not a repo", which is the right answer for both.
 */
export function isInsideGitRepo(dir: string): boolean {
  return gitCapture(dir, ['rev-parse', '--git-common-dir']) !== null;
}

/**
 * The path segments under `~/.smithy/` naming the external artifact store
 * that serves `targetDir`:
 *   - inside a git repo → `repos/<repoKey(targetDir)>`
 *   - outside one       → `projects/default`
 *
 * Single source of truth for {@link resolveArtifactsRoot} and
 * {@link templateArtifactsPrefix}. Those two must always name the same
 * store — one as an absolute filesystem path, the other as the tilde form
 * baked into deployed prompts — and routing both through this helper is what
 * stops them drifting apart.
 */
function externalStoreSegments(targetDir: string): string[] {
  return isInsideGitRepo(targetDir)
    ? [REPOS_DIR, repoKey(targetDir)]
    : [PROJECTS_DIR, DEFAULT_PROJECT];
}

/**
 * Resolve the absolute directory under which planning artifacts (RFCs,
 * specs, tasks, strikes, PRDs) are written:
 *   - 'repo'     → `<targetDir>` (paths land at `docs/rfcs/...`, `specs/...`)
 *   - 'external' → `~/.smithy/repos/<repoKey(targetDir)>/` when `targetDir`
 *     is inside a git repo, else `~/.smithy/projects/default/` (paths land
 *     at `<store>/docs/rfcs/...`, `<store>/specs/...`)
 *
 * The `<repoKey>` segment is worktree-stable (see {@link repoKey}), so every
 * worktree of a repo shares one external store.
 *
 * Used by the status scanner and any other code that needs the *real*
 * filesystem location. For the template variable baked into deployed
 * prompts (which may be committed to the repo), use
 * {@link templateArtifactsPrefix} instead — it returns a tilde-prefixed,
 * portable path rather than the home-expanded absolute one.
 */
export function resolveArtifactsRoot(
  targetDir: string,
  location: ArtifactsLocation = 'repo',
): string {
  if (location === 'external') {
    return path.join(os.homedir(), '.smithy', ...externalStoreSegments(targetDir));
  }
  return targetDir;
}

/**
 * The prefix that gets substituted into deployed prompts via the
 * `{{artifactsRoot}}` template variable. Returns `""` for in-repo mode
 * so paths render unchanged (`docs/rfcs/...`), or the tilde form of the
 * external store — `~/.smithy/repos/<repoKey>/` inside a repo,
 * `~/.smithy/projects/default/` outside one — so paths render as
 * `<store>/docs/rfcs/...`.
 *
 * Tilde-form (not home-expanded) so committed deployed prompts stay
 * portable across team members. Agents (Claude Code, Gemini CLI, Codex)
 * expand `~` at tool-call time.
 */
export function templateArtifactsPrefix(
  targetDir: string,
  location: ArtifactsLocation = 'repo',
): string {
  if (location === 'external') {
    return `~/.smithy/${externalStoreSegments(targetDir).join('/')}/`;
  }
  return '';
}

/**
 * Read an existing manifest. Returns null if no manifest exists.
 */
export function readManifest(targetDir: string, location: DeployLocation): SmithyManifest | null {
  const manifestPath = resolveManifestPath(targetDir, location);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SmithyManifest;
    if (data.version === 1 && data.files) return data;
    return null;
  } catch {
    return null;
  }
}

/**
 * Collect all file paths from a manifest across all agents.
 */
export function allManifestFiles(manifest: SmithyManifest): string[] {
  return Object.values(manifest.files).flat();
}

/**
 * Given an old manifest and a new set of deployed files, remove any files
 * that were in the old manifest but are not in the new set.
 * Returns the number of stale files removed.
 */
export function removeStaleFiles(
  targetDir: string,
  oldManifest: SmithyManifest | null,
  currentFiles: string[],
): number {
  if (!oldManifest) return 0;

  const baseDir = oldManifest.deployLocation === 'user' ? os.homedir() : targetDir;
  const currentSet = new Set(currentFiles);
  const oldFiles = allManifestFiles(oldManifest);
  let removed = 0;
  for (const file of oldFiles) {
    if (!currentSet.has(file)) {
      const absPath = path.join(baseDir, file);
      if (removeIfExists(absPath)) removed++;
    }
  }
  return removed;
}

export interface WriteManifestOptions {
  targetDir: string;
  location: DeployLocation;
  agents: string[];
  permissions: boolean;
  sessionTitles?: boolean;
  languages?: string[] | undefined;
  platforms?: string[] | undefined;
  /**
   * Where planning artifacts go. Omit (or pass `'repo'`) to leave the
   * field out of the manifest entirely — legacy manifests stay byte-identical.
   */
  artifactsLocation?: ArtifactsLocation;
  files: Record<string, string[]>;
}

/**
 * Write a manifest recording the full deployment state.
 */
export function writeManifest(opts: WriteManifestOptions): void {
  const manifestPath = resolveManifestPath(opts.targetDir, opts.location);
  const manifestDir = path.dirname(manifestPath);
  if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true });
  const manifest: SmithyManifest = {
    version: 1,
    smithyVersion,
    deployLocation: opts.location,
    agents: opts.agents,
    permissions: opts.permissions,
    ...(opts.sessionTitles !== undefined ? { sessionTitles: opts.sessionTitles } : {}),
    ...(opts.languages !== undefined ? { languages: opts.languages } : {}),
    ...(opts.platforms !== undefined ? { platforms: opts.platforms } : {}),
    // Only persist artifactsLocation when it's non-default ('external').
    // Keeping the field absent on the default keeps existing manifests
    // byte-identical, which matters for the .smithy/smithy-manifest.json
    // diff noise teams see in source control.
    ...(opts.artifactsLocation === 'external' ? { artifactsLocation: 'external' as const } : {}),
    files: opts.files,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Remove all files listed in a manifest and delete the manifest itself.
 * Used during uninit.
 */
export function removeManifestFiles(targetDir: string, location: DeployLocation): number {
  const manifest = readManifest(targetDir, location);
  if (!manifest) return 0;

  const baseDir = location === 'user' ? os.homedir() : targetDir;
  const emptiedDirs: string[] = [];
  let removed = 0;
  for (const file of allManifestFiles(manifest)) {
    const absPath = path.join(baseDir, file);
    if (removeIfExists(absPath)) {
      removed++;
      emptiedDirs.push(path.dirname(absPath));
    }
  }
  for (const dir of emptiedDirs) {
    pruneEmptyDirs(dir, baseDir);
  }

  // Remove the manifest itself
  removeIfExists(resolveManifestPath(targetDir, location));
  return removed;
}

/**
 * Walk up from `dir` toward `stopAt`, deleting each directory that is empty
 * and stopping at the first one that isn't (or at `stopAt`, exclusive).
 *
 * Removing a tracked file leaves its directory behind, which matters now that
 * a skill can nest bundled reference files: an uninit that deletes
 * `references/examples.md` would otherwise leave `<skill>/references/` and
 * `<skill>/` sitting in the target repo as empty scaffolding. Only
 * *already-empty* directories are removed, so nothing a user put there is at
 * risk — a sibling file or a stray dot-file is enough to keep the directory.
 *
 * Not counted in the removal total: these are directories the caller's own
 * file deletions emptied, not artifacts in their own right.
 */
function pruneEmptyDirs(dir: string, stopAt: string): void {
  let current = path.resolve(dir);
  const boundary = path.resolve(stopAt);
  while (current !== boundary && current.startsWith(boundary + path.sep)) {
    let entries: string[];
    try {
      entries = fs.readdirSync(current);
    } catch {
      return; // already gone, or unreadable — nothing to prune
    }
    if (entries.length > 0) return;
    try {
      fs.rmdirSync(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

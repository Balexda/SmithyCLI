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
 *   2. `repoRoot = dirname(realpath(resolve(targetDir, commonDir)))` — the
 *      main worktree's root.
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
      const repoRoot = path.dirname(
        fs.realpathSync(path.resolve(targetDir, commonDir)),
      );
      const key = path.basename(repoRoot);
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
 * Resolve the absolute directory under which planning artifacts (RFCs,
 * specs, tasks, strikes, PRDs) are written:
 *   - 'repo'     → `<targetDir>` (paths land at `docs/rfcs/...`, `specs/...`)
 *   - 'external' → `~/.smithy/repos/<repoKey(targetDir)>/` (paths land at
 *     `~/.smithy/repos/<repo>/docs/rfcs/...`, `~/.smithy/repos/<repo>/specs/...`)
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
    return path.join(os.homedir(), '.smithy', REPOS_DIR, repoKey(targetDir));
  }
  return targetDir;
}

/**
 * The prefix that gets substituted into deployed prompts via the
 * `{{artifactsRoot}}` template variable. Returns `""` for in-repo mode
 * so paths render unchanged (`docs/rfcs/...`), or the tilde form
 * `~/.smithy/repos/<repoKey>/` for external mode so paths render as
 * `~/.smithy/repos/<repo>/docs/rfcs/...`.
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
    return `~/.smithy/${REPOS_DIR}/${repoKey(targetDir)}/`;
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
  let removed = 0;
  for (const file of allManifestFiles(manifest)) {
    const absPath = path.join(baseDir, file);
    if (removeIfExists(absPath)) removed++;
  }

  // Remove the manifest itself
  removeIfExists(resolveManifestPath(targetDir, location));
  return removed;
}

import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import type { DeployLocation } from './interactive.js';
import { removeIfExists } from './utils.js';

const require = createRequire(import.meta.url);
export const { version: smithyVersion } = require('../package.json') as { version: string };

const MANIFEST_FILENAME = 'smithy-manifest.json';

export interface SmithyManifest {
  version: 1;
  smithyVersion: string;
  deployLocation: DeployLocation;
  agents: string[];
  permissions: boolean;
  issueTemplates: boolean;
  /** Whether the Claude Code session-title UserPromptSubmit hook was deployed. */
  sessionTitles?: boolean;
  languages?: string[] | undefined;
  /**
   * Platform package managers that were active when the manifest was written
   * (e.g. `['mac']`, `['linux']`). Stored for debugging/introspection only —
   * `update` re-detects from `process.platform` rather than round-tripping.
   */
  platforms?: string[] | undefined;
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
  issueTemplates: boolean;
  sessionTitles?: boolean;
  languages?: string[] | undefined;
  platforms?: string[] | undefined;
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
    issueTemplates: opts.issueTemplates,
    ...(opts.sessionTitles !== undefined ? { sessionTitles: opts.sessionTitles } : {}),
    ...(opts.languages !== undefined ? { languages: opts.languages } : {}),
    ...(opts.platforms !== undefined ? { platforms: opts.platforms } : {}),
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

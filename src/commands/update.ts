import path from 'path';
import picocolors from 'picocolors';
import { readManifest, smithyVersion } from '../manifest.js';
import { initAction } from './init.js';
import {
  promptManifestChoice,
  promptConfirmOverwrite,
  promptConfirmDowngrade,
  promptConfirmInit,
} from '../interactive.js';
import type { SmithyManifest } from '../manifest.js';
import type { AgentChoice, DeployLocation } from '../interactive.js';
import { toolchains, type LanguageToolchain } from '../permissions.js';

/** Validate and filter manifest language values against known toolchain keys. */
function validatedLanguages(raw: string[] | undefined): LanguageToolchain[] | undefined {
  if (raw === undefined) return undefined;
  const valid = new Set(Object.keys(toolchains));
  const filtered = raw.filter(l => valid.has(l)) as LanguageToolchain[];
  return filtered.length > 0 ? filtered : undefined;
}

export interface UpdateOptions {
  targetDir?: string;
  yes?: boolean;
}

/** Map a manifest's agents array back to an AgentChoice for initAction. */
function toAgentChoice(agents: string[]): AgentChoice {
  const sorted = [...agents].sort();
  if (sorted.length === 2 && sorted[0] === 'claude' && sorted[1] === 'gemini') {
    return 'all';
  }
  return agents[0] as AgentChoice;
}

/**
 * Compare two semver strings. Returns -1, 0, or 1.
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

/**
 * Compare CLI version against manifest version and prompt if needed.
 * Returns true if the update should proceed, false to skip.
 */
async function confirmVersionChange(
  manifest: SmithyManifest,
  nonInteractive: boolean,
  location: DeployLocation,
): Promise<boolean> {
  const manifestVer = manifest.smithyVersion;
  const cmp = compareSemver(smithyVersion, manifestVer);

  if (cmp > 0) {
    // Normal upgrade — proceed silently
    return true;
  }

  if (cmp === 0) {
    if (nonInteractive) return true;
    return await promptConfirmOverwrite(manifestVer, location);
  }

  // CLI version < manifest version — downgrade
  if (nonInteractive) return true;
  return await promptConfirmDowngrade(manifestVer, smithyVersion, location);
}

/** Run initAction with the config stored in a manifest. */
async function redeployFromManifest(
  manifest: SmithyManifest,
  targetDir: string,
): Promise<void> {
  await initAction({
    agent: toAgentChoice(manifest.agents),
    location: manifest.deployLocation,
    permissions: manifest.permissions,
    issueTemplates: manifest.issueTemplates,
    languages: validatedLanguages(manifest.languages),
    targetDir,
    yes: true,
    quiet: true,
  });
}

export async function updateAction(opts: UpdateOptions = {}): Promise<void> {
  console.log(picocolors.cyan('🔨 Smithy CLI — Update\n'));

  const targetDir = path.resolve(opts.targetDir ?? process.cwd());
  const nonInteractive = opts.yes ?? false;

  // 1. Check for manifests in both locations
  const repoManifest = readManifest(targetDir, 'repo');
  const userManifest = readManifest(targetDir, 'user');

  if (!repoManifest && !userManifest) {
    if (nonInteractive) {
      console.error(picocolors.red('No smithy manifest found. Run `smithy init` first.'));
      process.exitCode = 1;
      return;
    }
    const shouldInit = await promptConfirmInit();
    if (!shouldInit) {
      return;
    }
    await initAction({ targetDir });
    return;
  }

  // 2. Determine which manifest(s) to update
  type UpdateTarget = { location: DeployLocation; manifest: SmithyManifest };
  const targets: UpdateTarget[] = [];

  if (repoManifest && userManifest) {
    // Both exist — prompt for choice
    const choice = nonInteractive
      ? 'both'
      : await promptManifestChoice(repoManifest.smithyVersion, userManifest.smithyVersion);

    if (choice === 'both' || choice === 'repo') {
      targets.push({ location: 'repo', manifest: repoManifest });
    }
    if (choice === 'both' || choice === 'user') {
      targets.push({ location: 'user', manifest: userManifest });
    }
  } else if (repoManifest) {
    console.log(picocolors.dim('Found repo manifest'));
    targets.push({ location: 'repo', manifest: repoManifest });
  } else {
    console.log(picocolors.dim('Found user manifest'));
    targets.push({ location: 'user', manifest: userManifest! });
  }

  // 3. For each target, check version and redeploy
  for (const { location, manifest } of targets) {
    const proceed = await confirmVersionChange(manifest, nonInteractive, location);
    if (!proceed) {
      console.log(picocolors.dim(`Skipping ${manifest.deployLocation} manifest update.`));
      continue;
    }
    await redeployFromManifest(manifest, targetDir);
  }
}

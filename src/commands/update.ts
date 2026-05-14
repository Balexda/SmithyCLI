import path from 'path';
import picocolors from 'picocolors';
import { readManifest, smithyVersion } from '../manifest.js';
import { initAction } from './init.js';
import {
  promptManifestChoice,
  promptConfirmOverwrite,
  promptConfirmDowngrade,
  promptConfirmInit,
  promptConfirmResetPermissions,
} from '../interactive.js';
import type { SmithyManifest } from '../manifest.js';
import type { AgentName, DeployLocation } from '../interactive.js';
import { toolchains, type LanguageToolchain } from '../permissions.js';
import { detectPlatforms } from '../platform-detect.js';
import {
  analyzeSettingsDrift,
  resolveSettingsPath,
  resetPermissions as resetClaudePermissions,
} from '../agents/claude.js';
import { formatDriftReport, hasDrift, type DriftReport } from '../drift.js';

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
  /**
   * When true, replace the `allow`/`ask`/`deny` arrays in Claude's
   * settings.json with the canonical Smithy baseline before redeploying.
   * Drops user customizations and stale entries. No-op for manifests that
   * don't manage Claude permissions.
   */
  resetPermissions?: boolean;
}

const knownAgents = new Set<AgentName>(['claude', 'gemini', 'codex']);

/** Validate a manifest's agent list before replaying it through initAction. */
function validateManifestAgents(
  manifest: SmithyManifest,
  location: DeployLocation,
): AgentName[] | null {
  if (manifest.agents.length === 0) {
    console.error(picocolors.red(`  ${location} manifest contains no agents; refusing to update.`));
    process.exitCode = 1;
    return null;
  }

  const unknown = manifest.agents.filter(agent => !knownAgents.has(agent as AgentName));
  if (unknown.length > 0) {
    console.error(picocolors.red(
      `  ${location} manifest contains unsupported agent${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}; refusing to update.`,
    ));
    process.exitCode = 1;
    return null;
  }

  return manifest.agents as AgentName[];
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
  agents: AgentName[],
): Promise<void> {
  await initAction({
    agents,
    location: manifest.deployLocation,
    permissions: manifest.permissions,
    sessionTitles: manifest.sessionTitles ?? true,
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
  const resetRequested = opts.resetPermissions ?? false;
  for (const { location, manifest } of targets) {
    // The manifest's stored deployLocation must match where we read it from.
    // They diverge only when a manifest is hand-copied between repo/user, in
    // which case `--reset-permissions` and the drift report would act on
    // `location`'s settings.json while `redeployFromManifest` would write to
    // `manifest.deployLocation`'s — two different files. Bail loudly instead
    // of silently picking one.
    if (manifest.deployLocation !== location) {
      console.log(
        picocolors.yellow(
          `  ${location} manifest declares deployLocation="${manifest.deployLocation}"; refusing to update — fix the manifest or rerun \`smithy init\`.`,
        ),
      );
      continue;
    }

    const agents = validateManifestAgents(manifest, location);
    if (!agents) return;

    const proceed = await confirmVersionChange(manifest, nonInteractive, location);
    if (!proceed) {
      console.log(picocolors.dim(`Skipping ${manifest.deployLocation} manifest update.`));
      continue;
    }

    const reset = await maybeResetClaudePermissions(
      targetDir,
      location,
      manifest,
      resetRequested,
      nonInteractive,
    );

    // Capture drift before the redeploy mutates the file. `writePermissions`
    // unions canonical entries into the user's settings, so post-merge every
    // user customization would look like drift — the diff is only meaningful
    // against the pre-merge state. Skip when we just reset; the diff is moot
    // because the file already matches the baseline.
    const drift = reset ? null : collectClaudeDrift(targetDir, location, manifest);

    await redeployFromManifest(manifest, targetDir, agents);

    if (drift) {
      const settingsPath = resolveSettingsPath(targetDir, location);
      console.log('');
      console.log(picocolors.yellow(formatDriftReport(drift, settingsPath)));
    }
  }
}

/**
 * Honor `--reset-permissions` for a single update target. Returns true when a
 * reset was actually performed (so the caller can skip the drift report).
 *
 * No-op when:
 *   - the flag wasn't passed,
 *   - the manifest does not manage Claude permissions, or
 *   - the user declines the interactive confirmation.
 */
async function maybeResetClaudePermissions(
  targetDir: string,
  location: DeployLocation,
  manifest: SmithyManifest,
  resetRequested: boolean,
  nonInteractive: boolean,
): Promise<boolean> {
  if (!resetRequested) return false;

  if (!manifest.permissions || !manifest.agents.includes('claude')) {
    console.log(
      picocolors.dim(
        `  --reset-permissions: ${location} manifest does not manage Claude permissions; nothing to reset.`,
      ),
    );
    return false;
  }

  const ok = nonInteractive || (await promptConfirmResetPermissions(location));
  if (!ok) {
    console.log(picocolors.dim(`  Skipping permission reset for ${location} manifest.`));
    return false;
  }

  resetClaudePermissions(
    targetDir,
    location,
    validatedLanguages(manifest.languages),
    detectPlatforms(),
  );
  return true;
}

/**
 * Build a Claude drift report for the given target, or `null` if Claude isn't
 * one of the deployed agents, permissions are disabled, or the settings file
 * doesn't exist yet.
 */
function collectClaudeDrift(
  targetDir: string,
  location: DeployLocation,
  manifest: SmithyManifest,
): DriftReport | null {
  if (!manifest.permissions) return null;
  if (!manifest.agents.includes('claude')) return null;
  const report = analyzeSettingsDrift(
    targetDir,
    location,
    validatedLanguages(manifest.languages),
    detectPlatforms(),
  );
  if (!report || !hasDrift(report)) return null;
  return report;
}

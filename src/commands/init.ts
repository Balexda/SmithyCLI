import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import {
  promptAgent,
  promptDeployLocation,
  promptOverwriteOrdersTemplates,
  promptPermissions,
  promptToolchains,
} from '../interactive.js';
import { detectLanguages } from '../language-detect.js';
import { detectPlatforms } from '../platform-detect.js';
import type { LanguageToolchain, PlatformPackageManager } from '../permissions.js';
import {
  agentGitignoreEntries,
  addToGitignore,
} from '../utils.js';
import { readManifest, removeStaleFiles, resolveManifestDir, writeManifest } from '../manifest.js';
import { ORDERS_TEMPLATE_TYPES, provisionOrdersTemplates } from '../orders-templates.js';
import * as gemini from '../agents/gemini.js';
import * as claude from '../agents/claude.js';
import * as codex from '../agents/codex.js';
import { agentDeployLocations } from '../interactive.js';
import type { AgentChoice, DeployLocation } from '../interactive.js';

export interface InitOptions {
  agent?: AgentChoice;
  location?: DeployLocation;
  permissions?: boolean;
  /**
   * When true (default), deploys the Claude Code session-title UserPromptSubmit
   * hook so `/smithy.<cmd>` invocations get a meaningful session title.
   * Set to false (via `--no-session-titles`) to skip.
   */
  sessionTitles?: boolean;
  languages?: LanguageToolchain[] | undefined;
  /**
   * Platform-scoped package managers (brew on macOS, apt/dpkg on Linux) to
   * include in auto-allowed permissions. When omitted, `initAction` calls
   * `detectPlatforms()` to infer from `process.platform`.
   */
  platforms?: PlatformPackageManager[] | undefined;
  targetDir?: string;
  yes?: boolean;
  /** When true, suppresses the welcome banner and uses "Upgrade" in the completion message. */
  quiet?: boolean;
}

export async function initAction(opts: InitOptions = {}): Promise<void> {
  if (!opts.quiet) {
    console.log(picocolors.cyan('🔨 Welcome to Smithy CLI\n'));
  }

  // 1. Agent selection
  const agent = opts.agent ?? (opts.yes ? 'all' : await promptAgent());

  // 2. Deploy location (limited by agent capabilities)
  const deployLocation = opts.location ?? (opts.yes ? 'repo' : await promptDeployLocation(agent));

  // Validate that the deploy location is supported by the selected agent
  const supportedLocations = agentDeployLocations[agent];
  if (!supportedLocations.includes(deployLocation)) {
    console.error(picocolors.red(
      `Error: Deploy location '${deployLocation}' is not supported by ${agent}. ` +
      `Supported locations: ${supportedLocations.join(', ')}`,
    ));
    process.exitCode = 1;
    return;
  }

  // 3. Permissions — y/n at the selected deploy location
  let deployPermissions: boolean;
  if (opts.permissions !== undefined) {
    deployPermissions = opts.permissions;
  } else if (opts.yes) {
    deployPermissions = true;
  } else {
    deployPermissions = await promptPermissions();
  }

  // 4. Target directory (resolved early — needed for language detection)
  const targetDir = path.resolve(opts.targetDir ?? process.cwd());

  // 5. Language toolchains — which toolchain permissions to include
  let languages: LanguageToolchain[] | undefined;
  if (deployPermissions) {
    if (opts.languages !== undefined) {
      // Explicit selection (from CLI flag or manifest replay)
      languages = opts.languages;
    } else if (opts.yes) {
      // Non-interactive: default to all toolchains (undefined) to preserve
      // backward compat. Use --toolchains for explicit filtering in CI.
      languages = undefined;
    } else {
      // Interactive: auto-detect and let user confirm/adjust
      const detected = detectLanguages(targetDir);
      languages = await promptToolchains(detected);
    }
  }

  // 5c. Platform-scoped package managers (brew on macOS, apt/dpkg on Linux).
  // Auto-detected silently from `process.platform` — no interactive prompt.
  // Pass `opts.platforms` to override (e.g. from an integration test).
  let platformManagers: PlatformPackageManager[] | undefined;
  if (deployPermissions) {
    platformManagers = opts.platforms ?? detectPlatforms();
  }

  // 5b. Session-title hook (Claude only). Default on; opt out via --no-session-titles.
  const deploySessionTitles = opts.sessionTitles ?? true;

  // 5d. Orders templates — write canonical default bodies to
  // <manifestDir>/templates/orders/. Provisioning runs BEFORE the manifest-write
  // step and never reads or alters smithy-manifest.json. The four canonical
  // <type>.md files are user content, not manifest-tracked artifacts (FR-009),
  // so they are not added to deployedFiles.
  const ordersManifestDir = resolveManifestDir(targetDir, deployLocation);
  const ordersDir = path.join(ordersManifestDir, 'templates', 'orders');
  const existingOrdersTypes = ORDERS_TEMPLATE_TYPES.filter(t =>
    fs.existsSync(path.join(ordersDir, `${t}.md`)),
  );
  let overwriteOrders = false;
  if (existingOrdersTypes.length > 0) {
    if (opts.yes === true) {
      overwriteOrders = false;
    } else {
      overwriteOrders = await promptOverwriteOrdersTemplates(ordersManifestDir);
    }
  }
  const ordersResult = provisionOrdersTemplates({
    targetDir,
    location: deployLocation,
    overwrite: overwriteOrders,
  });
  {
    const w = ordersResult.templatesWritten.length;
    const p = ordersResult.templatesPreserved.length;
    const writtenPart = `${w} template${w === 1 ? '' : 's'} written`;
    const preservedPart = `${p} preserved`;
    console.log(picocolors.dim(`  Orders templates: ${writtenPart}, ${preservedPart}`));
  }

  // --- Step 1: Check manifest (read old state for stale file cleanup) ---
  const oldManifest = readManifest(targetDir, deployLocation);

  // --- Step 2: Deploy ---

  // Deploy agents and collect deployed files per agent
  const agentsToSetup = agent === 'all' ? ['gemini', 'claude'] as const : [agent] as const;
  const deployedFiles: Record<string, string[]> = {};

  for (const a of agentsToSetup) {
    if (a === 'gemini') {
      deployedFiles['gemini'] = await gemini.deploy(targetDir, deployPermissions && deployLocation === 'repo', languages, platformManagers);
    } else if (a === 'claude') {
      deployedFiles['claude'] = await claude.deploy(targetDir, 'none', deployLocation);
      if (deployPermissions) {
        claude.writePermissions(targetDir, deployLocation, languages, platformManagers);
      }
      if (deploySessionTitles) {
        const hookRel = claude.deploySessionTitleHookScript(targetDir, deployLocation);
        deployedFiles['claude'].push(hookRel);
        claude.writeSessionTitleHook(targetDir, deployLocation);
      }
    } else if (a === 'codex') {
      deployedFiles['codex'] = await codex.deploy(targetDir, deployPermissions && deployLocation === 'repo');
    }
  }

  // Remove stale files from previous deployment
  const allCurrentFiles = Object.values(deployedFiles).flat();
  const staleRemoved = removeStaleFiles(targetDir, oldManifest, allCurrentFiles);
  if (staleRemoved > 0) {
    console.log(picocolors.dim(`  Cleaned up ${staleRemoved} stale artifact${staleRemoved === 1 ? '' : 's'} from previous deployment`));
  }

  // --- Step 3: Write manifest ---
  writeManifest({
    targetDir,
    location: deployLocation,
    agents: [...agentsToSetup],
    permissions: deployPermissions,
    sessionTitles: deploySessionTitles,
    languages,
    platforms: platformManagers,
    files: deployedFiles,
  });

  // Update .gitignore
  const gitignoreEntries = agentsToSetup.flatMap(a => agentGitignoreEntries[a] ?? []);

  if (gitignoreEntries.length > 0) {
    const added = addToGitignore(targetDir, gitignoreEntries);
    if (added > 0) {
      console.log(picocolors.blue(`  Added ${added} entr${added === 1 ? 'y' : 'ies'} to .gitignore`));
    } else {
      console.log(picocolors.dim('  .gitignore already up to date'));
    }
  }

  console.log(picocolors.cyan(opts.quiet ? '\n✅ Upgrade complete!' : '\n✅ Initialization complete!'));

  if (agentsToSetup.includes('gemini')) {
    console.log(picocolors.yellow('Note: If you are currently in an interactive Gemini CLI session, please run `/skills reload` to load the new workspace skills.'));
  }
}

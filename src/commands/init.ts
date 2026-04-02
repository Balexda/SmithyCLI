import path from 'path';
import picocolors from 'picocolors';
import {
  promptAgent,
  promptDeployLocation,
  promptPermissions,
  promptIssueTemplates,
} from '../interactive.js';
import {
  copyDirSync,
  issueTemplatesSrcDir,
  agentGitignoreEntries,
  addToGitignore,
  resolveIssueTemplatePath,
} from '../utils.js';
import { readManifest, removeStaleFiles, writeManifest } from '../manifest.js';
import * as gemini from '../agents/gemini.js';
import * as claude from '../agents/claude.js';
import * as codex from '../agents/codex.js';
import { agentDeployLocations } from '../interactive.js';
import type { AgentChoice, DeployLocation } from '../interactive.js';

export interface InitOptions {
  agent?: AgentChoice;
  location?: DeployLocation;
  permissions?: boolean;
  issueTemplates?: boolean;
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

  // 4. Issue templates — y/n at the selected deploy location
  let deployIssueTemplates: boolean;
  if (opts.issueTemplates !== undefined) {
    deployIssueTemplates = opts.issueTemplates;
  } else if (opts.yes) {
    deployIssueTemplates = true;
  } else {
    deployIssueTemplates = await promptIssueTemplates();
  }

  // 5. Target directory
  const targetDir = path.resolve(opts.targetDir ?? process.cwd());

  // --- Step 1: Check manifest (read old state for stale file cleanup) ---
  const oldManifest = readManifest(targetDir, deployLocation);

  // --- Step 2: Deploy ---

  // Deploy issue templates at the selected location
  if (deployIssueTemplates) {
    const dest = resolveIssueTemplatePath(targetDir, deployLocation);
    console.log(picocolors.green(`\nInstalling Smithy issue templates in ${dest}...`));
    copyDirSync(issueTemplatesSrcDir, dest);
  }

  // Deploy agents and collect deployed files per agent
  const agentsToSetup = agent === 'all' ? ['gemini', 'claude'] as const : [agent] as const;
  const deployedFiles: Record<string, string[]> = {};

  for (const a of agentsToSetup) {
    if (a === 'gemini') {
      deployedFiles['gemini'] = gemini.deploy(targetDir, deployPermissions && deployLocation === 'repo');
    } else if (a === 'claude') {
      deployedFiles['claude'] = claude.deploy(targetDir, 'none', deployLocation);
      if (deployPermissions) {
        claude.writePermissions(targetDir, deployLocation);
      }
    } else if (a === 'codex') {
      deployedFiles['codex'] = codex.deploy(targetDir, deployPermissions && deployLocation === 'repo');
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
    issueTemplates: deployIssueTemplates,
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

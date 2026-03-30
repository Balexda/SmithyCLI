import path from 'path';
import picocolors from 'picocolors';
import {
  promptAgent,
  promptDeployLocation,
  promptPermissionLocations,
  promptIssueTemplateLocations,
  promptTargetDir,
} from '../interactive.js';
import {
  copyDirSync,
  issueTemplatesSrcDir,
  agentGitignoreEntries,
  localDeployGitignoreEntries,
  addToGitignore,
  resolveIssueTemplatePath,
} from '../utils.js';
import * as gemini from '../agents/gemini.js';
import * as claude from '../agents/claude.js';
import * as codex from '../agents/codex.js';
import type { AgentChoice, DeployLocation } from '../interactive.js';

export interface InitOptions {
  agent?: AgentChoice;
  location?: DeployLocation;
  permissions?: boolean;
  issueTemplates?: boolean;
  targetDir?: string;
  yes?: boolean;
}

export async function initAction(opts: InitOptions = {}): Promise<void> {
  console.log(picocolors.cyan('🔨 Welcome to Smithy CLI\n'));

  // 1. Agent selection
  const agent = opts.agent ?? (opts.yes ? 'all' : await promptAgent());

  // 2. Deploy location (limited by agent capabilities)
  const deployLocation = opts.location ?? (opts.yes ? 'repo' : await promptDeployLocation(agent));

  // 3. Permissions — multi-select of deploy locations (interactive), or boolean (CLI)
  let permissionLocations: DeployLocation[];
  if (opts.permissions !== undefined) {
    permissionLocations = opts.permissions ? [deployLocation] : [];
  } else if (opts.yes) {
    permissionLocations = [deployLocation];
  } else {
    permissionLocations = await promptPermissionLocations(agent, deployLocation);
  }

  // 4. Issue templates — multi-select of deploy locations (interactive), or boolean (CLI)
  let issueTemplateLocations: DeployLocation[];
  if (opts.issueTemplates !== undefined) {
    issueTemplateLocations = opts.issueTemplates ? [deployLocation] : [];
  } else if (opts.yes) {
    issueTemplateLocations = [deployLocation];
  } else {
    issueTemplateLocations = await promptIssueTemplateLocations(agent, deployLocation);
  }

  // 5. Target directory
  const targetDir = path.resolve(opts.targetDir ?? (opts.yes ? process.cwd() : await promptTargetDir()));

  // Deploy issue templates to each selected location
  for (const loc of issueTemplateLocations) {
    const dest = resolveIssueTemplatePath(targetDir, loc);
    console.log(picocolors.green(`\nInstalling Smithy issue templates in ${dest}...`));
    copyDirSync(issueTemplatesSrcDir, dest);
  }

  // Deploy agents
  const agentsToSetup = agent === 'all' ? ['gemini', 'claude', 'codex'] as const : [agent] as const;

  for (const a of agentsToSetup) {
    if (a === 'gemini') {
      gemini.deploy(targetDir, permissionLocations.includes('repo'));
    } else if (a === 'claude') {
      // Deploy prompts/commands without permissions, then write permissions per selected location
      claude.deploy(targetDir, 'none');
      for (const level of permissionLocations) {
        claude.writePermissions(targetDir, level);
      }
    } else if (a === 'codex') {
      codex.deploy(targetDir, permissionLocations.includes('repo'));
    }
  }

  // Update .gitignore
  const gitignoreEntries = agentsToSetup.flatMap(a => agentGitignoreEntries[a] ?? []);

  // Add .smithy/local/ to gitignore if any local deployment was selected
  const usesLocal = permissionLocations.includes('local') || issueTemplateLocations.includes('local');
  if (usesLocal) {
    gitignoreEntries.push(...localDeployGitignoreEntries);
  }

  if (gitignoreEntries.length > 0) {
    const added = addToGitignore(targetDir, gitignoreEntries);
    if (added > 0) {
      console.log(picocolors.blue(`  Added ${added} entr${added === 1 ? 'y' : 'ies'} to .gitignore`));
    } else {
      console.log(picocolors.dim('  .gitignore already up to date'));
    }
  }

  console.log(picocolors.cyan('\n✅ Initialization complete!'));

  if (agentsToSetup.includes('gemini')) {
    console.log(picocolors.yellow('Note: If you are currently in an interactive Gemini CLI session, please run `/skills reload` to load the new workspace skills.'));
  }
}

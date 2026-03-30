import { select, checkbox, input, confirm } from '@inquirer/prompts';
import picocolors from 'picocolors';

export type AgentChoice = 'gemini' | 'claude' | 'codex' | 'all';
export type DeployLocation = 'repo' | 'local' | 'user';
export type PermissionLevel = 'repo' | 'local' | 'user' | 'none';
export type DeployablePermissionLevel = Exclude<PermissionLevel, 'none'>;

/** Deploy locations supported by each agent. */
export const agentDeployLocations: Record<AgentChoice, DeployLocation[]> = {
  claude: ['repo', 'local', 'user'],
  gemini: ['repo'],
  codex: ['repo'],
  all: ['repo', 'local', 'user'],
};

const deployLocationLabels: Record<DeployLocation, { name: string; description: string }> = {
  repo: { name: 'Repo', description: 'Checked into git — shared across worktrees and team members' },
  local: { name: 'Local', description: 'Per-machine — not checked in, applies only to this repo' },
  user: { name: 'User (global)', description: 'Global per-user — not checked in, applies to all repos' },
};

export async function promptAgent(): Promise<AgentChoice> {
  return await select<AgentChoice>({
    message: 'Which AI assistant CLI are you configuring this repository for?',
    choices: [
      { name: 'Gemini CLI', value: 'gemini', description: 'Sets up workspace skills in .gemini/skills/' },
      { name: 'Claude', value: 'claude', description: 'Sets up prompt files for Claude in .claude/prompts/' },
      { name: 'Codex', value: 'codex', description: 'Sets up prompt files for Codex in tools/codex/prompts/' },
      { name: 'All', value: 'all', description: 'Sets up all of the above' },
    ],
  });
}

export async function promptDeployLocation(agent: AgentChoice): Promise<DeployLocation> {
  const locations = agentDeployLocations[agent];

  // Auto-select when only one option is available
  if (locations.length === 1) {
    console.log(picocolors.dim(`  Deploy location: ${locations[0]} (only option for ${agent})`));
    return locations[0]!;
  }

  return await select<DeployLocation>({
    message: 'Where should Smithy be deployed?',
    choices: locations.map(loc => ({
      name: deployLocationLabels[loc].name,
      value: loc,
      description: deployLocationLabels[loc].description,
    })),
  });
}

export async function promptPermissionLocations(
  agent: AgentChoice,
  defaultLocation: DeployLocation,
): Promise<DeployLocation[]> {
  const locations = agentDeployLocations[agent];

  return await checkbox<DeployLocation>({
    message: 'Where should Smithy permissions be deployed? (leave empty to skip)',
    choices: locations.map(loc => ({
      name: deployLocationLabels[loc].name,
      value: loc,
      checked: loc === defaultLocation,
    })),
  });
}

export async function promptIssueTemplateLocations(
  agent: AgentChoice,
  defaultLocation: DeployLocation,
): Promise<DeployLocation[]> {
  const locations = agentDeployLocations[agent];

  return await checkbox<DeployLocation>({
    message: 'Where should Smithy issue templates be deployed? (leave empty to skip)',
    choices: locations.map(loc => ({
      name: deployLocationLabels[loc].name,
      value: loc,
      checked: loc === defaultLocation,
    })),
  });
}

export async function promptTargetDir(): Promise<string> {
  const dir = await input({
    message: 'Target directory?',
    default: process.cwd(),
  });
  return dir;
}

export async function promptConfirmUninit(): Promise<boolean> {
  return await confirm({
    message: 'Are you sure you want to remove Smithy prompts and templates? (Permissions will not be touched)',
    default: false,
  });
}

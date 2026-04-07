import { select, confirm, checkbox } from '@inquirer/prompts';
import picocolors from 'picocolors';
import { toolchains, type LanguageToolchain } from './permissions.js';

export type AgentChoice = 'gemini' | 'claude' | 'codex' | 'all';
export type DeployLocation = 'repo' | 'user';
export type PermissionLevel = 'repo' | 'user' | 'none';
export type DeployablePermissionLevel = Exclude<PermissionLevel, 'none'>;

/** Deploy locations supported by each agent. */
export const agentDeployLocations: Record<AgentChoice, DeployLocation[]> = {
  claude: ['repo', 'user'],
  gemini: ['repo'],
  codex: ['repo'],
  all: ['repo', 'user'],
};

/** Build a location label with an agent-specific description of where files go. */
function getDeployLocationLabel(agent: AgentChoice, loc: DeployLocation): { name: string; description: string } {
  if (loc === 'repo') {
    const pathHint: Record<AgentChoice, string> = {
      claude: '.claude/commands/, .claude/prompts/',
      gemini: '.gemini/skills/',
      codex: 'tools/codex/prompts/',
      all: 'shared across team members',
    };
    return { name: 'Repo', description: `Checked into git — ${pathHint[agent]}` };
  }
  // loc === 'user'
  const pathHint: Record<AgentChoice, string> = {
    claude: '~/.claude/',
    gemini: '~/',
    codex: '~/',
    all: '~/ (Claude only)',
  };
  return { name: 'User (global)', description: `Per-user global config in ${pathHint[agent]}` };
}

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
    choices: locations.map(loc => {
      const label = getDeployLocationLabel(agent, loc);
      return { name: label.name, value: loc, description: label.description };
    }),
  });
}

export async function promptPermissions(): Promise<boolean> {
  return await confirm({
    message: 'Deploy Smithy permissions?',
    default: true,
  });
}

export async function promptIssueTemplates(): Promise<boolean> {
  return await confirm({
    message: 'Deploy Smithy issue templates?',
    default: true,
  });
}


export async function promptToolchains(detected: LanguageToolchain[]): Promise<LanguageToolchain[]> {
  const detectedSet = new Set(detected);
  const choices = (Object.entries(toolchains) as [LanguageToolchain, typeof toolchains[LanguageToolchain]][]).map(
    ([key, tc]) => ({
      name: tc.label,
      value: key,
      checked: detectedSet.has(key),
    }),
  );

  if (detected.length > 0) {
    console.log(picocolors.dim(`  Detected: ${detected.map(l => toolchains[l].label).join(', ')}`));
  }

  return await checkbox<LanguageToolchain>({
    message: 'Which language toolchains should be included in permissions?',
    choices,
  });
}

export async function promptConfirmUninit(): Promise<boolean> {
  return await confirm({
    message: 'Are you sure you want to remove Smithy prompts and templates? (Permissions will not be touched)',
    default: false,
  });
}

export async function promptManifestChoice(
  repoVersion: string,
  userVersion: string,
  action: string = 'upgrade',
): Promise<DeployLocation | 'both'> {
  return await select<DeployLocation | 'both'>({
    message: `Found multiple manifests, which do you want to ${action}?`,
    choices: [
      { name: `Both`, value: 'both', description: `repo (v${repoVersion}) + user (v${userVersion})` },
      { name: `Repo`, value: 'repo', description: `v${repoVersion} — .smithy/smithy-manifest.json` },
      { name: `User`, value: 'user', description: `v${userVersion} — ~/.smithy/smithy-manifest.json` },
    ],
  });
}

export async function promptConfirmInit(): Promise<boolean> {
  return await confirm({
    message: 'No manifests found, would you like to initialize?',
    default: true,
  });
}

export async function promptConfirmOverwrite(version: string, location?: DeployLocation): Promise<boolean> {
  const prefix = location ? `${location.charAt(0).toUpperCase() + location.slice(1)} manifest` : 'Manifest';
  return await confirm({
    message: `${prefix} is the same version (${version}), are you sure you want to overwrite?`,
    default: false,
  });
}

export async function promptConfirmDowngrade(
  manifestVersion: string,
  cliVersion: string,
  location?: DeployLocation,
): Promise<boolean> {
  const prefix = location ? `${location.charAt(0).toUpperCase() + location.slice(1)} manifest` : 'Manifest';
  return await confirm({
    message: `${prefix} is higher version (${manifestVersion}) than CLI (${cliVersion}), are you sure you want to downgrade?`,
    default: false,
  });
}

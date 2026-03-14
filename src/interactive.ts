import { select, input, confirm } from '@inquirer/prompts';

export type AgentChoice = 'gemini' | 'claude' | 'codex' | 'all';

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

export async function promptPermissions(): Promise<boolean> {
  return await confirm({
    message: 'Would you like to initialize default smithy permissions for the selected agent(s)? (Grants access to non-destructive repo actions)',
    default: true,
  });
}

export async function promptIssueTemplates(): Promise<boolean> {
  return await confirm({
    message: 'Would you like to install the Smithy GitHub Issue templates? (Requires a GitHub repository)',
    default: true,
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

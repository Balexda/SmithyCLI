import { select, input, confirm } from '@inquirer/prompts';

export type AgentChoice = 'gemini' | 'claude' | 'codex' | 'all';
export type PermissionLevel = 'repo' | 'user' | 'none';

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

export async function promptPermissions(): Promise<PermissionLevel> {
  return await select<PermissionLevel>({
    message: 'Where should smithy permissions be deployed?',
    choices: [
      { name: 'Repo (.claude/settings.json)', value: 'repo', description: 'Checked into git — shared across worktrees and team members' },
      { name: 'User (~/.claude/settings.json)', value: 'user', description: 'Global per-user — not checked in, applies to all repos' },
      { name: 'None', value: 'none', description: 'Skip permissions setup' },
    ],
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

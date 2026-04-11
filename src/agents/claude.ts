import fs from 'fs';
import os from 'os';
import path from 'path';
import picocolors from 'picocolors';
import { getComposedTemplates, getTemplateFilesByCategory, stripFrontmatter } from '../templates.js';
import { flattenPermissions, claudeToolPermissions, denyPermissions, type LanguageToolchain } from '../permissions.js';
import { removeIfExists } from '../utils.js';
import type { PermissionLevel, DeployablePermissionLevel, DeployLocation } from '../interactive.js';

/**
 * Deploy Claude templates. Returns the list of deployed file paths (relative to baseDir).
 */
export async function deploy(targetDir: string, permissionLevel: PermissionLevel, location: DeployLocation = 'repo'): Promise<string[]> {
  const baseDir = location === 'user' ? os.homedir() : targetDir;
  const templates = await getComposedTemplates('claude');
  const deployedFiles: string[] = [];

  // Deploy commands -> .claude/commands/
  const commandsDir = path.join(baseDir, '.claude', 'commands');
  if (templates.commands.size > 0) {
    if (!fs.existsSync(commandsDir)) fs.mkdirSync(commandsDir, { recursive: true });
  }
  for (const [file, content] of templates.commands) {
    const dest = path.join(commandsDir, file);
    fs.writeFileSync(dest, stripFrontmatter(content));
    deployedFiles.push(path.relative(baseDir, dest));
  }
  console.log(picocolors.green(`\nDeployed Claude agent skills in ${path.join(baseDir, '.claude')}`));

  // Deploy prompts -> .claude/prompts/
  const promptsDir = path.join(baseDir, '.claude', 'prompts');
  if (templates.prompts.size > 0) {
    if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true });
  }
  for (const [file, content] of templates.prompts) {
    const dest = path.join(promptsDir, file);
    fs.writeFileSync(dest, stripFrontmatter(content));
    deployedFiles.push(path.relative(baseDir, dest));
  }

  // Deploy agents -> .claude/agents/ (keep frontmatter)
  const agentsDir = path.join(baseDir, '.claude', 'agents');
  if (templates.agents.size > 0) {
    if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });
  }
  for (const [file, content] of templates.agents) {
    const dest = path.join(agentsDir, file);
    fs.writeFileSync(dest, content);
    deployedFiles.push(path.relative(baseDir, dest));
  }

  // Deploy skills -> .claude/skills/<skillname>/SKILL.md + scripts/ subdirectory
  for (const [skillName, skill] of templates.skills) {
    const skillDir = path.join(baseDir, '.claude', 'skills', skillName);
    if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });

    // Write SKILL.md (frontmatter kept — Claude Code reads allowed-tools from it)
    const skillMd = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillMd, skill.prompt);
    deployedFiles.push(path.relative(baseDir, skillMd));

    // Copy scripts into scripts/ subdirectory as executable files
    if (skill.scripts.size > 0) {
      const scriptsDir = path.join(skillDir, 'scripts');
      if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
      for (const [filename, content] of skill.scripts) {
        const dest = path.join(scriptsDir, filename);
        fs.writeFileSync(dest, content, { mode: 0o755 });
        deployedFiles.push(path.relative(baseDir, dest));
      }
    }
  }

  if (permissionLevel !== 'none') {
    writePermissions(targetDir, permissionLevel);
  }

  return deployedFiles;
}

/**
 * Remove Claude artifacts by known template filenames (legacy cleanup, no manifest).
 */
export function removeLegacy(targetDir: string): number {
  let removedCount = 0;
  const categories = getTemplateFilesByCategory();
  for (const file of categories.commands) {
    if (removeIfExists(path.join(targetDir, '.claude', 'commands', file))) removedCount++;
  }
  for (const file of categories.prompts) {
    if (removeIfExists(path.join(targetDir, '.claude', 'prompts', file))) removedCount++;
  }
  for (const file of categories.agents) {
    if (removeIfExists(path.join(targetDir, '.claude', 'agents', file))) removedCount++;
  }
  for (const skillName of categories.skills) {
    const skillDir = path.join(targetDir, '.claude', 'skills', skillName);
    if (removeIfExists(skillDir)) removedCount++;
  }
  return removedCount;
}

/**
 * Build the Claude Code allow-list from the shared permissions.
 * Wraps each command in Bash(...) and appends Claude-specific tool permissions.
 */
export function buildClaudeAllowList(languages?: LanguageToolchain[]): string[] {
  const bashPermissions = flattenPermissions(languages).map(cmd => `Bash(${cmd})`);
  return [...bashPermissions, ...claudeToolPermissions];
}

/**
 * Build the Claude Code deny-list from the shared deny permissions.
 */
export function buildClaudeDenyList(): string[] {
  return denyPermissions.map(cmd => `Bash(${cmd})`);
}

/**
 * Resolve the settings file path based on the permission level.
 */
export function resolveSettingsPath(targetDir: string, level: DeployablePermissionLevel): string {
  if (level === 'user') {
    return path.join(os.homedir(), '.claude', 'settings.json');
  }
  return path.join(targetDir, '.claude', 'settings.json');
}

/**
 * Write permissions to the appropriate settings.json using Claude Code's schema.
 * Merges with existing settings.json if present.
 */
export function writePermissions(targetDir: string, level: DeployablePermissionLevel, languages?: LanguageToolchain[]): void {
  const settingsPath = resolveSettingsPath(targetDir, level);
  const settingsDir = path.dirname(settingsPath);
  if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });
  const allowList = buildClaudeAllowList(languages);
  const denyList = buildClaudeDenyList();

  let config: Record<string, unknown> = {
    permissions: { allow: allowList, deny: denyList },
  };

  if (fs.existsSync(settingsPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
      const existingPerms = existing['permissions'] as Record<string, unknown> | undefined;
      const existingAllow = (existingPerms?.['allow'] ?? []) as string[];
      const existingDeny = (existingPerms?.['deny'] ?? []) as string[];

      const mergedAllow = [...new Set([...existingAllow, ...allowList])];
      const mergedDeny = [...new Set([...existingDeny, ...denyList])];

      config = {
        ...existing,
        permissions: {
          ...(existingPerms ?? {}),
          allow: mergedAllow,
          deny: mergedDeny,
        },
      };
    } catch {
      config = { permissions: { allow: allowList, deny: denyList } };
    }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2));
  console.log(picocolors.blue(`  Added default permissions to ${settingsPath}`));
}

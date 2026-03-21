import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { getComposedTemplates, getBaseTemplateFiles, stripFrontmatter, isCommandTemplate } from '../templates.js';
import { flattenPermissions, claudeToolPermissions, denyPermissions } from '../permissions.js';
import { removeIfExists } from '../utils.js';

export function deploy(targetDir: string, initPermissions: boolean): void {
  const promptsDir = path.join(targetDir, '.claude', 'prompts');
  console.log(picocolors.green(`\nInitializing Claude prompts in ${promptsDir}...`));
  if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true });

  const commandsDir = path.join(targetDir, '.claude', 'commands');

  const templates = getComposedTemplates();

  for (const [file, content] of templates) {
    const stripped = stripFrontmatter(content);

    // Deploy to prompts/
    fs.writeFileSync(path.join(promptsDir, file), stripped);

    // Deploy command-flagged templates to commands/
    if (isCommandTemplate(content)) {
      if (!fs.existsSync(commandsDir)) fs.mkdirSync(commandsDir, { recursive: true });
      fs.writeFileSync(path.join(commandsDir, file), stripped);
    }
  }

  if (initPermissions) {
    writePermissions(targetDir);
  }
}

export function remove(targetDir: string): number {
  let removedCount = 0;

  for (const file of getBaseTemplateFiles()) {
    if (removeIfExists(path.join(targetDir, '.claude', 'prompts', file))) removedCount++;
    if (removeIfExists(path.join(targetDir, '.claude', 'commands', file))) removedCount++;
  }

  return removedCount;
}

/**
 * Build the Claude Code allow-list from the shared permissions.
 * Wraps each command in Bash(...) and appends Claude-specific tool permissions.
 */
export function buildClaudeAllowList(): string[] {
  const bashPermissions = flattenPermissions().map(cmd => `Bash(${cmd})`);
  return [...bashPermissions, ...claudeToolPermissions];
}

/**
 * Build the Claude Code deny-list from the shared deny permissions.
 */
export function buildClaudeDenyList(): string[] {
  return denyPermissions.map(cmd => `Bash(${cmd})`);
}

/**
 * Write permissions to .claude/settings.json using Claude Code's schema:
 *   { "permissions": { "allow": ["Bash(...)", "WebSearch", ...] } }
 *
 * Merges with existing settings.json if present.
 */
export function writePermissions(targetDir: string): void {
  const claudeBaseDir = path.join(targetDir, '.claude');
  if (!fs.existsSync(claudeBaseDir)) fs.mkdirSync(claudeBaseDir, { recursive: true });

  const settingsPath = path.join(claudeBaseDir, 'settings.json');
  const allowList = buildClaudeAllowList();
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

      // Merge: union of existing and new entries
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
      // If parse fails, overwrite with defaults
      config = { permissions: { allow: allowList, deny: denyList } };
    }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2));
  console.log(picocolors.blue(`  Added default permissions to ${settingsPath}`));
}

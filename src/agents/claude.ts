import fs from 'fs';
import os from 'os';
import path from 'path';
import picocolors from 'picocolors';
import { getComposedTemplates, getTemplateFilesByCategory, stripFrontmatter } from '../templates.js';
import { flattenPermissions, claudeToolPermissions, denyPermissions, type LanguageToolchain } from '../permissions.js';
import { hooksTemplateDir, removeIfExists } from '../utils.js';
import type { PermissionLevel, DeployablePermissionLevel, DeployLocation } from '../interactive.js';

/** Filename of the deployed Claude Code session-title hook script. */
export const SESSION_TITLE_HOOK_FILENAME = 'smithy-session-title.mjs';
/** Relative deploy path under the Claude base directory. */
export const SESSION_TITLE_HOOK_RELPATH = `.claude/hooks/${SESSION_TITLE_HOOK_FILENAME}`;
/** The shell command registered in settings.json to invoke the hook. */
export const SESSION_TITLE_HOOK_COMMAND =
  `node "$CLAUDE_PROJECT_DIR/.claude/hooks/${SESSION_TITLE_HOOK_FILENAME}"`;

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
        fs.writeFileSync(dest, content);
        fs.chmodSync(dest, 0o755);
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
 * Copy the session-title hook script into `<baseDir>/.claude/hooks/` and return
 * the relative path so the manifest can track it like any other artifact.
 */
export function deploySessionTitleHookScript(targetDir: string, location: DeployLocation = 'repo'): string {
  const baseDir = location === 'user' ? os.homedir() : targetDir;
  const hooksDir = path.join(baseDir, '.claude', 'hooks');
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
  const src = path.join(hooksTemplateDir, SESSION_TITLE_HOOK_FILENAME);
  const dest = path.join(hooksDir, SESSION_TITLE_HOOK_FILENAME);
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  return path.relative(baseDir, dest);
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

// ----- Session-title hook -----

interface HookCommand {
  type?: string;
  command?: string;
}

interface HookEntry {
  matcher?: string;
  hooks?: HookCommand[];
}

interface SettingsWithHooks {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

/**
 * Read settings.json (or return an empty object). Tolerant of malformed JSON —
 * mirrors the behavior of `writePermissions`.
 */
function readSettings(settingsPath: string): SettingsWithHooks {
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as SettingsWithHooks;
  } catch {
    return {};
  }
}

function isSessionTitleHookCommand(cmd: HookCommand | undefined): boolean {
  return !!cmd && typeof cmd.command === 'string' && cmd.command.includes(SESSION_TITLE_HOOK_FILENAME);
}

/**
 * Merge the smithy session-title UserPromptSubmit hook into settings.json.
 * Idempotent: a second call leaves the file unchanged.
 */
export function writeSessionTitleHook(targetDir: string, level: DeployablePermissionLevel): void {
  const settingsPath = resolveSettingsPath(targetDir, level);
  const settingsDir = path.dirname(settingsPath);
  if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });

  const settings = readSettings(settingsPath);
  const hooks = (settings.hooks ?? {}) as Record<string, HookEntry[]>;
  const ups = Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit : [];

  // Idempotent: bail if our hook command is already registered anywhere in UserPromptSubmit
  const alreadyRegistered = ups.some(entry =>
    Array.isArray(entry.hooks) && entry.hooks.some(isSessionTitleHookCommand),
  );

  if (!alreadyRegistered) {
    ups.push({
      hooks: [{ type: 'command', command: SESSION_TITLE_HOOK_COMMAND }],
    });
  }

  const next: SettingsWithHooks = {
    ...settings,
    hooks: { ...hooks, UserPromptSubmit: ups },
  };

  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2));
  if (!alreadyRegistered) {
    console.log(picocolors.blue(`  Added session-title hook to ${settingsPath}`));
  }
}

/**
 * Remove the smithy session-title UserPromptSubmit hook entry from settings.json.
 * Preserves any unrelated hooks. If settings.json ends up empty, deletes it.
 */
export function removeSessionTitleHook(targetDir: string, level: DeployablePermissionLevel): void {
  const settingsPath = resolveSettingsPath(targetDir, level);
  if (!fs.existsSync(settingsPath)) return;

  const settings = readSettings(settingsPath);
  const hooks = settings.hooks;
  if (!hooks || !Array.isArray(hooks.UserPromptSubmit)) {
    return;
  }

  const filteredEntries: HookEntry[] = [];
  for (const entry of hooks.UserPromptSubmit) {
    const cmds = Array.isArray(entry.hooks) ? entry.hooks.filter(c => !isSessionTitleHookCommand(c)) : [];
    if (cmds.length > 0) {
      filteredEntries.push({ ...entry, hooks: cmds });
    }
  }

  const nextHooks: Record<string, HookEntry[]> = { ...hooks };
  if (filteredEntries.length > 0) {
    nextHooks.UserPromptSubmit = filteredEntries;
  } else {
    delete nextHooks.UserPromptSubmit;
  }

  const next: SettingsWithHooks = { ...settings };
  if (Object.keys(nextHooks).length > 0) {
    next.hooks = nextHooks;
  } else {
    delete next.hooks;
  }

  // If nothing is left, remove the settings file entirely.
  if (Object.keys(next).length === 0) {
    removeIfExists(settingsPath);
    return;
  }

  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2));
}

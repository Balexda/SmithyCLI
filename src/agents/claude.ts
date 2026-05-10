import fs from 'fs';
import os from 'os';
import path from 'path';
import picocolors from 'picocolors';
import { getComposedTemplates, getTemplateFilesByCategory, stripFrontmatter } from '../templates.js';
import { flattenPermissions, claudeToolPermissions, askPermissions, denyPermissions, extraPermissions, type LanguageToolchain, type PlatformPackageManager } from '../permissions.js';
import { hooksTemplateDir, removeIfExists } from '../utils.js';
import { computeDrift, type DriftReport, type PermissionTriple } from '../drift.js';
import type { PermissionLevel, DeployablePermissionLevel, DeployLocation } from '../interactive.js';

/** Filename of the deployed Claude Code session-title hook script. */
export const SESSION_TITLE_HOOK_FILENAME = 'smithy-session-title.mjs';
/** Relative deploy path under the Claude base directory. */
export const SESSION_TITLE_HOOK_RELPATH = `.claude/hooks/${SESSION_TITLE_HOOK_FILENAME}`;
/**
 * The shell command registered in settings.json to invoke the hook.
 *
 * Wrapped in `[ -f ... ] && node ... || true` so the hook is a no-op when
 * `$CLAUDE_PROJECT_DIR` is unset/empty or the script is missing — without the
 * guard, `node "/.claude/hooks/..."` fails with `ERR_MODULE_NOT_FOUND` from
 * the cjs loader (issue #264). The trailing `|| true` keeps the hook from
 * exiting non-zero when `[ -f ]` is false.
 */
export const SESSION_TITLE_HOOK_COMMAND =
  `[ -f "$CLAUDE_PROJECT_DIR/.claude/hooks/${SESSION_TITLE_HOOK_FILENAME}" ] && node "$CLAUDE_PROJECT_DIR/.claude/hooks/${SESSION_TITLE_HOOK_FILENAME}" || true`;

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
 * `extraPermissions` is Claude-only and intentionally lives here rather than
 * inside `flattenPermissions()` so it doesn't leak into Gemini's allowlist.
 */
export function buildClaudeAllowList(
  languages?: LanguageToolchain[],
  platformManagers?: PlatformPackageManager[],
): string[] {
  const flat = [...flattenPermissions(languages, platformManagers), ...extraPermissions];
  const bashPermissions = flat.map(cmd => `Bash(${cmd})`);
  return [...bashPermissions, ...claudeToolPermissions];
}

/**
 * Build the Claude Code deny-list from the shared deny permissions.
 */
export function buildClaudeDenyList(): string[] {
  return denyPermissions.map(cmd => `Bash(${cmd})`);
}

/**
 * Build the Claude Code ask-list from the shared ask permissions. Claude Code
 * surfaces these as an explicit prompt even in auto mode.
 */
export function buildClaudeAskList(): string[] {
  return askPermissions.map(cmd => `Bash(${cmd})`);
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
export function writePermissions(
  targetDir: string,
  level: DeployablePermissionLevel,
  languages?: LanguageToolchain[],
  platformManagers?: PlatformPackageManager[],
): void {
  const settingsPath = resolveSettingsPath(targetDir, level);
  const settingsDir = path.dirname(settingsPath);
  if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });
  const allowList = buildClaudeAllowList(languages, platformManagers);
  const askList = buildClaudeAskList();
  const denyList = buildClaudeDenyList();

  let config: Record<string, unknown> = {
    permissions: { allow: allowList, ask: askList, deny: denyList },
  };

  if (fs.existsSync(settingsPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
      const existingPerms = existing['permissions'] as Record<string, unknown> | undefined;
      const existingAllow = (existingPerms?.['allow'] ?? []) as string[];
      const existingAsk = (existingPerms?.['ask'] ?? []) as string[];
      const existingDeny = (existingPerms?.['deny'] ?? []) as string[];

      const mergedAllow = [...new Set([...existingAllow, ...allowList])];
      const mergedAsk = [...new Set([...existingAsk, ...askList])];
      const mergedDeny = [...new Set([...existingDeny, ...denyList])];

      config = {
        ...existing,
        permissions: {
          ...(existingPerms ?? {}),
          allow: mergedAllow,
          ask: mergedAsk,
          deny: mergedDeny,
        },
      };
    } catch {
      config = { permissions: { allow: allowList, ask: askList, deny: denyList } };
    }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2));
  console.log(picocolors.blue(`  Added default permissions to ${settingsPath}`));
}

/**
 * Replace the `allow`/`ask`/`deny` lists in Claude's settings.json with the
 * canonical Smithy baseline, dropping any user customizations or stale entries
 * left over from previous Smithy versions.
 *
 * Unlike {@link writePermissions}, this does NOT merge — it overwrites the
 * three permission arrays. Other top-level keys (e.g. `model`, `hooks`) and
 * any other keys inside `permissions` (e.g. `defaultMode`) are preserved, so
 * an unrelated config survives the reset.
 *
 * Used by `smithy update --reset-permissions` to clear accumulated drift after
 * a Smithy version that relocated entries between categories.
 */
export function resetPermissions(
  targetDir: string,
  level: DeployablePermissionLevel,
  languages?: LanguageToolchain[],
  platformManagers?: PlatformPackageManager[],
): void {
  const settingsPath = resolveSettingsPath(targetDir, level);
  const settingsDir = path.dirname(settingsPath);
  if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });
  const allowList = buildClaudeAllowList(languages, platformManagers);
  const askList = buildClaudeAskList();
  const denyList = buildClaudeDenyList();

  let config: Record<string, unknown> = {
    permissions: { allow: allowList, ask: askList, deny: denyList },
  };

  if (fs.existsSync(settingsPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
      const rawPerms = existing['permissions'];
      const existingPerms: Record<string, unknown> =
        typeof rawPerms === 'object' && rawPerms !== null && !Array.isArray(rawPerms)
          ? (rawPerms as Record<string, unknown>)
          : {};
      const { allow: _a, ask: _k, deny: _d, ...preservedPerms } = existingPerms;
      void _a; void _k; void _d;
      config = {
        ...existing,
        permissions: {
          ...preservedPerms,
          allow: allowList,
          ask: askList,
          deny: denyList,
        },
      };
    } catch {
      config = { permissions: { allow: allowList, ask: askList, deny: denyList } };
    }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2));
  console.log(picocolors.blue(`  Reset permissions to Smithy baseline in ${settingsPath}`));
}

/**
 * Inspect a Claude settings.json for drift against the canonical Smithy
 * permission lists. Returns `null` if the file does not exist or cannot be
 * parsed (no drift to report on something we can't read). Otherwise returns
 * a {@link DriftReport} the caller can format and surface to the user.
 *
 * Call this *before* `writePermissions` so the comparison sees the user's
 * pre-merge state — once the merge runs, every customization would look like
 * drift in the new file.
 */
export function analyzeSettingsDrift(
  targetDir: string,
  level: DeployablePermissionLevel,
  languages?: LanguageToolchain[],
  platformManagers?: PlatformPackageManager[],
): DriftReport | null {
  const settingsPath = resolveSettingsPath(targetDir, level);
  if (!fs.existsSync(settingsPath)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return null;
  }
  const perms = (raw as { permissions?: Record<string, unknown> })?.permissions;
  const existing: PermissionTriple = {
    allow: Array.isArray(perms?.allow) ? (perms!.allow as string[]) : [],
    ask: Array.isArray(perms?.ask) ? (perms!.ask as string[]) : [],
    deny: Array.isArray(perms?.deny) ? (perms!.deny as string[]) : [],
  };

  const canonical: PermissionTriple = {
    allow: buildClaudeAllowList(languages, platformManagers),
    ask: buildClaudeAskList(),
    deny: buildClaudeDenyList(),
  };

  return computeDrift(existing, canonical);
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
 *
 * Idempotent on a clean settings.json AND heals stale registrations: any entry
 * whose command references our hook filename but differs from the current
 * `SESSION_TITLE_HOOK_COMMAND` is rewritten in place. This is what migrates an
 * existing user from the old unguarded `node "$CLAUDE_PROJECT_DIR/..."` form to
 * the wrapped form on `smithy update` (issue #264 fix).
 */
export function writeSessionTitleHook(targetDir: string, level: DeployablePermissionLevel): void {
  const settingsPath = resolveSettingsPath(targetDir, level);
  const settingsDir = path.dirname(settingsPath);
  if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });

  const settings = readSettings(settingsPath);
  const hooks = (settings.hooks ?? {}) as Record<string, HookEntry[]>;
  const ups = Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit : [];

  let foundMatching = false;
  let healed = false;
  for (const entry of ups) {
    if (!Array.isArray(entry.hooks)) continue;
    for (const cmd of entry.hooks) {
      if (!isSessionTitleHookCommand(cmd)) continue;
      foundMatching = true;
      if (cmd.command !== SESSION_TITLE_HOOK_COMMAND) {
        cmd.command = SESSION_TITLE_HOOK_COMMAND;
        healed = true;
      }
    }
  }

  if (!foundMatching) {
    ups.push({
      hooks: [{ type: 'command', command: SESSION_TITLE_HOOK_COMMAND }],
    });
  }

  const next: SettingsWithHooks = {
    ...settings,
    hooks: { ...hooks, UserPromptSubmit: ups },
  };

  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2));
  if (!foundMatching) {
    console.log(picocolors.blue(`  Added session-title hook to ${settingsPath}`));
  } else if (healed) {
    console.log(picocolors.blue(`  Updated session-title hook command in ${settingsPath}`));
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

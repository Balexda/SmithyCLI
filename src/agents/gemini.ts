import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { getComposedTemplates, parseFrontmatterName } from '../templates.js';
import { flattenPermissions, type LanguageToolchain, type PlatformPackageManager } from '../permissions.js';
import { removeIfExists } from '../utils.js';

/**
 * Deploy Gemini templates. Returns the list of deployed file paths (relative to targetDir).
 */
export async function deploy(
  targetDir: string,
  initPermissions: boolean,
  languages?: LanguageToolchain[],
  platformManagers?: PlatformPackageManager[],
  artifactsRoot: string = '',
): Promise<string[]> {
  const destDir = path.join(targetDir, '.gemini');
  const skillsDir = path.join(destDir, 'skills');
  console.log(picocolors.green(`\nInitializing Gemini CLI workspace skills in ${skillsDir}...`));

  const templates = await getComposedTemplates('gemini', artifactsRoot);
  const deployedFiles: string[] = [];

  // Deploy commands and prompts as skills (skip agents — they are sub-agents, not invocable)
  const deployAsSkill = (content: string, name?: string) => {
    const skillName = name ?? parseFrontmatterName(content);
    if (!skillName) return;
    const skillPath = path.join(skillsDir, skillName);
    if (!fs.existsSync(skillPath)) fs.mkdirSync(skillPath, { recursive: true });
    const dest = path.join(skillPath, 'SKILL.md');
    fs.writeFileSync(dest, content);
    deployedFiles.push(path.relative(targetDir, dest));
    return skillPath;
  };

  for (const [, content] of templates.commands) deployAsSkill(content);
  for (const [, content] of templates.prompts) deployAsSkill(content);

  // Deploy all skills. Skills with scripts are no longer skipped; Gemini
  // instructions (rendered via {{#ifAgent 'gemini'}}) can choose whether
  // to invoke them via run_shell_command or use native tools.
  for (const [skillName, skill] of templates.skills) {
    const skillPath = deployAsSkill(skill.prompt, skillName);
    if (skillPath && skill.scripts.size > 0) {
      const scriptsDir = path.join(skillPath, 'scripts');
      if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
      for (const [filename, content] of skill.scripts) {
        const dest = path.join(scriptsDir, filename);
        fs.writeFileSync(dest, content);
        fs.chmodSync(dest, 0o755);
        deployedFiles.push(path.relative(targetDir, dest));
      }
    }
  }

  if (initPermissions) {
    writePermissions(destDir, languages, platformManagers);
  }

  return deployedFiles;
}

/**
 * Remove Gemini artifacts by scanning for smithy-prefixed skill dirs (legacy cleanup, no manifest).
 */
export function removeLegacy(targetDir: string): number {
  let removedCount = 0;
  const skillsDir = path.join(targetDir, '.gemini', 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir)) {
      if (entry.startsWith('smithy-')) {
        const entryPath = path.join(skillsDir, entry);
        if (fs.statSync(entryPath).isDirectory() && fs.existsSync(path.join(entryPath, 'SKILL.md'))) {
          if (removeIfExists(entryPath)) removedCount++;
        }
      }
    }
  }
  return removedCount;
}

/**
 * Build Gemini's allowed tool list from the shared permissions.
 * Wraps each flattened command in run_shell_command(...) format.
 */
export function buildGeminiAllowList(
  languages?: LanguageToolchain[],
  platformManagers?: PlatformPackageManager[],
): string[] {
  return flattenPermissions(languages, platformManagers).map(cmd => `run_shell_command(${cmd})`);
}

function writePermissions(
  destDir: string,
  languages?: LanguageToolchain[],
  platformManagers?: PlatformPackageManager[],
): void {
  const settingsPath = path.join(destDir, 'settings.json');
  const allowList = buildGeminiAllowList(languages, platformManagers);

  type GeminiSettings = { tools?: { allowed?: string[]; [k: string]: unknown }; [k: string]: unknown };

  let config: GeminiSettings = {
    tools: { allowed: allowList },
  };

  if (fs.existsSync(settingsPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as GeminiSettings;
      const existingAllowed = existing.tools?.allowed ?? [];
      const merged = [...new Set([...existingAllowed, ...allowList])];
      config = {
        ...existing,
        tools: { ...(existing.tools ?? {}), allowed: merged },
      };
    } catch {
      config = { tools: { allowed: allowList } };
    }
  }

  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2));
  console.log(picocolors.blue(`  Added default permissions to ${settingsPath}`));
}

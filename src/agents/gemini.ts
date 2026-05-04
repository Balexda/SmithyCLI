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
): Promise<string[]> {
  const destDir = path.join(targetDir, '.gemini');
  const skillsDir = path.join(destDir, 'skills');
  console.log(picocolors.green(`\nInitializing Gemini CLI workspace skills in ${skillsDir}...`));

  const templates = await getComposedTemplates();
  const deployedFiles: string[] = [];

  // Deploy commands and prompts as skills (skip agents — they are sub-agents, not invocable)
  const deployAsSkill = (content: string) => {
    const name = parseFrontmatterName(content);
    if (!name) return;
    const skillPath = path.join(skillsDir, name);
    if (!fs.existsSync(skillPath)) fs.mkdirSync(skillPath, { recursive: true });
    const dest = path.join(skillPath, 'SKILL.md');
    fs.writeFileSync(dest, content);
    deployedFiles.push(path.relative(targetDir, dest));
  };

  for (const [, content] of templates.commands) deployAsSkill(content);
  for (const [, content] of templates.prompts) deployAsSkill(content);

  // Skills (`.claude/skills/<name>/SKILL.md` for Claude) are also surfaced to
  // Gemini as plain skills, but only when the skill is portable — i.e. it
  // ships no `scripts/` directory. Skills with bundled scripts reference
  // them through Claude's `${CLAUDE_SKILL_DIR}` env var (and pre-allow them
  // through `allowed-tools` patterns), neither of which exists on Gemini;
  // mirroring just `SKILL.md` would leave the Gemini-side skill instructing
  // the agent to invoke scripts that aren't there. Skip those entirely
  // until cross-agent script mirroring is designed.
  for (const [, skill] of templates.skills) {
    if (skill.scripts.size > 0) continue;
    deployAsSkill(skill.prompt);
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

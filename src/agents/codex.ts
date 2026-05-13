import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { getComposedTemplates, getTemplateFilesByCategory, stripFrontmatter, parseFrontmatterName } from '../templates.js';
import { permissions } from '../permissions.js';
import { removeIfExists } from '../utils.js';

/**
 * Deploy Codex templates. Returns the list of deployed file paths (relative to targetDir).
 */
export async function deploy(targetDir: string, initPermissions: boolean): Promise<string[]> {
  const templates = await getComposedTemplates('codex');
  const deployedFiles: string[] = [];

  // Deploy prompts -> tools/codex/prompts/
  const promptsDir = path.join(targetDir, 'tools', 'codex', 'prompts');
  if (templates.prompts.size > 0) {
    if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true });
  }
  console.log(picocolors.green(`\nInitializing Codex prompts in ${promptsDir}...`));
  for (const [file, content] of templates.prompts) {
    const dest = path.join(promptsDir, file);
    fs.writeFileSync(dest, stripFrontmatter(content));
    deployedFiles.push(path.relative(targetDir, dest));
  }

  // Deploy commands, reference prompts, and operational skills as Codex skills.
  const skillsDir = path.join(targetDir, '.agents', 'skills');
  const deployAsSkill = (content: string, name?: string): string | undefined => {
    const skillName = name ?? parseFrontmatterName(content);
    if (!skillName) return undefined;
    const skillPath = path.join(skillsDir, skillName);
    if (!fs.existsSync(skillPath)) fs.mkdirSync(skillPath, { recursive: true });
    const dest = path.join(skillPath, 'SKILL.md');
    fs.writeFileSync(dest, content);
    deployedFiles.push(path.relative(targetDir, dest));
    return skillPath;
  };

  for (const [, content] of templates.commands) deployAsSkill(content);
  for (const [, content] of templates.prompts) deployAsSkill(content);

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
    writePermissions(targetDir);
  }

  return deployedFiles;
}

/**
 * Remove Codex artifacts by known filenames and scanning for smithy-prefixed skill dirs
 * (legacy cleanup, no manifest).
 */
export function removeLegacy(targetDir: string): number {
  let removedCount = 0;
  const categories = getTemplateFilesByCategory();
  for (const file of categories.prompts) {
    if (removeIfExists(path.join(targetDir, 'tools', 'codex', 'prompts', file))) removedCount++;
  }

  const skillsDir = path.join(targetDir, '.agents', 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir)) {
      if (entry.startsWith('smithy-') || entry.startsWith('smithy.')) {
        const entryPath = path.join(skillsDir, entry);
        if (fs.statSync(entryPath).isDirectory() && fs.existsSync(path.join(entryPath, 'SKILL.md'))) {
          if (removeIfExists(entryPath)) removedCount++;
        }
      }
    }
  }

  return removedCount;
}

function writePermissions(targetDir: string): void {
  const codexBaseDir = path.join(targetDir, '.codex');
  if (!fs.existsSync(codexBaseDir)) fs.mkdirSync(codexBaseDir, { recursive: true });

  const configPath = path.join(codexBaseDir, 'config.toml');

  let tomlContent = `[approvals]\npolicy = "auto"\n\n`;

  for (const [cmd, value] of Object.entries(permissions)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        tomlContent += `[[approvals.rules]]\ncommand = "${cmd}"\nargs = []\n\n`;
      } else if (value.includes('*')) {
        tomlContent += `[[approvals.rules]]\ncommand = "${cmd}"\nargs_startswith = []\n\n`;
      } else {
        const hasWildcard = value.some(arg => arg.includes('*'));
        if (hasWildcard) {
          const cleanArgs = value.map(arg => arg.replace('*', '')).filter(arg => arg !== '');
          tomlContent += `[[approvals.rules]]\ncommand = "${cmd}"\nargs_startswith = ${JSON.stringify(cleanArgs)}\n\n`;
        } else {
          tomlContent += `[[approvals.rules]]\ncommand = "${cmd}"\nargs = ${JSON.stringify(value)}\n\n`;
        }
      }
    } else {
      for (const [sub, args] of Object.entries(value)) {
        const subParts = sub.split(' ');
        const fullArgs = [...subParts, ...args];
        const hasWildcard = fullArgs.some(arg => arg.includes('*'));

        if (hasWildcard) {
          const cleanArgs = fullArgs.map(arg => arg.replace('*', '')).filter(arg => arg !== '');
          tomlContent += `[[approvals.rules]]\ncommand = "${cmd}"\nargs_startswith = ${JSON.stringify(cleanArgs)}\n\n`;
        } else {
          tomlContent += `[[approvals.rules]]\ncommand = "${cmd}"\nargs = ${JSON.stringify(fullArgs)}\n\n`;
        }
      }
    }
  }

  if (!fs.existsSync(configPath) || !fs.readFileSync(configPath, 'utf8').includes('[approvals]')) {
    fs.appendFileSync(configPath, (fs.existsSync(configPath) ? '\n' : '') + tomlContent);
    console.log(picocolors.blue(`  Added default permissions to ${configPath}`));
  }
}

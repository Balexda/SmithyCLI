import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { getComposedTemplates, getTemplateFilesByCategory, stripFrontmatter, parseFrontmatterName } from '../templates.js';
import { permissions } from '../permissions.js';
import { removeIfExists } from '../utils.js';

/**
 * Deploy Codex templates. Returns the list of deployed file paths (relative to targetDir).
 */
export function deploy(targetDir: string, initPermissions: boolean): string[] {
  const templates = getComposedTemplates();
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

  // Deploy commands as Codex skills -> .agents/skills/<name>/SKILL.md
  const skillsDir = path.join(targetDir, '.agents', 'skills');
  for (const [, content] of templates.commands) {
    const name = parseFrontmatterName(content);
    if (name) {
      const skillPath = path.join(skillsDir, name);
      if (!fs.existsSync(skillPath)) fs.mkdirSync(skillPath, { recursive: true });
      const dest = path.join(skillPath, 'SKILL.md');
      fs.writeFileSync(dest, content);
      deployedFiles.push(path.relative(targetDir, dest));
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

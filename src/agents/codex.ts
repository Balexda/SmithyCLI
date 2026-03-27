import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { getComposedTemplates, getBaseTemplateFiles, stripFrontmatter, isCommandTemplate, parseFrontmatterName, readTemplate } from '../templates.js';
import { permissions } from '../permissions.js';
import { removeIfExists, removeStaleSmithyArtifacts } from '../utils.js';

export function deploy(targetDir: string, initPermissions: boolean): void {
  const promptsDir = path.join(targetDir, 'tools', 'codex', 'prompts');
  const skillsDir = path.join(targetDir, '.agents', 'skills');
  console.log(picocolors.green(`\nInitializing Codex prompts in ${promptsDir}...`));
  if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true });

  const templates = getComposedTemplates();
  const promptFilenames = new Set<string>();
  const skillNames = new Set<string>();

  for (const [file, content] of templates) {
    promptFilenames.add(file);
    const stripped = stripFrontmatter(content);

    // Deploy to prompts/
    fs.writeFileSync(path.join(promptsDir, file), stripped);

    // Deploy command-flagged templates as Codex skills (.agents/skills/<name>/SKILL.md)
    if (isCommandTemplate(content)) {
      const name = parseFrontmatterName(content);
      if (name) {
        skillNames.add(name);
        const skillPath = path.join(skillsDir, name);
        if (!fs.existsSync(skillPath)) fs.mkdirSync(skillPath, { recursive: true });
        fs.writeFileSync(path.join(skillPath, 'SKILL.md'), content);
      }
    }
  }

  // Remove stale .md artifacts from renamed/deleted templates
  const isMdFile = (p: string) => p.endsWith('.md') && fs.statSync(p).isFile();
  removeStaleSmithyArtifacts(promptsDir, 'smithy.', promptFilenames, isMdFile);

  // Remove stale skill directories from renamed/deleted templates
  const isCodexSkill = (p: string) =>
    fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'SKILL.md'));
  removeStaleSmithyArtifacts(skillsDir, 'smithy-', skillNames, isCodexSkill);

  if (initPermissions) {
    writePermissions(targetDir);
  }
}

export function remove(targetDir: string): number {
  let removedCount = 0;
  const skillsDir = path.join(targetDir, '.agents', 'skills');

  for (const file of getBaseTemplateFiles()) {
    if (removeIfExists(path.join(targetDir, 'tools', 'codex', 'prompts', file))) removedCount++;

    // Remove corresponding skill directory
    const content = readTemplate(file);
    const name = parseFrontmatterName(content);
    if (name) {
      if (removeIfExists(path.join(skillsDir, name))) removedCount++;
    }
  }

  // Remove stale .md artifacts from renamed/deleted templates
  const isMdFile = (p: string) => p.endsWith('.md') && fs.statSync(p).isFile();
  removedCount += removeStaleSmithyArtifacts(path.join(targetDir, 'tools', 'codex', 'prompts'), 'smithy.', new Set(), isMdFile);

  // Remove stale skill directories
  const isCodexSkill = (p: string) =>
    fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'SKILL.md'));
  removedCount += removeStaleSmithyArtifacts(skillsDir, 'smithy-', new Set(), isCodexSkill);

  return removedCount;
}

function writePermissions(targetDir: string): void {
  const codexBaseDir = path.join(targetDir, '.codex');
  if (!fs.existsSync(codexBaseDir)) fs.mkdirSync(codexBaseDir, { recursive: true });

  const configPath = path.join(codexBaseDir, 'config.toml');

  let tomlContent = `[approvals]\npolicy = "auto"\n\n`;

  for (const [cmd, value] of Object.entries(permissions)) {
    if (Array.isArray(value)) {
      // Simple command like cp ["*"]
      if (value.length === 0) {
        tomlContent += `[[approvals.rules]]\ncommand = "${cmd}"\nargs = []\n\n`;
      } else if (value.includes('*')) {
        // Bare "*" = allow any arguments; flag variants are subsumed
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
      // Nested subcommands
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

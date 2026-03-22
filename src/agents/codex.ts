import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { getComposedTemplates, getBaseTemplateFiles, stripFrontmatter } from '../templates.js';
import { permissions } from '../permissions.js';
import { removeIfExists } from '../utils.js';

export function deploy(targetDir: string, initPermissions: boolean): void {
  const destDir = path.join(targetDir, 'tools', 'codex', 'prompts');
  console.log(picocolors.green(`\nInitializing Codex prompts in ${destDir}...`));
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const templates = getComposedTemplates();

  for (const [file, content] of templates) {
    const stripped = stripFrontmatter(content);
    fs.writeFileSync(path.join(destDir, file), stripped);
  }

  if (initPermissions) {
    writePermissions(targetDir);
  }
}

export function remove(targetDir: string): number {
  let removedCount = 0;

  for (const file of getBaseTemplateFiles()) {
    if (removeIfExists(path.join(targetDir, 'tools', 'codex', 'prompts', file))) removedCount++;
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
      // Simple command like cp ["*"]
      if (value.length === 0) {
        tomlContent += `[[approvals.rules]]\ncommand = "${cmd}"\nargs = []\n\n`;
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

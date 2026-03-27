import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { getComposedTemplates, getBaseTemplateFiles, stripFrontmatter, isCommandTemplate } from '../templates.js';
import { permissions } from '../permissions.js';
import { removeIfExists, removeStaleSmithyArtifacts } from '../utils.js';

export function deploy(targetDir: string, initPermissions: boolean): void {
  const promptsDir = path.join(targetDir, 'tools', 'codex', 'prompts');
  console.log(picocolors.green(`\nInitializing Codex prompts in ${promptsDir}...`));
  if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true });

  const commandsDir = path.join(targetDir, 'tools', 'codex', 'commands');

  const templates = getComposedTemplates();
  const allFilenames = new Set<string>();
  const commandFilenames = new Set<string>();

  for (const [file, content] of templates) {
    allFilenames.add(file);
    const stripped = stripFrontmatter(content);

    // Deploy to prompts/
    fs.writeFileSync(path.join(promptsDir, file), stripped);

    // Deploy command-flagged templates to commands/
    if (isCommandTemplate(content)) {
      commandFilenames.add(file);
      if (!fs.existsSync(commandsDir)) fs.mkdirSync(commandsDir, { recursive: true });
      fs.writeFileSync(path.join(commandsDir, file), stripped);
    }
  }

  // Remove stale .md artifacts from renamed/deleted templates
  const isMdFile = (p: string) => p.endsWith('.md') && fs.statSync(p).isFile();
  removeStaleSmithyArtifacts(promptsDir, 'smithy.', allFilenames, isMdFile);
  removeStaleSmithyArtifacts(commandsDir, 'smithy.', commandFilenames, isMdFile);

  if (initPermissions) {
    writePermissions(targetDir);
  }
}

export function remove(targetDir: string): number {
  let removedCount = 0;

  for (const file of getBaseTemplateFiles()) {
    if (removeIfExists(path.join(targetDir, 'tools', 'codex', 'prompts', file))) removedCount++;
    if (removeIfExists(path.join(targetDir, 'tools', 'codex', 'commands', file))) removedCount++;
  }

  // Remove stale .md artifacts from renamed/deleted templates
  const isMdFile = (p: string) => p.endsWith('.md') && fs.statSync(p).isFile();
  removedCount += removeStaleSmithyArtifacts(path.join(targetDir, 'tools', 'codex', 'prompts'), 'smithy.', new Set(), isMdFile);
  removedCount += removeStaleSmithyArtifacts(path.join(targetDir, 'tools', 'codex', 'commands'), 'smithy.', new Set(), isMdFile);

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

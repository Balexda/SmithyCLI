import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { getBaseTemplateFiles, readTemplate, stripFrontmatter, isCommandTemplate } from '../templates.js';
import { flattenPermissions } from '../permissions.js';
import { removeIfExists } from '../utils.js';

export function deploy(targetDir: string, initPermissions: boolean): void {
  const promptsDir = path.join(targetDir, '.claude', 'prompts');
  console.log(picocolors.green(`\nInitializing Claude prompts in ${promptsDir}...`));
  if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true });

  const commandsDir = path.join(targetDir, '.claude', 'commands');

  for (const file of getBaseTemplateFiles()) {
    const content = readTemplate(file);
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

function writePermissions(targetDir: string): void {
  const claudeBaseDir = path.join(targetDir, '.claude');
  if (!fs.existsSync(claudeBaseDir)) fs.mkdirSync(claudeBaseDir, { recursive: true });

  const configPath = path.join(claudeBaseDir, 'config.json');
  const config = { permissions: { allowed_commands: flattenPermissions() } };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(picocolors.blue(`  Added default permissions to ${configPath}`));
}

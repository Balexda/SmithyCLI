import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { getComposedTemplates, getBaseTemplateFiles, readTemplate, parseFrontmatterName, isAgentTemplate } from '../templates.js';
import { flattenPermissions } from '../permissions.js';
import { removeIfExists, removeStaleSmithyArtifacts } from '../utils.js';

export function deploy(targetDir: string, initPermissions: boolean): void {
  const destDir = path.join(targetDir, '.gemini');
  const skillsDir = path.join(destDir, 'skills');
  console.log(picocolors.green(`\nInitializing Gemini CLI workspace skills in ${skillsDir}...`));

  const templates = getComposedTemplates();
  const currentNames = new Set<string>();

  for (const [, content] of templates) {
    // Skip agent-only templates — they are sub-agents, not invocable skills
    if (isAgentTemplate(content)) continue;

    const name = parseFrontmatterName(content);
    if (name) {
      currentNames.add(name);
      const skillPath = path.join(skillsDir, name);
      if (!fs.existsSync(skillPath)) fs.mkdirSync(skillPath, { recursive: true });
      fs.writeFileSync(path.join(skillPath, 'SKILL.md'), content);
    }
  }

  // Only remove dirs that look like Smithy-deployed skills (contain SKILL.md)
  const isGeminiSkill = (p: string) =>
    fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'SKILL.md'));
  removeStaleSmithyArtifacts(skillsDir, 'smithy-', currentNames, isGeminiSkill);

  if (initPermissions) {
    writePermissions(destDir);
  }
}

export function remove(targetDir: string): number {
  let removedCount = 0;
  const skillsDir = path.join(targetDir, '.gemini', 'skills');

  for (const file of getBaseTemplateFiles()) {
    const content = readTemplate(file);
    const name = parseFrontmatterName(content);
    if (name) {
      if (removeIfExists(path.join(skillsDir, name))) removedCount++;
    }
  }

  // Remove any stale smithy skills from renamed/deleted templates
  const isGeminiSkill = (p: string) =>
    fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'SKILL.md'));
  removedCount += removeStaleSmithyArtifacts(skillsDir, 'smithy-', new Set(), isGeminiSkill);

  return removedCount;
}

function writePermissions(destDir: string): void {
  const configPath = path.join(destDir, 'config.json');
  const permissionsList = flattenPermissions();

  let config: { permissions?: { allowed_commands?: string[] } } = {
    permissions: { allowed_commands: permissionsList },
  };

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!config.permissions) config.permissions = { allowed_commands: [] };
      if (!config.permissions.allowed_commands) config.permissions.allowed_commands = [];
      config.permissions.allowed_commands = [
        ...new Set([...config.permissions.allowed_commands, ...permissionsList]),
      ];
    } catch {
      // If parse fails, overwrite with defaults
      config = { permissions: { allowed_commands: permissionsList } };
    }
  }

  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(picocolors.blue(`  Added default permissions to ${configPath}`));
}

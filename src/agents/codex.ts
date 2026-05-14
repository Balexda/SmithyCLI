import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { getComposedTemplates, getTemplateFilesByCategory, stripFrontmatter, parseFrontmatterName } from '../templates.js';
import { permissions } from '../permissions.js';
import { removeIfExists } from '../utils.js';

const SMITHY_CODEX_RULES_BEGIN = '# BEGIN SMITHY CODEX RULES';
const SMITHY_CODEX_RULES_END = '# END SMITHY CODEX RULES';

const SMITHY_SKILL_SCRIPT_RULES = [
  './.agents/skills/smithy.pr-review/scripts/find-pr.sh',
  './.agents/skills/smithy.pr-review/scripts/get-comments.sh',
  './.agents/skills/smithy.pr-review/scripts/reply-comment.sh',
  './.agents/skills/smithy.gh-issue/scripts/check-env.sh',
  './.agents/skills/smithy.gh-issue/scripts/search-issues.sh',
  './.agents/skills/smithy.gh-issue/scripts/create-issue.sh',
  './.agents/skills/smithy.gh-issue/scripts/link-blocked-by.sh',
];

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
  const rulesDir = path.join(targetDir, '.codex', 'rules');
  if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });

  const rulesPath = path.join(rulesDir, 'default.rules');
  const rulesBlock = [
    SMITHY_CODEX_RULES_BEGIN,
    ...buildCodexRules().map(formatPrefixRule),
    SMITHY_CODEX_RULES_END,
    '',
  ].join('\n');

  const existing = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf8') : '';
  const next = upsertManagedRulesBlock(existing, rulesBlock);

  fs.writeFileSync(rulesPath, next);
  console.log(picocolors.blue(`  Added default permissions to ${rulesPath}`));
}

function buildCodexRules(): string[][] {
  const patterns = SMITHY_SKILL_SCRIPT_RULES.map(script => [script]);

  for (const [cmd, value] of Object.entries(permissions)) {
    if (Array.isArray(value)) {
      if (value.length === 0) patterns.push([cmd]);
      for (const arg of value) patterns.push(buildPrefixPattern(cmd, arg));
    } else {
      for (const [sub, args] of Object.entries(value)) {
        if (args.length === 0) patterns.push(buildPrefixPattern(cmd, sub));
        for (const arg of args) patterns.push(buildPrefixPattern(cmd, sub, arg));
      }
    }
  }

  const seen = new Set<string>();
  return patterns.filter(pattern => {
    const key = JSON.stringify(pattern);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildPrefixPattern(command: string, ...parts: string[]): string[] {
  const tokens = [command];

  for (const part of parts) {
    for (const token of part.split(/\s+/)) {
      const cleanToken = token.trim().replace(/\*+$/, '');
      if (cleanToken && cleanToken !== '*') tokens.push(cleanToken);
    }
  }

  return tokens;
}

function formatPrefixRule(pattern: string[]): string {
  return `prefix_rule(pattern=${JSON.stringify(pattern)}, decision="allow")`;
}

function upsertManagedRulesBlock(existing: string, rulesBlock: string): string {
  const managedBlockPattern = new RegExp(
    `${escapeRegExp(SMITHY_CODEX_RULES_BEGIN)}[\\s\\S]*?${escapeRegExp(SMITHY_CODEX_RULES_END)}\\n?`
  );

  if (managedBlockPattern.test(existing)) {
    return existing.replace(managedBlockPattern, rulesBlock);
  }

  if (!existing.trim()) return rulesBlock;

  return `${existing.replace(/\s*$/, '')}\n\n${rulesBlock}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

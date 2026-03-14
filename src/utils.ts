import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const templatesBaseDir = path.join(__dirname, '../src/templates');
export const basePromptsDir = path.join(templatesBaseDir, 'base');
export const issueTemplatesSrcDir = path.join(templatesBaseDir, 'issue-templates');

export function copyDirSync(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export const agentGitignoreEntries: Record<string, string[]> = {
  claude: ['.claude/'],
  gemini: ['.gemini/'],
  codex: ['.codex/', 'tools/codex/'],
};

/**
 * Add entries to .gitignore in targetDir, deduplicating against existing lines.
 * Returns the count of entries actually added.
 */
export function addToGitignore(targetDir: string, entries: string[]): number {
  const gitignorePath = path.join(targetDir, '.gitignore');

  let existing = '';
  if (fs.existsSync(gitignorePath)) {
    existing = fs.readFileSync(gitignorePath, 'utf8');
  }

  const existingLines = new Set(existing.split('\n').map(l => l.trim()));
  const toAdd = entries.filter(e => !existingLines.has(e));

  if (toAdd.length === 0) return 0;

  const hasHeader = existingLines.has('# Smithy agent directories');
  const header = hasHeader ? '' : '# Smithy agent directories\n';
  const separator = existing.length > 0 ? (existing.endsWith('\n') ? '\n' : '\n\n') : '';
  fs.writeFileSync(gitignorePath, existing + separator + header + toAdd.join('\n') + '\n');

  return toAdd.length;
}

export function removeIfExists(p: string): boolean {
  if (fs.existsSync(p)) {
    const stats = fs.statSync(p);
    if (stats.isDirectory()) {
      fs.rmSync(p, { recursive: true, force: true });
    } else {
      fs.unlinkSync(p);
    }
    return true;
  }
  return false;
}

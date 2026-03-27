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

/**
 * Scans `dir` for entries matching `prefix` and removes any not in `currentNames`.
 * Used to clean up stale artifacts after template renames.
 *
 * An optional `isArtifact` predicate gates removal: only entries for which it
 * returns true are considered Smithy-deployed artifacts. This prevents
 * accidental deletion of user-created files/dirs that happen to share the prefix.
 */
export function removeStaleSmithyArtifacts(
  dir: string,
  prefix: string,
  currentNames: Set<string>,
  isArtifact?: (entryPath: string) => boolean,
): number {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith(prefix) && !currentNames.has(entry)) {
      const entryPath = path.join(dir, entry);
      if (isArtifact && !isArtifact(entryPath)) continue;
      if (removeIfExists(entryPath)) removed++;
    }
  }
  return removed;
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

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

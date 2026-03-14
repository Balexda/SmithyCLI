import fs from 'fs';
import { basePromptsDir } from './utils.js';

export interface TemplateMeta {
  name?: string;
  command?: boolean;
  content: string;
  filename: string;
}

export function getBaseTemplateFiles(): string[] {
  if (!fs.existsSync(basePromptsDir)) return [];
  return fs.readdirSync(basePromptsDir).filter(f => f.endsWith('.md'));
}

export function readTemplate(filename: string): string {
  return fs.readFileSync(`${basePromptsDir}/${filename}`, 'utf8');
}

export function stripFrontmatter(content: string): string {
  return content.replace(/^---\s*[\s\S]*?\n---\s*\n/, '');
}

export function parseFrontmatterName(content: string): string | undefined {
  const match = content.match(/^---\s*\nname:\s*([^\n]+)/m);
  return match?.[1]?.trim();
}

export function isCommandTemplate(content: string): boolean {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/m);
  if (!frontmatterMatch) return false;
  return /command:\s*true/.test(frontmatterMatch[1]!);
}

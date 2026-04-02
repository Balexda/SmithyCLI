import fs from 'fs';
import path from 'path';
import { commandsTemplateDir, promptsTemplateDir, agentsTemplateDir, snippetsTemplateDir } from './utils.js';

export type TemplateCategory = 'commands' | 'prompts' | 'agents';

export interface ComposedTemplates {
  commands: Map<string, string>;  // filename → composed content
  prompts: Map<string, string>;
  agents: Map<string, string>;
}

export function stripFrontmatter(content: string): string {
  return content.replace(/^---\s*[\s\S]*?\n---\s*\n/, '');
}

export function parseFrontmatterName(content: string): string | undefined {
  const match = content.match(/^---\s*\nname:\s*([^\n]+)/m);
  return match?.[1]?.trim();
}

/**
 * List .md files in a template subdirectory.
 */
function listTemplateFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
}

/**
 * Read all .md files from a template subdirectory into a Map.
 */
function readTemplateDir(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of listTemplateFiles(dir)) {
    map.set(file, fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  return map;
}

/**
 * Load all snippet files from the snippets directory.
 */
export function loadSnippets(): Map<string, string> {
  return readTemplateDir(snippetsTemplateDir);
}

/**
 * Replace <!-- snippet:filename.md --> placeholders with snippet content.
 */
export function resolveSnippets(content: string, snippets: Map<string, string>): string {
  return content.replace(/<!-- snippet:(\S+) -->/g, (_match, name: string) => {
    const snippet = snippets.get(name);
    if (!snippet) {
      throw new Error(`Snippet "${name}" not found in snippets/`);
    }
    return snippet.trimEnd();
  });
}

/**
 * Returns filenames for each template category (without reading content).
 * Useful for remove/cleanup operations.
 */
export function getTemplateFilesByCategory(): Record<TemplateCategory, string[]> {
  return {
    commands: listTemplateFiles(commandsTemplateDir),
    prompts: listTemplateFiles(promptsTemplateDir),
    agents: listTemplateFiles(agentsTemplateDir),
  };
}

/**
 * Reads all templates from their categorized subdirectories, resolves snippets,
 * and returns a ComposedTemplates object.
 */
export function getComposedTemplates(): ComposedTemplates {
  const snippets = loadSnippets();

  const resolve = (dir: string): Map<string, string> => {
    const raw = readTemplateDir(dir);
    const composed = new Map<string, string>();
    for (const [file, content] of raw) {
      composed.set(file, resolveSnippets(content, snippets));
    }
    return composed;
  };

  return {
    commands: resolve(commandsTemplateDir),
    prompts: resolve(promptsTemplateDir),
    agents: resolve(agentsTemplateDir),
  };
}

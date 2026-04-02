import fs from 'fs';
import path from 'path';
import { commandsTemplateDir, promptsTemplateDir, agentsTemplateDir, snippetsTemplateDir } from './utils.js';
import { parseTemplate, resolvePartials } from './dotprompt-adapter.js';

export type TemplateCategory = 'commands' | 'prompts' | 'agents';

export interface ComposedTemplates {
  commands: Map<string, string>;  // filename → composed content
  prompts: Map<string, string>;
  agents: Map<string, string>;
}

export function stripFrontmatter(content: string): string {
  return parseTemplate(content).body;
}

export function parseFrontmatterName(content: string): string | undefined {
  return parseTemplate(content).name;
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
 * Resolve Handlebars partial references ({{>partial-name}}) in template content
 * using Dotprompt's render pipeline.
 * Snippet filenames are mapped to partial names by stripping the .md extension.
 */
export async function resolveSnippets(content: string, snippets: Map<string, string>): Promise<string> {
  // Map snippet filenames (e.g. "audit-checklist-rfc.md") to partial names ("audit-checklist-rfc")
  const partials = new Map<string, string>();
  for (const [filename, body] of snippets) {
    const name = filename.replace(/\.md$/, '');
    partials.set(name, body.trimEnd());
  }
  return resolvePartials(content, partials);
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
 * Reads all templates from their categorized subdirectories, resolves snippets
 * via Dotprompt's rendering pipeline, and returns a ComposedTemplates object.
 */
export async function getComposedTemplates(): Promise<ComposedTemplates> {
  const snippets = loadSnippets();

  const resolve = async (dir: string): Promise<Map<string, string>> => {
    const raw = readTemplateDir(dir);
    const composed = new Map<string, string>();
    for (const [file, content] of raw) {
      composed.set(file, await resolveSnippets(content, snippets));
    }
    return composed;
  };

  return {
    commands: await resolve(commandsTemplateDir),
    prompts: await resolve(promptsTemplateDir),
    agents: await resolve(agentsTemplateDir),
  };
}

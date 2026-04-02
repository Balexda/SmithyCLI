import fs from 'fs';
import path from 'path';
import { Dotprompt } from 'dotprompt';
import { commandsTemplateDir, promptsTemplateDir, agentsTemplateDir, snippetsTemplateDir } from './utils.js';

const dp = new Dotprompt();

export type TemplateCategory = 'commands' | 'prompts' | 'agents';

export interface ComposedTemplates {
  commands: Map<string, string>;  // filename → composed content
  prompts: Map<string, string>;
  agents: Map<string, string>;
}

export function stripFrontmatter(content: string): string {
  return dp.parse(content).template;
}

export function parseFrontmatterName(content: string): string | undefined {
  return dp.parse(content).name;
}

/**
 * List .prompt files in a template subdirectory.
 */
function listTemplateFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.prompt'));
}

/**
 * Read all .prompt files from a template subdirectory into a Map.
 * Map keys are translated to .md (the deployed filename).
 */
function readTemplateDir(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of listTemplateFiles(dir)) {
    const deployName = file.replace(/\.prompt$/, '.md');
    map.set(deployName, fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  return map;
}

/**
 * Read all .md files from a directory into a Map (used for snippets).
 */
function readMdDir(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(dir)) return map;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
    map.set(file, fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  return map;
}

/**
 * Load all snippet files from the snippets directory.
 */
export function loadSnippets(): Map<string, string> {
  return readMdDir(snippetsTemplateDir);
}

/**
 * Build a partials map from snippet files, keyed by partial name (filename without .md).
 */
function buildPartialsMap(snippets: Map<string, string>): Map<string, string> {
  const partials = new Map<string, string>();
  for (const [filename, body] of snippets) {
    const name = filename.replace(/\.md$/, '');
    partials.set(name, body.trimEnd());
  }
  return partials;
}

/**
 * Resolve Handlebars partial references ({{>partial-name}}) in template content.
 * Captures the original frontmatter via regex and reattaches it after rendering
 * to preserve exact YAML formatting.
 */
export async function resolveSnippets(content: string, renderer: Dotprompt): Promise<string> {
  if (!content.includes('{{>')) {
    return content;
  }

  const frontmatterMatch = content.match(/^(---\s*\n[\s\S]*?\n---\s*\n)/);
  const frontmatter = frontmatterMatch?.[1] ?? '';

  const result = await renderer.render(content, {});
  const rendered = result.messages
    .map(m => m.content.map(p => ('text' in p ? p.text : '')).join(''))
    .join('\n');

  return frontmatter + rendered;
}

/**
 * Returns filenames for each template category (without reading content).
 * Useful for remove/cleanup operations.
 */
export function getTemplateFilesByCategory(): Record<TemplateCategory, string[]> {
  const toMd = (files: string[]) => files.map(f => f.replace(/\.prompt$/, '.md'));
  return {
    commands: toMd(listTemplateFiles(commandsTemplateDir)),
    prompts: toMd(listTemplateFiles(promptsTemplateDir)),
    agents: toMd(listTemplateFiles(agentsTemplateDir)),
  };
}

/**
 * Reads all templates from their categorized subdirectories, resolves snippets
 * via Dotprompt's rendering pipeline, and returns a ComposedTemplates object.
 */
export async function getComposedTemplates(): Promise<ComposedTemplates> {
  const snippets = loadSnippets();
  const renderer = new Dotprompt({ partials: Object.fromEntries(buildPartialsMap(snippets)) });

  const resolve = async (dir: string): Promise<Map<string, string>> => {
    const raw = readTemplateDir(dir);
    const entries = await Promise.all(
      Array.from(raw, ([file, content]) =>
        resolveSnippets(content, renderer).then(resolved => [file, resolved] as const),
      ),
    );
    return new Map(entries);
  };

  return {
    commands: await resolve(commandsTemplateDir),
    prompts: await resolve(promptsTemplateDir),
    agents: await resolve(agentsTemplateDir),
  };
}

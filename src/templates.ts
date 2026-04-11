import fs from 'fs';
import path from 'path';
import { Dotprompt } from 'dotprompt';
import { commandsTemplateDir, promptsTemplateDir, agentsTemplateDir, snippetsTemplateDir, skillsTemplateDir } from './utils.js';

const dp = new Dotprompt();

export type TemplateCategory = 'commands' | 'prompts' | 'agents' | 'skills';

export interface SkillTemplate {
  prompt: string;               // rendered SKILL.md content (frontmatter not yet stripped)
  scripts: Map<string, string>; // filename → raw script content
}

export interface ComposedTemplates {
  commands: Map<string, string>;  // filename → composed content
  prompts: Map<string, string>;
  agents: Map<string, string>;
  skills: Map<string, SkillTemplate>; // skill name → { prompt, scripts }
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
 * List only base (non-variant) .prompt files.
 * A file is a variant if removing its last dot-segment before .prompt yields
 * another file name that exists in the same directory.
 * E.g. smithy.forge.claude.prompt is a variant of smithy.forge.prompt.
 */
function listBaseTemplateFiles(dir: string): string[] {
  const all = listTemplateFiles(dir);
  const allSet = new Set(all);
  return all.filter(f => parsePromptFilename(f, allSet).variantName === null);
}

/**
 * Parse a .prompt filename into its base stem and optional variant name.
 * E.g. 'smithy.forge.claude.prompt' → { baseStem: 'smithy.forge', variantName: 'claude' }
 *      'smithy.forge.prompt'        → { baseStem: 'smithy.forge', variantName: null }
 * A file is only a variant if the corresponding base file exists in allFiles.
 */
function parsePromptFilename(file: string, allFiles: Set<string>): { baseStem: string; variantName: string | null } {
  const stem = file.replace(/\.prompt$/, '');
  const lastDot = stem.lastIndexOf('.');
  if (lastDot !== -1) {
    const candidateBase = stem.slice(0, lastDot) + '.prompt';
    if (allFiles.has(candidateBase)) {
      return { baseStem: stem.slice(0, lastDot), variantName: stem.slice(lastDot + 1) };
    }
  }
  return { baseStem: stem, variantName: null };
}

/**
 * Read all .prompt files from a template subdirectory into a Map.
 * Map keys are translated to .md (the deployed filename).
 *
 * When a variant is specified (e.g. 'claude'), variant files like
 * smithy.forge.claude.prompt override the base smithy.forge.prompt.
 * Non-matching variant files are excluded. The deploy name always derives
 * from the base name (e.g. smithy.forge.md regardless of variant).
 */
function readTemplateDir(dir: string, variant?: string): Map<string, string> {
  const all = listTemplateFiles(dir);
  const allSet = new Set(all);
  const map = new Map<string, string>();

  // Build a lookup of variant overrides: baseStem → variant file content
  const variantOverrides = new Map<string, string>();
  if (variant) {
    for (const file of all) {
      const parsed = parsePromptFilename(file, allSet);
      if (parsed.variantName === variant) {
        variantOverrides.set(parsed.baseStem, fs.readFileSync(path.join(dir, file), 'utf8'));
      }
    }
  }

  // Read base files, applying variant overrides where available
  for (const file of all) {
    const parsed = parsePromptFilename(file, allSet);
    if (parsed.variantName !== null) continue; // skip variant files
    const deployName = parsed.baseStem + '.md';
    const content = variantOverrides.get(parsed.baseStem)
      ?? fs.readFileSync(path.join(dir, file), 'utf8');
    map.set(deployName, content);
  }
  return map;
}

/**
 * Read all .md files from a directory into a Map (used for snippets).
 */
function readMdDir(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(dir)) return map;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md')) {
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
  if (!content.includes('{{')) {
    return content;
  }

  // Strip frontmatter before rendering so Dotprompt doesn't try to process
  // Smithy-specific fields (e.g. `tools: Read, Edit, ...` as a string, which
  // Dotprompt expects as an array). Re-attach the original frontmatter after.
  const frontmatterMatch = content.match(/^(---\s*\n[\s\S]*?\n---\s*\n)/);
  const frontmatter = frontmatterMatch?.[1] ?? '';
  const body = frontmatter ? content.slice(frontmatter.length) : content;

  const result = await renderer.render(body, {});
  const rendered = result.messages
    .map(m => m.content.map(p => ('text' in p ? p.text : '')).join(''))
    .join('\n');

  return frontmatter + rendered;
}

/**
 * List skill names (subdirectory names) in the skills template directory.
 */
function listSkillNames(): string[] {
  if (!fs.existsSync(skillsTemplateDir)) return [];
  return fs.readdirSync(skillsTemplateDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

/**
 * Read a single skill directory: find SKILL.prompt → renders to prompt string,
 * and collect all *.sh files as raw scripts.
 */
async function readSkillDir(skillName: string, renderer: Dotprompt): Promise<SkillTemplate> {
  const skillDir = path.join(skillsTemplateDir, skillName);
  const entries = fs.readdirSync(skillDir);

  // Find and render the SKILL.prompt file
  const promptFile = entries.find(f => f.endsWith('.prompt'));
  let promptContent = '';
  if (promptFile) {
    const raw = fs.readFileSync(path.join(skillDir, promptFile), 'utf8');
    promptContent = await resolveSnippets(raw, renderer);
  }

  // Collect all shell scripts
  const scripts = new Map<string, string>();
  for (const entry of entries) {
    if (entry.endsWith('.sh')) {
      scripts.set(entry, fs.readFileSync(path.join(skillDir, entry), 'utf8'));
    }
  }

  return { prompt: promptContent, scripts };
}

/**
 * Returns filenames for each template category (without reading content).
 * Only includes base templates — variant files are excluded.
 * Useful for remove/cleanup operations.
 */
export function getTemplateFilesByCategory(): Record<TemplateCategory, string[]> {
  const toMd = (files: string[]) => files.map(f => f.replace(/\.prompt$/, '.md'));
  return {
    commands: toMd(listBaseTemplateFiles(commandsTemplateDir)),
    prompts: toMd(listBaseTemplateFiles(promptsTemplateDir)),
    agents: toMd(listBaseTemplateFiles(agentsTemplateDir)),
    skills: listSkillNames(),
  };
}

/**
 * Reads all templates from their categorized subdirectories, resolves snippets
 * and Handlebars conditionals via Dotprompt's rendering pipeline.
 *
 * When a variant is specified (e.g. 'claude'), it registers an {{#ifAgent}}
 * block helper that renders the main block; without a variant, the {{else}}
 * branch renders instead. Variant-specific .prompt files also override
 * their base files.
 */
export async function getComposedTemplates(variant?: string): Promise<ComposedTemplates> {
  const snippets = loadSnippets();
  const renderer = new Dotprompt({ partials: Object.fromEntries(buildPartialsMap(snippets)) });

  // Register {{#ifAgent}} block helper. Dotprompt uses knownHelpersOnly so
  // standard {{#if variable}} doesn't work — custom block helpers are required.
  renderer.defineHelper('ifAgent', function (this: unknown, ...args: unknown[]) {
    const options = args[args.length - 1] as { fn: (ctx: unknown) => string; inverse: (ctx: unknown) => string };
    return variant ? options.fn(this) : options.inverse(this);
  });

  const resolve = async (dir: string): Promise<Map<string, string>> => {
    const raw = readTemplateDir(dir, variant);
    const entries = await Promise.all(
      Array.from(raw, ([file, content]) =>
        resolveSnippets(content, renderer).then(resolved => [file, resolved] as const),
      ),
    );
    return new Map(entries);
  };

  // Resolve skills: each skill is a directory with a SKILL.prompt and optional scripts
  const skillNames = listSkillNames();
  const skillEntries = await Promise.all(
    skillNames.map(async name => [name, await readSkillDir(name, renderer)] as const),
  );
  const skills = new Map<string, SkillTemplate>(skillEntries);

  return {
    commands: await resolve(commandsTemplateDir),
    prompts: await resolve(promptsTemplateDir),
    agents: await resolve(agentsTemplateDir),
    skills,
  };
}

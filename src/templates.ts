import fs from 'fs';
import path from 'path';
import { Dotprompt } from 'dotprompt';
import { commandsTemplateDir, promptsTemplateDir, agentsTemplateDir, snippetsTemplateDir, skillsTemplateDir } from './utils.js';

const dp = new Dotprompt();

export type TemplateCategory = 'commands' | 'prompts' | 'agents' | 'skills';

export interface SkillTemplate {
  prompt: string;               // rendered SKILL.md content (frontmatter not yet stripped)
  scripts: Map<string, string>; // filename → raw script content
  /**
   * Bundled files the skill body links to but does not inline — the
   * progressive-disclosure half of a skill (`references/examples.md` and
   * friends). Keyed by POSIX-style path relative to the skill directory so a
   * markdown link in `SKILL.md` resolves against the deployed tree unchanged.
   *
   * Excludes the `SKILL.prompt` itself and everything under `scripts/`, which
   * have their own deploy paths (`prompt` / `scripts` above).
   *
   * A `.prompt` entry is rendered text (keyed by its deployed `.md` name);
   * every other entry is the file's raw bytes, so binary assets survive the
   * round trip intact.
   */
  resources: Map<string, string | Buffer>;
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
export function buildPartialsMap(snippets: Map<string, string>): Map<string, string> {
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
 * Directory name, relative to a skill root, whose contents deploy as
 * executable scripts rather than as bundled reference files.
 */
const SKILL_SCRIPTS_DIR = 'scripts';

/** Conventional filename of a skill's always-loaded body. */
const SKILL_BODY_FILENAME = 'SKILL.prompt';

/**
 * Recursively list files under `dir` as POSIX-style paths relative to `dir`.
 * Dot-entries are skipped at every level so editor and OS droppings
 * (`.DS_Store`, `.swp`) never reach a target repo.
 */
function listFilesRecursive(dir: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...listFilesRecursive(path.join(dir, entry.name), relPath));
    } else {
      found.push(relPath);
    }
  }
  return found;
}

/**
 * Read a single skill directory into its three deployable parts:
 *
 *   - `prompt`    — the rendered `SKILL.prompt` body (always loaded).
 *   - `scripts`   — `*.sh` files under `scripts/` (deployed executable).
 *   - `resources` — every other bundled file, keyed by its relative path.
 *
 * Bundled `.prompt` files go through the same snippet/Handlebars rendering as
 * the skill body and are renamed to `.md` on the way out, matching the rest of
 * the template pipeline — so authored prose in a bundle can use
 * `{{artifactsRoot}}`, `{{#ifAgent}}`, and `{{>snippet}}` like any other
 * template, and `.md` in the source tree keeps meaning "never deployed"
 * (READMEs and snippets). Anything else is copied byte-for-byte, so a skill can
 * ship a JSON schema or a sample fixture without it being parsed as a template.
 */
async function readSkillDir(skillName: string, renderer: Dotprompt): Promise<SkillTemplate> {
  const skillDir = path.join(skillsTemplateDir, skillName);
  const entries = fs.readdirSync(skillDir);

  // Find and render the SKILL.prompt file. Matched by exact name first: a
  // skill may bundle its own top-level `.prompt` reference files, and picking
  // the body by "first entry ending in .prompt" would make it depend on
  // readdir order. The suffix match stays as a fallback for a skill whose
  // body file is named something else.
  const promptFile = entries.includes(SKILL_BODY_FILENAME)
    ? SKILL_BODY_FILENAME
    : entries.find(f => f.endsWith('.prompt'));
  let promptContent = '';
  if (promptFile) {
    const raw = fs.readFileSync(path.join(skillDir, promptFile), 'utf8');
    promptContent = await resolveSnippets(raw, renderer);
  }

  // Collect shell scripts from the scripts/ subdirectory
  const scripts = new Map<string, string>();
  const scriptsDir = path.join(skillDir, SKILL_SCRIPTS_DIR);
  if (fs.existsSync(scriptsDir)) {
    for (const entry of fs.readdirSync(scriptsDir)) {
      if (entry.endsWith('.sh')) {
        scripts.set(entry, fs.readFileSync(path.join(scriptsDir, entry), 'utf8'));
      }
    }
  }

  // Collect everything else the skill bundles for on-demand loading. Only
  // `.prompt` files are decoded to text, because only they get rendered;
  // everything else stays a Buffer so the bytes reaching the target repo are
  // the bytes in this repo. Decoding a PNG or a zip as utf8 would replace
  // every invalid sequence with U+FFFD and write the corruption back out.
  const resources = new Map<string, string | Buffer>();
  for (const relPath of listFilesRecursive(skillDir)) {
    if (relPath === promptFile) continue;
    if (relPath.startsWith(`${SKILL_SCRIPTS_DIR}/`)) continue;
    const absPath = path.join(skillDir, ...relPath.split('/'));
    if (relPath.endsWith('.prompt')) {
      const raw = fs.readFileSync(absPath, 'utf8');
      resources.set(relPath.replace(/\.prompt$/, '.md'), await resolveSnippets(raw, renderer));
    } else {
      resources.set(relPath, fs.readFileSync(absPath));
    }
  }

  return { prompt: promptContent, scripts, resources };
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
 * Build the Dotprompt renderer used to compose every template, with the
 * snippet partials registered and the three Smithy block helpers defined.
 *
 * Exported, with the partials map overridable, so a consumer that needs to
 * render templates the way the deploy path does gets identical semantics
 * instead of a second copy of this setup drifting out of step with it. The
 * template lint substitutes sentinel-wrapped partials to count injections
 * exactly, letting Handlebars resolve the `{{#ifAgent}}` gating rather than
 * re-implementing it.
 */
export function createTemplateRenderer(
  variant?: string,
  artifactsRoot: string = '',
  partials: Map<string, string> = buildPartialsMap(loadSnippets()),
): Dotprompt {
  const renderer = new Dotprompt({ partials: Object.fromEntries(partials) });
  // Which variants render the rich {{#ifAgent}} sub-agent branch (vs. the
  // {{else}} fallback). Claude and Codex both ship deployable sub-agent
  // definitions (.claude/agents/*.md and .codex/agents/*.toml respectively)
  // and support parallel isolated-context dispatch. Gemini gets no sub-agent
  // definitions deployed, so it stays on the inline fallback path.
  const supportsSubAgents = variant === 'claude' || variant === 'codex';

  // Register {{#ifAgent}} block helper. Dotprompt uses knownHelpersOnly so
  // standard {{#if variable}} doesn't work — custom block helpers are required.
  renderer.defineHelper('ifAgent', function (this: unknown, ...args: unknown[]) {
    const options = args[args.length - 1] as { fn: (ctx: unknown) => string; inverse: (ctx: unknown) => string };
    if (args.length > 1) {
      const agentName = args[0] as string;
      return variant === agentName ? options.fn(this) : options.inverse(this);
    }
    return supportsSubAgents ? options.fn(this) : options.inverse(this);
  });

  // Register {{artifactsRoot}} as a zero-arg helper rather than relying on
  // Dotprompt's data context. Handlebars resolves `{{name}}` as either a
  // variable lookup or a known helper invocation, and since dotprompt runs
  // with knownHelpersOnly the helper form is the reliable path.
  renderer.defineHelper('artifactsRoot', function () {
    return artifactsRoot;
  });

  // Block helper gating content on external-artifacts mode. Needed as a
  // helper for the same reason as `ifAgent`: dotprompt runs with
  // `knownHelpersOnly`, so a plain `{{#if artifactsRoot}}` will not resolve.
  //
  // Some instructions only make sense when artifacts live in a separate
  // git-backed store — telling an agent to commit the store is actively
  // wrong in repo mode, where the same words would have it commit the code
  // repo mid-plan. Rendering them unconditionally is not a harmless extra.
  renderer.defineHelper('ifExternalArtifacts', function (this: unknown, ...args: unknown[]) {
    const options = args[args.length - 1] as {
      fn: (ctx: unknown) => string;
      inverse: (ctx: unknown) => string;
    };
    return artifactsRoot.length > 0 ? options.fn(this) : options.inverse(this);
  });

  return renderer;
}

/**
 * Reads all templates from their categorized subdirectories, resolves snippets
 * and Handlebars conditionals via Dotprompt's rendering pipeline.
 *
 * When a variant is specified (e.g. 'claude'), it registers an {{#ifAgent}}
 * block helper that renders the main block; without a variant, the {{else}}
 * branch renders instead. Variant-specific .prompt files also override
 * their base files.
 *
 * `artifactsRoot` is the prefix substituted into deployed prompts via the
 * `{{artifactsRoot}}` template variable. Templates write paths like
 * `{{artifactsRoot}}docs/rfcs/...`; with an empty prefix (in-repo mode) the
 * path renders as `docs/rfcs/...`, and with `~/.smithy/repos/<repo>/` (external
 * mode) it renders as `~/.smithy/repos/<repo>/docs/rfcs/...`. Implemented as a
 * zero-arg Handlebars helper so Dotprompt's `knownHelpersOnly` mode accepts
 * the reference (same plumbing pattern as `{{#ifAgent}}`).
 */
export async function getComposedTemplates(
  variant?: string,
  artifactsRoot: string = '',
): Promise<ComposedTemplates> {
  const renderer = createTemplateRenderer(variant, artifactsRoot);

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

/**
 * Structural lints over the agent-skill template tree.
 *
 * The 2026-08 audit's own evidence was that prose rules against these failure
 * modes existed and failed — roughly twelve hand-copies of the kind gate
 * shipped while two READMEs called it a single source of truth — while the one
 * automated check in the tree (the orders parity assertion) largely held. This
 * module is the deterministic half of the prevention layer: it turns the
 * engraved commitments into things CI can fail on.
 *
 * | Record | What it says | Which lint carries it |
 * |--------|--------------|-----------------------|
 * | INV-1 | shared protocols are composed or cited, never restated | `findDuplicateInjections`, `findRestatedProtocol`, `findCrossTemplateCopies` |
 * | INV-2 | deployable templates read correctly outside SmithyCLI | `findInternalReferences` |
 * | INV-3 | deployed metadata is honoured, grant side included | `findMissingToolGrants`, `findMissingSkillGrants` |
 * | INV-8 | examples obey the contract they illustrate | `findDependencyOrderCheckboxes` |
 * | P-1 | always-loaded context is a budget | `findOverBudgetDescriptions` |
 *
 * Every lint reads a `TemplateSource` and returns findings rather than
 * throwing, so the test that drives it owns the allowlists and the failure
 * message. The source is a parameter rather than a disk read inside each check:
 * a test that needs to prove a lint still detects its defect builds a modified
 * source in memory instead of writing to the tracked tree, which would race
 * with every other test file vitest runs in parallel.
 *
 * Anything reading the composed form goes through `createTemplateRenderer`
 * rather than regexing raw source, so `{{#ifAgent}}` gating is resolved by the
 * same code path that deploys.
 *
 * Two checks the issue scoped here already exist elsewhere and are deliberately
 * not restated: the Bash permission grammar is asserted over generated
 * settings.json in `permissions.test.ts` and over skill `allowed-tools` in
 * `templates.test.ts`.
 */
import fs from 'fs';
import path from 'path';
import type { Dotprompt } from 'dotprompt';
import { buildPartialsMap, createTemplateRenderer, loadSnippets, resolveSnippets } from './templates.js';
import {
  agentsTemplateDir,
  commandsTemplateDir,
  promptsTemplateDir,
  skillsTemplateDir,
  snippetsTemplateDir,
} from './utils.js';

/** A deployable template, keyed the way a lint failure should name it. */
export interface DeployableTemplate {
  /** `commands/smithy.cut.prompt`, `skills/smithy.status/SKILL.prompt`, … */
  id: string;
  /** Which template category the file belongs to. */
  category: 'commands' | 'prompts' | 'agents' | 'snippets' | 'skills';
  /** Raw source text, frontmatter included. */
  source: string;
}

/**
 * Everything the lints read, in one value.
 *
 * `snippets` is keyed by filename (`kind-gate.md`) to match `loadSnippets`,
 * and its entries are also present in `templates` under the `snippets`
 * category — the two views serve the partial map and the text scans
 * respectively.
 */
export interface TemplateSource {
  templates: DeployableTemplate[];
  snippets: Map<string, string>;
}

/** One lint failure. `id` names the template; `detail` is the operator-facing why. */
export interface LintFinding {
  id: string;
  detail: string;
}

/**
 * Read the tree from disk: every file whose *content* reaches a target repo —
 * the four template categories plus snippets (inlined rather than deployed,
 * but their text ships) and any reference files a skill bundles. READMEs are
 * source-tree docs and are excluded; they are the one place internal
 * references are correct.
 */
export function loadTemplateSource(): TemplateSource {
  const templates: DeployableTemplate[] = [];
  const flat: Array<[DeployableTemplate['category'], string, string]> = [
    ['commands', commandsTemplateDir, '.prompt'],
    ['prompts', promptsTemplateDir, '.prompt'],
    ['agents', agentsTemplateDir, '.prompt'],
    ['snippets', snippetsTemplateDir, '.md'],
  ];
  for (const [category, dir, ext] of flat) {
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith(ext) || file === 'README.md') continue;
      templates.push({
        id: `${category}/${file}`,
        category,
        source: fs.readFileSync(path.join(dir, file), 'utf8'),
      });
    }
  }

  for (const skill of fs.readdirSync(skillsTemplateDir, { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => e.name).sort()) {
    const skillDir = path.join(skillsTemplateDir, skill);
    for (const rel of listFilesRecursive(skillDir)) {
      // Scripts are shell, not prose, and carry their own review surface.
      if (rel.startsWith('scripts/') || !rel.endsWith('.prompt')) continue;
      templates.push({
        id: `skills/${skill}/${rel}`,
        category: 'skills',
        source: fs.readFileSync(path.join(skillDir, ...rel.split('/')), 'utf8'),
      });
    }
  }

  return { templates, snippets: loadSnippets() };
}

/**
 * A copy of `source` with one template's text replaced.
 *
 * The planted-defect tests use this to prove a lint still detects what it was
 * written for, without touching the tracked tree.
 */
export function withTemplate(
  source: TemplateSource,
  id: string,
  rewrite: (previous: string) => string,
): TemplateSource {
  const templates = source.templates.map(t => (t.id === id ? { ...t, source: rewrite(t.source) } : t));
  if (!templates.some(t => t.id === id)) throw new Error(`no template with id ${id}`);
  const snippets = new Map(source.snippets);
  // A snippet's body feeds the partial map as well as the text scans, so both
  // views have to move together.
  const snippetFile = id.startsWith('snippets/') ? id.slice('snippets/'.length) : undefined;
  if (snippetFile) snippets.set(snippetFile, rewrite(source.snippets.get(snippetFile)!));
  return { templates, snippets };
}

function listFilesRecursive(dir: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...listFilesRecursive(path.join(dir, entry.name), rel));
    else found.push(rel);
  }
  return found;
}

/** Snippet partial names, e.g. `kind-gate`, in the spelling `{{>name}}` uses. */
export function snippetNames(source: TemplateSource = loadTemplateSource()): string[] {
  return [...source.snippets.keys()].map(f => f.replace(/\.md$/, '')).sort();
}

/** Skill directory names, derived from the template ids the source carries. */
export function skillNames(source: TemplateSource = loadTemplateSource()): string[] {
  const names = new Set<string>();
  for (const t of source.templates) {
    const m = t.id.match(/^skills\/([^/]+)\//);
    if (m) names.add(m[1]!);
  }
  return [...names].sort();
}

const SENTINEL = (name: string) => `@@smithy-snippet:${name}@@`;

function occurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n += 1;
    i += needle.length;
  }
  return n;
}

/**
 * A renderer whose partials each emit a unique sentinel ahead of their body.
 *
 * Counting sentinels in a composed template gives the exact number of times a
 * snippet was injected — transitively, since a nested partial still renders and
 * still emits its own marker, and correctly per agent, since Handlebars (not a
 * hand-rolled parser) decides which `{{#ifAgent}}` branch runs. Prepending the
 * marker rather than replacing the body keeps the composed text otherwise
 * identical, so the same render answers both the injection question and the
 * restatement question below.
 */
function sentinelRenderer(variant: string, source: TemplateSource): Dotprompt {
  const marked = new Map<string, string>();
  for (const [name, body] of buildPartialsMap(source.snippets)) {
    marked.set(name, `${SENTINEL(name)}\n${body}`);
  }
  return createTemplateRenderer(variant, '', marked);
}

/** Compose every deployable template for one agent variant, sentinels included. */
async function composeWithSentinels(variant: string, source: TemplateSource): Promise<Map<string, string>> {
  const renderer = sentinelRenderer(variant, source);
  const out = new Map<string, string>();
  for (const t of source.templates) {
    // Snippets are composed *into* the consumers below; linting them again
    // standalone would double-report every finding their bodies carry.
    if (t.category === 'snippets') continue;
    out.set(t.id, await resolveSnippets(t.source, renderer));
  }
  return out;
}

/**
 * Snippets injected more than once into a single composed template.
 *
 * The cost of a snippet is its size times every deployment that composes it, so
 * a second injection into the same file is paid by every agent that loads it,
 * every run (P-1). It is also how the two copies start to drift apart.
 */
export async function findDuplicateInjections(
  variant: string,
  source: TemplateSource = loadTemplateSource(),
): Promise<LintFinding[]> {
  const names = snippetNames(source);
  const findings: LintFinding[] = [];
  for (const [id, body] of await composeWithSentinels(variant, source)) {
    for (const name of names) {
      const n = occurrences(body, SENTINEL(name));
      if (n > 1) findings.push({ id, detail: `injects {{>${name}}} ${n} times` });
    }
  }
  return findings;
}

/**
 * Lines distinctive enough to prove a snippet's text is present, keyed by the
 * snippet that owns them.
 *
 * Derived from raw snippet source rather than the rendered form, so a parent
 * snippet does not claim the lines of a child it nests: `review-protocol`
 * composes `kind-gate`, and attributing the gate's lines to both would leave
 * neither with a canary of its own. Handlebars-bearing lines are skipped
 * because their rendered form varies by variant, and short lines are skipped
 * because they collide by accident.
 */
export function snippetCanaries(
  source: TemplateSource = loadTemplateSource(),
  minLength = 50,
): Map<string, string[]> {
  const raw = new Map<string, string[]>();
  for (const [file, body] of source.snippets) {
    raw.set(
      file.replace(/\.md$/, ''),
      body.split('\n').map(l => l.trim()).filter(l => l.length >= minLength && !l.includes('{{')),
    );
  }
  const owners = new Map<string, Set<string>>();
  for (const [name, lines] of raw) {
    for (const line of lines) {
      if (!owners.has(line)) owners.set(line, new Set());
      owners.get(line)!.add(name);
    }
  }
  const canaries = new Map<string, string[]>();
  for (const [name, lines] of raw) {
    const unique = [...new Set(lines)].filter(l => owners.get(l)!.size === 1);
    unique.sort((a, b) => b.length - a.length);
    canaries.set(name, unique);
  }
  return canaries;
}

/**
 * Snippet text present in a composed template more often than that template
 * injected the snippet — a hand-written copy of a protocol that has a canonical
 * home (INV-1).
 *
 * The comparison is per-snippet against its own injection count rather than
 * against zero, so a legitimate single injection is silent and a copy standing
 * beside it is not.
 */
export async function findRestatedProtocol(
  variant: string,
  source: TemplateSource = loadTemplateSource(),
  canariesPerSnippet = 6,
): Promise<LintFinding[]> {
  const canaries = snippetCanaries(source);
  const findings: LintFinding[] = [];
  for (const [id, body] of await composeWithSentinels(variant, source)) {
    for (const [name, lines] of canaries) {
      const injected = occurrences(body, SENTINEL(name));
      for (const line of lines.slice(0, canariesPerSnippet)) {
        const found = occurrences(body, line);
        if (found > injected) {
          findings.push({
            id,
            detail: `restates ${name} (injected ${injected}×, text present ${found}×): ${truncate(line)}`,
          });
          break; // One finding per snippet per template; the first line is evidence enough.
        }
      }
    }
  }
  return findings;
}

function truncate(s: string, max = 90): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

const HEADING_REF = /`(#{2,4})\s+([^`]+)`/g;
/** `<Title>`, `SD-NNN`, `Slice N` — a reference to a shape, not to one section. */
const PLACEHOLDER = /[<>]|\bN\b|\d/;

const normalizeHeading = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Every section heading any deployable template emits, as `<level> <title>`.
 *
 * The level is part of the key because it is part of the destination: `## Error`
 * and `### Error` are different insertion points, and one template's `##`
 * scaffold must not silently satisfy another's `###` reference. `smithy.survey`
 * says as much in its own prose — "`### Error` — not `## Error`".
 */
export function emittedHeadings(source: TemplateSource = loadTemplateSource()): Set<string> {
  const headings = new Set<string>();
  for (const t of source.templates) {
    for (const line of t.source.split('\n')) {
      // Scaffolds are shown indented, inside fences, and blockquoted; strip
      // all three so an emitted heading counts wherever it is illustrated.
      const stripped = line.trim().replace(/^>+\s*/, '');
      const m = stripped.match(/^(#{2,4})\s+(\S.*)$/);
      if (m) headings.add(`${m[1]} ${normalizeHeading(m[2]!)}`);
    }
  }
  return headings;
}

/**
 * Findings routed to a section no template produces.
 *
 * The gate and the review agents name where each non-steering finding belongs;
 * a destination that exists only in the routing table sends every finding of
 * that kind nowhere. Only snippets and sub-agents are scanned, because they are
 * the routing surfaces, and only literal section names are checked — a
 * reference carrying a placeholder names a shape rather than one section.
 */
export function findDeadRoutingDestinations(source: TemplateSource = loadTemplateSource()): LintFinding[] {
  const headings = emittedHeadings(source);
  const findings: LintFinding[] = [];
  for (const t of source.templates) {
    if (t.category !== 'snippets' && t.category !== 'agents') continue;
    for (const m of t.source.matchAll(HEADING_REF)) {
      const name = normalizeHeading(m[2]!);
      const key = `${m[1]} ${name}`;
      if (PLACEHOLDER.test(name) || headings.has(key)) continue;
      findings.push({ id: t.id, detail: `routes findings to \`${key}\`, which no template emits` });
    }
  }
  return findings;
}

/** The tool vocabulary a template can name; the grant has to cover each one. */
const TOOL_NAMES = [
  'Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit', 'Task', 'Skill',
  'WebFetch', 'WebSearch', 'AskUserQuestion', 'NotebookEdit', 'TodoWrite',
] as const;

export interface AgentTemplate {
  id: string;
  /** Frontmatter `name:`. */
  name: string;
  /** Frontmatter `description:`, quotes stripped. */
  description: string;
  /** Frontmatter `tools:` list. */
  tools: string[];
  /** Everything after the frontmatter. */
  body: string;
}

function splitFrontmatter(source: string): { frontmatter: string; body: string } {
  const m = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  return m ? { frontmatter: m[1]!, body: source.slice(m[0].length) } : { frontmatter: '', body: source };
}

function scalar(frontmatter: string, key: string): string {
  // `[^\S\n]` rather than `\s`, so a key whose value is a block list on the
  // following lines reads as empty here instead of swallowing its first item.
  const m = frontmatter.match(new RegExp(`^${key}:[^\\S\\n]*(.*)$`, 'm'));
  return (m?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
}

/** Parse every sub-agent definition into the fields the lints grade. */
export function listAgentTemplates(source: TemplateSource = loadTemplateSource()): AgentTemplate[] {
  return source.templates
    .filter(t => t.category === 'agents')
    .map(t => {
      const { frontmatter, body } = splitFrontmatter(t.source);
      // `tools:` is authored both inline (`tools: Read, Edit`) and as a YAML
      // block list; a parser that read only one form would report the other as
      // granting nothing.
      const inline = scalar(frontmatter, 'tools');
      const tools = inline
        ? inline.split(',').map(x => x.trim()).filter(Boolean)
        : [...frontmatter.matchAll(/^\s*-\s*(\w+)\s*$/gm)].map(m => m[1]!);
      return {
        id: t.id,
        name: scalar(frontmatter, 'name'),
        description: scalar(frontmatter, 'description'),
        tools,
        body,
      };
    });
}

/**
 * Tools a sub-agent's body tells it to use that its `tools:` grant omits.
 *
 * A missing grant fails silently — the instruction stands in the prompt and the
 * step simply never happens — which is how `smithy-prose` came to be ordered to
 * call a skill it had no `Skill` grant for. Only unambiguous naming counts: a
 * `Skill("…")` call, or a tool named in backticks, which is how these prompts
 * write an instruction as opposed to prose ("Task decomposition" is not a
 * `Task` call).
 */
export function findMissingToolGrants(source: TemplateSource = loadTemplateSource()): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const agent of listAgentTemplates(source)) {
    const granted = new Set(agent.tools);
    const needed = new Set<string>();
    if (/Skill\("/.test(agent.body)) needed.add('Skill');
    for (const m of agent.body.matchAll(/`(\w+)`/g)) {
      const tool = m[1]!;
      if ((TOOL_NAMES as readonly string[]).includes(tool)) needed.add(tool);
    }
    for (const tool of [...needed].sort()) {
      if (!granted.has(tool)) {
        findings.push({
          id: agent.id,
          detail: `body invokes ${tool} but tools: grants only ${agent.tools.join(', ') || '(nothing)'}`,
        });
      }
    }
  }
  return findings;
}

/**
 * Every `smithy…` identifier a template can legitimately name, in both
 * spellings the deployed tree uses.
 *
 * Codex and Gemini receive the dashed `name:` from frontmatter
 * (`smithy-plan`); Claude names a command, sub-agent, or reference prompt by
 * its filename stem (`smithy.plan`) and a skill by its directory. A check that
 * knew only one spelling would let a rename leave a broken instruction on the
 * other surface.
 */
export function knownSmithyIdentifiers(source: TemplateSource = loadTemplateSource()): Set<string> {
  const names = new Set<string>(skillNames(source));
  for (const t of source.templates) {
    if (t.category !== 'commands' && t.category !== 'agents' && t.category !== 'prompts') continue;
    names.add(path.basename(t.id).replace(/\.prompt$/, ''));   // smithy.plan
    const declared = scalar(splitFrontmatter(t.source).frontmatter, 'name');
    if (declared) names.add(declared);                          // smithy-plan
  }
  return names;
}

/**
 * `smithy-…` and `smithy.…` tokens, with the trailing character that follows
 * each.
 *
 * A leading `/` is deliberately allowed: `/smithy.forge` is how a Claude slash
 * command is written, and it is also how a deployed path names one
 * (`.claude/skills/smithy.status/`). The lookbehind only rules out a token
 * glued to a preceding word or hyphen, which would be part of a longer name.
 */
const SMITHY_IDENTIFIER = /(?<![\w-])smithy[.-][a-z][a-z0-9-]*(.?)/g;

/**
 * `smithy…` names that resolve to nothing deployed — a dispatch to an agent
 * that does not exist, or a pointer at a renamed command.
 *
 * A name followed by `.` or `:` is a filename or a marker key
 * (`smithy-manifest.json`, `smithy-pr-review-response-to:`), not an identifier,
 * and is skipped.
 */
export function findUnresolvedSmithyNames(source: TemplateSource = loadTemplateSource()): LintFinding[] {
  const known = knownSmithyIdentifiers(source);
  const findings: LintFinding[] = [];
  for (const t of source.templates) {
    const seen = new Set<string>();
    for (const m of t.source.matchAll(SMITHY_IDENTIFIER)) {
      const trailing = m[1] ?? '';
      const name = trailing ? m[0].slice(0, -1) : m[0];
      if (trailing === '.' || trailing === ':') continue;
      if (known.has(name) || seen.has(name)) continue;
      seen.add(name);
      findings.push({
        id: t.id,
        detail: `names \`${name}\`, which matches no deployed agent, command, prompt, or skill`,
      });
    }
  }
  return findings;
}

/** `{{>snippet}}` targets and `Skill("name")` targets that do not exist. */
export function findUnresolvedReferences(source: TemplateSource = loadTemplateSource()): LintFinding[] {
  const snippets = new Set(snippetNames(source));
  const skills = new Set(skillNames(source));
  const findings: LintFinding[] = [];
  for (const t of source.templates) {
    for (const m of t.source.matchAll(/\{\{>\s*([\w-]+)\s*\}\}/g)) {
      if (!snippets.has(m[1]!)) findings.push({ id: t.id, detail: `composes {{>${m[1]}}}, which has no snippet` });
    }
    for (const m of t.source.matchAll(/Skill\("([^"]+)"\)/g)) {
      const target = m[1]!;
      // `Skill("<name>")` is the call's shape shown in prose, not a call.
      if (target.startsWith('<') || skills.has(target)) continue;
      findings.push({ id: t.id, detail: `invokes Skill("${target}"), which has no skill directory` });
    }
  }
  return findings;
}

/**
 * References that resolve only inside SmithyCLI (INV-2).
 *
 * Deployed text is runtime instruction for an agent standing in someone else's
 * repo, where every one of these dead-ends or misleads. The patterns are the
 * unambiguous ones the invariant names outright — a source path carrying a line
 * number, a bare issue or PR number, this repo's URL, a pointer at a
 * source-tree-only document, and this repo's own build directories. INV-2's
 * carve-out for purely illustrative example paths is why a bare `src/…` path is
 * not itself a finding: an example is not an instruction, and the tree uses
 * example paths deliberately.
 */
const INTERNAL_REFERENCE_PATTERNS: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\bsrc\/[\w./-]+\.(?:ts|tsx|js|json|md):\d+/g, why: 'source path with a line number' },
  { pattern: /\bsrc\/(?:commands|agents|engraved)\/[\w-]+\.ts\b/g, why: 'SmithyCLI source module' },
  { pattern: /\bsrc\/(?:manifest|templates|permissions|orders-templates|cli|agent-models|skill-frontmatter|command-frontmatter)\.ts\b/g, why: 'SmithyCLI source module' },
  { pattern: /(?<![\w#])#\d{2,4}\b/g, why: 'SmithyCLI issue or PR number' },
  { pattern: /Balexda\/SmithyCLI/g, why: "this repo's URL" },
  { pattern: /\bevals\//g, why: "this repo's eval fixtures" },
  { pattern: /\bagent-skills\/README/g, why: 'source-tree-only document' },
  { pattern: /\bCONTRIBUTING\.md\b/g, why: 'source-tree-only document' },
];

export function findInternalReferences(source: TemplateSource = loadTemplateSource()): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const t of source.templates) {
    for (const { pattern, why } of INTERNAL_REFERENCE_PATTERNS) {
      for (const m of t.source.matchAll(pattern)) {
        findings.push({ id: t.id, detail: `${why}: \`${m[0]}\`` });
      }
    }
  }
  return findings;
}

/**
 * Word budgets for the descriptions that sit in context before any work begins
 * (P-1).
 *
 * Sub-agent and command descriptions are the tightest: a sub-agent's is
 * advertised to every parent that can dispatch it, and a command's rides the
 * registry for a command the operator invokes by name anyway, so neither has to
 * explain the procedure. A skill's description is the trigger the model matches
 * on to decide whether to load the body at all, so it is allowed the room that
 * enumerating triggers takes.
 */
export const DESCRIPTION_BUDGETS = { agents: 40, commands: 40, skills: 55 } as const;

/**
 * Commands that stay in the model's registry (`disable-model-invocation:
 * false`), keyed by file stem. Every other command is a pipeline step the
 * operator drives and opts out. `smithy.engrave` is the exception: recording
 * a durable commitment is something a planning or review agent should be able
 * to reach for mid-task, and its description is the trigger it matches on.
 */
export const MODEL_INVOCABLE_COMMANDS: ReadonlySet<string> = new Set(['smithy.engrave']);

/** The command's file stem: `smithy.engrave.prompt` / `.md` → `smithy.engrave`. */
export function commandStem(file: string): string {
  return path.basename(file).replace(/\.(prompt|md)$/, '');
}

export interface DescribedTemplate {
  id: string;
  surface: keyof typeof DESCRIPTION_BUDGETS;
  /** The key an allowlist entry uses: agent/command/skill `name`. */
  name: string;
  description: string;
  words: number;
}

/** Every surface that ships a `description`, with its word count. */
export function listDescribedTemplates(source: TemplateSource = loadTemplateSource()): DescribedTemplate[] {
  const out: DescribedTemplate[] = [];
  for (const t of source.templates) {
    const isSkillBody = t.category === 'skills' && t.id.endsWith('/SKILL.prompt');
    if (t.category !== 'agents' && t.category !== 'commands' && !isSkillBody) continue;
    const surface: DescribedTemplate['surface'] = isSkillBody ? 'skills' : t.category as 'agents' | 'commands';
    const { frontmatter } = splitFrontmatter(t.source);
    const description = scalar(frontmatter, 'description');
    const fallback = isSkillBody ? t.id.split('/')[1]! : path.basename(t.id);
    out.push({
      id: t.id,
      surface,
      name: scalar(frontmatter, 'name') || fallback,
      description,
      words: description ? description.split(/\s+/).filter(Boolean).length : 0,
    });
  }
  return out;
}

/** Descriptions that are missing, or longer than their surface's budget. */
export function findOverBudgetDescriptions(
  exempt: ReadonlySet<string> = new Set(),
  source: TemplateSource = loadTemplateSource(),
): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const t of listDescribedTemplates(source)) {
    if (!t.description) {
      findings.push({ id: t.id, detail: 'declares no description' });
      continue;
    }
    const budget = DESCRIPTION_BUDGETS[t.surface];
    if (t.words > budget && !exempt.has(t.name)) {
      findings.push({ id: t.id, detail: `description is ${t.words} words, over the ${budget}-word ${t.surface} budget` });
    }
  }
  return findings;
}

/**
 * The pipeline's three grading scales, each with the values it admits.
 *
 * `debt-row-shape.md` is the canonical home; these are the sets it defines, and
 * a template stating a subset (review confidence uses the two endpoints of the
 * confidence scale) agrees rather than diverges. Cross-contamination is what
 * this catches: `Important` is a severity value, and a template offering it as
 * an `Impact` has invented a fourth scale.
 */
export const ENUM_SCALES: Record<string, readonly string[]> = {
  impact: ['Critical', 'High', 'Medium', 'Low'],
  confidence: ['High', 'Medium', 'Low'],
  severity: ['Critical', 'Important', 'Minor'],
};

const ENUM_VOCABULARY = 'Critical|Important|High|Medium|Minor|Low';
const ENUM_RUN = new RegExp(`(?:${ENUM_VOCABULARY})(?:\\s*[/,|]\\s*(?:${ENUM_VOCABULARY}))+`, 'g');
const ENUM_FIELD = /\b(impact|confidence|severity)\b/gi;

/** One field named on a line, with the value run stated beside it. */
export interface EnumStatement {
  id: string;
  line: number;
  field: string;
  values: string[];
}

/**
 * Harvest positive enumerations of the grading scales.
 *
 * A line naming more than one of the three fields is skipped: the run beside it
 * cannot be attributed, and the canonical table's header row names all of them.
 */
export function listEnumStatements(source: TemplateSource = loadTemplateSource()): EnumStatement[] {
  const out: EnumStatement[] = [];
  for (const t of source.templates) {
    t.source.split('\n').forEach((line, i) => {
      const fields = new Set([...line.matchAll(ENUM_FIELD)].map(m => m[1]!.toLowerCase()));
      if (fields.size !== 1) return;
      const bare = line.replace(/`/g, '');
      const runs = [...bare.matchAll(ENUM_RUN)].map(m => m[0]);
      if (!runs.length) return;
      const values = [...new Set(runs.flatMap(r => r.split(/\s*[/,|]\s*/)))];
      out.push({ id: t.id, line: i + 1, field: [...fields][0]!, values });
    });
  }
  return out;
}

/** Enumerations offering a value the field's canonical scale does not admit. */
export function findEnumDrift(source: TemplateSource = loadTemplateSource()): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const s of listEnumStatements(source)) {
    const allowed = ENUM_SCALES[s.field]!;
    const stray = s.values.filter(v => !allowed.includes(v));
    if (stray.length) {
      findings.push({
        id: `${s.id}:${s.line}`,
        detail: `states ${s.field} as ${s.values.join(' / ')}; ${stray.join(', ')} ${stray.length === 1 ? 'is not a' : 'are not'} ${s.field} value${stray.length === 1 ? '' : 's'} (scale: ${allowed.join(' / ')})`,
      });
    }
  }
  return findings;
}

/**
 * Which templates compose each snippet — the ground truth the snippets README's
 * **Used By** column claims.
 *
 * Keyed by snippet name, valued by the short label the README uses: a command,
 * agent, or prompt without its `smithy.` prefix, or a snippet's own filename
 * when one snippet nests another.
 */
export function snippetConsumers(source: TemplateSource = loadTemplateSource()): Map<string, Set<string>> {
  const consumers = new Map<string, Set<string>>();
  for (const name of snippetNames(source)) consumers.set(name, new Set());
  for (const t of source.templates) {
    const label = t.category === 'snippets'
      ? path.basename(t.id).replace(/\.md$/, '')
      : path.basename(t.id).replace(/^smithy\./, '').replace(/\.prompt$/, '');
    for (const m of t.source.matchAll(/\{\{>\s*([\w-]+)\s*\}\}/g)) {
      consumers.get(m[1]!)?.add(label);
    }
  }
  return consumers;
}

/**
 * A run of lines copied from one deployable template into another (INV-1,
 * D-1).
 *
 * `findRestatedProtocol` only sees text that has a snippet behind it; a
 * passage pasted between two commands with no snippet yet passes it. This
 * compares authored source, so text a template composes through `{{>…}}` is
 * a single partial line here and never counts as a copy.
 */
export interface CrossTemplateCopy {
  /** The template the finding is reported against. */
  id: string;
  /** The other template carrying the same run. */
  other: string;
  /** 1-based source line where the run starts in `id`. */
  line: number;
  /** Number of significant lines in the run. */
  length: number;
  /** The run's first significant line, normalised. */
  first: string;
}

/**
 * Lines shorter than this are boilerplate that collides by accident —
 * `Otherwise:`, `- **Yes**`, a lone `{{/ifAgent}}`.
 */
export const COPY_MIN_LINE_LENGTH = 30;
/**
 * A run this long is a passage, not a phrase. Three lines still matched
 * unrelated templates sharing a stock list item; at four, every finding on the
 * tree is a passage someone pasted.
 */
export const COPY_MIN_RUN = 4;

/**
 * The lines a copy is judged on, with their 1-based source line numbers.
 *
 * Whitespace is collapsed and list/blockquote markers are kept, because a
 * copy re-indented into a nested list is still a copy. Dropped: frontmatter,
 * blank lines, fence markers, table separator rows, headings (two templates
 * sharing `## Phase 3: Review` is structure, not a copy), partial and helper
 * lines, and anything shorter than `COPY_MIN_LINE_LENGTH`.
 */
function significantLines(source: string): Array<{ line: number; text: string }> {
  const { frontmatter, body } = splitFrontmatter(source);
  const offset = frontmatter ? source.slice(0, source.length - body.length).split('\n').length - 1 : 0;
  const out: Array<{ line: number; text: string }> = [];
  body.split('\n').forEach((raw, i) => {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (text.length < COPY_MIN_LINE_LENGTH) return;
    if (/^(```|~~~)/.test(text)) return;
    if (/^\|?[\s:|-]+\|?$/.test(text) && text.includes('-')) return;
    if (/^(>\s*)*#{1,6}\s/.test(text)) return;
    if (/^\{\{[^}]*\}\}$/.test(text)) return;
    out.push({ line: offset + i + 1, text });
  });
  return out;
}

/**
 * Every maximal run of at least `minRun` consecutive significant lines that
 * two deployable templates (commands, prompts, agents, skills and their
 * bundled references) both carry. Snippets are excluded: they are the
 * canonical homes, and their consumers compose rather than copy them.
 *
 * Each pair is reported once per run, from both sides, so an allowlist entry
 * names the template it excuses.
 */
export function findCrossTemplateCopies(
  source: TemplateSource = loadTemplateSource(),
  minRun = COPY_MIN_RUN,
): CrossTemplateCopy[] {
  const docs = source.templates
    .filter(t => t.category !== 'snippets')
    .map(t => ({ id: t.id, lines: significantLines(t.source) }));

  // Index every window of `minRun` lines by its joined text.
  const windows = new Map<string, Array<{ doc: number; at: number }>>();
  docs.forEach((d, doc) => {
    for (let at = 0; at + minRun <= d.lines.length; at++) {
      const key = d.lines.slice(at, at + minRun).map(l => l.text).join('\n');
      if (!windows.has(key)) windows.set(key, []);
      windows.get(key)!.push({ doc, at });
    }
  });

  // Collect matching window starts per (doc, other doc) pair, then fold
  // overlapping windows into maximal runs.
  const starts = new Map<string, Set<number>>();
  for (const hits of windows.values()) {
    for (const a of hits) {
      for (const b of hits) {
        if (a.doc === b.doc) continue;
        const key = `${a.doc}:${b.doc}`;
        if (!starts.has(key)) starts.set(key, new Set());
        starts.get(key)!.add(a.at);
      }
    }
  }

  const copies: CrossTemplateCopy[] = [];
  for (const [key, set] of starts) {
    const [a, b] = key.split(':').map(Number) as [number, number];
    const sorted = [...set].sort((x, y) => x - y);
    let runStart = sorted[0]!;
    let prev = runStart;
    const flush = () => {
      const lines = docs[a]!.lines;
      copies.push({
        id: docs[a]!.id,
        other: docs[b]!.id,
        line: lines[runStart]!.line,
        length: prev - runStart + minRun,
        first: lines[runStart]!.text,
      });
    };
    for (const at of sorted.slice(1)) {
      if (at === prev + 1) { prev = at; continue; }
      flush();
      runStart = prev = at;
    }
    flush();
  }
  return copies.sort((x, y) => x.id.localeCompare(y.id) || x.line - y.line || x.other.localeCompare(y.other));
}

/** `findCrossTemplateCopies`, shaped as lint findings. */
export function crossTemplateCopyFindings(source: TemplateSource = loadTemplateSource()): LintFinding[] {
  return findCrossTemplateCopies(source).map(c => ({
    id: c.id,
    detail: `${c.length} lines at line ${c.line} also in ${c.other}: ${truncate(c.first)}`,
  }));
}

/** An open Markdown code fence: its marker character, run length, and info string. */
interface OpenFence { char: '`' | '~'; length: number; info: string }

/** The fence a trimmed line opens, or `undefined` when it opens none. */
function fenceOpening(line: string): OpenFence | undefined {
  const m = line.match(/^(`{3,}|~{3,})\s*([^\s`]*)/);
  return m ? { char: m[1]![0] as '`' | '~', length: m[1]!.length, info: m[2]! } : undefined;
}

/**
 * Whether a trimmed line closes `fence`: the same marker character, at least
 * as long as the opener, and nothing after it — so a three-backtick line
 * inside a four-backtick example stays example text.
 */
function closesFence(line: string, fence: OpenFence): boolean {
  const m = line.match(/^(`{3,}|~{3,})\s*$/);
  return !!m && m[1]![0] === fence.char && m[1]!.length >= fence.length;
}

/**
 * Checkbox list items under a `Dependency Order` heading.
 *
 * The section is a four-column table at every level; a checkbox list there is
 * the retired format, and an example that shows one teaches the agent to emit
 * it (INV-8). Fenced blocks are scanned as documents of their own — an output
 * example's headings scope only that example — so a fence opening or closing
 * resets the section. A section ends at the next heading of the same or a
 * higher level, which is why `## Slice N:` task checkboxes are untouched.
 */
export function findDependencyOrderCheckboxes(source: TemplateSource = loadTemplateSource()): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const t of source.templates) {
    let level = 0; // heading level of the open Dependency Order section; 0 when none
    let fence: OpenFence | undefined;
    t.source.split('\n').forEach((raw, i) => {
      const line = raw.trim().replace(/^(>\s*)+/, '');
      if (fence ? closesFence(line, fence) : fenceOpening(line)) {
        fence = fence ? undefined : fenceOpening(line);
        level = 0;
        return;
      }
      const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*$/);
      if (heading) {
        const depth = heading[1]!.length;
        if (level && depth <= level) level = 0;
        if (/^dependency order$/i.test(normalizeHeading(heading[2]!.replace(/[*_`]/g, '')))) level = depth;
        return;
      }
      if (level && /^(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(line)) {
        findings.push({ id: t.id, detail: `line ${i + 1}: checkbox under Dependency Order: ${truncate(line)}` });
      }
    });
  }
  return findings;
}

/**
 * Names a bare `{{name}}` may use, because the deploy-time renderer defines
 * them: `artifactsRoot` is a registered helper and `else` belongs to a block
 * helper. Everything else in a bare mustache resolves against the empty render
 * context and deploys as an empty string.
 */
export const RENDER_TIME_NAMES: ReadonlySet<string> = new Set(['artifactsRoot', 'else']);

/** A bare mustache: not escaped, and not a partial, block, inverse, or comment. */
const BARE_MUSTACHE = /(?<!\\)\{\{(?![>#/^!{])\s*([^{}]*?)\s*\}\}/g;

/**
 * Mustaches that deploy blank. Templates are rendered by Handlebars with an
 * empty context, so a placeholder the *agent* is meant to substitute at run
 * time — `{{title}}` in an issue-body context list — renders as nothing, and
 * a bullet naming it becomes an empty code span. Such a name has to be
 * written `\{{title}}` to survive the render. Matching the source rather than
 * the rendered output is what makes this precise: a deliberate double-backtick
 * span looks like an empty span once rendered, while a bare mustache with an
 * unknown name has no legitimate reading.
 */
export function findBlankRenderedPlaceholders(source: TemplateSource = loadTemplateSource()): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const t of source.templates) {
    t.source.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(BARE_MUSTACHE)) {
        const name = m[1]!;
        if (RENDER_TIME_NAMES.has(name)) continue;
        findings.push({ id: t.id, detail: `line ${i + 1}: {{${name}}} renders blank; escape it as \\{{${name}}}` });
      }
    });
  }
  return findings;
}

/** A skill file's grant lists, as the deployers read them. */
export interface SkillGrants {
  id: string;
  /** `allowed-tools` entries; empty when the key is absent. */
  allowed: string[];
  /** Whether `allowed-tools` is declared at all. */
  declaresAllowed: boolean;
  /** `codex-allowed-tools` entries; empty when the key is absent. */
  codex: string[];
  declaresCodex: boolean;
}

/**
 * Split a space-separated grant list. Entries carry spaces inside their
 * parentheses (`Bash(smithy status *)`), so the split is on spaces at depth 0.
 */
function splitGrants(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Whether one Claude permission rule covers a tool use, per the grammar in
 * docs/permission-grammar.md: `Bash(P *)` matches `P` bare or followed by a
 * space, any other `*` spans anything, and an MCP rule may glob only after its
 * literal `mcp__<server>__` prefix.
 */
export function grantCovers(rule: string, use: string): boolean {
  const toRegex = (pattern: string) => new RegExp(`^${pattern
    .split(' *').map(part => part.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*'))
    .join('(?: .*)?')}$`);
  const bash = (s: string) => s.match(/^Bash\((.*)\)$/)?.[1];
  const ruleCmd = bash(rule);
  const useCmd = bash(use);
  if (ruleCmd !== undefined && useCmd !== undefined) {
    // A trailing ` *` is the only form that also matches the bare command.
    return toRegex(ruleCmd).test(useCmd);
  }
  const skill = (s: string) => s.match(/^Skill\(([^ )]+)(?: \*)?\)$/)?.[1];
  if (skill(rule) !== undefined && skill(use) !== undefined) return skill(rule) === skill(use);
  if (rule.startsWith('mcp__') && rule.includes('*')) return toRegex(rule).test(use);
  return rule === use;
}

export function listSkillGrants(source: TemplateSource = loadTemplateSource()): SkillGrants[] {
  return source.templates
    .filter(t => /^skills\/[^/]+\/SKILL\.prompt$/.test(t.id))
    .map(t => {
      const { frontmatter } = splitFrontmatter(t.source);
      const declaresAllowed = /^allowed-tools:/m.test(frontmatter);
      const declaresCodex = /^codex-allowed-tools:/m.test(frontmatter);
      return {
        id: t.id,
        allowed: splitGrants(scalar(frontmatter, 'allowed-tools')),
        declaresAllowed,
        codex: splitGrants(scalar(frontmatter, 'codex-allowed-tools')),
        declaresCodex,
      };
    });
}

/**
 * Commands inside shell-language fences, with Handlebars already resolved.
 *
 * Backslash-continued lines are joined into one command, heredoc bodies are
 * skipped (they are data the command writes), and each command is split into
 * the subcommands Claude Code matches on their own.
 */
function fencedShellCommands(body: string): string[] {
  const commands: string[] = [];
  let fence: OpenFence | undefined;
  let heredoc: string | null = null;
  let pending = '';
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (fence ? closesFence(line, fence) : fenceOpening(line)) {
      fence = fence ? undefined : fenceOpening(line);
      heredoc = null;
      pending = '';
      continue;
    }
    if (!fence || !/^(bash|sh|shell|zsh)$/.test(fence.info)) continue;
    if (heredoc !== null) {
      if (line === heredoc) heredoc = null;
      continue;
    }
    if (!pending && (!line || line.startsWith('#'))) continue;
    if (line.endsWith('\\')) {
      pending += `${line.slice(0, -1).trim()} `;
      continue;
    }
    const command = `${pending}${line}`.trim();
    pending = '';
    commands.push(...splitCompound(command));
    // A heredoc's body is data written by the command, not commands.
    heredoc = command.match(/<<-?\s*['"]?(\w+)['"]?/)?.[1] ?? null;
  }
  return commands;
}

/**
 * Split a shell line on `;`, `&&`, `||`, `|`, and a backgrounding `&`,
 * whatever whitespace surrounds them, outside quotes. A `&` inside a
 * redirection (`2>&1`, `&>file`) is not a separator.
 */
export function splitCompound(line: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < line.length) { cur += ch + line[++i]; continue; }
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === '\\' && i + 1 < line.length) { cur += ch + line[++i]; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    const two = line.slice(i, i + 2);
    if (two === '&&' || two === '||') { parts.push(cur); cur = ''; i++; continue; }
    if (ch === ';' || ch === '|') { parts.push(cur); cur = ''; continue; }
    if (ch === '&' && line[i - 1] !== '>' && line[i - 1] !== '<' && line[i + 1] !== '>') {
      parts.push(cur); cur = ''; continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map(p => p.trim()).filter(Boolean);
}

/**
 * Tool uses a skill body (and the references it bundles) makes that its grant
 * lists do not cover (INV-3, grant side).
 *
 * Deliberately narrow, so a finding is always a real invocation:
 * - a bundled script run from a shell fence (`${CLAUDE_SKILL_DIR}/scripts/…`),
 *   which needs a `Bash(…)` rule matching it with its arguments;
 * - when the skill declares `allowed-tools`, every other fenced shell command
 *   too — a skill that pre-declares its grant has to declare all of it;
 * - an MCP tool named in backticks (`mcp__github__issue_write`);
 * - a `Skill("…")` call, when the skill declares `allowed-tools`;
 * - on the Codex render, a GitHub-app action named in backticks (`_fetch_pr_comments`),
 *   which `codex-allowed-tools` must list — whether or not the key is declared.
 *
 * Bodies are rendered per variant first, so a script path gated to Claude is
 * judged against the Claude grant only.
 */
export async function findMissingSkillGrants(source: TemplateSource = loadTemplateSource()): Promise<LintFinding[]> {
  const skills = listSkillGrants(source);
  const filesOf = (skill: SkillGrants) => {
    const dir = skill.id.replace(/SKILL\.prompt$/, '');
    return source.templates.filter(t => t.id.startsWith(dir)).map(t => splitFrontmatter(t.source).body);
  };

  // One variant per pass: renderers share Handlebars helper state, so a
  // second renderer created before the first finishes rebinds its gating.
  const needed = new Map<string, Set<string>>(skills.map(s => [s.id, new Set()]));
  const claude = createTemplateRenderer('claude', '', buildPartialsMap(source.snippets));
  for (const skill of skills) {
    const uses = needed.get(skill.id)!;
    for (const raw of filesOf(skill)) {
      const body = await resolveSnippets(raw, claude);
      for (const cmd of fencedShellCommands(body)) {
        if (cmd.startsWith('${CLAUDE_SKILL_DIR}/') || skill.declaresAllowed) uses.add(`Bash(${cmd})`);
      }
      for (const m of body.matchAll(/`(mcp__[a-z0-9_-]+__[a-z0-9_]+)`/gi)) uses.add(m[1]!);
      if (skill.declaresAllowed) {
        for (const m of body.matchAll(/Skill\("([^"]+)"\)/g)) uses.add(`Skill(${m[1]})`);
      }
    }
  }

  const codexNeeded = new Map<string, Set<string>>(skills.map(s => [s.id, new Set()]));
  const codex = createTemplateRenderer('codex', '', buildPartialsMap(source.snippets));
  // Every skill, not only those declaring the key: an action used with the key
  // omitted deploys with no Codex grant at all, the same gap as an empty list.
  for (const skill of skills) {
    for (const raw of filesOf(skill)) {
      const body = await resolveSnippets(raw, codex);
      for (const m of body.matchAll(/`(_[a-z][a-z0-9_]*)`/g)) codexNeeded.get(skill.id)!.add(m[1]!);
    }
  }

  const findings: LintFinding[] = [];
  for (const skill of skills) {
    for (const use of [...needed.get(skill.id)!].sort()) {
      if (!skill.allowed.some(rule => grantCovers(rule, use))) {
        findings.push({ id: skill.id, detail: `invokes ${use} but allowed-tools does not cover it` });
      }
    }
    for (const use of [...codexNeeded.get(skill.id)!].sort()) {
      if (!skill.codex.includes(use)) {
        findings.push({ id: skill.id, detail: `invokes ${use} on Codex but codex-allowed-tools does not list it` });
      }
    }
  }
  return findings;
}

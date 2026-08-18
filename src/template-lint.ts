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
 * | INV-1 | shared protocols are composed or cited, never restated | `findDuplicateInjections`, `findRestatedProtocol` |
 * | INV-2 | deployable templates read correctly outside SmithyCLI | `findInternalReferences` |
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

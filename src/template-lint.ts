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
 * Each function returns findings rather than throwing, so the test that drives
 * it owns the allowlists and the failure message. Anything reading the composed
 * form goes through `createTemplateRenderer` rather than regexing raw source,
 * so `{{#ifAgent}}` gating is resolved by the same code path that deploys.
 *
 * Two checks the issue scoped here already exist elsewhere and are deliberately
 * not restated: the Bash permission grammar is asserted over generated
 * settings.json in `permissions.test.ts` and over skill `allowed-tools` in
 * `templates.test.ts`.
 */
import fs from 'fs';
import path from 'path';
import type { Dotprompt } from 'dotprompt';
import {
  buildPartialsMap,
  createTemplateRenderer,
  loadSnippets,
  resolveSnippets,
} from './templates.js';
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
  /** Absolute path on disk. */
  absPath: string;
  /** Raw source text, frontmatter included. */
  source: string;
}

/** One lint failure. `id` names the template; `detail` is the operator-facing why. */
export interface LintFinding {
  id: string;
  detail: string;
}

/**
 * Every file whose *content* reaches a target repo: the four template
 * categories plus snippets (inlined rather than deployed, but their text ships)
 * and any reference files a skill bundles. READMEs are source-tree docs and are
 * excluded — they are the one place internal references are correct.
 */
export function listDeployableTemplates(): DeployableTemplate[] {
  const out: DeployableTemplate[] = [];
  const add = (category: DeployableTemplate['category'], absPath: string, id: string) => {
    out.push({ id, category, absPath, source: fs.readFileSync(absPath, 'utf8') });
  };

  const flat: Array<[DeployableTemplate['category'], string, string]> = [
    ['commands', commandsTemplateDir, '.prompt'],
    ['prompts', promptsTemplateDir, '.prompt'],
    ['agents', agentsTemplateDir, '.prompt'],
    ['snippets', snippetsTemplateDir, '.md'],
  ];
  for (const [category, dir, ext] of flat) {
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith(ext) || file === 'README.md') continue;
      add(category, path.join(dir, file), `${category}/${file}`);
    }
  }

  for (const skill of listSkillNames()) {
    const skillDir = path.join(skillsTemplateDir, skill);
    for (const rel of listFilesRecursive(skillDir)) {
      // Scripts are shell, not prose, and carry their own review surface.
      if (rel.startsWith('scripts/') || !rel.endsWith('.prompt')) continue;
      add('skills', path.join(skillDir, ...rel.split('/')), `skills/${skill}/${rel}`);
    }
  }
  return out;
}

function listSkillNames(): string[] {
  return fs.readdirSync(skillsTemplateDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
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
export function snippetNames(): string[] {
  return [...loadSnippets().keys()].map(f => f.replace(/\.md$/, '')).sort();
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
function sentinelRenderer(variant: string): Dotprompt {
  const marked = new Map<string, string>();
  for (const [name, body] of buildPartialsMap(loadSnippets())) {
    marked.set(name, `${SENTINEL(name)}\n${body}`);
  }
  return createTemplateRenderer(variant, '', marked);
}

/** Compose every deployable template for one agent variant, sentinels included. */
async function composeWithSentinels(variant: string): Promise<Map<string, string>> {
  const renderer = sentinelRenderer(variant);
  const out = new Map<string, string>();
  for (const t of listDeployableTemplates()) {
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
export async function findDuplicateInjections(variant: string): Promise<LintFinding[]> {
  const names = snippetNames();
  const findings: LintFinding[] = [];
  for (const [id, body] of await composeWithSentinels(variant)) {
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
export function snippetCanaries(minLength = 50): Map<string, string[]> {
  const raw = new Map<string, string[]>();
  for (const [file, body] of loadSnippets()) {
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
  canariesPerSnippet = 6,
): Promise<LintFinding[]> {
  const canaries = snippetCanaries();
  const findings: LintFinding[] = [];
  for (const [id, body] of await composeWithSentinels(variant)) {
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

/** Every section heading any deployable template emits, scaffolds included. */
export function emittedHeadings(): Set<string> {
  const headings = new Set<string>();
  for (const t of listDeployableTemplates()) {
    for (const line of t.source.split('\n')) {
      // Scaffolds are shown indented, inside fences, and blockquoted; strip
      // all three so an emitted heading counts wherever it is illustrated.
      const stripped = line.trim().replace(/^>+\s*/, '');
      const m = stripped.match(/^#{2,4}\s+(\S.*)$/);
      if (m) headings.add(normalizeHeading(m[1]!));
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
export function findDeadRoutingDestinations(): LintFinding[] {
  const headings = emittedHeadings();
  const findings: LintFinding[] = [];
  for (const t of listDeployableTemplates()) {
    if (t.category !== 'snippets' && t.category !== 'agents') continue;
    for (const m of t.source.matchAll(HEADING_REF)) {
      const name = normalizeHeading(m[2]!);
      if (PLACEHOLDER.test(name) || headings.has(name)) continue;
      findings.push({ id: t.id, detail: `routes findings to \`${m[1]} ${name}\`, which no template emits` });
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
export function listAgentTemplates(): AgentTemplate[] {
  return fs.readdirSync(agentsTemplateDir).sort()
    .filter(f => f.endsWith('.prompt'))
    .map(file => {
      const { frontmatter, body } = splitFrontmatter(
        fs.readFileSync(path.join(agentsTemplateDir, file), 'utf8'),
      );
      // `tools:` is authored both inline (`tools: Read, Edit`) and as a
      // YAML block list; a parser that read only one form would report the
      // other as granting nothing.
      const inline = scalar(frontmatter, 'tools');
      const tools = inline
        ? inline.split(',').map(t => t.trim()).filter(Boolean)
        : [...frontmatter.matchAll(/^\s*-\s*(\w+)\s*$/gm)].map(m => m[1]!);
      return {
        id: `agents/${file}`,
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
export function findMissingToolGrants(): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const agent of listAgentTemplates()) {
    const granted = new Set(agent.tools);
    const needed = new Set<string>();
    if (/Skill\("/.test(agent.body)) needed.add('Skill');
    for (const m of agent.body.matchAll(/`(\w+)`/g)) {
      const tool = m[1]!;
      if ((TOOL_NAMES as readonly string[]).includes(tool)) needed.add(tool);
    }
    for (const tool of [...needed].sort()) {
      if (!granted.has(tool)) {
        findings.push({ id: agent.id, detail: `body invokes ${tool} but tools: grants only ${agent.tools.join(', ') || '(nothing)'}` });
      }
    }
  }
  return findings;
}

/**
 * Every `smithy-…` identifier a template can legitimately name: the sub-agents
 * it can dispatch, the commands it can point an operator at (Codex's dashed
 * spelling), and the reference prompts it can tell one to read.
 */
export function knownSmithyIdentifiers(): Set<string> {
  const names = new Set<string>();
  for (const dir of [agentsTemplateDir, commandsTemplateDir, promptsTemplateDir]) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.prompt')) continue;
      const { frontmatter } = splitFrontmatter(fs.readFileSync(path.join(dir, file), 'utf8'));
      const name = scalar(frontmatter, 'name');
      if (name) names.add(name);
    }
  }
  return names;
}

/**
 * `smithy-…` names that resolve to nothing deployed — a dispatch to an agent
 * that does not exist, or a pointer at a renamed command.
 *
 * A name followed by `.` or `:` is a filename or a marker key
 * (`smithy-manifest.json`, `smithy-pr-review-response-to:`), not an identifier,
 * and is skipped.
 */
export function findUnresolvedSmithyNames(): LintFinding[] {
  const known = knownSmithyIdentifiers();
  const findings: LintFinding[] = [];
  for (const t of listDeployableTemplates()) {
    const seen = new Set<string>();
    for (const m of t.source.matchAll(/\bsmithy-[a-z][a-z-]*\b(.?)/g)) {
      const name = m[0].slice(0, m[0].length - (m[1] ? 1 : 0));
      if (m[1] === '.' || m[1] === ':') continue;
      if (known.has(name) || seen.has(name)) continue;
      seen.add(name);
      findings.push({ id: t.id, detail: `names \`${name}\`, which matches no deployed agent, command, or prompt` });
    }
  }
  return findings;
}

/** `{{>snippet}}` targets and `Skill("name")` targets that do not exist. */
export function findUnresolvedReferences(): LintFinding[] {
  const snippets = new Set(snippetNames());
  const skills = new Set(listSkillNames());
  const findings: LintFinding[] = [];
  for (const t of listDeployableTemplates()) {
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

export function findInternalReferences(): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const t of listDeployableTemplates()) {
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
export function listDescribedTemplates(): DescribedTemplate[] {
  const out: DescribedTemplate[] = [];
  const push = (surface: DescribedTemplate['surface'], id: string, source: string, fallbackName: string) => {
    const { frontmatter } = splitFrontmatter(source);
    const description = scalar(frontmatter, 'description');
    out.push({
      id,
      surface,
      name: scalar(frontmatter, 'name') || fallbackName,
      description,
      words: description ? description.split(/\s+/).filter(Boolean).length : 0,
    });
  };
  for (const [surface, dir] of [['agents', agentsTemplateDir], ['commands', commandsTemplateDir]] as const) {
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.prompt')) continue;
      push(surface, `${surface}/${file}`, fs.readFileSync(path.join(dir, file), 'utf8'), file);
    }
  }
  for (const skill of listSkillNames()) {
    const body = path.join(skillsTemplateDir, skill, 'SKILL.prompt');
    if (fs.existsSync(body)) push('skills', `skills/${skill}/SKILL.prompt`, fs.readFileSync(body, 'utf8'), skill);
  }
  return out;
}

/** Descriptions that are missing, or longer than their surface's budget. */
export function findOverBudgetDescriptions(exempt: ReadonlySet<string> = new Set()): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const t of listDescribedTemplates()) {
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
export function listEnumStatements(): EnumStatement[] {
  const out: EnumStatement[] = [];
  for (const t of listDeployableTemplates()) {
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
export function findEnumDrift(): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const s of listEnumStatements()) {
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
export function snippetConsumers(): Map<string, Set<string>> {
  const consumers = new Map<string, Set<string>>();
  for (const name of snippetNames()) consumers.set(name, new Set());
  for (const t of listDeployableTemplates()) {
    const label = t.category === 'snippets'
      ? path.basename(t.id).replace(/\.md$/, '')
      : path.basename(t.id).replace(/^smithy\./, '').replace(/\.prompt$/, '');
    for (const m of t.source.matchAll(/\{\{>\s*([\w-]+)\s*\}\}/g)) {
      consumers.get(m[1]!)?.add(label);
    }
  }
  return consumers;
}

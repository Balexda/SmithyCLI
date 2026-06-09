import { parse as parseYaml } from 'yaml';

/**
 * Smithy's provider-neutral model abstraction for sub-agents.
 *
 * Sub-agent `.prompt` files declare a capability `tier` (and optional reasoning
 * `effort`) instead of a provider-specific model name. Each deployer translates
 * the tier into whatever that provider exposes:
 *
 *   - Claude: the tier picks the agent's `model:` (haiku/sonnet/opus).
 *   - Codex:  the tier (and any `effort` override) picks `model_reasoning_effort`
 *             while the model itself is inherited from the parent session.
 *
 * This keeps one knob in the source templates ("how much horsepower does this
 * sub-agent need?") and lets each provider honor it in its own idiom.
 */
export type ModelTier = 'light' | 'standard' | 'deep';
export type ModelEffort = 'low' | 'medium' | 'high';

interface TierMapping {
  /** Claude Code agent `model:` value for this tier. */
  claudeModel: 'haiku' | 'sonnet' | 'opus';
  /** Default Codex `model_reasoning_effort` for this tier (overridable by `effort:`). */
  codexEffort: ModelEffort;
}

const TIER_MAP: Record<ModelTier, TierMapping> = {
  light: { claudeModel: 'haiku', codexEffort: 'low' },
  standard: { claudeModel: 'sonnet', codexEffort: 'medium' },
  deep: { claudeModel: 'opus', codexEffort: 'high' },
};

export const MODEL_TIERS = Object.keys(TIER_MAP) as ModelTier[];
export const MODEL_EFFORTS: ModelEffort[] = ['low', 'medium', 'high'];

/** Tier assumed when a sub-agent omits `tier:`. */
export const DEFAULT_TIER: ModelTier = 'standard';

export function isModelTier(value: unknown): value is ModelTier {
  return typeof value === 'string' && value in TIER_MAP;
}

export function isModelEffort(value: unknown): value is ModelEffort {
  return typeof value === 'string' && (MODEL_EFFORTS as string[]).includes(value);
}

/** Translate a Smithy tier into the Claude Code agent `model:` value. */
export function tierToClaudeModel(tier: ModelTier): string {
  return TIER_MAP[tier].claudeModel;
}

/**
 * Translate a Smithy tier (plus optional explicit effort) into the Codex
 * `model_reasoning_effort`. An explicit `effort:` always wins over the
 * tier default.
 */
export function tierToCodexEffort(tier: ModelTier, override?: ModelEffort): ModelEffort {
  return override ?? TIER_MAP[tier].codexEffort;
}

export interface AgentModel {
  name: string | undefined;
  description: string | undefined;
  tools: string[];
  tier: ModelTier;
  effort: ModelEffort | undefined;
}

const FRONTMATTER_RE = /^(---\s*\n[\s\S]*?\n---\s*\n)([\s\S]*)$/;

/** Split an agent template into its raw frontmatter block and body. */
export function splitAgentFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: '', body: content };
  return { frontmatter: match[1] ?? '', body: match[2] ?? '' };
}

function normalizeTools(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map(t => t.trim()).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map(t => t.trim()).filter(Boolean);
  return [];
}

/**
 * Parse a sub-agent template's frontmatter into the structured model info both
 * deployers need. Tolerates the legacy `model: opus|sonnet|haiku` field by
 * mapping it back onto the equivalent tier, so a half-migrated tree still works.
 */
export function parseAgentModel(content: string): AgentModel {
  const { frontmatter } = splitAgentFrontmatter(content);
  const inner = frontmatter.replace(/^---\s*\n/, '').replace(/\n---\s*\n$/, '');
  const data = (inner ? parseYaml(inner) : {}) as Record<string, unknown>;

  let tier: ModelTier = DEFAULT_TIER;
  if (isModelTier(data.tier)) {
    tier = data.tier;
  } else if (typeof data.model === 'string') {
    // Legacy escape hatch: a bare Claude model name maps onto a tier.
    const legacy = (MODEL_TIERS as ModelTier[]).find(t => TIER_MAP[t].claudeModel === data.model);
    if (legacy) tier = legacy;
  }

  return {
    name: typeof data.name === 'string' ? data.name : undefined,
    description: typeof data.description === 'string' ? data.description : undefined,
    tools: normalizeTools(data.tools),
    tier,
    effort: isModelEffort(data.effort) ? data.effort : undefined,
  };
}

/**
 * Produce the Claude-deployed agent content: the source frontmatter with the
 * provider-neutral `tier:`/`effort:` lines replaced by a native `model:` line
 * that Claude Code understands. All other frontmatter formatting is preserved.
 */
export function toClaudeAgentContent(content: string): string {
  const { frontmatter, body } = splitAgentFrontmatter(content);
  if (!frontmatter) return content;

  const model = tierToClaudeModel(parseAgentModel(content).tier);
  const lines = frontmatter.split('\n');
  const out: string[] = [];
  let modelWritten = false;

  for (const line of lines) {
    if (/^tier:\s*/.test(line) || /^model:\s*/.test(line)) {
      if (!modelWritten) {
        out.push(`model: ${model}`);
        modelWritten = true;
      }
      continue; // drop the tier/legacy-model line (collapse duplicates)
    }
    if (/^effort:\s*/.test(line)) continue; // effort has no Claude frontmatter knob
    out.push(line);
  }

  if (!modelWritten) {
    // No tier/model line existed; inject one just before the closing fence.
    const closingIdx = out.lastIndexOf('---');
    if (closingIdx > 0) out.splice(closingIdx, 0, `model: ${model}`);
  }

  return out.join('\n') + body;
}

/** TOML basic-string escape for a single-line value (name/description). */
function tomlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Decide a Codex sandbox mode from the agent's declared tools. Agents that can
 * edit the working tree (Write/Edit/Bash) need write access; everything else is
 * read-only analysis.
 */
function sandboxModeForTools(tools: string[]): 'read-only' | 'workspace-write' {
  const writeCapable = new Set(['write', 'edit', 'bash']);
  return tools.some(t => writeCapable.has(t.toLowerCase())) ? 'workspace-write' : 'read-only';
}

/**
 * Render a sub-agent template into a Codex custom-agent TOML definition
 * (deployed to `.codex/agents/<name>.toml`). Returns the agent name and the
 * TOML text; `name` is undefined when the template has no `name:` frontmatter.
 */
export function toCodexAgentToml(content: string): { name: string | undefined; toml: string } {
  const model = parseAgentModel(content);
  const { body } = splitAgentFrontmatter(content);
  if (!model.name) return { name: undefined, toml: '' };

  const effort = tierToCodexEffort(model.tier, model.effort);
  const sandbox = sandboxModeForTools(model.tools);
  const instructions = body.replace(/^\n+/, '').replace(/\s+$/, '');

  const toml = [
    `name = ${tomlString(model.name)}`,
    model.description ? `description = ${tomlString(model.description)}` : undefined,
    `sandbox_mode = "${sandbox}"`,
    `model_reasoning_effort = "${effort}"`,
    '',
    'developer_instructions = """',
    // Escape any literal triple-quote so it cannot close the block early.
    instructions.replace(/"""/g, '\\"\\"\\"'),
    '"""',
    '',
  ]
    .filter(line => line !== undefined)
    .join('\n');

  return { name: model.name, toml };
}

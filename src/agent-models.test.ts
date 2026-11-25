import { describe, it, expect } from 'vitest';
import { parse as parseToml } from 'smol-toml';
import {
  tierToClaudeModel,
  tierToCodexEffort,
  parseAgentModel,
  toClaudeAgentContent,
  toCodexAgentToml,
  MODEL_TIERS,
} from './agent-models.js';

const DEEP_AGENT = [
  '---',
  'name: smithy-plan',
  'description: "Design sub-agent."',
  'tools:',
  '  - Read',
  '  - Grep',
  'tier: deep',
  '---',
  '# smithy-plan',
  '',
  'You are the plan sub-agent.',
  '',
].join('\n');

const WRITE_AGENT = [
  '---',
  'name: smithy-implement',
  'description: "TDD implementation sub-agent."',
  'tools: Read, Edit, Write, Grep, Glob, Bash',
  'tier: deep',
  'effort: high',
  '---',
  '# smithy-implement',
  '',
  'Implement one task.',
  '',
].join('\n');

describe('model tier translation', () => {
  it('maps tiers to Claude models', () => {
    expect(tierToClaudeModel('light')).toBe('haiku');
    expect(tierToClaudeModel('standard')).toBe('sonnet');
    expect(tierToClaudeModel('deep')).toBe('opus');
  });

  it('maps tiers to Codex reasoning effort, honoring an explicit override', () => {
    expect(tierToCodexEffort('light')).toBe('low');
    expect(tierToCodexEffort('standard')).toBe('medium');
    expect(tierToCodexEffort('deep')).toBe('high');
    expect(tierToCodexEffort('light', 'high')).toBe('high');
  });

  it('exposes exactly the three tiers', () => {
    expect(MODEL_TIERS).toEqual(['light', 'standard', 'deep']);
  });
});

describe('parseAgentModel', () => {
  it('reads name, description, tools, tier, and effort', () => {
    const m = parseAgentModel(WRITE_AGENT);
    expect(m.name).toBe('smithy-implement');
    expect(m.description).toContain('TDD');
    expect(m.tools).toEqual(['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash']);
    expect(m.tier).toBe('deep');
    expect(m.effort).toBe('high');
  });

  it('falls back to the standard tier when none is declared', () => {
    const m = parseAgentModel('---\nname: x\n---\nbody');
    expect(m.tier).toBe('standard');
  });

  it('maps a legacy model: name back onto a tier', () => {
    const m = parseAgentModel('---\nname: x\nmodel: opus\n---\nbody');
    expect(m.tier).toBe('deep');
  });
});

describe('toClaudeAgentContent', () => {
  it('replaces tier: with a native model: line and preserves the body', () => {
    const out = toClaudeAgentContent(DEEP_AGENT);
    expect(out).toContain('model: opus');
    expect(out).not.toContain('tier:');
    expect(out).toContain('name: smithy-plan');
    expect(out).toContain('You are the plan sub-agent.');
  });

  it('drops the effort: line (Claude deployer does not translate it yet)', () => {
    const out = toClaudeAgentContent(WRITE_AGENT);
    expect(out).not.toContain('effort:');
    expect(out).toContain('model: opus');
  });
});

describe('toCodexAgentToml', () => {
  it('emits a TOML agent definition with effort and read-only sandbox', () => {
    const { name, toml } = toCodexAgentToml(DEEP_AGENT);
    expect(name).toBe('smithy-plan');
    expect(toml).toContain('name = "smithy-plan"');
    expect(toml).toContain('description = "Design sub-agent."');
    expect(toml).toContain('model_reasoning_effort = "high"');
    expect(toml).toContain('sandbox_mode = "read-only"');
    expect(toml).toContain('developer_instructions = """');
    expect(toml).toContain('You are the plan sub-agent.');
  });

  it('grants workspace-write to agents that can edit and honors effort override', () => {
    const { toml } = toCodexAgentToml(WRITE_AGENT);
    expect(toml).toContain('sandbox_mode = "workspace-write"');
    expect(toml).toContain('model_reasoning_effort = "high"');
  });

  // Codex documents no per-agent web-search key: a custom agent file can
  // change model settings, instructions, and disable `features.*`, and web
  // access follows the session's top-level `web_search` setting. Emitting one
  // would be a key the runtime ignores (INV-3), so web tools map to nothing.
  it('emits no web-search key for an agent that declares web tools', () => {
    const webAgent = DEEP_AGENT.replace('  - Grep\n', '  - Grep\n  - WebFetch\n  - WebSearch\n');
    expect(parseAgentModel(webAgent).tools).toContain('WebSearch');
    const parsed = parseToml(toCodexAgentToml(webAgent).toml) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      ['description', 'developer_instructions', 'model_reasoning_effort', 'name', 'sandbox_mode'],
    );
    expect(parsed.sandbox_mode).toBe('read-only');
  });

  it('emits no web-search key for an agent without web tools', () => {
    for (const agent of [DEEP_AGENT, WRITE_AGENT]) {
      const parsed = parseToml(toCodexAgentToml(agent).toml) as Record<string, unknown>;
      expect(Object.keys(parsed).some(k => /web/i.test(k))).toBe(false);
    }
  });

  it('returns no name when the template lacks frontmatter name', () => {
    expect(toCodexAgentToml('---\ntier: deep\n---\nbody').name).toBeUndefined();
  });

  it('round-trips backslashes and triple quotes through developer_instructions', () => {
    // Every backslash form that broke or corrupted the old emitter: a Markdown
    // table-pipe escape (invalid TOML escape), literal `\n`/`\t`/`\u0041`
    // (silently decoded), a Windows path, a literal triple quote, and a
    // trailing backslash right before the closing delimiter.
    const body = [
      '# smithy-escape',
      '',
      '| a \\| b | `\\n` and `\\t` and `\\u0041` |',
      'Path: C:\\path\\to\\file and \\\\server\\share',
      'Quote: """ and """" and "" end"',
      'Trailing backslash \\',
    ].join('\n');
    const content = ['---', 'name: smithy-escape', 'tier: light', '---', body, ''].join('\n');

    const { toml } = toCodexAgentToml(content);
    const parsed = parseToml(toml) as Record<string, unknown>;
    // The emitter puts the closing `"""` on its own line, so the decoded
    // string is the authored body plus that one newline.
    expect(parsed.developer_instructions).toBe(`${body}\n`);
    expect(parsed.name).toBe('smithy-escape');
  });
});

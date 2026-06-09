import { describe, it, expect } from 'vitest';
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

  it('drops the effort: line (no Claude frontmatter knob)', () => {
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

  it('returns no name when the template lacks frontmatter name', () => {
    expect(toCodexAgentToml('---\ntier: deep\n---\nbody').name).toBeUndefined();
  });
});

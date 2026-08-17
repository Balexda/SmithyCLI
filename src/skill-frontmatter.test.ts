import { describe, it, expect } from 'vitest';
import { translateSkillFrontmatter } from './skill-frontmatter.js';

const SKILL = [
  '---',
  'name: smithy.example',
  'description: "Does a thing."',
  'allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/run.sh *) mcp__github__issue_write',
  'codex-allowed-tools: _add_comment_to_issue _fetch_pr_comments',
  '---',
  '# smithy.example',
  '',
  'Body text.',
  '',
].join('\n');

describe('translateSkillFrontmatter', () => {
  it('keeps the Claude grant and drops the Codex one on the Claude path', () => {
    const out = translateSkillFrontmatter(SKILL, 'claude');
    expect(out).toContain('allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/run.sh *)');
    expect(out).not.toContain('codex-allowed-tools');
    expect(out).not.toContain('_add_comment_to_issue');
  });

  it('promotes the Codex grant to allowed-tools on the Codex path', () => {
    const out = translateSkillFrontmatter(SKILL, 'codex');
    expect(out).toContain('allowed-tools: _add_comment_to_issue _fetch_pr_comments');
    expect(out).not.toContain('codex-allowed-tools:');
    // The Claude grant — a Claude-only path variable and MCP tool names Codex
    // cannot call — never ships.
    expect(out).not.toContain('${CLAUDE_SKILL_DIR}');
    expect(out).not.toContain('mcp__github__issue_write');
  });

  it('drops the allowed-tools key entirely for Codex when no Codex grant is declared', () => {
    const claudeOnly = SKILL.replace('codex-allowed-tools: _add_comment_to_issue _fetch_pr_comments\n', '');
    const out = translateSkillFrontmatter(claudeOnly, 'codex');
    expect(out).not.toContain('allowed-tools');
    expect(out).toContain('name: smithy.example');
  });

  it('drops both grants for Gemini, whose allowlist lives in settings.json', () => {
    const out = translateSkillFrontmatter(SKILL, 'gemini');
    expect(out).not.toContain('allowed-tools');
    expect(out).toContain('name: smithy.example');
    expect(out).toContain('description: "Does a thing."');
  });

  it('preserves name, description, and the body on every path', () => {
    for (const target of ['claude', 'gemini', 'codex'] as const) {
      const out = translateSkillFrontmatter(SKILL, target);
      expect(out, target).toMatch(/^---\nname: smithy\.example\n/);
      expect(out, target).toContain('description: "Does a thing."');
      expect(out, target).toContain('# smithy.example\n\nBody text.');
    }
  });

  it('leaves content without frontmatter, or without either grant, unchanged', () => {
    expect(translateSkillFrontmatter('# Bare body\n', 'codex')).toBe('# Bare body\n');
    const plain = '---\nname: x\ndescription: y\n---\nbody\n';
    for (const target of ['claude', 'gemini', 'codex'] as const) {
      expect(translateSkillFrontmatter(plain, target), target).toBe(plain);
    }
  });
});

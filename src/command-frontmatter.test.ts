import { describe, it, expect } from 'vitest';
import { CLAUDE_COMMAND_FRONTMATTER_KEYS, toClaudeCommandContent } from './command-frontmatter.js';

describe('toClaudeCommandContent', () => {
  it('keeps the description — the whole point of translating instead of stripping', () => {
    const content = '---\nname: smithy-audit\ndescription: "Audits a Smithy artifact."\n---\n# smithy-audit\n';
    expect(toClaudeCommandContent(content)).toBe(
      '---\ndescription: "Audits a Smithy artifact."\n---\n# smithy-audit\n',
    );
  });

  it('drops `name` so a command is never advertised under its Codex spelling', () => {
    const content = '---\nname: smithy-audit\ndescription: "d"\n---\nbody\n';
    expect(toClaudeCommandContent(content)).not.toContain('name:');
  });

  it('keeps every key Claude Code reads on a command file', () => {
    const content = [
      '---',
      'name: smithy-forge',
      'description: "d"',
      'argument-hint: "<tasks-file> [<slice-number>]"',
      'allowed-tools: Bash(git status)',
      'disable-model-invocation: true',
      'model: opus',
      'context: fork',
      'agent: smithy-plan',
      'hooks:',
      '  PreToolUse: []',
      '---',
      'body',
      '',
    ].join('\n');
    const out = toClaudeCommandContent(content);
    for (const key of CLAUDE_COMMAND_FRONTMATTER_KEYS) {
      expect(out).toContain(`${key}:`);
    }
  });

  it('drops keys that only Gemini or Codex consume', () => {
    const content = '---\nname: smithy-cut\ndescription: "d"\ntier: deep\ntools: Read, Grep\n---\nbody\n';
    const out = toClaudeCommandContent(content);
    expect(out).not.toContain('tier:');
    expect(out).not.toContain('tools:');
    expect(out).toContain('description:');
  });

  it('falls back to the bare body when the block carries nothing Claude reads', () => {
    expect(toClaudeCommandContent('---\nname: smithy-x\n---\n# Body\n')).toBe('# Body\n');
  });

  it('returns content with no frontmatter unchanged', () => {
    expect(toClaudeCommandContent('# Body\n')).toBe('# Body\n');
  });
});

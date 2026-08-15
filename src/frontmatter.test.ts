import { describe, it, expect } from 'vitest';
import { splitFrontmatter, filterFrontmatterKeys } from './frontmatter.js';

describe('splitFrontmatter', () => {
  it('splits a block from its body, fences included', () => {
    const { frontmatter, body } = splitFrontmatter('---\nname: x\n---\n# Body\n');
    expect(frontmatter).toBe('---\nname: x\n---\n');
    expect(body).toBe('# Body\n');
  });

  it('returns an empty block and the whole content when there is no frontmatter', () => {
    const { frontmatter, body } = splitFrontmatter('# Body only');
    expect(frontmatter).toBe('');
    expect(body).toBe('# Body only');
  });

  it('does not treat a horizontal rule inside the body as a fence', () => {
    const content = '# Title\n\n---\n\nmore prose\n';
    expect(splitFrontmatter(content)).toEqual({ frontmatter: '', body: content });
  });
});

describe('filterFrontmatterKeys', () => {
  const allow = (...keys: string[]) => new Set(keys);

  it('keeps allowed keys and drops the rest, preserving source order', () => {
    const content = '---\nname: smithy-audit\ndescription: "Audits things."\ntier: deep\n---\n# Body\n';
    expect(filterFrontmatterKeys(content, allow('description'))).toBe(
      '---\ndescription: "Audits things."\n---\n# Body\n',
    );
  });

  it('preserves the exact formatting of kept lines', () => {
    const content = '---\ndescription:   "spaced   out"\nname: x\n---\nbody\n';
    expect(filterFrontmatterKeys(content, allow('description'))).toContain('description:   "spaced   out"');
  });

  it('carries the indented continuation lines of a kept block value', () => {
    const content = [
      '---',
      'name: x',
      'hooks:',
      '  PreToolUse:',
      '    - matcher: Bash',
      'description: "d"',
      '---',
      'body',
      '',
    ].join('\n');
    const out = filterFrontmatterKeys(content, allow('hooks', 'description'));
    expect(out).toBe(
      ['---', 'hooks:', '  PreToolUse:', '    - matcher: Bash', 'description: "d"', '---', 'body', ''].join('\n'),
    );
  });

  it('does not carry the continuation lines of a dropped block value', () => {
    const content = ['---', 'tools:', '  - Read', '  - Grep', 'description: "d"', '---', 'body', ''].join('\n');
    const out = filterFrontmatterKeys(content, allow('description'));
    expect(out).toBe(['---', 'description: "d"', '---', 'body', ''].join('\n'));
    expect(out).not.toContain('Read');
  });

  it('returns a bare body when no key survives the filter', () => {
    const content = '---\nname: x\ntier: deep\n---\n# Body\n';
    expect(filterFrontmatterKeys(content, allow('description'))).toBe('# Body\n');
  });

  it('returns content unchanged when there is no frontmatter', () => {
    expect(filterFrontmatterKeys('# Body\n', allow('description'))).toBe('# Body\n');
  });

  it('leaves the body untouched, horizontal rules and all', () => {
    const content = '---\nname: x\ndescription: "d"\n---\n# Body\n\n---\n\nSection two\n';
    expect(filterFrontmatterKeys(content, allow('description'))).toBe(
      '---\ndescription: "d"\n---\n# Body\n\n---\n\nSection two\n',
    );
  });
});

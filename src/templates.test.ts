import { describe, it, expect } from 'vitest';
import {
  stripFrontmatter,
  parseFrontmatterName,
  loadSnippets,
  resolveSnippets,
  getTemplateFilesByCategory,
  getComposedTemplates,
} from './templates.js';

describe('stripFrontmatter', () => {
  it('removes YAML frontmatter from content', () => {
    const content = `---\nname: test\ndescription: "A test"\n---\n# Body`;
    expect(stripFrontmatter(content)).toBe('# Body');
  });

  it('returns content unchanged when no frontmatter exists', () => {
    const content = '# Just a markdown file';
    expect(stripFrontmatter(content)).toBe(content);
  });

  it('returns empty string when content is only frontmatter', () => {
    const content = '---\nname: test\n---\n';
    expect(stripFrontmatter(content)).toBe('');
  });
});

describe('parseFrontmatterName', () => {
  it('extracts name from frontmatter', () => {
    const content = `---\nname: smithy-strike\ndescription: "Strike"\n---\n# Body`;
    expect(parseFrontmatterName(content)).toBe('smithy-strike');
  });

  it('returns undefined when no frontmatter exists', () => {
    expect(parseFrontmatterName('# Just markdown')).toBeUndefined();
  });

  it('returns undefined when frontmatter has no name field', () => {
    const content = `---\ndescription: "No name"\n---\n# Body`;
    expect(parseFrontmatterName(content)).toBeUndefined();
  });

  it('trims whitespace from the name value', () => {
    const content = `---\nname:   spaced-name  \n---\n# Body`;
    expect(parseFrontmatterName(content)).toBe('spaced-name');
  });
});

describe('resolveSnippets', () => {
  it('replaces a snippet placeholder with its content', () => {
    const snippets = new Map([['greeting.md', 'Hello, world!']]);
    const content = 'Before\n<!-- snippet:greeting.md -->\nAfter';
    expect(resolveSnippets(content, snippets)).toBe('Before\nHello, world!\nAfter');
  });

  it('replaces multiple snippet placeholders', () => {
    const snippets = new Map([
      ['alpha.md', 'AAA'],
      ['beta.md', 'BBB'],
    ]);
    const content = '<!-- snippet:alpha.md -->\nmiddle\n<!-- snippet:beta.md -->';
    expect(resolveSnippets(content, snippets)).toBe('AAA\nmiddle\nBBB');
  });

  it('throws on a missing snippet', () => {
    const snippets = new Map<string, string>();
    const content = '<!-- snippet:missing.md -->';
    expect(() => resolveSnippets(content, snippets)).toThrow(
      'Snippet "missing.md" not found in snippets/',
    );
  });

  it('returns content unchanged when there are no placeholders', () => {
    const snippets = new Map([['unused.md', 'data']]);
    const content = 'No placeholders here.';
    expect(resolveSnippets(content, snippets)).toBe(content);
  });

  it('trims trailing whitespace from snippet content', () => {
    const snippets = new Map([['trail.md', 'content\n\n']]);
    const content = '<!-- snippet:trail.md -->';
    expect(resolveSnippets(content, snippets)).toBe('content');
  });
});

describe('loadSnippets', () => {
  it('loads all 5 audit checklist snippet files', () => {
    const snippets = loadSnippets();
    expect(snippets.size).toBe(5);

    const expectedFiles = [
      'audit-checklist-rfc.md',
      'audit-checklist-features.md',
      'audit-checklist-spec.md',
      'audit-checklist-tasks.md',
      'audit-checklist-strike.md',
    ];
    for (const file of expectedFiles) {
      expect(snippets.has(file)).toBe(true);
      expect(snippets.get(file)!.length).toBeGreaterThan(0);
    }
  });

  it('snippet content contains audit checklist headers', () => {
    const snippets = loadSnippets();
    expect(snippets.get('audit-checklist-rfc.md')).toContain('Audit Checklist (.rfc.md)');
    expect(snippets.get('audit-checklist-features.md')).toContain('Audit Checklist (.features.md)');
    expect(snippets.get('audit-checklist-spec.md')).toContain('Audit Checklist (.spec.md)');
    expect(snippets.get('audit-checklist-tasks.md')).toContain('Audit Checklist (.tasks.md)');
    expect(snippets.get('audit-checklist-strike.md')).toContain('Audit Checklist (.strike.md)');
  });
});

describe('getTemplateFilesByCategory', () => {
  it('returns the correct number of files per category', () => {
    const byCategory = getTemplateFilesByCategory();
    expect(byCategory.commands).toHaveLength(9);
    expect(byCategory.prompts).toHaveLength(2);
    expect(byCategory.agents).toHaveLength(2);
  });

  it('commands includes expected template files', () => {
    const { commands } = getTemplateFilesByCategory();
    expect(commands).toContain('smithy.strike.md');
    expect(commands).toContain('smithy.audit.md');
    expect(commands).toContain('smithy.ignite.md');
    expect(commands).toContain('smithy.forge.md');
    expect(commands).toContain('smithy.mark.md');
    expect(commands).toContain('smithy.cut.md');
    expect(commands).toContain('smithy.render.md');
    expect(commands).toContain('smithy.fix.md');
    expect(commands).toContain('smithy.orders.md');
  });

  it('prompts includes guidance and titles', () => {
    const { prompts } = getTemplateFilesByCategory();
    expect(prompts).toContain('smithy.guidance.md');
    expect(prompts).toContain('smithy.titles.md');
  });

  it('agents includes clarify and refine', () => {
    const { agents } = getTemplateFilesByCategory();
    expect(agents).toContain('smithy.clarify.md');
    expect(agents).toContain('smithy.refine.md');
  });

  it('does not include smithy.slice.md (deleted)', () => {
    const { commands, prompts, agents } = getTemplateFilesByCategory();
    const allFiles = [...commands, ...prompts, ...agents];
    expect(allFiles).not.toContain('smithy.slice.md');
  });
});

describe('getComposedTemplates', () => {
  it('returns commands, prompts, and agents maps', () => {
    const composed = getComposedTemplates();
    expect(composed.commands).toBeInstanceOf(Map);
    expect(composed.prompts).toBeInstanceOf(Map);
    expect(composed.agents).toBeInstanceOf(Map);
  });

  it('categorizes templates correctly', () => {
    const composed = getComposedTemplates();
    expect(composed.commands.has('smithy.strike.md')).toBe(true);
    expect(composed.commands.has('smithy.audit.md')).toBe(true);
    expect(composed.prompts.has('smithy.guidance.md')).toBe(true);
    expect(composed.prompts.has('smithy.titles.md')).toBe(true);
    expect(composed.agents.has('smithy.clarify.md')).toBe(true);
    expect(composed.agents.has('smithy.refine.md')).toBe(true);
  });

  it('audit template has all 5 checklists resolved (no snippet placeholders)', () => {
    const composed = getComposedTemplates();
    const audit = composed.commands.get('smithy.audit.md')!;
    expect(audit).toBeDefined();

    // Snippet placeholders should be replaced
    expect(audit).not.toContain('<!-- snippet:');

    // All 5 checklist sections should be present
    expect(audit).toContain('Audit Checklist (.rfc.md)');
    expect(audit).toContain('Audit Checklist (.features.md)');
    expect(audit).toContain('Audit Checklist (.spec.md)');
    expect(audit).toContain('Audit Checklist (.tasks.md)');
    expect(audit).toContain('Audit Checklist (.strike.md)');
  });

  it('agent templates retain frontmatter', () => {
    const composed = getComposedTemplates();
    const clarify = composed.agents.get('smithy.clarify.md')!;
    expect(clarify).toBeDefined();
    expect(clarify).toMatch(/^---\s*\n/);
    expect(clarify).toContain('name: smithy-clarify');
    expect(clarify).toContain('tools:');
  });

  it('command templates without snippets are returned as-is', () => {
    const composed = getComposedTemplates();
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    expect(strike.length).toBeGreaterThan(0);
    // strike should not contain any unresolved snippet placeholders
    expect(strike).not.toContain('<!-- snippet:');
  });

  it('prompt templates are included without modification', () => {
    const composed = getComposedTemplates();
    const titles = composed.prompts.get('smithy.titles.md')!;
    expect(titles).toBeDefined();
    expect(titles).toContain('Document Title Conventions');
  });
});

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
  it('resolves a Handlebars partial reference with its content', async () => {
    const partials = new Map([['greeting', 'Hello, world!']]);
    const content = 'Before\n{{>greeting}}\nAfter';
    const result = await resolveSnippets(content, partials);
    expect(result).toContain('Before');
    expect(result).toContain('Hello, world!');
    expect(result).toContain('After');
  });

  it('resolves multiple partial references', async () => {
    const partials = new Map([
      ['alpha', 'AAA'],
      ['beta', 'BBB'],
    ]);
    const content = '{{>alpha}}\nmiddle\n{{>beta}}';
    const result = await resolveSnippets(content, partials);
    expect(result).toContain('AAA');
    expect(result).toContain('middle');
    expect(result).toContain('BBB');
  });

  it('throws on a missing partial', async () => {
    const partials = new Map<string, string>();
    const content = '{{>missing}}';
    await expect(resolveSnippets(content, partials)).rejects.toThrow();
  });

  it('returns content unchanged when there are no partial references', async () => {
    const partials = new Map([['unused', 'data']]);
    const content = 'No partials here.';
    const result = await resolveSnippets(content, partials);
    expect(result).toBe(content);
  });

  it('renders partial content as-is (trimming is done by buildPartialsMap)', async () => {
    const partials = new Map([['trail', 'content']]);
    const content = '{{>trail}}';
    const result = await resolveSnippets(content, partials);
    expect(result).toBe('content');
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
  it('returns commands, prompts, and agents maps', async () => {
    const composed = await getComposedTemplates();
    expect(composed.commands).toBeInstanceOf(Map);
    expect(composed.prompts).toBeInstanceOf(Map);
    expect(composed.agents).toBeInstanceOf(Map);
  });

  it('categorizes templates correctly', async () => {
    const composed = await getComposedTemplates();
    expect(composed.commands.has('smithy.strike.md')).toBe(true);
    expect(composed.commands.has('smithy.audit.md')).toBe(true);
    expect(composed.prompts.has('smithy.guidance.md')).toBe(true);
    expect(composed.prompts.has('smithy.titles.md')).toBe(true);
    expect(composed.agents.has('smithy.clarify.md')).toBe(true);
    expect(composed.agents.has('smithy.refine.md')).toBe(true);
  });

  it('audit template has all 5 checklists resolved (no unresolved partials)', async () => {
    const composed = await getComposedTemplates();
    const audit = composed.commands.get('smithy.audit.md')!;
    expect(audit).toBeDefined();

    // Partial references should be resolved
    expect(audit).not.toContain('{{>');

    // All 5 checklist sections should be present
    expect(audit).toContain('Audit Checklist (.rfc.md)');
    expect(audit).toContain('Audit Checklist (.features.md)');
    expect(audit).toContain('Audit Checklist (.spec.md)');
    expect(audit).toContain('Audit Checklist (.tasks.md)');
    expect(audit).toContain('Audit Checklist (.strike.md)');
  });

  it('agent templates retain frontmatter', async () => {
    const composed = await getComposedTemplates();
    const clarify = composed.agents.get('smithy.clarify.md')!;
    expect(clarify).toBeDefined();
    expect(clarify).toMatch(/^---\s*\n/);
    expect(clarify).toContain('name: smithy-clarify');
    expect(clarify).toContain('tools:');
  });

  it('command templates without partials are returned as-is', async () => {
    const composed = await getComposedTemplates();
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    expect(strike.length).toBeGreaterThan(0);
    // strike should not contain any unresolved partial references
    expect(strike).not.toContain('{{>');
  });

  it('prompt templates are included without modification', async () => {
    const composed = await getComposedTemplates();
    const titles = composed.prompts.get('smithy.titles.md')!;
    expect(titles).toBeDefined();
    expect(titles).toContain('Document Title Conventions');
  });
});

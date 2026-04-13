import { describe, it, expect, beforeAll } from 'vitest';
import { Dotprompt } from 'dotprompt';
import {
  stripFrontmatter,
  parseFrontmatterName,
  loadSnippets,
  resolveSnippets,
  getTemplateFilesByCategory,
  getComposedTemplates,
  type ComposedTemplates,
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
    const renderer = new Dotprompt({ partials: { greeting: 'Hello, world!' } });
    const content = 'Before\n{{>greeting}}\nAfter';
    const result = await resolveSnippets(content, renderer);
    expect(result).toContain('Before');
    expect(result).toContain('Hello, world!');
    expect(result).toContain('After');
  });

  it('resolves multiple partial references', async () => {
    const renderer = new Dotprompt({ partials: { alpha: 'AAA', beta: 'BBB' } });
    const content = '{{>alpha}}\nmiddle\n{{>beta}}';
    const result = await resolveSnippets(content, renderer);
    expect(result).toContain('AAA');
    expect(result).toContain('middle');
    expect(result).toContain('BBB');
  });

  it('throws on a missing partial', async () => {
    const renderer = new Dotprompt();
    const content = '{{>missing}}';
    await expect(resolveSnippets(content, renderer)).rejects.toThrow();
  });

  it('returns content unchanged when there are no partial references', async () => {
    const renderer = new Dotprompt({ partials: { unused: 'data' } });
    const content = 'No partials here.';
    const result = await resolveSnippets(content, renderer);
    expect(result).toBe(content);
  });

  it('renders partial content as-is (trimming is done by buildPartialsMap)', async () => {
    const renderer = new Dotprompt({ partials: { trail: 'content' } });
    const content = '{{>trail}}';
    const result = await resolveSnippets(content, renderer);
    expect(result).toBe('content');
  });

  it('preserves frontmatter verbatim when content contains partials', async () => {
    const frontmatter = '---\nname: smithy-test\ndescription: "A test prompt"\ntools:\n  - Read\n  - Grep\nmodel: opus\n---\n';
    const renderer = new Dotprompt({ partials: { checklist: '- [ ] Item 1\n- [ ] Item 2' } });
    const content = frontmatter + '# Heading\n\n{{>checklist}}\n\nDone.';
    const result = await resolveSnippets(content, renderer);
    expect(result.startsWith(frontmatter)).toBe(true);
    expect(result).toContain('- [ ] Item 1');
    expect(result).toContain('Done.');
  });
});

describe('loadSnippets', () => {
  it('loads all snippet files', () => {
    const snippets = loadSnippets();
    expect(snippets.size).toBe(11);

    const expectedFiles = [
      'audit-checklist-rfc.md',
      'audit-checklist-features.md',
      'audit-checklist-spec.md',
      'audit-checklist-tasks.md',
      'audit-checklist-strike.md',
      'competing-lenses-decomposition.md',
      'competing-lenses-implementation.md',
      'competing-lenses-scoping.md',
      'guidance-shell.md',
      'tdd-protocol.md',
      'review-protocol.md',
    ];
    for (const file of expectedFiles) {
      expect(snippets.has(file)).toBe(true);
      expect(snippets.get(file)!.length).toBeGreaterThan(0);
    }
  });

  it('snippet content contains expected headers', () => {
    const snippets = loadSnippets();
    expect(snippets.get('audit-checklist-rfc.md')).toContain('Audit Checklist (.rfc.md)');
    expect(snippets.get('audit-checklist-features.md')).toContain('Audit Checklist (.features.md)');
    expect(snippets.get('audit-checklist-spec.md')).toContain('Audit Checklist (.spec.md)');
    expect(snippets.get('audit-checklist-tasks.md')).toContain('Audit Checklist (.tasks.md)');
    expect(snippets.get('audit-checklist-strike.md')).toContain('Audit Checklist (.strike.md)');
    expect(snippets.get('guidance-shell.md')).toContain('Shell Best Practices');
    expect(snippets.get('tdd-protocol.md')).toContain('TDD Protocol');
    expect(snippets.get('review-protocol.md')).toContain('Code Review Protocol');
    expect(snippets.get('competing-lenses-decomposition.md')).toContain('Competing Slice Lenses');
    expect(snippets.get('competing-lenses-implementation.md')).toContain('Competing Plan Lenses');
    expect(snippets.get('competing-lenses-scoping.md')).toContain('Competing Plan Lenses');
  });
});

describe('getTemplateFilesByCategory', () => {
  it('returns the correct number of files per category', () => {
    const byCategory = getTemplateFilesByCategory();
    expect(byCategory.commands).toHaveLength(9);
    expect(byCategory.prompts).toHaveLength(2);
    expect(byCategory.agents).toHaveLength(11);
    expect(byCategory.skills).toHaveLength(1);
  });

  it('skills includes smithy.pr-review', () => {
    const { skills } = getTemplateFilesByCategory();
    expect(skills).toContain('smithy.pr-review');
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

  it('agents includes clarify, refine, implement, review, plan, reconcile, reconcile-slices, and slice', () => {
    const { agents } = getTemplateFilesByCategory();
    expect(agents).toContain('smithy.clarify.md');
    expect(agents).toContain('smithy.refine.md');
    expect(agents).toContain('smithy.implement.md');
    expect(agents).toContain('smithy.review.md');
    expect(agents).toContain('smithy.plan.md');
    expect(agents).toContain('smithy.reconcile.md');
    expect(agents).toContain('smithy.reconcile-slices.md');
    expect(agents).toContain('smithy.slice.md');
    expect(agents).toContain('smithy.prose.md');
  });

  it('smithy.slice.md is categorized as an agent', () => {
    const { commands, prompts, agents } = getTemplateFilesByCategory();
    expect(agents).toContain('smithy.slice.md');
    expect(commands).not.toContain('smithy.slice.md');
    expect(prompts).not.toContain('smithy.slice.md');
  });
});

describe('getComposedTemplates', () => {
  let composed: ComposedTemplates;

  beforeAll(async () => {
    composed = await getComposedTemplates();
  });

  it('returns commands, prompts, agents, and skills maps', () => {
    expect(composed.commands).toBeInstanceOf(Map);
    expect(composed.prompts).toBeInstanceOf(Map);
    expect(composed.agents).toBeInstanceOf(Map);
    expect(composed.skills).toBeInstanceOf(Map);
  });

  it('skills map includes smithy.pr-review with prompt and scripts', () => {
    const skill = composed.skills.get('smithy.pr-review');
    expect(skill).toBeDefined();
    expect(skill!.prompt).toBeTruthy();
    expect(skill!.scripts).toBeInstanceOf(Map);
    expect(skill!.scripts.size).toBe(3);
    expect(skill!.scripts.has('find-pr.sh')).toBe(true);
    expect(skill!.scripts.has('get-comments.sh')).toBe(true);
    expect(skill!.scripts.has('reply-comment.sh')).toBe(true);
  });

  it('smithy.pr-review prompt retains frontmatter including allowed-tools', () => {
    // Frontmatter is kept at deploy time so Claude Code can read allowed-tools from SKILL.md
    const skill = composed.skills.get('smithy.pr-review')!;
    expect(skill.prompt).toContain('smithy.pr-review');
    expect(skill.prompt).toContain('allowed-tools');
  });

  it('smithy.pr-review scripts start with bash shebang', () => {
    const skill = composed.skills.get('smithy.pr-review')!;
    for (const [filename, content] of skill.scripts) {
      expect(content).toMatch(/^#!\/usr\/bin\/env bash/);
    }
  });

  it('get-comments.sh uses GraphQL for full thread data', () => {
    const skill = composed.skills.get('smithy.pr-review')!;
    const script = skill.scripts.get('get-comments.sh')!;
    expect(script).toContain('gh api graphql');
    expect(script).toContain('reviewThreads');
    expect(script).toContain('isResolved');
    expect(script).toContain('databaseId');
  });

  it('reply-comment.sh uses correct REST API path with pr number', () => {
    const skill = composed.skills.get('smithy.pr-review')!;
    const script = skill.scripts.get('reply-comment.sh')!;
    expect(script).toContain('repos/$REPO/pulls/$PR/comments/$COMMENT_ID/replies');
    expect(script).toContain('--method POST');
    expect(script).toContain('--input "$BODY_FILE"');
  });

  it('categorizes templates correctly', () => {
    expect(composed.commands.has('smithy.strike.md')).toBe(true);
    expect(composed.commands.has('smithy.audit.md')).toBe(true);
    expect(composed.prompts.has('smithy.guidance.md')).toBe(true);
    expect(composed.prompts.has('smithy.titles.md')).toBe(true);
    expect(composed.agents.has('smithy.clarify.md')).toBe(true);
    expect(composed.agents.has('smithy.refine.md')).toBe(true);
  });

  it('audit template has all 5 checklists resolved (no unresolved partials)', () => {
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

  it('audit template preserves frontmatter after partial resolution', () => {
    const audit = composed.commands.get('smithy.audit.md')!;
    const expectedFrontmatter =
      '---\n' +
      'name: smithy-audit\n' +
      'description: "Context-aware artifact auditor. Reviews any Smithy artifact by extension, or reviews code on a forge branch against its upstream spec context."\n' +
      '---\n';
    expect(audit.startsWith(expectedFrontmatter)).toBe(true);
  });

  it('agent templates retain frontmatter', () => {
    const clarify = composed.agents.get('smithy.clarify.md')!;
    expect(clarify).toBeDefined();
    expect(clarify).toMatch(/^---\s*\n/);
    expect(clarify).toContain('name: smithy-clarify');
    expect(clarify).toMatch(/tools:\s*\n\s+-\s+Read/);
  });

  it('clarify agent triage uses Specification Debt category, not Questions', () => {
    const clarify = composed.agents.get('smithy.clarify.md')!;
    expect(clarify).not.toContain('### Questions');
    expect(clarify).toContain('debt_items');
  });

  it('mark template contains ## Specification Debt between ## Assumptions and ## Out of Scope', () => {
    const mark = composed.commands.get('smithy.mark.md')!;
    expect(mark).toBeDefined();

    const assumptionsIdx = mark.indexOf('## Assumptions');
    const debtIdx = mark.indexOf('## Specification Debt');
    const outOfScopeIdx = mark.indexOf('## Out of Scope');

    expect(assumptionsIdx).toBeGreaterThan(-1);
    expect(debtIdx).toBeGreaterThan(-1);
    expect(outOfScopeIdx).toBeGreaterThan(-1);

    expect(debtIdx).toBeGreaterThan(assumptionsIdx);
    expect(debtIdx).toBeLessThan(outOfScopeIdx);
  });

  it('cut template contains ## Specification Debt before ## Dependency Order', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    expect(cut).toBeDefined();

    const debtIdx = cut.indexOf('## Specification Debt');
    const dependencyIdx = cut.indexOf('## Dependency Order');

    expect(debtIdx).toBeGreaterThan(-1);
    expect(dependencyIdx).toBeGreaterThan(-1);

    expect(debtIdx).toBeLessThan(dependencyIdx);
  });

  it('strike template contains ## Specification Debt between ## Decisions and ## Single Slice', () => {
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();

    const decisionsIdx = strike.indexOf('## Decisions');
    const debtIdx = strike.indexOf('## Specification Debt');
    const singleSliceIdx = strike.indexOf('## Single Slice');

    expect(decisionsIdx).toBeGreaterThan(-1);
    expect(debtIdx).toBeGreaterThan(-1);
    expect(singleSliceIdx).toBeGreaterThan(-1);

    expect(debtIdx).toBeGreaterThan(decisionsIdx);
    expect(debtIdx).toBeLessThan(singleSliceIdx);
  });

  it('ignite template contains ## Specification Debt between ## Open Questions and ## Milestones', () => {
    const ignite = composed.commands.get('smithy.ignite.md')!;
    expect(ignite).toBeDefined();

    // Scope assertions to the markdown code fence block to avoid matching
    // instructional text that references these headings in backticks
    const markdownBlockMatch = ignite.match(/```markdown\r?\n([\s\S]*?)\r?\n```/);
    expect(markdownBlockMatch).not.toBeNull();

    const markdownBlock = markdownBlockMatch![1]!;
    const openQuestionsIdx = markdownBlock.indexOf('\n## Open Questions\n');
    const debtIdx = markdownBlock.indexOf('\n## Specification Debt\n');
    const milestonesIdx = markdownBlock.indexOf('\n## Milestones\n');

    expect(openQuestionsIdx).toBeGreaterThan(-1);
    expect(debtIdx).toBeGreaterThan(-1);
    expect(milestonesIdx).toBeGreaterThan(-1);

    expect(debtIdx).toBeGreaterThan(openQuestionsIdx);
    expect(debtIdx).toBeLessThan(milestonesIdx);
  });

  it('render template contains ## Specification Debt before ## Cross-Milestone Dependencies', () => {
    const render = composed.commands.get('smithy.render.md')!;
    expect(render).toBeDefined();

    const debtIdx = render.indexOf('## Specification Debt');
    const crossMilestoneIdx = render.indexOf('## Cross-Milestone Dependencies');

    expect(debtIdx).toBeGreaterThan(-1);
    expect(crossMilestoneIdx).toBeGreaterThan(-1);

    expect(debtIdx).toBeLessThan(crossMilestoneIdx);
  });

  it('command templates without partials are returned as-is', () => {
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    expect(strike.length).toBeGreaterThan(0);
    expect(strike).not.toContain('{{>');
  });

  it('prompt templates are included without modification', () => {
    const titles = composed.prompts.get('smithy.titles.md')!;
    expect(titles).toBeDefined();
    expect(titles).toContain('Document Title Conventions');
  });

  it('guidance prompt resolves with guidance-shell snippet content', () => {
    const guidance = composed.prompts.get('smithy.guidance.md')!;
    expect(guidance).toBeDefined();
    expect(guidance).toContain('Shell Best Practices');
    expect(guidance).toContain('Never embed subshells');
    expect(guidance).not.toContain('{{>');
  });

  it('implement agent retains frontmatter with correct tools', () => {
    const implement = composed.agents.get('smithy.implement.md')!;
    expect(implement).toBeDefined();
    expect(implement).toMatch(/^---\s*\n/);
    expect(implement).toContain('name: smithy-implement');
    expect(implement).toContain('tools: Read, Edit, Write, Grep, Glob, Bash');
  });

  it('review agent retains frontmatter with correct tools', () => {
    const review = composed.agents.get('smithy.review.md')!;
    expect(review).toBeDefined();
    expect(review).toMatch(/^---\s*\n/);
    expect(review).toContain('name: smithy-review');
    expect(review).toContain('tools: Read, Edit, Write, Grep, Glob, Bash');
  });

  it('forge default renders inline TDD and review protocols', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toBeDefined();
    expect(forge).toContain('TDD Protocol');
    expect(forge).toContain('Code Review Protocol');
    expect(forge).not.toContain('smithy-implement');
    expect(forge).not.toContain('{{');
  });

  it('forge with claude variant renders sub-agent dispatch', async () => {
    const claudeComposed = await getComposedTemplates('claude');
    const forge = claudeComposed.commands.get('smithy.forge.md')!;
    expect(forge).toBeDefined();
    expect(forge).toContain('smithy-implement');
    expect(forge).toContain('smithy-review');
    expect(forge).not.toContain('TDD Protocol');
    expect(forge).not.toContain('{{');
  });

  it('plan agent retains frontmatter with read-only tools', () => {
    const plan = composed.agents.get('smithy.plan.md')!;
    expect(plan).toBeDefined();
    expect(plan).toMatch(/^---\s*\n/);
    expect(plan).toContain('name: smithy-plan');
    expect(plan).toMatch(/tools:\s*\n\s+-\s+Read/);
    expect(plan).not.toContain('Edit');
    expect(plan).not.toContain('Write');
    expect(plan).not.toContain('Bash');
  });

  it('reconcile agent retains frontmatter with read-only tools', () => {
    const reconcile = composed.agents.get('smithy.reconcile.md')!;
    expect(reconcile).toBeDefined();
    expect(reconcile).toMatch(/^---\s*\n/);
    expect(reconcile).toContain('name: smithy-reconcile');
    expect(reconcile).toMatch(/tools:\s*\n\s+-\s+Read/);
    expect(reconcile).not.toContain('Edit');
    expect(reconcile).not.toContain('Write');
    expect(reconcile).not.toContain('Bash');
  });

  it('prose agent retains frontmatter with read-only tools', () => {
    const prose = composed.agents.get('smithy.prose.md')!;
    expect(prose).toBeDefined();
    expect(prose).toMatch(/^---\s*\n/);
    expect(prose).toContain('name: smithy-prose');
    expect(prose).toMatch(/tools:\s*\n\s+-\s+Read/);
    expect(prose).toMatch(/^\s+-\s+Grep$/m);
    expect(prose).toMatch(/^\s+-\s+Glob$/m);
    expect(prose).not.toContain('Edit');
    expect(prose).not.toContain('Write');
    expect(prose).not.toContain('Bash');
    expect(prose).not.toContain('{{>');
  });

  it('strike with claude variant renders competing plan dispatch', async () => {
    const claudeComposed = await getComposedTemplates('claude');
    const strike = claudeComposed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    expect(strike).toContain('smithy-plan');
    expect(strike).toContain('smithy-reconcile');
    expect(strike).toContain('Competing Plan Lenses');
    expect(strike).not.toContain('{{>');
    expect(strike).not.toContain('{{');
  });

  it('strike default does not contain competing plan dispatch', () => {
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    expect(strike).not.toContain('smithy-plan');
    expect(strike).not.toContain('smithy-reconcile');
    expect(strike).not.toContain('Competing Plan Lenses');
    expect(strike).toContain('What files you\'d change');
  });

  it('ignite with claude variant renders competing plan dispatch', async () => {
    const claudeComposed = await getComposedTemplates('claude');
    const ignite = claudeComposed.commands.get('smithy.ignite.md')!;
    expect(ignite).toBeDefined();
    expect(ignite).toContain('smithy-plan');
    expect(ignite).toContain('smithy-reconcile');
    expect(ignite).toContain('Competing Plan Lenses');
    expect(ignite).not.toContain('{{>');
    expect(ignite).not.toContain('{{');
    // Sub-phase dispatch identifiers from Phase 3 (Story 3)
    expect(ignite).toContain('3c');
    expect(ignite).toContain('3d');
    expect(ignite).toContain('3e');
    expect(ignite).toContain('3f');
    // Sub-phase dispatch identifiers from Phase 3 (Story 4)
    expect(ignite).toContain('Sub-phase 3a');
    expect(ignite).toContain('Sub-phase 3b');
    expect(ignite).toContain('Sub-phase 3e');
    expect(ignite).toContain('Sub-phase 3g');
    expect(ignite).toContain('smithy-prose');
    // Phase 4 agent path must NOT contain the unconditional file-write instruction
    expect(ignite).not.toContain('Write the RFC to');
  });

  it('ignite default does not contain competing plan dispatch', () => {
    const ignite = composed.commands.get('smithy.ignite.md')!;
    expect(ignite).toBeDefined();
    expect(ignite).not.toContain('smithy-plan');
    expect(ignite).not.toContain('smithy-reconcile');
    expect(ignite).not.toContain('Competing Plan Lenses');
    // Default (non-agent) path retains the unconditional file-write instruction
    expect(ignite).toContain('Write the RFC to');
  });

  it('ignite RFC template contains Out of Scope and Personas sections in correct order', () => {
    const ignite = composed.commands.get('smithy.ignite.md')!;
    expect(ignite).toBeDefined();

    // The RFC template code fence must contain these sections in order:
    // Goals -> Out of Scope -> Personas -> Proposal
    const goalsIdx = ignite.indexOf('## Goals');
    const outOfScopeIdx = ignite.indexOf('## Out of Scope');
    const personasIdx = ignite.indexOf('## Personas');
    const proposalIdx = ignite.indexOf('## Proposal');

    expect(goalsIdx).toBeGreaterThan(-1);
    expect(outOfScopeIdx).toBeGreaterThan(-1);
    expect(personasIdx).toBeGreaterThan(-1);
    expect(proposalIdx).toBeGreaterThan(-1);

    // Verify ordering
    expect(outOfScopeIdx).toBeGreaterThan(goalsIdx);
    expect(personasIdx).toBeGreaterThan(outOfScopeIdx);
    expect(proposalIdx).toBeGreaterThan(personasIdx);

    // Verify placeholder content exists
    expect(ignite).toContain('<Explicitly excluded capability 1>');
    expect(ignite).toContain('<Explicitly excluded capability 2>');
    expect(ignite).toContain('<Persona 1');
    expect(ignite).toContain('<Persona 2');
  });

  it('render with claude variant renders competing plan dispatch', async () => {
    const claudeComposed = await getComposedTemplates('claude');
    const render = claudeComposed.commands.get('smithy.render.md')!;
    expect(render).toBeDefined();
    expect(render).toContain('smithy-plan');
    expect(render).toContain('smithy-reconcile');
    expect(render).toContain('Competing Plan Lenses');
    expect(render).not.toContain('{{>');
    expect(render).not.toContain('{{');
  });

  it('render default does not contain competing plan dispatch', () => {
    const render = composed.commands.get('smithy.render.md')!;
    expect(render).toBeDefined();
    expect(render).not.toContain('smithy-plan');
    expect(render).not.toContain('smithy-reconcile');
    expect(render).not.toContain('Competing Plan Lenses');
  });

  it('mark with claude variant renders competing plan dispatch', async () => {
    const claudeComposed = await getComposedTemplates('claude');
    const mark = claudeComposed.commands.get('smithy.mark.md')!;
    expect(mark).toBeDefined();
    expect(mark).toContain('smithy-plan');
    expect(mark).toContain('smithy-reconcile');
    expect(mark).toContain('Competing Plan Lenses');
    expect(mark).not.toContain('{{>');
    expect(mark).not.toContain('{{');
  });

  it('mark default does not contain competing plan dispatch', () => {
    const mark = composed.commands.get('smithy.mark.md')!;
    expect(mark).toBeDefined();
    expect(mark).not.toContain('smithy-plan');
    expect(mark).not.toContain('smithy-reconcile');
    expect(mark).not.toContain('Competing Plan Lenses');
  });

  it('cut with claude variant renders competing slice dispatch', async () => {
    const claudeComposed = await getComposedTemplates('claude');
    const cut = claudeComposed.commands.get('smithy.cut.md')!;
    expect(cut).toBeDefined();
    expect(cut).toContain('smithy-slice');
    expect(cut).toContain('smithy-reconcile-slices');
    expect(cut).toContain('Competing Slice Lenses');
    expect(cut).not.toContain('{{>');
    expect(cut).not.toContain('{{');
  });

  it('cut default does not contain competing slice dispatch', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    expect(cut).toBeDefined();
    expect(cut).not.toContain('smithy-slice');
    expect(cut).not.toContain('smithy-reconcile-slices');
    expect(cut).not.toContain('Competing Slice Lenses');
  });

  it('mark template uses 4-column Dependency Order table with US<N> IDs', () => {
    const mark = composed.commands.get('smithy.mark.md')!;
    expect(mark).toBeDefined();

    // New unified heading present
    expect(mark).toContain('## Dependency Order');

    // 4-column table header present
    expect(mark).toContain('| ID | Title | Depends On | Artifact |');

    // Legacy heading must be absent (mark never mentions `## Story
    // Dependency Order` even as a legacy fallback)
    expect(mark).not.toContain('## Story Dependency Order');

    // The emitted spec template shape (the markdown code-fence block that
    // mark tells the LLM to produce) must not contain the legacy
    // `## Feature Dependency Order` heading either. Mark's prompt still
    // mentions that heading elsewhere as a legacy fallback that the
    // feature-map write-back tolerates, so we scope this assertion to the
    // template shape block.
    const markMarkdownMatch = mark.match(/```markdown\r?\n([\s\S]*?)\r?\n```/);
    expect(markMarkdownMatch).not.toBeNull();
    const markMarkdownBlock = markMarkdownMatch![1]!;
    expect(markMarkdownBlock).not.toContain('## Story Dependency Order');
    expect(markMarkdownBlock).not.toContain('## Feature Dependency Order');
    expect(markMarkdownBlock).toContain('## Dependency Order');
    expect(markMarkdownBlock).toContain('| ID | Title | Depends On | Artifact |');
    // US<N> rows must be present — a table with only a header is not enough
    expect(markMarkdownBlock).toContain('| US1 |');
    expect(markMarkdownBlock).toContain('| US2 |');

    // No checkbox dependency rows inside the Dependency Order section.
    // Scope to the spec template shape block (markMarkdownBlock) to avoid
    // matching earlier prose references to '## Dependency Order' in backticks.
    const depIdx = markMarkdownBlock.indexOf('## Dependency Order');
    expect(depIdx).toBeGreaterThan(-1);
    const afterDep = markMarkdownBlock.slice(depIdx + '## Dependency Order'.length);
    const nextHeadingIdx = afterDep.search(/\n## /);
    const depSection =
      nextHeadingIdx === -1 ? afterDep : afterDep.slice(0, nextHeadingIdx);
    expect(depSection).not.toMatch(/^- \[[ x]\] \*\*/m);
    expect(depSection).not.toMatch(/^\d+\. \[[ x]\] \*\*/m);
  });

  it('render template uses 4-column Dependency Order table with F<N> IDs', () => {
    const render = composed.commands.get('smithy.render.md')!;
    expect(render).toBeDefined();

    // New unified heading present
    expect(render).toContain('## Dependency Order');

    // 4-column table header present
    expect(render).toContain('| ID | Title | Depends On | Artifact |');

    // F1 and F2 rows present in the table shape
    expect(render).toContain('| F1 | <Title> | — | — |');
    expect(render).toContain('| F2 | <Title> | — | — |');

    // Legacy heading must be absent from the emitted feature map template
    // shape (the markdown code-fence block that render tells the LLM to
    // produce). The render prompt may still mention `## Feature Dependency
    // Order` elsewhere as a legacy fallback the audit phase tolerates, so we
    // scope this assertion to the template shape block.
    const renderMarkdownMatch = render.match(/```markdown\r?\n([\s\S]*?)\r?\n```/);
    expect(renderMarkdownMatch).not.toBeNull();
    const renderMarkdownBlock = renderMarkdownMatch![1]!;
    expect(renderMarkdownBlock).not.toContain('## Feature Dependency Order');
    expect(renderMarkdownBlock).toContain('## Dependency Order');
    expect(renderMarkdownBlock).toContain('| ID | Title | Depends On | Artifact |');

    // No checkbox dependency rows inside the Dependency Order section
    const depIdx = render.indexOf('## Dependency Order');
    expect(depIdx).toBeGreaterThan(-1);
    const afterDep = render.slice(depIdx + '## Dependency Order'.length);
    const nextHeadingIdx = afterDep.search(/\n## /);
    const depSection =
      nextHeadingIdx === -1 ? afterDep : afterDep.slice(0, nextHeadingIdx);
    expect(depSection).not.toMatch(/^- \[[ x]\] \*\*/m);
    expect(depSection).not.toMatch(/^\d+\. \[[ x]\] \*\*/m);
  });

  it('cut template uses 4-column Dependency Order table with S<N> IDs', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    expect(cut).toBeDefined();

    // New unified heading present
    expect(cut).toContain('## Dependency Order');

    // 4-column table header present
    expect(cut).toContain('| ID | Title | Depends On | Artifact |');

    // S<N> rows present in the table shape
    expect(cut).toContain('| S1 | <Title> | — | — |');
    expect(cut).toContain('| S2 | <Title> | — | — |');

    // Legacy heading must be absent from the emitted tasks template shape
    // (the markdown code-fence block that cut tells the LLM to produce). The
    // cut prompt still mentions `## Story Dependency Order` elsewhere as a
    // legacy fallback the spec write-back tolerates, so we scope this
    // assertion to the template shape block.
    const cutMarkdownMatch = cut.match(/```markdown\r?\n([\s\S]*?)\r?\n```/);
    expect(cutMarkdownMatch).not.toBeNull();
    const cutMarkdownBlock = cutMarkdownMatch![1]!;
    expect(cutMarkdownBlock).not.toContain('## Story Dependency Order');
    expect(cutMarkdownBlock).toContain('## Dependency Order');
    expect(cutMarkdownBlock).toContain('| ID | Title | Depends On | Artifact |');

    // Old numbered-checkbox format must be absent.
    // NOTE: Per-task checkboxes inside `## Slice N:` bodies are intentionally
    // still present (they track implementation progress); do NOT assert those
    // are absent.
    expect(cut).not.toContain('1. [ ] **Slice');
    expect(cut).not.toContain('2. [ ] **Slice');

    // No checkbox dependency rows inside the Dependency Order section.
    // Scope narrowly: from `## Dependency Order` to the first subsequent
    // `### ` subheading or end-of-code-fence marker — whichever comes first.
    // This avoids matching the task-format example (which legitimately uses
    // `- [ ] **<Title>**` markup) that appears later in the prompt under the
    // task authoring guidelines.
    const depIdx = cut.indexOf('## Dependency Order');
    expect(depIdx).toBeGreaterThan(-1);
    const afterDep = cut.slice(depIdx + '## Dependency Order'.length);
    const endMatch = afterDep.search(/\n### |\n```|\n## /);
    const depSection =
      endMatch === -1 ? afterDep : afterDep.slice(0, endMatch);
    expect(depSection).not.toMatch(/^- \[[ x]\] \*\*/m);
    expect(depSection).not.toMatch(/^\d+\. \[[ x]\] \*\*/m);
  });

  it('ignite RFC template contains ## Dependency Order after ## Milestones with M<N> IDs', () => {
    const ignite = composed.commands.get('smithy.ignite.md')!;
    expect(ignite).toBeDefined();

    // Scope assertions to the markdown code fence block (the RFC template
    // shape), mirroring the pattern used by sibling ignite tests.
    const markdownBlockMatch = ignite.match(/```markdown\r?\n([\s\S]*?)\r?\n```/);
    expect(markdownBlockMatch).not.toBeNull();
    const markdownBlock = markdownBlockMatch![1]!;

    const milestonesIdx = markdownBlock.indexOf('\n## Milestones\n');
    const depIdx = markdownBlock.indexOf('\n## Dependency Order\n');

    expect(milestonesIdx).toBeGreaterThan(-1);
    expect(depIdx).toBeGreaterThan(-1);
    expect(depIdx).toBeGreaterThan(milestonesIdx);

    // Dependency Order must be the immediately next top-level (##) section
    // after Milestones — no other ## heading may appear between them.
    const afterMilestones = markdownBlock.slice(milestonesIdx + '\n## Milestones\n'.length);
    const nextH2Match = afterMilestones.match(/\n## ([^\n]+)/);
    expect(nextH2Match).not.toBeNull();
    expect(nextH2Match![1]).toBe('Dependency Order');

    // 4-column table header present in the RFC template block
    expect(markdownBlock).toContain('| ID | Title | Depends On | Artifact |');

    // Legacy headings must be absent from the RFC template shape
    expect(markdownBlock).not.toContain('## Story Dependency Order');
    expect(markdownBlock).not.toContain('## Feature Dependency Order');

    // M<N> ID format appears in the table
    expect(markdownBlock).toMatch(/\|\s*M1\s*\|/);
    expect(markdownBlock).toMatch(/\|\s*M2\s*\|/);

    // No checkbox markup in the Dependency Order section of the RFC block
    const afterDep = markdownBlock.slice(depIdx + '\n## Dependency Order\n'.length);
    const nextHeadingIdx = afterDep.search(/\n## /);
    const depSection =
      nextHeadingIdx === -1 ? afterDep : afterDep.slice(0, nextHeadingIdx);
    expect(depSection).not.toMatch(/^- \[[ x]\] \*\*/m);
    expect(depSection).not.toMatch(/^\d+\. \[[ x]\] \*\*/m);
    expect(depSection).not.toContain('- [ ]');
    expect(depSection).not.toContain('- [x]');
  });

  it('variant does not change the number of template keys', async () => {
    const claudeComposed = await getComposedTemplates('claude');
    expect([...composed.commands.keys()].sort()).toEqual([...claudeComposed.commands.keys()].sort());
    expect([...composed.prompts.keys()].sort()).toEqual([...claudeComposed.prompts.keys()].sort());
    expect([...composed.agents.keys()].sort()).toEqual([...claudeComposed.agents.keys()].sort());
    expect([...composed.skills.keys()].sort()).toEqual([...claudeComposed.skills.keys()].sort());
  });
});

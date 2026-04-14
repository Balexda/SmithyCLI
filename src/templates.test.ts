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
    expect(snippets.size).toBe(12);

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
      'one-shot-output.md',
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

describe('one-shot-output snippet', () => {
  // Story 3 Slice 1: the shared one-shot output snippet is the single source
  // of truth for the terminal output format every planning command must
  // render when running one-shot. These assertions lock down the snippet's
  // contract so any regression (deleted file, renamed file, dropped header,
  // missing error fallback) fails the test suite immediately.

  it('snippet file is loadable as a partial via loadSnippets', () => {
    const snippets = loadSnippets();
    expect(snippets.has('one-shot-output.md')).toBe(true);
    const content = snippets.get('one-shot-output.md')!;
    expect(content.length).toBeGreaterThan(0);
  });

  it('snippet has no YAML frontmatter (raw Markdown per snippets README)', () => {
    const snippets = loadSnippets();
    const content = snippets.get('one-shot-output.md')!;
    expect(content).not.toMatch(/^---\s*\n/);
  });

  it('snippet contains the four required section headers in contract order', () => {
    const snippets = loadSnippets();
    const content = snippets.get('one-shot-output.md')!;

    const summaryIdx = content.indexOf('## Summary');
    const assumptionsIdx = content.indexOf('## Assumptions');
    const debtIdx = content.indexOf('## Specification Debt');
    const prIdx = content.indexOf('## PR');

    expect(summaryIdx).toBeGreaterThan(-1);
    expect(assumptionsIdx).toBeGreaterThan(summaryIdx);
    expect(debtIdx).toBeGreaterThan(assumptionsIdx);
    expect(prIdx).toBeGreaterThan(debtIdx);
  });

  it('snippet includes PR-creation-failure fallback guidance', () => {
    const snippets = loadSnippets();
    const content = snippets.get('one-shot-output.md')!;
    expect(content).toMatch(/PR creation fail/i);
    expect(content.toLowerCase()).toContain('artifacts are on disk');
  });

  it('snippet includes bail-out fallback guidance', () => {
    const snippets = loadSnippets();
    const content = snippets.get('one-shot-output.md')!;
    expect(content).toMatch(/bail[- ]out/i);
    expect(content).toContain('## Bail-Out');
  });

  it('snippet composes into any template via the {{>one-shot-output}} partial', async () => {
    // Prove the snippet is resolvable by the same partial machinery that
    // every planning command will use once subsequent slices wire it in.
    // If the snippet is deleted or renamed, this fails because the renderer
    // has no partial to substitute.
    const snippets = loadSnippets();
    const partials: Record<string, string> = {};
    for (const [filename, content] of snippets) {
      // Mirror the trailing-whitespace normalization applied by
      // buildPartialsMap in templates.ts so this test reflects runtime
      // partial-composition behavior rather than diverging from it.
      partials[filename.replace(/\.md$/, '')] = content.trimEnd();
    }
    const renderer = new Dotprompt({ partials });
    const host = '# Host Template\n\n{{>one-shot-output}}\n';
    const result = await resolveSnippets(host, renderer);
    expect(result).toContain('## Summary');
    expect(result).toContain('## Assumptions');
    expect(result).toContain('## Specification Debt');
    expect(result).toContain('## PR');
    expect(result).not.toContain('{{>one-shot-output}}');
  });
});

describe('getTemplateFilesByCategory', () => {
  it('returns the correct number of files per category', () => {
    const byCategory = getTemplateFilesByCategory();
    expect(byCategory.commands).toHaveLength(10);
    expect(byCategory.prompts).toHaveLength(2);
    expect(byCategory.agents).toHaveLength(12);
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
    expect(commands).toContain('smithy.spark.md');
  });

  it('prompts includes guidance and titles', () => {
    const { prompts } = getTemplateFilesByCategory();
    expect(prompts).toContain('smithy.guidance.md');
    expect(prompts).toContain('smithy.titles.md');
  });

  it('agents includes clarify, refine, implement, review, plan, reconcile, reconcile-slices, slice, prose, and survey', () => {
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
    expect(agents).toContain('smithy.survey.md');
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

  it('clarify agent is non-interactive: no STOP-gate language', () => {
    const clarify = composed.agents.get('smithy.clarify.md')!;
    expect(clarify).toBeDefined();
    expect(clarify).not.toMatch(/STOP and wait/i);
    expect(clarify).not.toMatch(/STOP and ask/i);
    expect(clarify).not.toMatch(/STOP after/i);
    expect(clarify).not.toMatch(/wait for the user to respond/i);
  });

  it('clarify agent return contract includes required ClarifyResult fields', () => {
    const clarify = composed.agents.get('smithy.clarify.md')!;
    expect(clarify).toContain('assumptions');
    expect(clarify).toContain('debt_items');
    expect(clarify).toContain('bail_out');
    expect(clarify).toContain('bail_out_summary');
  });

  it('refine agent is non-interactive: no STOP-gate language', () => {
    const refine = composed.agents.get('smithy.refine.md')!;
    expect(refine).toBeDefined();
    expect(refine).not.toMatch(/STOP and wait/i);
    expect(refine).not.toMatch(/STOP and ask/i);
    expect(refine).not.toMatch(/STOP after/i);
    expect(refine).not.toMatch(/wait for the user to respond/i);
  });

  it('refine agent return contract includes required RefineResult fields', () => {
    const refine = composed.agents.get('smithy.refine.md')!;
    expect(refine).toContain('refinements');
    expect(refine).toContain('debt_items');
    expect(refine).toContain('summary');
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
    // Story 5: Sub-phase 3b enforces mandatory personas via tone_directives
    // and halts on empty/placeholder sub-agent output.
    const subphase3bIdx = ignite.indexOf('Sub-phase 3b');
    const subphase3cIdx = ignite.indexOf('Sub-phase 3c');
    expect(subphase3bIdx).toBeGreaterThan(-1);
    expect(subphase3cIdx).toBeGreaterThan(subphase3bIdx);
    const subphase3bBlock = ignite.slice(subphase3bIdx, subphase3cIdx);
    expect(subphase3bBlock).toContain('tone_directives');
    expect(subphase3bBlock.toLowerCase()).toContain('mandatory');
    expect(subphase3bBlock.toLowerCase()).toContain('halt');
    expect(subphase3bBlock).toContain('clarification');

    // Story 5: Sub-phase 3g harmonize verifies `## Personas` as a mandatory
    // section and repairs it via smithy-prose if missing, empty, or
    // misplaced. Bound the slice to the `## Phase 4` heading so the
    // assertions only match content inside the 3g block itself — not the
    // later RFC template code fence which also mentions `## Personas`,
    // `Out of Scope`, and `Proposal`.
    const subphase3gIdx = ignite.indexOf('Sub-phase 3g');
    expect(subphase3gIdx).toBeGreaterThan(-1);
    const phase4Idx = ignite.indexOf('## Phase 4', subphase3gIdx);
    expect(phase4Idx).toBeGreaterThan(subphase3gIdx);
    const subphase3gBlock = ignite.slice(subphase3gIdx, phase4Idx);
    expect(subphase3gBlock).toContain('## Personas');
    expect(subphase3gBlock.toLowerCase()).toContain('mandatory');
    expect(subphase3gBlock).toContain('Out of Scope');
    expect(subphase3gBlock).toContain('Proposal');
    expect(subphase3gBlock).toContain('smithy-prose');
    expect(subphase3gBlock.toLowerCase()).toMatch(/repair|re-dispatch/);
    // Repair dispatch must include idea_description (smithy-prose contract)
    expect(subphase3gBlock).toContain('idea_description');

    // Story 6: Sub-phase 3c must mandate the Out of Scope section as a
    // required, never-omitted output. "required section, never omitted" is
    // introduced by the strengthened 3c directive and does not appear in the
    // RFC template code fence, so it will regress if Story 6 task 1 is
    // reverted.
    expect(ignite).toContain('required section, never omitted');
    // Story 6: Sub-phase 3g's coherence pass must contain the explicit
    // safety-net bullet. "Out of Scope safety net" is introduced by Story 6
    // task 2 and is absent from the RFC template code fence.
    expect(ignite).toContain('Out of Scope safety net');
    // Story 6: Shared canonical placeholder phrase — distinct from the RFC
    // template's `<Explicitly excluded capability ...>` placeholder. Must
    // appear in BOTH the sub-phase 3c directive and the sub-phase 3g safety
    // net. A total-occurrences count is not enough because 3g references the
    // phrase more than once on its own, which could mask a regression in 3c.
    // Extract each sub-phase's block independently and assert the placeholder
    // phrase is present in each, so both enforcement layers are locked in
    // place.
    const subPhase3cStart = ignite.indexOf('### Sub-phase 3c:');
    const subPhase3dStart = ignite.indexOf('### Sub-phase 3d:');
    expect(subPhase3cStart).toBeGreaterThan(-1);
    expect(subPhase3dStart).toBeGreaterThan(subPhase3cStart);
    const subPhase3cBlock = ignite.slice(subPhase3cStart, subPhase3dStart);
    expect(subPhase3cBlock).toContain('None identified at this time');

    // Use phase4Idx (already computed above) as the upper bound for the 3g
    // block so the assertion is anchored to the sub-phase 3g body, not the
    // later RFC template code fence.
    const subPhase3gBody = ignite.slice(subphase3gIdx, phase4Idx);
    expect(subPhase3gBody).toContain('None identified at this time');

    // Story 7: Phase 0 state detection and branch. The renamed Phase 0
    // heading must cover both detection and the review loop in the agent
    // variant, and the three classification states must appear verbatim in
    // backticks so the detection vocabulary is locked in place.
    expect(ignite).toContain('Phase 0: State Detection and Review Loop');
    expect(ignite).toContain('`fresh`');
    expect(ignite).toContain('`partial`');
    expect(ignite).toContain('`complete`');
    // The partial branch must wire the hand-off to the "first missing
    // sub-phase" — a distinctive phrase introduced by Story 7 task 1/2 that
    // does not collide with the RFC template code fence or the audit table.
    expect(ignite).toContain('first missing sub-phase');
    // The partial branch must require user confirmation before resuming
    // (AS US7-1) and must explicitly forbid re-running completed sub-phases
    // (AS US7-2).
    const phase0DetectIdx = ignite.indexOf('Phase 0.0: State Detection');
    const phase0ApplyIdx = ignite.indexOf('Phase 0c: Apply Refinements');
    expect(phase0DetectIdx).toBeGreaterThan(-1);
    expect(phase0ApplyIdx).toBeGreaterThan(phase0DetectIdx);
    const phase0Block = ignite.slice(phase0DetectIdx, phase0ApplyIdx);
    expect(phase0Block.toLowerCase()).toContain('confirm');
    expect(phase0Block.toLowerCase()).toMatch(/re-run any earlier sub-phase/);
    // Edge case: contextual mismatch offers overwrite / new RFC / proceed
    // anyway as explicit options.
    expect(phase0Block.toLowerCase()).toContain('overwrite');
    expect(phase0Block.toLowerCase()).toContain('proceed anyway');
    // Edge case: harmonize-crash note routes inconsistent "complete" files
    // into the review loop.
    expect(phase0Block.toLowerCase()).toContain('harmonization');

    // Story 7: Phase 3 resume note lives in the Phase 3 preamble (alongside
    // the append-and-continue protocol), not inside any individual sub-phase
    // block. Slice from the start of Phase 3 to the first sub-phase to
    // verify placement.
    const phase3Idx = ignite.indexOf('## Phase 3');
    const phase3aIdx = ignite.indexOf('### Sub-phase 3a');
    expect(phase3Idx).toBeGreaterThan(-1);
    expect(phase3aIdx).toBeGreaterThan(phase3Idx);
    const phase3Preamble = ignite.slice(phase3Idx, phase3aIdx);
    expect(phase3Preamble).toContain('Resume Hand-off');
    expect(phase3Preamble.toLowerCase()).toContain('skip');
    expect(phase3Preamble).toContain('rfc_file_path');

    // Story 8: Phase 2 must contain both a clarify-log read step and a
    // clarify-log write step. Bound assertions to the Phase 2 body (between
    // `## Phase 2` and `## Phase 3`) so these never accidentally match other
    // phases or the RFC template code fence. Reuses `phase3Idx` from the
    // Story 7 block above (start of `## Phase 3`, same value either way).
    const phase2Idx = ignite.indexOf('## Phase 2');
    expect(phase2Idx).toBeGreaterThan(-1);
    expect(phase3Idx).toBeGreaterThan(phase2Idx);
    const phase2Block = ignite.slice(phase2Idx, phase3Idx);
    // Filename appears at least twice — once for the read step, once for
    // the write step.
    const clarifyLogOccurrences = phase2Block.split('.clarify-log.md').length - 1;
    expect(clarifyLogOccurrences).toBeGreaterThanOrEqual(2);
    // Read-step marker: the inlined no-re-ask instruction. This phrase is
    // unique to the read step.
    expect(phase2Block).toContain('Do not re-ask questions already answered in this log.');
    // Write-step marker: language about appending a new session entry.
    // Distinct from any read-step phrasing.
    expect(phase2Block.toLowerCase()).toMatch(/append[^.]*new session/);
  });

  it('ignite default does not contain competing plan dispatch', () => {
    const ignite = composed.commands.get('smithy.ignite.md')!;
    expect(ignite).toBeDefined();
    expect(ignite).not.toContain('smithy-plan');
    expect(ignite).not.toContain('smithy-reconcile');
    expect(ignite).not.toContain('Competing Plan Lenses');
    // Default (non-agent) path retains the unconditional file-write instruction
    expect(ignite).toContain('Write the RFC to');
    // Story 7: the new Phase 0 state-detection step lives only inside
    // `{{#ifAgent}}`, so the default variant must not render its heading,
    // classification states, or resume note.
    expect(ignite).not.toContain('State Detection and Review Loop');
    expect(ignite).not.toContain('Phase 0.0: State Detection');
    expect(ignite).not.toContain('Resume Hand-off');
    expect(ignite).not.toContain('first missing sub-phase');
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

  it('ignite Phase 0 audit table includes Persona Coverage and Out of Scope Completeness', () => {
    const ignite = composed.commands.get('smithy.ignite.md')!;
    expect(ignite).toBeDefined();

    // Both new audit categories must appear in the composed ignite template
    expect(ignite).toContain('Persona Coverage');
    expect(ignite).toContain('Out of Scope Completeness');

    // Existing Phase 0 audit categories must be preserved
    expect(ignite).toContain('Problem Statement');
    expect(ignite).toContain('Goals');
    expect(ignite).toContain('Milestones');
    expect(ignite).toContain('Feasibility');
    expect(ignite).toContain('Scope');
    expect(ignite).toContain('Stakeholders');
  });

  it('audit template renders audit-checklist-rfc snippet with renamed categories', () => {
    const audit = composed.commands.get('smithy.audit.md')!;
    expect(audit).toBeDefined();

    // Snippet partial must be resolved (no unresolved references)
    expect(audit).not.toContain('{{>audit-checklist-rfc}}');

    // The new category names from the snippet must be present
    expect(audit).toContain('Persona Coverage');
    expect(audit).toContain('Out of Scope Completeness');

    // The retired row labels must no longer appear in the audit template
    expect(audit).not.toContain('Persona Clarity');
    expect(audit).not.toContain('Scope Boundaries');
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

    // Legacy headings must be absent from the whole prompt — mark emits the
    // 4-column table format and never references the legacy checkbox
    // sections, not even as a fallback.
    expect(mark).not.toContain('## Story Dependency Order');
    expect(mark).not.toContain('## Feature Dependency Order');

    // The emitted spec template shape (the markdown code-fence block that
    // mark tells the LLM to produce) must also not contain the legacy
    // headings.
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

    // Legacy heading must be absent from the whole prompt — render never
    // references `## Feature Dependency Order`, not even in the audit
    // categories.
    expect(render).not.toContain('## Feature Dependency Order');

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

    // Legacy heading must be absent from the whole prompt — cut never
    // references `## Story Dependency Order`, not even as a write-back
    // fallback.
    expect(cut).not.toContain('## Story Dependency Order');

    // Cut contains more than one ```markdown fence now: Phase 0c and Phase 5
    // render the shared one-shot-output snippet, which itself embeds a
    // markdown fence. Pick the fence that actually defines the tasks file
    // structure — i.e. the one containing `## Dependency Order`.
    const cutMarkdownBlocks = [
      ...cut.matchAll(/```markdown\r?\n([\s\S]*?)\r?\n```/g),
    ];
    const cutMarkdownMatch = cutMarkdownBlocks.find((m) =>
      m[1]!.includes('## Dependency Order'),
    );
    expect(cutMarkdownMatch).toBeDefined();
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

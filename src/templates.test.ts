import { describe, it, expect, beforeAll } from 'vitest';
import { Dotprompt } from 'dotprompt';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  stripFrontmatter,
  parseFrontmatterName,
  loadSnippets,
  resolveSnippets,
  getTemplateFilesByCategory,
  getComposedTemplates,
  type ComposedTemplates,
} from './templates.js';
import { ORDERS_DEFAULT_TEMPLATES } from './orders-templates.js';

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
    expect(snippets.size).toBe(16);

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
      'pr-create-tool-choice.md',
      'branch-policy.md',
      'feature-kinds.md',
      'artifact-location-policy.md',
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
    expect(snippets.get('review-protocol.md')).toContain('Review Protocol');
    expect(snippets.get('competing-lenses-decomposition.md')).toContain('Competing Slice Lenses');
    expect(snippets.get('competing-lenses-implementation.md')).toContain('Competing Plan Lenses');
    expect(snippets.get('competing-lenses-scoping.md')).toContain('Competing Plan Lenses');
    expect(snippets.get('branch-policy.md')).toContain('Branch Selection Policy');
  });
});

describe('review-protocol snippet', () => {
  // Story 4 Slice 1: the shared review-protocol snippet is the single source
  // of truth for the read-only, findings-based review protocol that both
  // `smithy-plan-review` and `smithy-implementation-review` compose. These
  // assertions lock down the snippet's contract so any regression (deleted
  // file, renamed file, dropped Finding structure section, dropped triage
  // table, reintroduced auto-fix language) fails the test suite immediately.

  it('snippet file is loadable as a partial via loadSnippets', () => {
    const snippets = loadSnippets();
    expect(snippets.has('review-protocol.md')).toBe(true);
    const content = snippets.get('review-protocol.md')!;
    expect(content.length).toBeGreaterThan(0);
  });

  it('snippet exposes the shared Finding structure with all required fields', () => {
    const snippets = loadSnippets();
    const content = snippets.get('review-protocol.md')!;
    // The shared Finding shape from the contracts must be present so both
    // review agents can emit findings in the same structure.
    expect(content).toContain('`category`');
    expect(content).toContain('`severity`');
    expect(content).toContain('`confidence`');
    expect(content).toContain('`description`');
    expect(content).toContain('`artifact_path`');
    expect(content).toContain('`proposed_fix`');
  });

  it('snippet contains the severity × confidence triage table', () => {
    const snippets = loadSnippets();
    const content = snippets.get('review-protocol.md')!;
    // Every row of the contracts triage table must be present so the parent
    // command has an unambiguous rulebook for processing returned findings.
    expect(content).toMatch(/Critical\s*\|\s*High/);
    expect(content).toMatch(/Critical\s*\|\s*Low/);
    expect(content).toMatch(/Important\s*\|\s*High/);
    expect(content).toMatch(/Important\s*\|\s*Low/);
    expect(content).toMatch(/Minor\s*\|\s*Any/);
    // Parent-action column content is what makes this a triage table rather
    // than just a grid of severities.
    expect(content).toContain('specification debt');
    expect(content).toContain('Apply proposed fix');
  });

  it('snippet no longer contains auto-fix language', () => {
    const snippets = loadSnippets();
    const content = snippets.get('review-protocol.md')!;
    // The rewritten protocol is read-only: review agents return findings,
    // they do not auto-fix, commit, or edit artifacts themselves. Guard
    // against a future edit that reintroduces the old auto-fix vocabulary.
    expect(content).not.toMatch(/auto[- ]fix/i);
    expect(content).not.toMatch(/auto[- ]resolve\b/i);
    expect(content).not.toContain('Edit tool');
    expect(content).not.toContain('Write tool');
    // The read-only invariant must be stated so both review agents inherit
    // the correct behavior when composing this snippet.
    expect(content).toMatch(/read[- ]only/i);
    expect(content).toContain('do not modify files');
  });

  it('snippet composes into any template via the {{>review-protocol}} partial', async () => {
    // Prove the snippet is resolvable by the same partial machinery that
    // both review agents will use. If the snippet is deleted or renamed,
    // this fails because the renderer has no partial to substitute.
    const snippets = loadSnippets();
    const partials: Record<string, string> = {};
    for (const [filename, content] of snippets) {
      partials[filename.replace(/\.md$/, '')] = content.trimEnd();
    }
    const renderer = new Dotprompt({ partials });
    const host = '# Host Template\n\n{{>review-protocol}}\n';
    const result = await resolveSnippets(host, renderer);
    expect(result).toContain('## Review Protocol');
    expect(result).toContain('`proposed_fix`');
    expect(result).toContain('Critical');
    expect(result).not.toContain('{{>review-protocol}}');
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

describe('feature-kinds snippet', () => {
  // The feature-kinds snippet is the single source of the kind/phase field
  // schema referenced by both smithy.render (authoring) and smithy.audit
  // (validation). These assertions lock the snippet's contract so a rename,
  // deletion, or dropped field fails the suite immediately.

  it('snippet file is loadable as a partial via loadSnippets', () => {
    const snippets = loadSnippets();
    expect(snippets.has('feature-kinds.md')).toBe(true);
    expect(snippets.get('feature-kinds.md')!.length).toBeGreaterThan(0);
  });

  it('snippet has no YAML frontmatter (raw Markdown per snippets README)', () => {
    const snippets = loadSnippets();
    const content = snippets.get('feature-kinds.md')!;
    expect(content).not.toMatch(/^---\s*\n/);
  });

  it('snippet documents the kind enum, phases, and ui-only fields', () => {
    const snippets = loadSnippets();
    const content = snippets.get('feature-kinds.md')!;
    expect(content).toContain('## Feature Kinds');
    for (const token of [
      'backend',
      'ui',
      'build',
      'wire',
      'kind',
      'phase',
      'flag',
      'screens',
      'flows',
    ]) {
      expect(content).toContain(token);
    }
  });

  it('snippet composes into any template via the {{>feature-kinds}} partial', async () => {
    const snippets = loadSnippets();
    const partials: Record<string, string> = {};
    for (const [filename, content] of snippets) {
      partials[filename.replace(/\.md$/, '')] = content.trimEnd();
    }
    const renderer = new Dotprompt({ partials });
    const host = '# Host Template\n\n{{>feature-kinds}}\n';
    const result = await resolveSnippets(host, renderer);
    expect(result).toContain('## Feature Kinds');
    expect(result).not.toContain('{{>feature-kinds}}');
  });
});

describe('getTemplateFilesByCategory', () => {
  it('returns the correct number of files per category', () => {
    const byCategory = getTemplateFilesByCategory();
    expect(byCategory.commands).toHaveLength(10);
    expect(byCategory.prompts).toHaveLength(2);
    expect(byCategory.agents).toHaveLength(13);
    expect(byCategory.skills).toHaveLength(7);
  });

  it('skills includes smithy.pr-review, smithy.status, smithy.gh-issue, smithy.helper-docker, smithy.helper-voice, smithy.helper-screen-design, and smithy.helper-flow-definition', () => {
    const { skills } = getTemplateFilesByCategory();
    expect(skills).toContain('smithy.pr-review');
    expect(skills).toContain('smithy.status');
    expect(skills).toContain('smithy.gh-issue');
    expect(skills).toContain('smithy.helper-docker');
    expect(skills).toContain('smithy.helper-voice');
    expect(skills).toContain('smithy.helper-screen-design');
    expect(skills).toContain('smithy.helper-flow-definition');
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
    expect(commands).not.toContain('smithy.status.md');
  });

  it('prompts includes guidance and titles', () => {
    const { prompts } = getTemplateFilesByCategory();
    expect(prompts).toContain('smithy.guidance.md');
    expect(prompts).toContain('smithy.titles.md');
  });

  it('agents includes clarify, refine, implement, implementation-review, plan, plan-review, reconcile, reconcile-slices, slice, prose, and survey', () => {
    const { agents } = getTemplateFilesByCategory();
    expect(agents).toContain('smithy.clarify.md');
    expect(agents).toContain('smithy.refine.md');
    expect(agents).toContain('smithy.implement.md');
    expect(agents).toContain('smithy.implementation-review.md');
    expect(agents).toContain('smithy.plan.md');
    expect(agents).toContain('smithy.plan-review.md');
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
  let claudeComposed: ComposedTemplates;
  let codexComposed: ComposedTemplates;

  beforeAll(async () => {
    composed = await getComposedTemplates();
    claudeComposed = await getComposedTemplates('claude');
    codexComposed = await getComposedTemplates('codex');
  });

  it('returns commands, prompts, agents, and skills maps', () => {
    expect(composed.commands).toBeInstanceOf(Map);
    expect(composed.prompts).toBeInstanceOf(Map);
    expect(composed.agents).toBeInstanceOf(Map);
    expect(composed.skills).toBeInstanceOf(Map);
  });

  it('skills map includes smithy.pr-review with prompt and scripts', () => {
    // Issue #261 added the GitHub MCP tools as the preferred path but kept
    // the `gh`-CLI shell scripts as the fallback for hosts without
    // the GitHub MCP server.
    const skill = claudeComposed.skills.get('smithy.pr-review');
    expect(skill).toBeDefined();
    expect(skill!.prompt).toBeTruthy();
    expect(skill!.scripts).toBeInstanceOf(Map);
    expect(skill!.scripts.size).toBe(4);
    expect(skill!.scripts.has('find-pr.sh')).toBe(true);
    expect(skill!.scripts.has('get-comments.sh')).toBe(true);
    expect(skill!.scripts.has('reply-comment.sh')).toBe(true);
    expect(skill!.scripts.has('add-comment.sh')).toBe(true);
  });

  it('smithy.pr-review prompt retains frontmatter including allowed-tools', () => {
    // Frontmatter is kept at deploy time so Claude Code can read allowed-tools from SKILL.md
    const skill = claudeComposed.skills.get('smithy.pr-review')!;
    expect(skill.prompt).toContain('smithy.pr-review');
    expect(skill.prompt).toContain('allowed-tools');
  });

  it('smithy.pr-review allowed-tools lists both the GitHub MCP tools and the script fallbacks', () => {
    const skill = claudeComposed.skills.get('smithy.pr-review')!;
    // MCP-first path
    expect(skill.prompt).toContain('mcp__github__list_pull_requests');
    expect(skill.prompt).toContain('mcp__github__pull_request_read');
    expect(skill.prompt).toContain('mcp__github__add_reply_to_pull_request_comment');
    expect(skill.prompt).toContain('mcp__github__issue_write');
    // gh-CLI script fallback (canonical `:*` argument-suffix form)
    expect(skill.prompt).toContain('Bash(*/smithy.pr-review/scripts/find-pr.sh)');
    expect(skill.prompt).toContain('Bash(*/smithy.pr-review/scripts/get-comments.sh:*)');
    expect(skill.prompt).toContain('Bash(*/smithy.pr-review/scripts/reply-comment.sh:*)');
    expect(skill.prompt).toContain('Bash(*/smithy.pr-review/scripts/add-comment.sh:*)');
  });

  it('smithy.pr-review documents PR comment operations and the MCP-first / script-fallback choice', () => {
    // Spot-check that the prompt body teaches the comment operations and the
    // dual-path decision rule (try MCP first, fall back to scripts when the
    // GitHub MCP server is unavailable).
    const skill = claudeComposed.skills.get('smithy.pr-review')!;
    expect(skill.prompt).toContain('Find Open PR');
    expect(skill.prompt).toContain('List PR Comments');
    expect(skill.prompt).toContain('Reply to Inline Comment');
    expect(skill.prompt).toContain('Reply to Conversation Comment');
    // MCP method that exposes review threads
    expect(skill.prompt).toContain('get_review_comments');
    // The skill must explicitly direct the agent through the dual-path flow.
    expect(skill.prompt).toMatch(/MCP[^\n]+(first|prefer)/i);
    expect(skill.prompt).toMatch(/(fall back|fallback)/i);
  });

  it('smithy.pr-review renders Codex script fallback paths', () => {
    const skill = codexComposed.skills.get('smithy.pr-review')!;
    expect(skill.prompt).toContain('./.agents/skills/smithy.pr-review/scripts/find-pr.sh');
    expect(skill.prompt).toContain('./.agents/skills/smithy.pr-review/scripts/get-comments.sh');
    expect(skill.prompt).toContain('./.agents/skills/smithy.pr-review/scripts/reply-comment.sh');
    expect(skill.prompt).toContain('./.agents/skills/smithy.pr-review/scripts/add-comment.sh');
    expect(skill.prompt).not.toContain('${CLAUDE_SKILL_DIR}');
    expect(skill.prompt).not.toContain('./.gemini/skills/smithy.pr-review');
  });

  it('smithy.pr-review renders Codex GitHub app actions as the preferred review-thread path', () => {
    const skill = codexComposed.skills.get('smithy.pr-review')!;
    expect(skill.prompt).toContain("Codex's GitHub app connector");
    expect(skill.prompt).toContain('allowed-tools:');
    expect(skill.prompt).toContain('_list_pull_request_review_threads');
    expect(skill.prompt).toContain('_fetch_pr_comments');
    expect(skill.prompt).toContain('_reply_to_review_comment');
    expect(skill.prompt).toContain('_add_comment_to_issue');
    expect(skill.prompt).toContain('reply-comment.sh <ownerRepo> <pr-number> <comment-id> <body-file>');
    expect(skill.prompt).toContain('use tool discovery');
    expect(skill.prompt).toContain('The discovered Codex GitHub app actions do not provide a direct "find open PR');
  });

  it('smithy.fix tells Codex to use pr-review app actions before script fallbacks', () => {
    const fix = codexComposed.commands.get('smithy.fix.md')!;
    expect(fix).toContain("skill's Codex GitHub app path");
    expect(fix).toContain('root comment ID identified by the `smithy.pr-review` Codex path');
    expect(fix).not.toContain('Post your reply to\n   `comments[0].databaseId`');
  });

  it('smithy.pr-review scripts start with bash shebang', () => {
    const skill = claudeComposed.skills.get('smithy.pr-review')!;
    for (const [, content] of skill.scripts) {
      expect(content).toMatch(/^#!\/usr\/bin\/env bash/);
    }
  });

  it('get-comments.sh uses GraphQL for full thread data', () => {
    const skill = claudeComposed.skills.get('smithy.pr-review')!;
    const script = skill.scripts.get('get-comments.sh')!;
    expect(script).toContain('gh api graphql');
    expect(script).toContain('reviewThreads');
    expect(script).toContain('viewer { login }');
    expect(script).toContain('comments(last: 100)');
    expect(script).toContain('conversation_comment');
    expect(script).toContain('smithy-pr-review-response-to:');
    expect(script).toContain('isResolved');
    expect(script).toContain('databaseId');
  });

  it('add-comment.sh uses correct REST API path for PR conversation comments', () => {
    const skill = claudeComposed.skills.get('smithy.pr-review')!;
    const script = skill.scripts.get('add-comment.sh')!;
    expect(script).toContain('repos/$REPO/issues/$PR/comments');
    expect(script).toContain('--method POST');
    expect(script).toContain('--input "$BODY_FILE"');
  });

  it('reply-comment.sh uses correct REST API path with pr number', () => {
    const skill = claudeComposed.skills.get('smithy.pr-review')!;
    const script = skill.scripts.get('reply-comment.sh')!;
    expect(script).toContain('repos/$REPO/pulls/$PR/comments/$COMMENT_ID/replies');
    expect(script).toContain('--method POST');
    expect(script).toContain('--input "$BODY_FILE"');
  });

  it('skills map includes smithy.gh-issue with the four expected scripts', () => {
    const skill = claudeComposed.skills.get('smithy.gh-issue');
    expect(skill).toBeDefined();
    expect(skill!.prompt).toBeTruthy();
    expect(skill!.scripts.size).toBe(4);
    expect(skill!.scripts.has('check-env.sh')).toBe(true);
    expect(skill!.scripts.has('search-issues.sh')).toBe(true);
    expect(skill!.scripts.has('create-issue.sh')).toBe(true);
    expect(skill!.scripts.has('link-blocked-by.sh')).toBe(true);
  });

  it('smithy.gh-issue prompt retains frontmatter with allowed-tools for all scripts', () => {
    const skill = claudeComposed.skills.get('smithy.gh-issue')!;
    expect(skill.prompt).toMatch(/^---\s*\n/);
    expect(skill.prompt).toContain('name: smithy.gh-issue');
    expect(skill.prompt).toContain('Bash(*/smithy.gh-issue/scripts/check-env.sh)');
    expect(skill.prompt).toContain('Bash(*/smithy.gh-issue/scripts/search-issues.sh *)');
    expect(skill.prompt).toContain('Bash(*/smithy.gh-issue/scripts/create-issue.sh *)');
    expect(skill.prompt).toContain('Bash(*/smithy.gh-issue/scripts/link-blocked-by.sh *)');
  });

  it('smithy.gh-issue scripts start with bash shebang and set strict mode', () => {
    const skill = claudeComposed.skills.get('smithy.gh-issue')!;
    for (const [, content] of skill.scripts) {
      expect(content).toMatch(/^#!\/usr\/bin\/env bash/);
      expect(content).toContain('set -euo pipefail');
    }
  });

  it('search-issues.sh accepts state, query, and optional limit', () => {
    const skill = claudeComposed.skills.get('smithy.gh-issue')!;
    const script = skill.scripts.get('search-issues.sh')!;
    expect(script).toContain('gh issue list');
    expect(script).toContain('--state "$STATE"');
    expect(script).toContain('--search "$QUERY"');
    expect(script).toContain('--limit "$LIMIT"');
    expect(script).toContain('--json number,title,state,body');
  });

  it('create-issue.sh writes via --body-file and emits JSON with number', () => {
    const skill = claudeComposed.skills.get('smithy.gh-issue')!;
    const script = skill.scripts.get('create-issue.sh')!;
    expect(script).toContain('gh issue create --title "$TITLE" --body-file "$BODY_FILE"');
    expect(script).toContain('jq -n');
    expect(script).toContain('number: $number');
  });

  it('link-blocked-by.sh uses addBlockedBy GraphQL mutation', () => {
    const skill = claudeComposed.skills.get('smithy.gh-issue')!;
    const script = skill.scripts.get('link-blocked-by.sh')!;
    expect(script).toContain('addBlockedBy');
    expect(script).toContain('blockingIssueId:$blocker');
    expect(script).toContain('gh api graphql');
  });

  it('smithy.orders command delegates GitHub ops to smithy.gh-issue scripts', () => {
    const orders = claudeComposed.commands.get('smithy.orders.md')!;
    expect(orders).toBeDefined();
    expect(orders).toContain('${CLAUDE_SKILL_DIR}/scripts/check-env.sh');
    expect(orders).toContain('${CLAUDE_SKILL_DIR}/scripts/search-issues.sh');
    expect(orders).toContain('${CLAUDE_SKILL_DIR}/scripts/create-issue.sh');
    expect(orders).toContain('${CLAUDE_SKILL_DIR}/scripts/link-blocked-by.sh');
    // The old inline gh invocations should be gone — orders no longer calls
    // gh directly for issue creation, search, or linking.
    expect(orders).not.toContain('gh issue create --title');
    expect(orders).not.toContain('gh issue list --search');

    // Manifest-load phase (US2 S1 Task 1): the prompt must name the
    // resolveManifestDir helper that drives <manifestDir> selection, and
    // it must name the runtime templates path pattern that Phase 5 reads
    // from.
    expect(orders).toContain('resolveManifestDir');
    expect(orders).toContain('<manifestDir>/templates/orders/');
    const manifestResolutionHeading = '### Manifest Discovery and `<manifestDir>` Resolution';
    const manifestResolutionStart = orders.indexOf(manifestResolutionHeading);
    expect(manifestResolutionStart).toBeGreaterThan(-1);
    const manifestResolutionEnd = orders.indexOf('**Forbidden operations.**', manifestResolutionStart);
    expect(manifestResolutionEnd).toBeGreaterThan(manifestResolutionStart);
    const manifestResolution = orders.slice(manifestResolutionStart, manifestResolutionEnd);

    // US3 Slice 2: deploy-location awareness must be routed through the
    // manifest-load phase, not hardcoded to one location. The prompt may use a
    // deploy-location-agnostic <manifestDir> placeholder downstream, so assert
    // that both location values are inputs to resolveManifestDir here.
    expect(manifestResolution).toContain("parsed JSON object (in particular its `deployLocation` field");
    expect(manifestResolution).toMatch(/Read the selected\s+manifest's stored `deployLocation` field/);
    expect(manifestResolution).toContain('<manifestDir> = resolveManifestDir(targetDir, location)');
    expect(manifestResolution).toContain("resolveManifestDir(targetDir, 'repo')");
    expect(manifestResolution).toContain("resolveManifestDir(targetDir, 'user')");
    const missingManifestStart = manifestResolution.indexOf('**(a) Neither candidate exists.**');
    expect(missingManifestStart).toBeGreaterThan(-1);
    const missingManifestEnd = manifestResolution.indexOf('**(b) Only the repo candidate exists.**', missingManifestStart);
    expect(missingManifestEnd).toBeGreaterThan(missingManifestStart);
    const missingManifestPath = manifestResolution.slice(missingManifestStart, missingManifestEnd);
    expect(missingManifestPath).toContain('`smithy init`');
    // Spec template lookup (US2 S1 Task 2): the .spec.md mapping must
    // specifically reference the spec.md template file under the
    // manifest's orders templates directory.
    expect(orders).toContain('<manifestDir>/templates/orders/spec.md');

    // US2 S2: rfc/tasks template lookup + RFC parent epic stays
    // hardcoded per AS 2.2. The per-milestone .rfc.md child body and
    // the per-slice .tasks.md child body both render from
    // <manifestDir>/templates/orders/<type>.md when present. The
    // RFC parent tracking issue (the `[RFC] <rfc-title>` epic) body
    // is explicitly out of scope and must remain as a hardcoded
    // heredoc — we assert both the `## RFC Tracking Issue` section
    // header and the `[RFC] <rfc-title>` title pattern survive so a
    // future edit cannot quietly drop the parent epic body.
    expect(orders).toContain('<manifestDir>/templates/orders/rfc.md');
    expect(orders).toContain('<manifestDir>/templates/orders/tasks.md');
    expect(orders).toContain('## RFC Tracking Issue');
    expect(orders).toContain('[RFC] <rfc-title>');

    // US2 S3: features issues render from the features template when
    // present, and the features parser populates {{features_path}} from
    // the source RFC's Dependency Order table rather than guessing a path.
    expect(orders).toContain('<manifestDir>/templates/orders/features.md');
    expect(orders).toContain('{{features_path}}');
    expect(orders).toMatch(/Source RFC[\s\S]+## Dependency Order[\s\S]+Artifact/);
    expect(orders).toMatch(/milestone number[\s\S]+M<N>/);

    // US4 Slice 1 Task 2: parity between the prompt's Phase 5 fallback
    // bodies and the canonical default exports in `src/orders-templates.ts`.
    // For each of the four orders-eligible artifact types, both surfaces
    // must (a) name every variable from the data-model variable table for
    // that type and (b) carry the hybrid `## Source` / `## Context`
    // section the spec's "Default Template Content" promises. We assert
    // on structural strings only (no pasted body text, no line numbers)
    // so the test stays robust to copy edits.
    const perTypeVariables: Record<'rfc' | 'features' | 'spec' | 'tasks', string[]> = {
      rfc: [
        '{{title}}',
        '{{milestone_number}}',
        '{{milestone_title}}',
        '{{milestone_description}}',
        '{{milestone_success_criteria}}',
        '{{rfc_path}}',
        '{{parent_issue}}',
        '{{next_step}}',
      ],
      features: [
        '{{title}}',
        '{{feature_description}}',
        '{{milestone_number}}',
        '{{parent_issue}}',
        '{{features_path}}',
        '{{next_step}}',
      ],
      spec: [
        '{{title}}',
        '{{priority}}',
        '{{user_story_number}}',
        '{{user_story}}',
        '{{acceptance_scenarios}}',
        '{{spec_path}}',
        '{{data_model_path}}',
        '{{contracts_path}}',
        '{{next_step}}',
        '{{spec_folder}}',
      ],
      tasks: [
        '{{title}}',
        '{{slice_number}}',
        '{{slice_goal}}',
        '{{slice_tasks}}',
        '{{tasks_path}}',
        '{{parent_issue}}',
        '{{next_step}}',
      ],
    };

    // The hybrid section the spec calls for is either a `## Source`
    // (rfc, features) or `## Context` (spec, tasks) header — the spec's
    // "Default Template Content" uses both names. Each canonical body
    // includes at least one repo-relative path placeholder inside that
    // section.
    const perTypeHybridHeader: Record<'rfc' | 'features' | 'spec' | 'tasks', string> = {
      rfc: '## Source',
      features: '## Source',
      spec: '## Context',
      tasks: '## Context',
    };

    for (const type of ['rfc', 'features', 'spec', 'tasks'] as const) {
      const canonical = ORDERS_DEFAULT_TEMPLATES[type];
      expect(canonical).toBeDefined();

      for (const variable of perTypeVariables[type]) {
        // The canonical default must name every variable from the
        // data-model table for this type.
        expect(canonical).toContain(variable);
        // The composed prompt's fallback region must name the same set
        // — if either surface loses a variable, the two have drifted.
        expect(orders).toContain(variable);
      }

      // Structural hybrid section: each canonical default has a
      // Source/Context header with a repo-relative path placeholder.
      expect(canonical).toContain(perTypeHybridHeader[type]);
      expect(orders).toContain(perTypeHybridHeader[type]);
    }

    // Spec-type fallback's next-step line must include the parenthetical
    // the spec shows, naming `{{spec_folder}}` and `{{user_story_number}}`
    // together. We assert on both occurring near each other in both
    // surfaces — the canonical default carries the same parenthetical so
    // the prompt and module cannot diverge on this scope-edge wording.
    expect(ORDERS_DEFAULT_TEMPLATES.spec).toMatch(
      /smithy\.cut \{\{spec_folder\}\} \{\{user_story_number\}\}/
    );
    expect(orders).toMatch(/smithy\.cut \{\{spec_folder\}\} \{\{user_story_number\}\}/);
  });

  it('smithy.orders renders Codex gh-issue script paths', () => {
    const orders = codexComposed.commands.get('smithy.orders.md')!;
    expect(orders).toContain('./.agents/skills/smithy.gh-issue/scripts/check-env.sh');
    expect(orders).toContain('./.agents/skills/smithy.gh-issue/scripts/search-issues.sh');
    expect(orders).toContain('./.agents/skills/smithy.gh-issue/scripts/create-issue.sh');
    expect(orders).toContain('./.agents/skills/smithy.gh-issue/scripts/link-blocked-by.sh');
    expect(orders).not.toContain('${CLAUDE_SKILL_DIR}');
    expect(orders).not.toContain('./.gemini/skills/smithy.gh-issue');
  });

  it('smithy.forge renders direct implementation and review instructions for Codex', () => {
    const forge = codexComposed.commands.get('smithy.forge.md')!;
    expect(forge).toContain('Use test-driven development for each task');
    expect(forge).toContain('Review your implementation by examining the diff');
    expect(forge).not.toContain('Dispatch a sub-agent for each task');
    expect(forge).not.toContain('smithy-implementation-review sub-agent');
    expect(forge).not.toContain('smithy-maid sub-agent');
  });

  // US4 Slice 1 Task 1: the RFC parser in Phase 3 must enumerate
  // milestone-level success criteria alongside title and description so
  // downstream fallback bodies can render {{milestone_success_criteria}}.
  // The data-model row for that variable is `rfc | inline | body of
  // **Success Criteria**`, and validation says missing content resolves to
  // empty string. The assertion below is structural: it isolates Phase 3's
  // `.rfc.md` block and checks that the per-milestone extraction set names
  // all three fields (title, description, success criteria) without
  // pinning exact wording.
  it('smithy.orders Phase 3 RFC parser enumerates milestone success criteria', () => {
    const orders = composed.commands.get('smithy.orders.md')!;
    expect(orders).toBeDefined();

    // Slice out the `.rfc.md` parse block from Phase 3 — the section
    // begins at the `### For \`.rfc.md\`` heading and ends at the next
    // `### For ` heading (the `.features.md` block).
    const rfcHeading = '### For `.rfc.md`';
    const rfcStart = orders.indexOf(rfcHeading);
    expect(rfcStart).toBeGreaterThan(-1);
    const nextHeading = orders.indexOf('### For ', rfcStart + rfcHeading.length);
    expect(nextHeading).toBeGreaterThan(rfcStart);
    const rfcBlock = orders.slice(rfcStart, nextHeading);

    // Per-milestone extraction set must enumerate title, description, and
    // success criteria. We match the data-model field name ("success
    // criteria") and the source pattern (`**Success Criteria**`) so the
    // assertion fails if either disappears.
    expect(rfcBlock.toLowerCase()).toContain('title');
    expect(rfcBlock.toLowerCase()).toContain('description');
    expect(rfcBlock.toLowerCase()).toContain('success criteria');
    expect(rfcBlock).toContain('**Success Criteria**');

    // Anchor the success-criteria extraction to the per-milestone block
    // (`### Milestone N:` pattern) rather than a top-level RFC section.
    expect(rfcBlock).toMatch(/###\s+Milestone\s+N/i);
  });

  it('smithy.helper-docker is body-only (no scripts) with frontmatter retained', () => {
    const skill = composed.skills.get('smithy.helper-docker');
    expect(skill).toBeDefined();
    expect(skill!.prompt).toContain('name: smithy.helper-docker');
    expect(skill!.prompt).toMatch(/^---\s*\n/);
    expect(skill!.scripts.size).toBe(0);
  });

  it('smithy.forge advertises smithy.helper-docker in its operational skills table', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toBeDefined();
    expect(forge).toContain('smithy.helper-docker');
  });

  // Issue #408 (EPIC #404): smithy.forge is parameterized by feature `kind`
  // and `phase` WITHOUT forking the pipeline. The four UI paths are:
  //   build × no-bundle, build × bundle, wire × (flow emission), plus the
  //   ui reviewer profile. The backend path must stay unchanged. These tests
  //   are structural — they isolate the routing section and assert each path's
  //   distinguishing instruction is present without pinning exact wording.
  describe('smithy.forge kind/phase routing (#408)', () => {
    // Helper: slice out the Feature Kind Routing section so assertions don't
    // accidentally match unrelated prose elsewhere in the prompt.
    const routingSection = (forge: string): string => {
      const start = forge.indexOf('## Feature Kind Routing');
      expect(start).toBeGreaterThan(-1);
      const end = forge.indexOf('\n## ', start + 1);
      expect(end).toBeGreaterThan(start);
      return forge.slice(start, end);
    };

    it('advertises the two UI helper skills in the operational skills table', () => {
      const forge = composed.commands.get('smithy.forge.md')!;
      expect(forge).toContain('smithy.helper-screen-design');
      expect(forge).toContain('smithy.helper-flow-definition');
    });

    it('has a Feature Kind Routing section that resolves kind from the feature map and defaults to backend', () => {
      const section = routingSection(composed.commands.get('smithy.forge.md')!);
      // Reads kind/phase/design_system/bundle from the feature (#405 schema).
      expect(section).toContain('Source Feature Map');
      expect(section).toContain('kind');
      expect(section).toContain('phase');
      expect(section).toContain('design_system');
      expect(section).toContain('bundle');
      // The resolve instruction must explicitly include `flag` — downstream
      // steps gate the mock build, flip at wire, and pass it into sub-agents,
      // so forge must resolve it alongside the other UI fields (PR #434 review).
      const resolveLine = section
        .split('\n')
        .find((l) => /Determine `kind`/.test(l));
      expect(resolveLine).toBeDefined();
      expect(resolveLine!).toContain('`flag`');
      // Default-to-backend keeps pre-#404 tasks/strike files on the old path.
      expect(section).toMatch(/default.*backend/i);
    });

    it('keeps the backend path explicitly unchanged', () => {
      const section = routingSection(composed.commands.get('smithy.forge.md')!);
      const backendRow = section
        .split('\n')
        .find((l) => l.includes('`backend`') && /unchanged/i.test(l));
      expect(backendRow).toBeDefined();
    });

    // Path 1 — UI build, no bundle: Compose from prose + committed skill.
    it('routes UI build with no bundle to Compose from prose + the committed design skill', () => {
      const section = routingSection(composed.commands.get('smithy.forge.md')!);
      const buildNoBundle = section
        .split('\n')
        .find((l) => l.includes('`build`') && /absent/i.test(l));
      expect(buildNoBundle).toBeDefined();
      expect(buildNoBundle!).toMatch(/compose/i);
      expect(buildNoBundle!).toMatch(/prose/i);
      expect(buildNoBundle!).toContain('design_system');
    });

    // Path 2 — UI build, with bundle: translate to Compose under conflict rule.
    it('routes UI build with a bundle to a Compose translation under the bundle-vs-skill conflict rule', () => {
      const section = routingSection(composed.commands.get('smithy.forge.md')!);
      const buildBundle = section
        .split('\n')
        .find((l) => l.includes('`build`') && /present/i.test(l));
      expect(buildBundle).toBeDefined();
      // Conflict rule: bundle wins on layout/visual intent; skill wins on dialect.
      expect(buildBundle!).toMatch(/bundle wins on layout/i);
      expect(buildBundle!).toMatch(/skill wins on implementation dialect/i);
    });

    it('preloads the design_system skill as implementer context for every UI profile', () => {
      const section = routingSection(composed.commands.get('smithy.forge.md')!);
      expect(section).toMatch(/preload the `design_system` skill/i);
    });

    // Path 3 — UI wire: definition-of-done emits/updates the Maestro flow + flow.md.
    it('routes UI wire so the definition-of-done emits/updates the Maestro flow + flow.md for participating flows', () => {
      const forge = composed.commands.get('smithy.forge.md')!;
      const section = routingSection(forge);
      const wireRow = section
        .split('\n')
        .find((l) => l.trimStart().startsWith('|') && l.includes('`wire`'));
      expect(wireRow).toBeDefined();
      expect(wireRow!).toMatch(/maestro flow/i);
      expect(wireRow!).toContain('flow.md');
      // The wire gate is a real STOP gate, not a note.
      const gateStart = forge.indexOf('## Wire Definition-of-Done');
      expect(gateStart).toBeGreaterThan(-1);
      const gate = forge.slice(gateStart, forge.indexOf('\n## ', gateStart + 1));
      expect(gate).toContain('design/flows/<FlowId>.flow.md');
      expect(gate).toContain('maestro/flows/<FlowId>.yaml');
      expect(gate).toMatch(/testID-keyed/i);
      expect(gate).toMatch(/STOP gate/);
    });

    // Path 4 — reviewer profile selection for kind: ui.
    it('selects a structural-conformance reviewer profile for kind: ui that does not judge visual fidelity', () => {
      const forge = composed.commands.get('smithy.forge.md')!;
      const start = forge.indexOf('### Review profile selection');
      expect(start).toBeGreaterThan(-1);
      const profile = forge.slice(start, forge.indexOf('\n{{#ifAgent}}', start));
      // Structural conformance checks from the issue.
      expect(profile).toMatch(/tokens-only/i);
      expect(profile).toMatch(/no hardcoded hex|raw color literal/i);
      expect(profile).toMatch(/component reuse/i);
      expect(profile).toMatch(/M2 convention|Material-2/i);
      expect(profile).toMatch(/every brief state|brief state present/i);
      expect(profile).toMatch(/touch-target/i);
      expect(profile).toMatch(/contrast/i);
      // Explicitly does NOT judge visual fidelity, and stays read-only.
      expect(profile).toMatch(/does not judge visual fidelity/i);
      expect(profile).toMatch(/read-only|no-write/i);
    });

    it('carries the routing and reviewer-profile selection into the Codex (non-agent) variant too', () => {
      // Routing is agent-independent: it changes inputs + review profile, not
      // orchestration, so the Codex inline path must see it as well.
      const forge = codexComposed.commands.get('smithy.forge.md')!;
      expect(forge).toContain('## Feature Kind Routing');
      expect(forge).toContain('### Review profile selection');
      expect(forge).toMatch(/does not judge visual fidelity/i);
    });
  });

  it('smithy-implementation-review carries a ui structural-conformance profile that excludes visual fidelity', () => {
    const review = composed.agents.get('smithy.implementation-review.md')!;
    expect(review).toBeDefined();
    // Profile selection input + the two profiles.
    expect(review).toContain('Review profile');
    expect(review).toMatch(/`backend` profile/);
    expect(review).toMatch(/`ui` profile/);
    // ui profile = structural conformance only, no visual fidelity.
    expect(review).toMatch(/structural conformance only/i);
    expect(review).toMatch(/do not judge visual fidelity/i);
    // ui category vocabulary covers the issue's structural checks.
    expect(review).toMatch(/Hardcoded design value/i);
    expect(review).toMatch(/Component reuse/i);
    expect(review).toMatch(/M2 convention/i);
    expect(review).toMatch(/Missing brief state/i);
    expect(review).toMatch(/Accessibility role/i);
    expect(review).toMatch(/Flow conformance/i);
  });

  // Issue #420: smithy.helper-voice is a new body-only operational skill
  // that distributes the voice & audience taxonomy (EPIC #419). These
  // assertions back-stop the deployment contract (body-only, frontmatter
  // retained, auto-trigger description) and the 10-section outline so a
  // regression that drops a section, removes the auto-trigger phrases, or
  // accidentally adds a `scripts/` subdirectory fails the suite.
  it('smithy.helper-voice is body-only (no scripts) with frontmatter retained', () => {
    const skill = composed.skills.get('smithy.helper-voice');
    expect(skill).toBeDefined();
    expect(skill!.prompt).toMatch(/^---\s*\n/);
    expect(skill!.prompt).toContain('name: smithy.helper-voice');
    expect(skill!.scripts.size).toBe(0);
  });

  it('smithy.helper-voice description triggers on draft and review/cleanup phrasing', () => {
    const skill = composed.skills.get('smithy.helper-voice')!;
    // Auto-trigger description (frontmatter) must name the two invocation
    // surfaces and the deliverable types the skill covers, so calling
    // agents recognize when to lazy-load it.
    expect(skill.prompt).toMatch(/drafting or reviewing prose/i);
    expect(skill.prompt).toContain('migration plans');
    expect(skill.prompt).toContain('ADRs');
    expect(skill.prompt).toContain('runbooks');
    expect(skill.prompt).toContain('READMEs');
    // The Role × Diátaxis-mode framing is the load-bearing claim of the
    // description — if it disappears, the skill no longer advertises its
    // actual content.
    expect(skill.prompt).toMatch(/Role × Diátaxis-mode taxonomy/i);
  });

  it('smithy.helper-voice body covers the 10-section outline', () => {
    const skill = composed.skills.get('smithy.helper-voice')!;
    // Per issue #420, the body must cover all ten sections of the
    // outline. Anchor on the numbered heading prefix so a regression that
    // renumbers or drops one section is caught.
    expect(skill.prompt).toContain('## 1. The two axes');
    expect(skill.prompt).toContain('## 2. The four anti-patterns');
    expect(skill.prompt).toContain('## 3. Voice rules per Role × Mode combination');
    expect(skill.prompt).toContain('## 4. Diagram guidance');
    expect(skill.prompt).toContain('## 5. Embedded examples — when code helps vs. hurts');
    expect(skill.prompt).toContain('## 6. Reference-prose anti-pattern');
    expect(skill.prompt).toContain('## 7. Depth-control rule');
    expect(skill.prompt).toContain('## 8. Audience tag grammar');
    expect(skill.prompt).toContain('## 9. Three worked before/after examples');
    expect(skill.prompt).toContain('## 10. Application beyond Smithy');
  });

  it('smithy.helper-voice documents both invocation modes', () => {
    const skill = composed.skills.get('smithy.helper-voice')!;
    // Two first-class modes per issue #420. Both must be documented in
    // the body so any agent loading the skill knows it can draft *or*
    // review/cleanup.
    expect(skill.prompt).toMatch(/Draft mode/);
    expect(skill.prompt).toMatch(/Review \/ cleanup mode/);
    // The side-by-side compare is the primary validation path for the
    // cleanup mode and must be called out explicitly. Either spelling
    // (hyphenated or whitespace-separated, potentially wrapped across a
    // newline) counts as documenting the compare protocol.
    expect(skill.prompt).toMatch(/side[\s-]+by[\s-]+side/i);
  });

  it('smithy.helper-voice documents the audience-tag grammar with all directive keys', () => {
    const skill = composed.skills.get('smithy.helper-voice')!;
    // Tagging-grammar directive keys (issue #420). Every key must appear
    // in the body so authors of new templates have one source of truth
    // for the convention.
    expect(skill.prompt).toContain('audience:');
    expect(skill.prompt).toContain('mode:');
    expect(skill.prompt).toContain('length:');
    expect(skill.prompt).toContain('diagram:');
    expect(skill.prompt).toContain('examples:');
    expect(skill.prompt).toContain('applicability:');
    // The +ai-input flag is additive on the base role and must be named.
    expect(skill.prompt).toContain('+ai-input');
    // The inline HTML-comment carrier and the N/A fallback for
    // non-code-shaped Reference sections are both load-bearing pieces of
    // the taxonomy, per issue #420 sections 6 and 8.
    expect(skill.prompt).toMatch(/<!-- audience:/);
    expect(skill.prompt).toMatch(/N\/A —/);
  });

  it('smithy.helper-voice is provider-neutral (no Claude/Gemini/Codex syntax in the body)', () => {
    const skill = composed.skills.get('smithy.helper-voice')!;
    // Strip frontmatter before checking — the deploy-target name in
    // frontmatter is "smithy.helper-voice", not a Claude-specific term.
    const body = skill.prompt.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
    // Provider-specific surfaces must not leak into the body.
    expect(body).not.toMatch(/\$ARGUMENTS\b/);
    expect(body).not.toMatch(/allowed-tools\s*:/);
    expect(body).not.toMatch(/CLAUDE_SKILL_DIR/);
    expect(body).not.toMatch(/\.gemini\/skills/);
    expect(body).not.toMatch(/\.agents\/skills/);
    // The body must explicitly assert its provider-neutrality so a
    // future edit that quietly adds provider-specific syntax has to
    // also remove the assertion.
    expect(body).toMatch(/Provider-neutral/i);
  });

  // Issue #407 (EPIC #404): smithy.helper-screen-design is a body-only,
  // lazy-loaded operational skill that owns the authoring contract for
  // `design/screens/<ScreenId>.design.md`. The skill body is the single
  // source of truth for the YAML front-matter schema, the rationale-only
  // body rule, the skeleton template, and the worked Library example, so
  // downstream commands (`smithy.forge` once #408 wires UI emission and
  // `smithy.audit` / `flow-lint` once #409 lands) Skill() it instead of
  // composing a partial. These assertions back-stop the deployment contract
  // (body-only, frontmatter retained, auto-trigger description) and every
  // load-bearing piece of the schema so a regression that drops a section,
  // weakens the no-re-description guard, or relocates the artifact path
  // fails the suite immediately.
  it('smithy.helper-screen-design is body-only (no scripts) with frontmatter retained', () => {
    const skill = composed.skills.get('smithy.helper-screen-design');
    expect(skill).toBeDefined();
    expect(skill!.prompt).toMatch(/^---\s*\n/);
    expect(skill!.prompt).toContain('name: smithy.helper-screen-design');
    expect(skill!.scripts.size).toBe(0);
  });

  it('smithy.helper-screen-design description triggers on authoring and auditing UI screens', () => {
    const skill = composed.skills.get('smithy.helper-screen-design')!;
    // Auto-trigger description (frontmatter) must name the artifact path,
    // the two invocation modes (authoring + auditing), and the four
    // front-matter keys so calling agents recognize when to lazy-load it.
    expect(skill.prompt).toContain('design/screens/<ScreenId>.design.md');
    expect(skill.prompt).toMatch(/authoring or auditing/i);
    expect(skill.prompt).toContain('kind: ui');
    // The four schema keys are the load-bearing claim of the description.
    expect(skill.prompt).toMatch(/id\s*\/\s*composable\s*\/\s*design_system\s*\/\s*bundle/);
  });

  it('smithy.helper-screen-design body documents the four front-matter fields', () => {
    const skill = composed.skills.get('smithy.helper-screen-design')!;
    expect(skill.prompt).toContain('## YAML front-matter schema');
    for (const field of ['`id`', '`composable`', '`design_system`', '`bundle`']) {
      expect(skill.prompt).toContain(field);
    }
    // Explicit YAML labeling — the front-matter is YAML between `---` fences,
    // not a Smithy-specific format. Guard against a future edit that drops
    // the YAML labeling and leaves only an implicit convention.
    expect(skill.prompt).toMatch(/YAML front-matter/);
    expect(skill.prompt).toMatch(/between `---`[\s\S]*fences/);
  });

  it('smithy.helper-screen-design body documents the three rationale-only sections', () => {
    const skill = composed.skills.get('smithy.helper-screen-design')!;
    expect(skill.prompt).toContain('## Body shape');
    for (const section of [
      'Why this screen exists',
      'Deliberate choices',
      'Deferred',
    ]) {
      expect(skill.prompt).toContain(section);
    }
  });

  it('smithy.helper-screen-design enforces the no-re-description rule', () => {
    const skill = composed.skills.get('smithy.helper-screen-design')!;
    // The whole point of the annotation is that it is NOT a parallel screen
    // spec — the composable owns layout/behavior, this file owns intent.
    // Guard against a future edit that softens the rule.
    expect(skill.prompt).toMatch(/thin/i);
    expect(skill.prompt).toMatch(/intent/i);
    expect(skill.prompt).toMatch(/rationale only/i);
    // The forbidden-sections list keeps the rule operational rather than
    // aspirational — the review checklist must call them out by name.
    expect(skill.prompt).toMatch(/no `## Layout`, `## States`, or `## Flow`/);
  });

  it('smithy.helper-screen-design ships the skeleton template and the Library example', () => {
    const skill = composed.skills.get('smithy.helper-screen-design')!;
    expect(skill.prompt).toContain('## Skeleton template');
    expect(skill.prompt).toContain('## Worked example — `Library.design.md`');
    // Library example must be filled out, not a placeholder — at least the
    // composable path and the rationale sections from the issue.
    expect(skill.prompt).toContain('id: Library');
    expect(skill.prompt).toContain('LibraryScreen.kt');
    expect(skill.prompt).toContain('story-spider-design');
  });

  it('smithy.helper-screen-design ships a review checklist for the audit/lint surfaces', () => {
    const skill = composed.skills.get('smithy.helper-screen-design')!;
    // The checklist is what makes the skill usable by smithy.audit (and
    // later flow-lint #409) — it converts the prose contract into a
    // line-by-line list of findings. Guard the items that matter most.
    expect(skill.prompt).toContain('## Review checklist');
    expect(skill.prompt).toMatch(/Missing required front-matter key/i);
    expect(skill.prompt).toMatch(/composable[\s\S]*does not resolve/i);
    // The forbidden body sections must be named explicitly in the checklist —
    // a vague "no layout content" wouldn't give the audit a hit-list.
    for (const heading of [
      '`## Layout`',
      '`## States`',
      '`## Flow`',
      '`## Steps`',
      '`## Walkthrough`',
    ]) {
      expect(skill.prompt).toContain(heading);
    }
  });

  it('agent-skills README points at the smithy.helper-screen-design skill instead of redefining the schema', () => {
    // The README intentionally does not duplicate the schema (so the two
    // cannot drift). It must, however, point at the skill so contributors
    // can find the source of truth.
    const readmePath = path.join(
      process.cwd(),
      'src',
      'templates',
      'agent-skills',
      'README.md',
    );
    const readme = fs.readFileSync(readmePath, 'utf8');
    expect(readme).toContain('## Screen Design-Context Annotations');
    expect(readme).toContain('smithy.helper-screen-design');
    expect(readme).toContain('skills/smithy.helper-screen-design/SKILL.prompt');
    // README must NOT carry the schema body itself anymore. Naming the
    // worked example by filename is fine ("a worked `Library.design.md`
    // example lives in the skill") — what must NOT appear is the example
    // body or screen-specific field semantics. These load-bearing strings
    // appear only in the SKILL; if a future edit copies them back into the
    // README, the guard fires.
    expect(readme).not.toContain('FAB rather than an');
    expect(readme).not.toContain('Empty state owns the screen');
    expect(readme).not.toContain('LibraryScreen.kt');
    expect(readme).not.toContain('owning Compose file');
    expect(readme).not.toContain('bundle wins on layout');
  });

  // Issue #406 (EPIC #404): smithy.helper-flow-definition is a body-only,
  // lazy-loaded operational skill that owns the authoring contract for the
  // durable Flow entity pair — `design/flows/<FlowId>.flow.md` (intent
  // annotation) + `maestro/flows/<FlowId>.yaml` (executable behavioral
  // body), keyed 1:1 by flat FlowId. The skill body is the single source
  // of truth for the YAML front-matter schema, the rationale-only body
  // rule, the Maestro selector contract, the testID naming convention,
  // and the worked AddTitle example, so downstream commands
  // (`smithy.forge` once #408 wires UI emission, `smithy.audit` /
  // `flow-lint` once #409 lands, and `flow-scaffold` once #410 lands)
  // Skill() it instead of composing a partial. These assertions back-stop
  // the deployment contract (body-only, frontmatter retained, auto-trigger
  // description) and every load-bearing piece of the schema so a
  // regression that drops a section, weakens the testID-only rule, or
  // relocates the artifact path fails the suite immediately.
  it('smithy.helper-flow-definition is body-only (no scripts) with frontmatter retained', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition');
    expect(skill).toBeDefined();
    expect(skill!.prompt).toMatch(/^---\s*\n/);
    expect(skill!.prompt).toContain('name: smithy.helper-flow-definition');
    expect(skill!.scripts.size).toBe(0);
  });

  it('smithy.helper-flow-definition description triggers on authoring and auditing flows', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition')!;
    // Auto-trigger description must name BOTH artifact paths (this is the
    // load-bearing claim — flows are a 1:1 pair, not a single file), the
    // two invocation modes (authoring + auditing), the wire-phase context,
    // and the three front-matter keys so calling agents recognize when to
    // lazy-load it.
    expect(skill.prompt).toContain('design/flows/<FlowId>.flow.md');
    expect(skill.prompt).toContain('maestro/flows/<FlowId>.yaml');
    expect(skill.prompt).toMatch(/authoring or auditing/i);
    expect(skill.prompt).toContain('kind: ui');
    expect(skill.prompt).toMatch(/phase:\s*wire/);
    // The three flow.md schema keys are the load-bearing key list of the
    // description.
    expect(skill.prompt).toMatch(/id\s*\/\s*screens\s*\/\s*maestro/);
  });

  it('smithy.helper-flow-definition body documents the three front-matter fields', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition')!;
    expect(skill.prompt).toContain('## YAML front-matter schema');
    for (const field of ['`id`', '`screens`', '`maestro`']) {
      expect(skill.prompt).toContain(field);
    }
    // Explicit YAML labeling — the front-matter is YAML between `---`
    // fences, not a Smithy-specific format. Guard against a future edit
    // that drops the YAML labeling and leaves only an implicit convention.
    expect(skill.prompt).toMatch(/YAML front-matter/);
    expect(skill.prompt).toMatch(/between `---`[\s\S]*fences/);
  });

  it('smithy.helper-flow-definition body documents the four rationale-only sections', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition')!;
    expect(skill.prompt).toContain('## Body shape');
    for (const section of [
      '## Intent',
      '## Guards',
      '## Entry / Exit',
      '## Coverage Caveat',
    ]) {
      expect(skill.prompt).toContain(section);
    }
  });

  it('smithy.helper-flow-definition enforces the no-step-descriptions rule', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition')!;
    // The whole point of the pair is that the `.flow.md` body is NOT a
    // parallel narration of the yaml — the yaml owns the steps, the
    // `.flow.md` owns intent. Guard against a future edit that softens
    // the rule.
    expect(skill.prompt).toMatch(/thin/i);
    expect(skill.prompt).toMatch(/intent/i);
    expect(skill.prompt).toMatch(/rationale only/i);
    // The forbidden-sections list keeps the rule operational rather than
    // aspirational — the review checklist must call them out by name.
    expect(skill.prompt).toMatch(
      /no `## Steps`, `## Walkthrough`, `## Flow`,?\s*or `## Path`/,
    );
  });

  it('smithy.helper-flow-definition pins the Maestro selector contract (testIDs, not visible text)', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition')!;
    // Issue #406's load-bearing rule: selectors keyed to testIDs /
    // accessibility IDs / semantic tags — never visible text or layout
    // position. The yaml side becomes useless if this rule softens.
    expect(skill.prompt).toMatch(/testID/);
    expect(skill.prompt).toMatch(/accessibility/i);
    expect(skill.prompt).toMatch(/never visible text/i);
    expect(skill.prompt).toMatch(/never[^\n]*layout position/i);
    // The "asserts traversal AND guards" rule — a flow that only walks
    // the happy path is a smoke test, not a durable flow.
    expect(skill.prompt).toMatch(/traversal/i);
    expect(skill.prompt).toMatch(/guard/i);
    expect(skill.prompt).toMatch(/cannot reach confirm[^\n]*valid URL/i);
  });

  it('smithy.helper-flow-definition documents the testID naming convention', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition')!;
    // Convention shape: kebab-case, `<scope>-<element>[-<modifier>]`,
    // never from visible text or layout position.
    expect(skill.prompt).toMatch(/kebab-case/i);
    expect(skill.prompt).toContain('<scope>-<element>');
    // The two testID examples cited verbatim in issue #406.
    expect(skill.prompt).toContain('library-fab');
    expect(skill.prompt).toContain('add-title-url-field');
  });

  it('smithy.helper-flow-definition ships the skeleton template and the AddTitle example', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition')!;
    expect(skill.prompt).toContain('## Skeleton template');
    expect(skill.prompt).toContain('## Worked example');
    // AddTitle example must be filled out (not a placeholder), with both
    // halves of the pair: front-matter for `.flow.md` and a testID-keyed
    // yaml exercising the URL guard.
    expect(skill.prompt).toContain('design/flows/AddTitle.flow.md');
    expect(skill.prompt).toContain('maestro/flows/AddTitle.yaml');
    expect(skill.prompt).toMatch(/id:\s*AddTitle/);
    expect(skill.prompt).toMatch(/screens:\s*\[Library,\s*AddTitle\]/);
    expect(skill.prompt).toMatch(/maestro:\s*maestro\/flows\/AddTitle\.yaml/);
    // The yaml side must include the URL-guard assertion the issue calls
    // out: confirm is not visible until URL is valid.
    expect(skill.prompt).toContain('add-title-url-field');
    expect(skill.prompt).toContain('add-title-confirm-button-enabled');
    expect(skill.prompt).toMatch(/assertNotVisible/);
  });

  it('smithy.helper-flow-definition documents the audio-service coverage caveat', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition')!;
    // Issue #406 coverage caveat: Maestro covers navigable bookends.
    // Audio-service behaviors (auto-advance under lock, foreground TTS)
    // need instrumentation-level tests. A green Maestro run must NOT
    // imply TTS coverage.
    expect(skill.prompt).toMatch(/navigable bookends/i);
    expect(skill.prompt).toMatch(/auto-advance/i);
    expect(skill.prompt).toMatch(/foreground TTS/i);
    expect(skill.prompt).toMatch(/instrumentation/i);
    expect(skill.prompt).toMatch(/must not be read as TTS coverage/i);
  });

  it('smithy.helper-flow-definition ships a review checklist for the audit/lint surfaces', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition')!;
    // The checklist is what makes the skill usable by smithy.audit (and
    // later flow-lint #409) — it converts the prose contract into a
    // line-by-line list of findings. Guard the items that matter most.
    expect(skill.prompt).toContain('## Review checklist');
    expect(skill.prompt).toMatch(/Missing required front-matter key/i);
    expect(skill.prompt).toMatch(/maestro[\s\S]*does not resolve/i);
    // The forbidden body sections must be named explicitly in the
    // checklist — a vague "no walkthrough content" wouldn't give the
    // audit a hit-list.
    for (const heading of [
      '`## Steps`',
      '`## Walkthrough`',
      '`## Flow`',
      '`## Path`',
    ]) {
      expect(skill.prompt).toContain(heading);
    }
    // Selector-quality checks: visible text and layout-index selectors
    // are the failure modes the yaml side guards against.
    expect(skill.prompt).toMatch(/text:[^\n]*selector|visible-text matcher/i);
    expect(skill.prompt).toMatch(/layout[- ]index/i);
  });

  it('agent-skills README points at the smithy.helper-flow-definition skill instead of redefining the schema', () => {
    // The README intentionally does not duplicate the schema (so the two
    // cannot drift). It must, however, point at the skill so contributors
    // can find the source of truth.
    const readmePath = path.join(
      process.cwd(),
      'src',
      'templates',
      'agent-skills',
      'README.md',
    );
    const readme = fs.readFileSync(readmePath, 'utf8');
    expect(readme).toContain('## Flow Definitions');
    expect(readme).toContain('smithy.helper-flow-definition');
    expect(readme).toContain(
      'skills/smithy.helper-flow-definition/SKILL.prompt',
    );
    // README must NOT carry the schema body itself anymore. Naming the
    // worked example by filename is fine ("a worked `AddTitle` example
    // lives in the skill") — what must NOT appear is the example body,
    // the AddTitle yaml selectors, or the testID convention table.
    // These load-bearing strings appear only in the SKILL; if a future
    // edit copies them back into the README, the guard fires.
    expect(readme).not.toContain('add-title-url-field');
    expect(readme).not.toContain('add-title-confirm-button-enabled');
    expect(readme).not.toContain('library-row-<title-slug>');
    expect(readme).not.toContain('assertNotVisible');
    expect(readme).not.toContain('appId: com.storyspider.app');
  });

  it('categorizes templates correctly', () => {
    expect(composed.commands.has('smithy.strike.md')).toBe(true);
    expect(composed.commands.has('smithy.audit.md')).toBe(true);
    expect(composed.commands.has('smithy.status.md')).toBe(false);
    expect(composed.skills.has('smithy.status')).toBe(true);
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

  // smithy.status is deployed as a Claude Code skill (auto-activated on
  // natural-language status questions and explicitly invocable via
  // `/smithy.status` with CLI flags). The skill operates in two modes:
  // pass-through (shells out to `smithy status` with the user's flags
  // unchanged) and question (runs `smithy status --format json` and answers
  // the question from the parsed JSON). These assertions back-stop both
  // halves of the contract so a future regression that drops the shell-out
  // instruction, the argument forwarding token, the JSON question-mode
  // invocation, or the verbatim-error wording fails the suite.
  it('status skill shells out to `smithy status` and forwards $ARGUMENTS', () => {
    const status = composed.skills.get('smithy.status')!.prompt;
    expect(status).toBeDefined();
    // AS 5.1 (shell-out to the CLI subcommand) and AS 5.3 (forward the
    // user's arguments unchanged). AS 5.2 (no-args default to cwd) is
    // implicit in unchanged $ARGUMENTS forwarding — the skill never
    // synthesizes a default path. Match on the combined `smithy status
    // $ARGUMENTS` substring rather than the two tokens independently, so a
    // regression that drops the argument-forwarding token from the bash
    // command — but keeps `$ARGUMENTS` in the surrounding prose — still
    // fails the suite.
    expect(status).toContain('smithy status $ARGUMENTS');
  });

  it('status skill answers natural-language questions via --format json', () => {
    const status = composed.skills.get('smithy.status')!.prompt;
    expect(status).toBeDefined();
    // Question mode (auto-activation surface): the skill must instruct the
    // agent to consult the deterministic CLI in JSON form rather than
    // reconstructing answers from training data or unrelated file reads.
    // Anchor on `smithy status --format json` so a regression that removes
    // the JSON branch entirely — collapsing the skill back to a pure
    // verbatim wrapper — fails the suite.
    expect(status).toContain('smithy status --format json');
  });

  it('status skill surfaces CLI failures verbatim in the Errors section', () => {
    const status = composed.skills.get('smithy.status')!.prompt;
    expect(status).toBeDefined();
    // AS 5.4: the skill must surface CLI failures verbatim rather than
    // paraphrase them or reconstruct the status view from first principles.
    // Anchor on (a) the Errors heading and (b) the contract-specific phrase
    // `stderr verbatim`, which appears only inside the Errors section's
    // non-zero-exit bullet and mirrors the contracts §2 obligation. The
    // word `verbatim` alone appears in the description, output, and rules
    // prose, so it would not prove the Errors section enforces verbatim
    // surfacing.
    expect(status).toContain('## Errors');
    expect(status).toContain('stderr verbatim');
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

  // Story 3 Slice 3: mark and cut must render the shared one-shot output
  // snippet as their terminal contract, reference the forge `gh pr create`
  // pattern after artifact write-out, and carry no STOP-gate language from
  // the removed intermediate approval stops.

  it('mark template resolves the one-shot-output partial', () => {
    const mark = composed.commands.get('smithy.mark.md')!;
    expect(mark).toBeDefined();
    // Unresolved partial references must not leak through composition.
    expect(mark).not.toContain('{{>one-shot-output}}');
    // The snippet's H2 title is unique — if present, the partial resolved.
    expect(mark).toContain('## One-Shot Output');
  });

  it('mark template contains all four one-shot output section headers', () => {
    const mark = composed.commands.get('smithy.mark.md')!;
    expect(mark).toContain('## Summary');
    expect(mark).toContain('## Assumptions');
    expect(mark).toContain('## Specification Debt');
    expect(mark).toContain('## PR');
  });

  it('mark template references PR creation after artifact write in Phase 6', () => {
    const mark = composed.commands.get('smithy.mark.md')!;
    expect(mark).toContain('gh pr create');
    // Scope to Phase 6 so we measure the write → PR ordering inside the
    // Write & PR phase, not across the file (Phase 0c also references
    // `gh pr create` for the refinement-diff PR path).
    const phase6Idx = mark.indexOf('## Phase 6:');
    expect(phase6Idx).toBeGreaterThan(-1);
    const phase6 =
      mark.slice(phase6Idx, mark.indexOf('## Phase 0:', phase6Idx));
    const writeIdx = phase6.indexOf('Create the spec folder and write');
    const prIdx = phase6.indexOf('gh pr create');
    expect(writeIdx).toBeGreaterThan(-1);
    expect(prIdx).toBeGreaterThan(writeIdx);
  });

  it('mark template contains no intermediate STOP-gate language', () => {
    const mark = composed.commands.get('smithy.mark.md')!;
    // Intermediate approval STOPs must be gone. The Phase 2 clarify bail-out
    // path (`Stop and wait for the user to provide expanded information`)
    // is intentional and preserved from Story 2 — it only runs when clarify
    // returns `bail_out: true` and the pipeline short-circuits before any
    // files are written.
    expect(mark).not.toMatch(/STOP and ask/i);
    expect(mark).not.toMatch(/STOP after/i);
  });

  it('cut template resolves the one-shot-output partial', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    expect(cut).toBeDefined();
    expect(cut).not.toContain('{{>one-shot-output}}');
    expect(cut).toContain('## One-Shot Output');
  });

  it('cut template contains all four one-shot output section headers', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    expect(cut).toContain('## Summary');
    expect(cut).toContain('## Assumptions');
    expect(cut).toContain('## Specification Debt');
    expect(cut).toContain('## PR');
  });

  it('cut template references PR creation after artifact write in Phase 5', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    expect(cut).toContain('gh pr create');
    // Scope to Phase 5 so we measure the write → PR ordering inside the
    // Write & PR phase, not across the file (Phase 0c is earlier in the
    // file and also references `gh pr create` for the refinement-diff PR
    // path).
    const phase5Idx = cut.indexOf('## Phase 5:');
    expect(phase5Idx).toBeGreaterThan(-1);
    const phase5 = cut.slice(phase5Idx);
    const writeIdx = phase5.indexOf(
      'Write the file to `specs/<folder>/<NN>-<story-slug>.tasks.md`',
    );
    const prIdx = phase5.indexOf('gh pr create');
    expect(writeIdx).toBeGreaterThan(-1);
    expect(prIdx).toBeGreaterThan(writeIdx);
  });

  it('cut template contains no intermediate STOP-gate language', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    // Intermediate approval STOPs must be gone. The Phase 3 clarify bail-out
    // path (`Stop and wait for the user to provide expanded information`)
    // is intentional and preserved from Story 2 — it only runs when clarify
    // returns `bail_out: true` and the pipeline short-circuits before the
    // tasks file is written.
    expect(cut).not.toMatch(/STOP and ask/i);
    expect(cut).not.toMatch(/STOP after/i);
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

  // Story 3 Slice 4: strike runs one-shot — no Phase 3 Refine iteration,
  // no Phase 5 STOP gate, creates a PR after writing the strike document,
  // and renders the shared one-shot output snippet as the terminal contract.
  it('strike template has no Phase 3 Refine heading', () => {
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    // The old Phase 3 was "## Phase 3: Refine" — Slice 4 removed it. The
    // renumbered Phase 3 is now "Strike Document". Assert the Refine
    // heading is gone and that the stale "keep iterating until the user
    // gives explicit approval" language is gone with it.
    expect(strike).not.toMatch(/##\s+Phase\s+3:\s*Refine/i);
    expect(strike).not.toMatch(/Keep iterating until the user gives explicit approval/i);
  });

  it('strike template contains no STOP-gate language', () => {
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    // The old Phase 5 STOP ("Ready to forge, or want to refine the plan?")
    // is replaced with non-interactive PR creation.
    expect(strike).not.toMatch(/STOP and ask/i);
    expect(strike).not.toMatch(/STOP and wait/i);
    expect(strike).not.toMatch(/Ready to forge, or want to refine the plan\?/i);
  });

  it('strike template references PR creation after artifact write', () => {
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    expect(strike).toMatch(/gh pr create/i);
    // PR creation must come after the Strike Document phase so the
    // artifact is on disk before the PR is opened.
    const strikeDocIdx = strike.indexOf('## Phase 3: Strike Document');
    const prIdx = strike.search(/gh pr create/i);
    expect(strikeDocIdx).toBeGreaterThan(-1);
    expect(prIdx).toBeGreaterThan(strikeDocIdx);
  });

  // Issue #385: PR descriptions are too verbose. The forge PR body must
  // carry exactly four scannable sections — Source / Slice Summary /
  // Addresses / Validation — in both .tasks.md and .strike.md modes.
  // The dropped sections (Tasks completed / Review / Documentation) all
  // duplicate information that lives in the commits, the artifact's
  // ## Specification Debt table, or the maid commits, so reviewers can
  // navigate to it from the Source link.
  it('forge PR body has lean four sections in .tasks.md mode (issue #385)', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toBeDefined();

    // Scope assertions to the .tasks.md PR-body block so we measure the
    // contract, not stray mentions elsewhere in the prompt.
    const blockStart = forge.indexOf('### `.tasks.md` mode — PR body:');
    expect(blockStart).toBeGreaterThan(-1);
    const blockEnd = forge.indexOf('### `.strike.md` mode — PR body:', blockStart);
    expect(blockEnd).toBeGreaterThan(blockStart);
    const block = forge.slice(blockStart, blockEnd);

    // The four kept sections.
    expect(block).toContain('**Source**');
    expect(block).toContain('**Slice Summary**');
    expect(block).toContain('**Addresses**');
    expect(block).toContain('**Validation**');

    // The three dropped sections — must not appear as PR-body bullets.
    expect(block).not.toMatch(/\*\*Tasks completed\*\*/);
    expect(block).not.toMatch(/\*\*Review\*\*/);
    expect(block).not.toMatch(/\*\*Documentation\*\*/);
  });

  it('forge PR body has lean four sections in .strike.md mode (issue #385)', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toBeDefined();

    const blockStart = forge.indexOf('### `.strike.md` mode — PR body:');
    expect(blockStart).toBeGreaterThan(-1);
    // The .strike.md mode block runs until the next `---` separator.
    const blockEnd = forge.indexOf('\n---', blockStart);
    expect(blockEnd).toBeGreaterThan(blockStart);
    const block = forge.slice(blockStart, blockEnd);

    expect(block).toContain('**Source**');
    expect(block).toContain('**Slice Summary**');
    expect(block).toContain('**Addresses**');
    expect(block).toContain('**Validation**');

    expect(block).not.toMatch(/\*\*Tasks completed\*\*/);
    expect(block).not.toMatch(/\*\*Review\*\*/);
    expect(block).not.toMatch(/\*\*Documentation\*\*/);
  });

  it('forge no longer routes review or maid findings into the PR body (issue #385)', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toBeDefined();

    // The legacy triage rows said "note the fix in the PR body" / "Flag in
    // the PR body" / "Note in the PR body only". With the Review section
    // gone from the PR body, those routes dangle and have been replaced by
    // terminal-output-deliverable language.
    expect(forge).not.toMatch(/note the fix in the PR body/i);
    expect(forge).not.toMatch(/flag it in the PR body/i);
    expect(forge).not.toMatch(/Note in the PR body only/i);

    // The maid "Documentation Notes" PR-body section is gone.
    expect(forge).not.toContain('Documentation Notes');

    // The "No review findings" PR-body insertion is gone too.
    expect(forge).not.toMatch(/include\s+"No review findings"\s+in the PR body/i);
  });

  it('strike PR body is Source + Slice Summary only — does not embed one-shot-output sections (issue #385)', () => {
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();

    // Scope to the "Create the PR" step in Phase 5 so we measure the PR-body
    // contract, not stray section markers elsewhere (the {{>one-shot-output}}
    // partial below still renders the same headers as the terminal output).
    const stepStart = strike.indexOf('**Create the PR**');
    expect(stepStart).toBeGreaterThan(-1);
    const stepEnd = strike.indexOf('**Capture the PR URL**', stepStart);
    expect(stepEnd).toBeGreaterThan(stepStart);
    const step = strike.slice(stepStart, stepEnd);

    // The two kept sections.
    expect(step).toContain('**Source**');
    expect(step).toContain('**Slice Summary**');

    // The dropped embedding rule must be gone — the old text instructed the
    // agent to populate `## Summary`, `## Assumptions`, and `## Specification
    // Debt` sections in the PR body. Those headers belong in the
    // terminal-output one-shot block, not the PR body.
    expect(step).not.toMatch(/Populate the other sections/i);
    expect(step).not.toMatch(/one-shot output content produced below/i);
    expect(step).not.toMatch(/\*\*excluding the `## PR` section\*\*/i);
  });

  it('strike review triage no longer routes findings into the PR body (issue #385)', () => {
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();

    expect(strike).not.toMatch(/Note the fix in the PR body/i);
    expect(strike).not.toMatch(/Flag in PR for the reviewer/i);
    expect(strike).not.toMatch(/Note in the PR body only/i);
    expect(strike).not.toMatch(/surface them prominently in the PR body/i);
  });

  it('strike template includes all four one-shot output headers', () => {
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    // These headers come from the {{>one-shot-output}} partial. ## Summary
    // and ## Specification Debt also appear in the strike document
    // markdown template, but ## Assumptions and ## PR are unique to the
    // snippet, so their presence proves the partial composed in.
    expect(strike).toContain('## Summary');
    expect(strike).toContain('## Assumptions');
    expect(strike).toContain('## Specification Debt');
    expect(strike).toContain('## PR');
    // Partials must be resolved — no leftover Handlebars syntax.
    expect(strike).not.toContain('{{>one-shot-output}}');
  });

  it('ignite RFC template contains ## Specification Debt between ## Decisions and ## Milestones (no Open Questions section)', () => {
    const ignite = composed.commands.get('smithy.ignite.md')!;
    expect(ignite).toBeDefined();

    // The RFC template code fence must be the one containing the full structure.
    // In agent mode, there's a smaller header-only block earlier; find the big one.
    const markdownBlocks = [...ignite.matchAll(/```markdown\r?\n([\s\S]*?)\r?\n```/g)];
    const markdownBlockMatch = markdownBlocks.find(m => m[1]!.includes('## Specification Debt'));
    expect(markdownBlockMatch).toBeDefined();

    const markdownBlock = markdownBlockMatch![1]!;
    const decisionsIdx = markdownBlock.indexOf('\n## Decisions\n');
    const debtIdx = markdownBlock.indexOf('\n## Specification Debt\n');
    const milestonesIdx = markdownBlock.indexOf('\n## Milestones\n');

    expect(decisionsIdx).toBeGreaterThan(-1);
    expect(debtIdx).toBeGreaterThan(-1);
    expect(milestonesIdx).toBeGreaterThan(-1);

    expect(debtIdx).toBeGreaterThan(decisionsIdx);
    expect(debtIdx).toBeLessThan(milestonesIdx);

    // Issue #367: the RFC template MUST NOT have a `## Open Questions`
    // section heading. Unresolved uncertainty belongs in Specification Debt.
    expect(markdownBlock).not.toContain('\n## Open Questions\n');
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

  it('strike template has all partial references resolved', () => {
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    expect(strike.length).toBeGreaterThan(0);
    expect(strike).not.toContain('{{>');
  });

  // Issue #422: every `##` heading inside the artifact code-fence template
  // of each artifact-producing command must carry an `<!-- audience: ... -->`
  // comment immediately below it. The tag grammar lives in
  // `smithy.helper-voice` (#420) and the convention is documented in
  // `src/templates/agent-skills/README.md`. These assertions back-stop the
  // contract so a regression that drops a tag or breaks the grammar is
  // caught at test time rather than at audit time.

  // Helper: extract a specific ```markdown ... ``` fence from a composed
  // command template by an anchor substring that uniquely identifies the
  // canonical artifact-template fence (e.g., `# Strike: <Title>`). The
  // anchor is the artifact's H1 (e.g., `# Feature Map: <Milestone Title>`),
  // which only appears inside the template fence — not in surrounding
  // prose, where prompts use code-quoted forms like
  // `` `## Problem Statement` `` instead.
  //
  // The implementation follows CommonMark fence matching: an opener uses
  // **N backticks** (3 or more) followed by `markdown`, and is closed only
  // by a line of **at least N backticks** with no other content. This
  // handles fences that wrap content already containing 3-backtick
  // yaml/bash blocks — e.g., render's artifact template uses a 4-backtick
  // wrapper because it now embeds 3-backtick `\`\`\`yaml metadata blocks
  // from the `feature-kinds` snippet. A flat 3-backtick toggle would
  // mistake those inner blocks for the outer fence's closer.
  function extractFenceByAnchor(template: string, anchor: string): string {
    const lines = template.split('\n');
    const fences: string[] = [];
    let openerCount = 0; // 0 == not in fence; >0 == number of opening backticks
    let fenceLines: string[] = [];
    const fenceOpenerRe = /^(`{3,})markdown\b/;
    const bareFenceRe = /^(`{3,})\s*$/;
    for (const line of lines) {
      const trimmed = line.trimStart();
      if (openerCount === 0) {
        const openMatch = trimmed.match(fenceOpenerRe);
        if (openMatch) {
          openerCount = openMatch[1]!.length;
          fenceLines = [];
        }
        continue;
      }
      const closeMatch = trimmed.match(bareFenceRe);
      if (closeMatch && closeMatch[1]!.length >= openerCount) {
        fences.push(fenceLines.join('\n'));
        openerCount = 0;
        continue;
      }
      fenceLines.push(line);
    }
    const match = fences.find(b => b.includes(anchor));
    if (!match) {
      // Surface a diagnostic the next reader (or CI) can act on rather than
      // hiding behind a bare assertion failure.
      const firstLines = fences.map((b, i) =>
        `  [${i}] (${b.length} chars) first line: ${b.split('\n')[0]?.slice(0, 80) ?? '(empty)'}`,
      ).join('\n');
      const containsAnchorAtAll = template.includes(anchor);
      const fenceLineDump = lines
        .map((l, i) => [i, l] as const)
        .filter(([, l]) => l.trimStart().startsWith('```'))
        .map(([i, l]) => `  line ${i}: ${JSON.stringify(l)}`)
        .join('\n');
      throw new Error(
        `no markdown fence contains anchor "${anchor}"\n` +
        `  template.includes(anchor) = ${containsAnchorAtAll}\n` +
        `  template length = ${template.length}\n` +
        `  fences found: ${fences.length}\n${firstLines}\n` +
        `  all \`\`\` lines:\n${fenceLineDump}`,
      );
    }
    return match;
  }

  // Helper: return the list of `## Heading` titles inside a markdown fence
  // string. We ignore `###` and deeper because the voice tag convention
  // attaches to top-level `##` sections only.
  function h2Headings(fence: string): string[] {
    const matches = [...fence.matchAll(/^## ([^\n]+)$/gm)];
    return matches.map(m => m[1]!.trim());
  }

  // Helper: assert that each `## Heading` inside a fence is immediately
  // followed (after at most a blank line) by an audience-tag HTML comment
  // matching the full issue #422 / #420 grammar. The regex enforces that
  // every directive key documented by `smithy.helper-voice` is present and
  // in canonical order: `audience` (enum) → `mode` (enum) → `length`
  // (free text) → `diagram` (enum) → `examples` (enum), with the optional
  // `applicability` clause trailing. Values for `length` are free-form so
  // section authors can write `2-3 sentences`, `tables only`,
  // `5-15 steps`, `bullets or table`, etc., per the skill's grammar.
  function expectAudienceTagPerH2(fence: string, label: string) {
    const audienceTagRe = new RegExp(
      String.raw`^## ([^\n]+)\n(?:\n)?<!--\s*` +
        // audience: stakeholder|reviewer|builder, optional +ai-input
        String.raw`audience:\s*(?:stakeholder|reviewer|builder)(?:\+ai-input)?\s*;\s*` +
        // mode: explanation|reference|how-to|tutorial
        String.raw`mode:\s*(?:explanation|reference|how-to|tutorial)\s*;\s*` +
        // length: free-form value (everything up to the next ;)
        String.raw`length:\s*[^;]+;\s*` +
        // diagram: required|recommended|optional
        String.raw`diagram:\s*(?:required|recommended|optional)\s*;\s*` +
        // examples: required|recommended|discouraged|forbidden|optional
        // (`optional` is used by sections like Spec Acceptance Scenarios
        // per the issue #422 directive mapping, beyond the four values
        // listed in the helper-voice grammar table)
        String.raw`examples:\s*(?:required|recommended|discouraged|forbidden|optional)\s*` +
        // optional trailing applicability clause
        String.raw`(?:;\s*applicability:\s*[^>]+)?\s*-->`,
      'gm',
    );
    const headingsWithTag = [...fence.matchAll(audienceTagRe)];
    const tagged = new Set(headingsWithTag.map(m => m[1]!.trim()));
    const all = h2Headings(fence);
    const missing = all.filter(h => !tagged.has(h));
    expect(missing, `${label}: ## headings missing well-formed audience tag: ${missing.join(', ')}`).toEqual([]);
  }

  it('strike artifact template tags every ## section with an audience comment (issue #422)', () => {
    const strike = composed.commands.get('smithy.strike.md')!;
    const fence = extractFenceByAnchor(strike, '# Strike: <Title>');
    expectAudienceTagPerH2(fence, 'smithy.strike');
    // Spot-check section→role mapping called out in the issue.
    expect(fence).toMatch(/## Summary\n+<!-- audience: stakeholder; mode: explanation;/);
    expect(fence).toMatch(/## Data Model\n+<!-- audience: builder; mode: reference;[^>]*applicability: code-shaped features only/);
    expect(fence).toMatch(/## Contracts\n+<!-- audience: builder; mode: reference;[^>]*applicability: code-shaped features only/);
    // Issue #422: tasks slice bodies use examples: forbidden.
    expect(fence).toMatch(/## Single Slice\n+<!-- audience: builder; mode: how-to;[^>]*examples: forbidden/);
  });

  it('spark PRD template tags every ## section with an audience comment (issue #422)', () => {
    const spark = composed.commands.get('smithy.spark.md')!;
    // Anchor on the PRD template reference fence — not the header-only
    // fence used by the Phase 3 PRD File Creation step.
    const fence = extractFenceByAnchor(spark, '## Problem Statement');
    expectAudienceTagPerH2(fence, 'smithy.spark');
    expect(fence).toMatch(/## Problem Statement\n+<!-- audience: stakeholder; mode: explanation;/);
    expect(fence).toMatch(/## Alternatives \/ Build-vs-Buy\n+<!-- audience: reviewer; mode: explanation;[^>]*examples: recommended/);
  });

  it('ignite RFC template tags every ## section with an audience comment (issue #422)', () => {
    const ignite = composed.commands.get('smithy.ignite.md')!;
    const fence = extractFenceByAnchor(ignite, '## Motivation / Problem Statement');
    expectAudienceTagPerH2(fence, 'smithy.ignite');
    // Issue #422 mapping: RFC Proposal → diagram: recommended; examples: recommended.
    expect(fence).toMatch(/## Proposal\n+<!-- audience: reviewer; mode: explanation;[^>]*diagram: recommended;[^>]*examples: recommended/);
    // Dependency Order is the LLM-consumed graph table.
    expect(fence).toMatch(/## Dependency Order\n+<!-- audience: builder\+ai-input; mode: reference;/);
  });

  it('render feature-map template tags every ## section with an audience comment (issue #422)', () => {
    const render = composed.commands.get('smithy.render.md')!;
    const fence = extractFenceByAnchor(render, '# Feature Map: <Milestone Title>');
    expectAudienceTagPerH2(fence, 'smithy.render');
    // Issue #422 mapping: Cross-Milestone Deps → diagram: recommended.
    expect(fence).toMatch(/## Cross-Milestone Dependencies\n+<!-- audience: reviewer; mode: reference;[^>]*diagram: recommended/);
  });

  it('mark spec template tags every ## section with an audience comment (issue #422)', () => {
    const mark = composed.commands.get('smithy.mark.md')!;
    const fence = extractFenceByAnchor(mark, '# Feature Specification: <Title>');
    expectAudienceTagPerH2(fence, 'smithy.mark spec');
    // Issue #422 mapping: Spec Acceptance Scenarios → examples: optional.
    expect(fence).toMatch(/## User Scenarios & Testing[^\n]*\n+<!-- audience: builder\+ai-input; mode: reference;[^>]*examples: optional/);
    expect(fence).toMatch(/## Requirements[^\n]*\n+<!-- audience: builder\+ai-input; mode: reference;[^>]*examples: recommended/);
  });

  it('mark data-model template is Reference-voice with applicability and N/A fallback (issue #422)', () => {
    const mark = composed.commands.get('smithy.mark.md')!;
    // Scope to Phase 4 so we are measuring the data-model template fences,
    // not the spec fence.
    const phase4Idx = mark.indexOf('## Phase 4: Model');
    expect(phase4Idx).toBeGreaterThan(-1);
    const phase5Idx = mark.indexOf('## Phase 5: Contract', phase4Idx);
    expect(phase5Idx).toBeGreaterThan(phase4Idx);
    const phase4 = mark.slice(phase4Idx, phase5Idx);

    // Applicability directive applied at the file top of the rendered
    // data-model.md template.
    expect(phase4).toMatch(/# Data Model: <Title>\n<!-- applicability: code-shaped features only -->/);
    // Section-level voice tags applied to every ## section, all carrying
    // the same applicability constraint.
    expect(phase4).toMatch(/## Entities\n<!-- audience: builder; mode: reference;[^>]*applicability: code-shaped features only/);
    expect(phase4).toMatch(/## Relationships\n<!-- audience: builder; mode: reference;[^>]*applicability: code-shaped features only/);
    expect(phase4).toMatch(/## State Transitions\n<!-- audience: builder; mode: reference;[^>]*applicability: code-shaped features only/);
    expect(phase4).toMatch(/## Identity & Uniqueness\n<!-- audience: builder; mode: reference;[^>]*applicability: code-shaped features only/);
    // Issue #422 directive mapping for Data Model Entities.
    expect(phase4).toMatch(/## Entities\n<!-- audience: builder; mode: reference;[^>]*diagram: required;[^>]*examples: recommended/);
    // N/A fallback documented in the template itself, not just in prose.
    expect(phase4).toMatch(/N\/A — <one-sentence reason this feature has no code-shaped data changes/);
    // The dense-prose `## Overview` heading that emitted Explanation prose
    // is gone.
    expect(phase4).not.toMatch(/```markdown[\s\S]*?## Overview[\s\S]*?```/);
    // Non-overlap with .contracts.md is stated in the prompt text itself so
    // the drafting agent has the rule visible without consulting the skill.
    expect(phase4).toMatch(/entities,\s*schema,\s*validation,\s*lifecycle,\s*and state transitions/i);
  });

  it('mark contracts template is Reference-voice with applicability and N/A fallback (issue #422)', () => {
    const mark = composed.commands.get('smithy.mark.md')!;
    // Scope to Phase 5 — Phase 0/Phase 6/Phase 0c also touch contracts in
    // prose, but we are measuring the contracts.md template fences here.
    const phase5Idx = mark.indexOf('## Phase 5: Contract');
    expect(phase5Idx).toBeGreaterThan(-1);
    const phase6Idx = mark.indexOf('## Phase 6:', phase5Idx);
    expect(phase6Idx).toBeGreaterThan(phase5Idx);
    const phase5 = mark.slice(phase5Idx, phase6Idx);

    expect(phase5).toMatch(/# Contracts: <Title>\n<!-- applicability: code-shaped features only -->/);
    // Issue #422 directive mapping for Contracts Interfaces.
    expect(phase5).toMatch(/## Interfaces\n<!-- audience: builder; mode: reference;[^>]*examples: required;[^>]*applicability: code-shaped features only/);
    expect(phase5).toMatch(/## Events \/ Hooks\n<!-- audience: builder; mode: reference;[^>]*examples: required;[^>]*applicability: code-shaped features only/);
    expect(phase5).toMatch(/## Integration Boundaries\n<!-- audience: builder; mode: reference;[^>]*examples: required;[^>]*applicability: code-shaped features only/);
    // N/A fallback documented in the template itself.
    expect(phase5).toMatch(/N\/A — <one-sentence reason this feature has no code-shaped interface changes/);
    // The dense-prose `## Overview` heading that emitted Explanation prose
    // is gone.
    expect(phase5).not.toMatch(/```markdown[\s\S]*?## Overview[\s\S]*?```/);
    // Non-overlap with .data-model.md is stated in the prompt text itself.
    expect(phase5).toMatch(/interfaces,\s*signatures,\s*integration boundaries,\s*and event\/hook surfaces/i);
  });

  it('cut tasks template tags every ## section and forbids examples in slice bodies (issue #422)', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    const fence = extractFenceByAnchor(cut, '# Tasks: <User Story Title>');
    expectAudienceTagPerH2(fence, 'smithy.cut');
    // Issue #422 mapping: Tasks slice bodies → examples: forbidden.
    // Slice 1 and Slice 2 must both carry the forbidden directive.
    const sliceTags = [...fence.matchAll(/## Slice \d+: [^\n]+\n<!-- ([^\n]+) -->/g)].map(m => m[1]!);
    expect(sliceTags.length).toBeGreaterThanOrEqual(2);
    for (const tag of sliceTags) {
      expect(tag).toMatch(/audience: builder/);
      expect(tag).toMatch(/mode: how-to/);
      expect(tag).toMatch(/examples: forbidden/);
    }
    // Issue #422 mapping: Tasks Dependency Order → diagram: recommended.
    expect(fence).toMatch(/## Dependency Order\n<!-- audience: builder\+ai-input; mode: reference;[^>]*diagram: recommended/);
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

  it('implementation-review agent retains frontmatter with read-only tools', () => {
    const review = composed.agents.get('smithy.implementation-review.md')!;
    expect(review).toBeDefined();
    expect(review).toMatch(/^---\s*\n/);
    expect(review).toContain('name: smithy-implementation-review');
    expect(review).toMatch(/tools:\s*\n\s+-\s+Read/);
    expect(review).toMatch(/^\s+-\s+Grep$/m);
    expect(review).toMatch(/^\s+-\s+Glob$/m);
    expect(review).not.toContain('Edit');
    expect(review).not.toContain('Write');
    expect(review).not.toContain('Bash');
    // The composed body must pull in the shared review-protocol snippet
    // from Slice 1 so both review agents share one source of truth.
    expect(review).toContain('## Review Protocol');
    expect(review).toContain('`proposed_fix`');
  });

  it('forge default renders inline TDD and review protocols', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toBeDefined();
    expect(forge).toContain('TDD Protocol');
    expect(forge).toContain('Review Protocol');
    // Use a word-boundary check so the assertion catches the standalone
    // sub-agent name `smithy-implement` (which only the claude variant
    // dispatches) without false-positive-matching `smithy-implementation-review`
    // referenced by the shared review-protocol snippet.
    expect(forge).not.toMatch(/\bsmithy-implement\b/);
    expect(forge).not.toContain('{{');
  });

  // Issue #380: merged PRs were landing with unchecked `- [ ]` rows in the
  // target slice, wedging the downstream dispatch loop. Forge owns the
  // checkbox-flip gate, so the composed prompt must contain a hard pre-PR
  // re-read of the target slice that STOPs if any task is still unchecked.
  it('forge prompt enforces a pre-PR slice-completion checkbox gate', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toBeDefined();
    expect(forge).toContain('Slice Completion Check');
    expect(forge).toContain('Forge owns the checkbox flip');
    expect(forge).toContain('STOP gate');
    expect(forge).toContain('wedges the downstream dispatch loop');
    expect(forge).toContain('Unchecked tasks at PR time');
  });

  // Issue #380: the implementation commit must include the `- [ ]` → `- [x]`
  // flip in the same commit as the code change, and the smithy-implement
  // sub-agent must not report `success` if the checkbox is still unchecked.
  it('smithy-implement sub-agent output contract requires checkbox flip with success', () => {
    const implement = claudeComposed.agents.get('smithy.implement.md')!;
    expect(implement).toBeDefined();
    expect(implement).toContain('flips this task\'s checkbox per TDD protocol step 5');
    expect(implement).toContain('never return `success` with the checkbox still');
  });

  // Issue #380: the shared TDD protocol snippet — used by both the
  // sub-agent and the no-agent forge variants — must flag the checkbox
  // flip as a mandatory part of the implementation commit (not a follow-up
  // commit and not optional bookkeeping).
  it('TDD protocol snippet flags the checkbox flip as mandatory in the implementation commit', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toBeDefined();
    // The snippet is inlined into the no-agent forge variant.
    expect(forge).toContain('Include this edit in the implementation commit');
    expect(forge).toContain('mandatory');
  });

  it('forge with claude variant renders sub-agent dispatch', async () => {
    const claudeComposed = await getComposedTemplates('claude');
    const forge = claudeComposed.commands.get('smithy.forge.md')!;
    expect(forge).toBeDefined();
    expect(forge).toContain('smithy-implement');
    // Story 4 Slice 3: the rename from `smithy-review` to
    // `smithy-implementation-review` must be visible in the forge agent-mode
    // branch — otherwise forge would still dispatch an agent that no longer
    // exists.
    expect(forge).toContain('smithy-implementation-review');
    expect(forge).not.toMatch(/\bsmithy-review\b/);
    // Forge must retain the triage rule that turns Low-confidence Important
    // findings into specification debt (per the contracts table), since
    // forge — not the review agent — owns that on-disk action now.
    expect(forge).toContain('Specification Debt');
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

  // Story 4 Slice 2: smithy-plan-review is a new read-only sub-agent that
  // composes the shared review-protocol snippet (Slice 1) and returns a
  // structured ReviewResult. These assertions lock down the frontmatter
  // contract (name, read-only tool list) and verify the composed body
  // actually inlines the shared Finding structure so both review agents
  // stay aligned on the return shape.
  it('plan-review agent retains frontmatter with read-only tools', () => {
    const planReview = composed.agents.get('smithy.plan-review.md')!;
    expect(planReview).toBeDefined();
    expect(planReview).toMatch(/^---\s*\n/);
    expect(planReview).toContain('name: smithy-plan-review');
    expect(planReview).toMatch(/tools:\s*\n\s+-\s+Read/);
    expect(planReview).toMatch(/^\s+-\s+Grep$/m);
    expect(planReview).toMatch(/^\s+-\s+Glob$/m);
    expect(planReview).not.toContain('Edit');
    expect(planReview).not.toContain('Write');
    expect(planReview).not.toContain('Bash');
  });

  it('plan-review agent composes the shared review-protocol snippet', () => {
    const planReview = composed.agents.get('smithy.plan-review.md')!;
    expect(planReview).toBeDefined();
    // Shared review-protocol section header must appear so both review
    // agents inherit the same findings contract.
    expect(planReview).toContain('## Review Protocol');
    // Finding-structure fields from the contracts must be present via the
    // composed snippet — dropping the partial would drop these fields.
    expect(planReview).toContain('`category`');
    expect(planReview).toContain('`severity`');
    expect(planReview).toContain('`confidence`');
    expect(planReview).toContain('`description`');
    expect(planReview).toContain('`artifact_path`');
    expect(planReview).toContain('`proposed_fix`');
    // Partial must have been resolved at compose time — no leftover
    // Handlebars expression.
    expect(planReview).not.toContain('{{>review-protocol}}');
    expect(planReview).not.toContain('{{');
  });

  it('plan-review agent documents its five categories and ReviewResult shape', () => {
    const planReview = composed.agents.get('smithy.plan-review.md')!;
    expect(planReview).toBeDefined();
    // Each contracts-defined plan-review category must appear in the body
    // so dispatched findings can cite a category from the documented list.
    expect(planReview).toContain('Internal contradiction');
    expect(planReview).toContain('Logical gap');
    expect(planReview).toContain('Assumption-output drift');
    expect(planReview).toContain('Debt completeness');
    expect(planReview).toContain('Brittle reference');
    // ReviewResult return shape from the contracts must be described so
    // parent commands know what to expect back.
    expect(planReview).toContain('ReviewResult');
    expect(planReview).toContain('findings');
    expect(planReview).toContain('summary');
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

  // Story 3 Slice 4: the claude variant of strike renders the {{#ifAgent}}
  // branch, which is the code path actually deployed to Claude Code. The
  // default-variant assertions above are not enough to catch a regression
  // that reintroduces interactivity, drops PR creation, or breaks the
  // one-shot output snippet only inside the agent branch.
  it('strike claude variant has no Phase 3 Refine heading and no STOP-gate language', async () => {
    const claudeComposed = await getComposedTemplates('claude');
    const strike = claudeComposed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    expect(strike).not.toMatch(/##\s+Phase\s+3:\s*Refine/i);
    expect(strike).not.toMatch(/Keep iterating until the user gives explicit approval/i);
    expect(strike).not.toMatch(/STOP and ask/i);
    expect(strike).not.toMatch(/STOP and wait/i);
    expect(strike).not.toMatch(/Ready to forge, or want to refine the plan\?/i);
    // The {{#ifAgent}} branch previously asked the agent to "Let the
    // user decide" on unresolved conflicts. Slice 4 removed that gate.
    expect(strike).not.toMatch(/Let the user decide/i);
  });

  it('strike claude variant references PR creation after the strike document phase', async () => {
    const claudeComposed = await getComposedTemplates('claude');
    const strike = claudeComposed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    expect(strike).toMatch(/gh pr create/i);
    const strikeDocIdx = strike.indexOf('## Phase 3: Strike Document');
    const prIdx = strike.search(/gh pr create/i);
    expect(strikeDocIdx).toBeGreaterThan(-1);
    expect(prIdx).toBeGreaterThan(strikeDocIdx);
  });

  it('strike claude variant includes all four one-shot output headers', async () => {
    const claudeComposed = await getComposedTemplates('claude');
    const strike = claudeComposed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    expect(strike).toContain('## Summary');
    expect(strike).toContain('## Assumptions');
    expect(strike).toContain('## Specification Debt');
    expect(strike).toContain('## PR');
    expect(strike).not.toContain('{{>one-shot-output}}');
  });

  it('strike default does not contain competing plan dispatch', () => {
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toBeDefined();
    // Negative-lookahead regex so this assertion fires only when the
    // `smithy-plan` sub-agent itself is referenced — `smithy-plan-review` is
    // unconditional per Story 4 Slice 4 and must not trip this check. A plain
    // `\b`-boundary regex is insufficient because `-` is a non-word character,
    // so `\bsmithy-plan\b` matches inside `smithy-plan-review`.
    expect(strike).not.toMatch(/smithy-plan(?!-review)/);
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

    // Issue #368 regression guard: the clarify-log path MUST live under
    // `.smithy/clarify-logs/`, not under the RFC folder. Pin the new path
    // and forbid the legacy path so a regression to writing the log
    // inside the RFC folder fails this assertion. Checked across the
    // entire composed ignite prompt — the path is referenced in Phase 2
    // (read + append) and Phase 3 (resume bridge), so a regression in
    // any one of those locations is enough to fail.
    expect(ignite).toContain('.smithy/clarify-logs/');
    expect(ignite).not.toMatch(/docs\/rfcs\/[^`\s]*\.clarify-log\.md/);
  });

  it('ignite default does not contain competing plan dispatch', () => {
    const ignite = composed.commands.get('smithy.ignite.md')!;
    expect(ignite).toBeDefined();
    // Negative-lookahead regex so this assertion fires only when the
    // `smithy-plan` sub-agent itself is referenced — `smithy-plan-review` is
    // unconditional per Story 4 Slice 4 and must not trip this check. A plain
    // `\b`-boundary regex is insufficient because `-` is a non-word character,
    // so `\bsmithy-plan\b` matches inside `smithy-plan-review`.
    expect(ignite).not.toMatch(/smithy-plan(?!-review)/);
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
    const markdownBlocks = [...ignite.matchAll(/```markdown\r?\n([\s\S]*?)\r?\n```/g)];
    const markdownBlockMatch = markdownBlocks.find(m => m[1]!.includes('## Goals'));
    expect(markdownBlockMatch).toBeDefined();
    const markdownBlock = markdownBlockMatch![1]!;

    const goalsIdx = markdownBlock.indexOf('## Goals');
    const outOfScopeIdx = markdownBlock.indexOf('## Out of Scope');
    const personasIdx = markdownBlock.indexOf('## Personas');
    const proposalIdx = markdownBlock.indexOf('## Proposal');

    expect(goalsIdx).toBeGreaterThan(-1);
    expect(outOfScopeIdx).toBeGreaterThan(-1);
    expect(personasIdx).toBeGreaterThan(-1);
    expect(proposalIdx).toBeGreaterThan(-1);

    // Verify ordering
    expect(outOfScopeIdx).toBeGreaterThan(goalsIdx);
    expect(personasIdx).toBeGreaterThan(outOfScopeIdx);
    expect(proposalIdx).toBeGreaterThan(personasIdx);

    // Verify placeholder content exists. Issue #366 reworded the Out of
    // Scope placeholders to call out true exclusions vs deferred work; the
    // first bullet now carries a bad/good example contrast.
    expect(markdownBlock).toContain('<Capability 1 this RFC will NOT deliver');
    expect(markdownBlock).toContain('<Capability 2>');
    expect(markdownBlock).toContain('<Persona 1');
    expect(markdownBlock).toContain('<Persona 2');
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
    // Negative-lookahead regex so this assertion fires only when the
    // `smithy-plan` sub-agent itself is referenced — `smithy-plan-review` is
    // unconditional per Story 4 Slice 4 and must not trip this check. A plain
    // `\b`-boundary regex is insufficient because `-` is a non-word character,
    // so `\bsmithy-plan\b` matches inside `smithy-plan-review`.
    expect(render).not.toMatch(/smithy-plan(?!-review)/);
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
    // Negative-lookahead regex so this assertion fires only when the
    // `smithy-plan` sub-agent itself is referenced — `smithy-plan-review` is
    // unconditional per Story 4 Slice 4 and must not trip this check. A plain
    // `\b`-boundary regex is insufficient because `-` is a non-word character,
    // so `\bsmithy-plan\b` matches inside `smithy-plan-review`.
    expect(mark).not.toMatch(/smithy-plan(?!-review)/);
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

    // The feature-map example uses a 4-backtick fence so it can embed
    // ```yaml metadata blocks; match that outer fence (3 backticks would
    // stop at the first inner ```yaml close).
    const renderMarkdownMatch = render.match(/````markdown\r?\n([\s\S]*?)\r?\n````/);
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
    const markdownBlocks = [...ignite.matchAll(/```markdown\r?\n([\s\S]*?)\r?\n```/g)];
    const markdownBlockMatch = markdownBlocks.find(m => m[1]!.includes('## Milestones'));
    expect(markdownBlockMatch).toBeDefined();
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

  // Story 3 Slice 5: ignite and smithy.render are now one-shot. Each must
  // include the shared one-shot-output snippet content, reference PR
  // creation after writing the artifact, and carry no STOP-gate language.
  // The cross-command assertion below iterates over the set of planning
  // commands that have been converted to one-shot so a regression
  // reintroducing a STOP in any of them fails the test suite. The list will
  // grow as slices 3 (mark, cut) and 4 (strike) land.

  it('ignite template renders the one-shot output headers after conversion', () => {
    const ignite = composed.commands.get('smithy.ignite.md')!;
    expect(ignite).toBeDefined();
    // The one-shot-output snippet adds `## Summary`, `## Assumptions`,
    // `## Specification Debt`, and `## PR` sections to the composed
    // template. `## Summary` and `## Specification Debt` already appear
    // elsewhere in the ignite template (in the RFC template code fence),
    // so their presence here does not prove the snippet was inlined.
    // The unique indicators of the inlined snippet are `## PR` and
    // `## Bail-Out` (only the snippet produces those); the other two
    // assertions guard against accidental removal of either copy.
    expect(ignite).toContain('## Assumptions');
    expect(ignite).toContain('## Specification Debt');
    expect(ignite).toContain('## PR');
    expect(ignite).toContain('## Bail-Out');
  });

  it('ignite template references PR creation after artifact write-out', () => {
    const ignite = composed.commands.get('smithy.ignite.md')!;
    expect(ignite).toBeDefined();
    expect(ignite).toMatch(/gh pr create/);
    // Phase 4 is the write-and-create-PR phase after the conversion.
    expect(ignite).toContain('Phase 4: Write & Create PR');
    // The legacy review-loop heading is gone.
    expect(ignite).not.toContain('## Phase 4: Write & Review');
  });

  it('ignite template is non-interactive: no STOP-gate language', () => {
    const ignite = composed.commands.get('smithy.ignite.md')!;
    expect(ignite).toBeDefined();
    expect(ignite).not.toMatch(/STOP and wait/i);
    expect(ignite).not.toMatch(/STOP and ask/i);
  });

  it('render template renders the one-shot output headers after conversion', () => {
    const render = composed.commands.get('smithy.render.md')!;
    expect(render).toBeDefined();
    // `## Summary` does not appear in render's feature-map template code
    // fence, so the snippet's `## Summary` header is the only source.
    expect(render).toContain('## Summary');
    expect(render).toContain('## Assumptions');
    expect(render).toContain('## Specification Debt');
    expect(render).toContain('## PR');
    expect(render).toContain('## Bail-Out');
  });

  it('render template composes the feature-kinds schema and emits Kind', () => {
    const render = composed.commands.get('smithy.render.md')!;
    expect(render).toBeDefined();
    // The feature-kinds partial composed in (its unique header) and the
    // feature-map skeleton now emits yaml metadata blocks plus the seam.
    expect(render).toContain('## Feature Kinds');
    expect(render).toContain('kind: ui');
    expect(render).toContain('phase: build');
    expect(render).toMatch(/build\/wire/i);
    expect(render).not.toContain('{{>feature-kinds}}');
    expect(render).not.toContain('{{>');
  });

  it('audit features checklist composes the feature-kind/seam categories', () => {
    const audit = composed.commands.get('smithy.audit.md')!;
    expect(audit).toBeDefined();
    expect(audit).toContain('Feature Kind');
    expect(audit).toContain('UI Feature Fields');
    expect(audit).toContain('Build/Wire Seam');
    // The checklist references the shared schema snippet, which must resolve.
    expect(audit).toContain('## Feature Kinds');
    expect(audit).not.toContain('{{>feature-kinds}}');
  });

  it('render template references PR creation after artifact write-out', () => {
    const render = composed.commands.get('smithy.render.md')!;
    expect(render).toBeDefined();
    expect(render).toMatch(/gh pr create/);
    // Phase 4 is the write-and-create-PR phase after the conversion.
    expect(render).toContain('Phase 4: Write & Create PR');
    // The legacy review-loop heading is gone.
    expect(render).not.toContain('## Phase 4: Write & Review');
  });

  it('render template is non-interactive: no STOP-gate language', () => {
    const render = composed.commands.get('smithy.render.md')!;
    expect(render).toBeDefined();
    expect(render).not.toMatch(/STOP and wait/i);
    expect(render).not.toMatch(/STOP and ask/i);
  });

  it('converted planning commands have no STOP-gate language', () => {
    // Cross-command invariant for the planning commands already converted
    // to one-shot in story 03. The list grows as slices 3 and 4 land
    // (strike, mark, cut). A regression reintroducing "STOP and ask" or
    // "STOP and wait" in any converted planning command fails here.
    const convertedPlanningCommands = [
      'smithy.ignite.md',
      'smithy.render.md',
    ];
    for (const name of convertedPlanningCommands) {
      const tpl = composed.commands.get(name);
      expect(tpl, `${name} should be in the composed commands map`).toBeDefined();
      expect(tpl!, `${name} should not contain "STOP and ask"`).not.toMatch(/STOP and ask/i);
      expect(tpl!, `${name} should not contain "STOP and wait"`).not.toMatch(/STOP and wait/i);
    }
  });

  // Story 4 Slice 4: `smithy-plan-review` must be dispatched by every planning
  // command after artifact write and before PR creation so the plan-review loop
  // is active end-to-end. These cross-command assertions lock the wiring down
  // so a future regression that drops the dispatch — or inverts its ordering
  // relative to `gh pr create` — fails here immediately.
  const planningCommands = [
    'smithy.strike.md',
    'smithy.ignite.md',
    'smithy.mark.md',
    'smithy.render.md',
    'smithy.cut.md',
  ];

  // Compose the claude variant once and reuse for every per-command test so
  // we don't re-render every template per iteration (would scale O(N × M)).
  // Helper: every PR-creation invocation must be preceded by at least one
  // plan-review dispatch earlier in the template. Scanning every occurrence
  // — not just the last — prevents a regression where a later phase (e.g.,
  // Phase 4 first-pass) retains the dispatch but an earlier phase (e.g.,
  // Phase 0c refinement) silently loses it.
  //
  // Marker: `mcp__github__create_pull_request`. After the issue #261
  // refactor, command templates no longer embed `gh pr create` literally
  // at the invocation site — the actual PR-creation step pulls in the
  // shared `pr-create-tool-choice` snippet, whose text is the only place
  // `mcp__github__create_pull_request` appears in the composed template.
  // That makes the MCP-tool name a tight, false-positive-free invocation
  // marker (descriptive prose like "the forge `gh pr create` pattern"
  // never mentions the MCP tool by name).
  function assertEveryPrCreatePrecededByPlanReview(tpl: string, label: string) {
    const invocations: number[] = [];
    const re = /mcp__github__create_pull_request/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(tpl)) !== null) {
      invocations.push(match.index);
    }
    expect(
      invocations.length,
      `${label} must contain at least one PR-creation invocation`,
    ).toBeGreaterThan(0);

    // Every invocation position must have a plan-review reference earlier
    // in the template. Two equivalent markers count as plan-review
    // references: the literal sub-agent name `smithy-plan-review`, and
    // the section heading `Plan-Review Pass` that planning-command
    // templates use as a forward reference to the detailed sub-section.
    // (Several Phase-0c flows describe step 3 as "Run the Plan-Review
    // Pass described below" before the literal sub-agent name appears
    // later in the file — both forms are valid for the ordering check.)
    const planReviewPositions: number[] = [];
    const prRe = /smithy-plan-review|Plan-Review Pass/g;
    let pm: RegExpExecArray | null;
    while ((pm = prRe.exec(tpl)) !== null) planReviewPositions.push(pm.index);
    expect(
      planReviewPositions.length,
      `${label} must reference smithy-plan-review or Plan-Review Pass`,
    ).toBeGreaterThan(0);

    for (const invIdx of invocations) {
      const precedingPlanReview = planReviewPositions.find((p) => p < invIdx);
      expect(
        precedingPlanReview,
        `${label}: PR-creation invocation at offset ${invIdx} must be preceded by a smithy-plan-review dispatch`,
      ).toBeDefined();
    }
  }

  for (const name of planningCommands) {
    it(`${name} default variant dispatches smithy-plan-review before every PR creation`, () => {
      const tpl = composed.commands.get(name);
      expect(tpl, `${name} should be in the composed commands map`).toBeDefined();
      // Every PR-creation invocation must be preceded by a plan-review
      // dispatch — not just the last one. This catches a regression where
      // the Phase 0c refinement PR flow loses plan-review while the
      // first-pass PR flow retains it.
      assertEveryPrCreatePrecededByPlanReview(tpl!, name);
    });

    it(`${name} claude variant dispatches smithy-plan-review before every PR creation`, () => {
      const tpl = claudeComposed.commands.get(name);
      expect(tpl, `${name} should be in the claude composed commands map`).toBeDefined();
      assertEveryPrCreatePrecededByPlanReview(tpl!, `${name} (claude)`);
    });
  }

  it('planning commands never grant smithy-plan-review write tools', () => {
    // The plan-review agent is read-only (US4 Slice 2). Planning commands must
    // not describe granting it Edit/Write/Bash inside any dispatch block —
    // the invariant has to hold for every plan-review mention, not just the
    // first, because several commands now reference plan-review from more
    // than one phase (Phase 0c + Phase 4/5/6).
    for (const variant of [composed, claudeComposed]) {
      for (const name of planningCommands) {
        const tpl = variant.commands.get(name);
        expect(tpl, `${name} should be composed`).toBeDefined();
        const positions: number[] = [];
        const re = /smithy-plan-review/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(tpl!)) !== null) positions.push(m.index);
        expect(
          positions.length,
          `${name} should reference smithy-plan-review`,
        ).toBeGreaterThan(0);
        // Window each occurrence separately: 200 chars before the mention
        // and 600 chars after captures the inline dispatch block.
        for (const idx of positions) {
          const window = tpl!.slice(Math.max(0, idx - 200), idx + 600);
          // Match both the literal prose phrases and YAML-style tool-list
          // grants. A forge-style dispatch could leak in through either
          // surface: prose "use the Edit tool to…" or YAML-list
          // "tools:\n  - Edit".
          expect(window, `${name} dispatch at offset ${idx} must be read-only`).not.toMatch(/\bEdit tool\b/);
          expect(window, `${name} dispatch at offset ${idx} must be read-only`).not.toMatch(/\bWrite tool\b/);
          expect(window, `${name} dispatch at offset ${idx} must be read-only`).not.toMatch(/\bBash tool\b/);
          expect(window, `${name} dispatch at offset ${idx} must be read-only`).not.toMatch(/^\s*-\s+Edit\b/m);
          expect(window, `${name} dispatch at offset ${idx} must be read-only`).not.toMatch(/^\s*-\s+Write\b/m);
          expect(window, `${name} dispatch at offset ${idx} must be read-only`).not.toMatch(/^\s*-\s+Bash\b/m);
        }
      }
    }
  });

  it('variant does not change the number of template keys', async () => {
    expect([...composed.commands.keys()].sort()).toEqual([...claudeComposed.commands.keys()].sort());
    expect([...composed.prompts.keys()].sort()).toEqual([...claudeComposed.prompts.keys()].sort());
    expect([...composed.agents.keys()].sort()).toEqual([...claudeComposed.agents.keys()].sort());
    expect([...composed.skills.keys()].sort()).toEqual([...claudeComposed.skills.keys()].sort());
  });
});

describe('getComposedTemplates artifactsRoot', () => {
  // The {{artifactsRoot}} helper is the deploy-time variable that decides
  // whether planning-artifact paths in the deployed prompts render as
  // `docs/rfcs/...` (in-repo, default) or `~/.smithy/<repo>/docs/rfcs/...`
  // (external mode). Each templatized command prompt must honor it; these
  // assertions lock that in against future template rewrites.

  it('defaults to an empty prefix so paths render unchanged', async () => {
    const c = await getComposedTemplates('claude');
    const strike = c.commands.get('smithy.strike.md')!;
    // Path in the Phase 3 write instruction renders without a prefix.
    expect(strike).toContain('Write a single strike document to `specs/strikes/YYYY-MM-DD-<slug>.strike.md`');
    expect(strike).not.toContain('{{artifactsRoot}}');
    // The policy snippet mentions ~/.smithy/<repo>/ as part of its explanation;
    // that's expected. Make sure no actual artifact path got a tilde prefix.
    expect(strike).not.toContain('~/.smithy/<repo>/specs/strikes/YYYY');
  });

  it('substitutes the supplied prefix into every templatized path', async () => {
    const c = await getComposedTemplates('claude', '~/.smithy/myrepo/');
    const strike = c.commands.get('smithy.strike.md')!;
    expect(strike).toContain('~/.smithy/myrepo/specs/strikes/YYYY-MM-DD-<slug>.strike.md');
    expect(strike).not.toContain('{{artifactsRoot}}');
  });

  it('propagates to the ignite, mark, cut, render, spark, audit, and orders prompts', async () => {
    const c = await getComposedTemplates('claude', '~/.smithy/myrepo/');
    for (const file of [
      'smithy.ignite.md',
      'smithy.mark.md',
      'smithy.cut.md',
      'smithy.render.md',
      'smithy.spark.md',
      'smithy.audit.md',
      'smithy.orders.md',
    ]) {
      const body = c.commands.get(file)!;
      expect(body, file).not.toContain('{{artifactsRoot}}');
      expect(body, file).toContain('~/.smithy/myrepo/');
    }
  });

  it('embeds the artifact-location-policy snippet in every templatized command', async () => {
    const c = await getComposedTemplates('claude');
    for (const file of [
      'smithy.strike.md',
      'smithy.ignite.md',
      'smithy.mark.md',
      'smithy.cut.md',
      'smithy.render.md',
      'smithy.spark.md',
      'smithy.audit.md',
      'smithy.orders.md',
    ]) {
      const body = c.commands.get(file)!;
      expect(body, file).toContain('## Planning Artifacts Location');
    }
  });

  it('renders the gemini variant with the same artifactsRoot substitution', async () => {
    const c = await getComposedTemplates('gemini', '~/.smithy/x/');
    const strike = c.commands.get('smithy.strike.md')!;
    expect(strike).toContain('~/.smithy/x/specs/strikes/');
    expect(strike).not.toContain('{{artifactsRoot}}');
  });
});

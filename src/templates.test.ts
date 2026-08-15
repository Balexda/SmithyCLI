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
import { skillsTemplateDir } from './utils.js';
import { ORDERS_DEFAULT_TEMPLATES, ORDERS_TEMPLATE_TYPES } from './orders-templates.js';
import { toClaudeCommandContent } from './command-frontmatter.js';

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
    expect(snippets.size).toBe(35);

    const expectedFiles = [
      'audit-checklist-rfc.md',
      'audit-checklist-features.md',
      'audit-checklist-spec.md',
      'audit-checklist-tasks.md',
      'audit-checklist-strike.md',
      'audit-checklist-voice.md',
      'audit-checklist-engraved.md',
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
      'persona-convention.md',
      'engraved-recall-rules.md',
      'engraved-recall-advisory.md',
      'engraved-recall-degraded.md',
      'engraved-recall-dispatch.md',
      'engraved-levels.md',
      'engraved-scan-roots.md',
      'engraved-project-resolution.md',
      'spec-debt-section.md',
      'open-implementation-questions.md',
      'typed-ui-build-profiles.md',
      'kind-gate.md',
      'debt-row-shape.md',
      'debt-grading.md',
      'debt-from-clarify.md',
      'plan-review-triage.md',
      'drift-categories.md',
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
    expect(snippets.get('audit-checklist-voice.md')).toContain('Voice & Audience Tag Lint');
    expect(snippets.get('guidance-shell.md')).toContain('Shell Best Practices');
    expect(snippets.get('tdd-protocol.md')).toContain('TDD Protocol');
    expect(snippets.get('review-protocol.md')).toContain('Review Protocol');
    expect(snippets.get('competing-lenses-decomposition.md')).toContain('Competing Slice Lenses');
    expect(snippets.get('competing-lenses-implementation.md')).toContain('Competing Plan Lenses');
    expect(snippets.get('competing-lenses-scoping.md')).toContain('Competing Plan Lenses');
    expect(snippets.get('branch-policy.md')).toContain('Branch Selection Policy');
    expect(snippets.get('persona-convention.md')).toContain('Persona Artifact Convention');
    expect(snippets.get('engraved-recall-rules.md')).toContain('Engraved Recall Rules');
    expect(snippets.get('spec-debt-section.md')).toContain('## Specification Debt');
    expect(snippets.get('open-implementation-questions.md')).toContain(
      '## Open Implementation Questions',
    );
    expect(snippets.get('kind-gate.md')).toContain('#### The steering test');
    expect(snippets.get('debt-row-shape.md')).toContain('**Debt row fields.**');
    expect(snippets.get('plan-review-triage.md')).toContain('the review note surface');
  });
});

describe('engraved-recall-rules snippet', () => {
  // US1 Slice 2: the recall *rules* live once in the shared
  // `engraved-recall-rules` snippet — the forge-pattern analogue of
  // `tdd-protocol` / `review-protocol`. It is the single source of truth,
  // included by the smithy-recall sub-agent and (in Slice 3) by the inline
  // degraded `{{else}}` branch of each consuming command's zero-arg
  // {{#ifAgent}} capability gate. There is no per-agent "consult" snippet:
  // the sub-agent dispatch prose is written inline in the command, the same
  // way forge inlines its smithy-implement / smithy-implementation-review
  // dispatch. These tests lock the shared snippet as the single, agent-agnostic
  // source so re-duplicating the rules or smuggling a conditional in fails early.
  const RULES = 'engraved-recall-rules.md';

  it('snippet file is loadable as a partial via loadSnippets', () => {
    const snippets = loadSnippets();
    expect(snippets.has(RULES)).toBe(true);
    expect(snippets.get(RULES)!.length).toBeGreaterThan(0);
  });

  it('is the single, agent-agnostic source of the recall rules', () => {
    const content = loadSnippets().get(RULES)!;
    // The scan roots themselves live in the nested level model, so the rules
    // snippet names it rather than restating a root list that would then have
    // two homes to drift between.
    expect(content).toContain('{{>engraved-levels}}');
    for (const token of ['domain', 'topics', 'scope', 'applies_to']) {
      expect(content).toContain(token);
    }
    expect(content).toContain('candidate new exception');
    expect(content).toContain('Accepted:');
    expect(content).toContain('Temporary:');
    expect(content).toContain('superseded');
    expect(content).toContain('deprecated');
    expect(content).toContain('"no_records"');
    expect(content).toContain('"no_match"');
    // Multi-level recall: every finding is level-tagged and precedence is
    // stated, not left to the model.
    expect(content).toContain('cross_level_conflicts');
    expect(content).toContain('levels_scanned');
    expect(content).toContain('severity');
    // The shared rules are agent-agnostic — no conditionals, no sub-agent name.
    expect(content).not.toContain('{{#ifAgent}}');
    expect(content).not.toContain('smithy-recall');
  });

  it('the nested level model carries the three-level scan roots', () => {
    const content = loadSnippets().get('engraved-scan-roots.md')!;
    for (const level of ['user', 'repo', 'project']) {
      expect(content).toContain(`\`${level}\``);
    }
    expect(content).toContain('~/.smithy/decisions/');
    expect(content).toContain('~/.smithy/invariants/');
    expect(content).toContain('~/.smithy/constitution/');
    expect(content).toContain('{{artifactsRoot}}docs/decisions/');
    expect(content).toContain('{{artifactsRoot}}docs/invariants/');
    expect(content).toContain('{{artifactsRoot}}docs/constitution/');
    expect(content).toContain('~/.smithy/projects/<project>/decisions/');
    expect(content).toContain('~/.smithy/projects/<project>/invariants/');
    expect(content).toContain('~/.smithy/projects/<project>/constitution/');
    expect(content).toContain('design/');
    expect(content).not.toContain('{{#ifAgent}}');
  });

  it('the level model states identity, precedence, and cross-level edges', () => {
    const content = loadSnippets().get('engraved-levels.md')!;
    // Level-prefixed ids: a user-level INV-1 can no longer collide with a
    // repo-level one, so a bare citation names exactly one record.
    for (const id of ['U-D-<N>', 'U-INV-<N>', 'U-P-<N>', 'PJ-D-<N>', 'PJ-INV-<N>', 'PJ-P-<N>']) {
      expect(content).toContain(id);
    }
    expect(content).toContain('project > repo > user');
    expect(content).toContain('excepts');
    // A narrower level never supersedes a broader one — that is the footgun
    // the exception edge exists to replace.
    expect(content).toMatch(/Same level only/);
    expect(content).not.toContain('{{#ifAgent}}');
  });

  it('composes into any template via the {{>engraved-recall-rules}} partial', async () => {
    const snippets = loadSnippets();
    const partials: Record<string, string> = {};
    for (const [filename, content] of snippets) {
      partials[filename.replace(/\.md$/, '')] = content.trimEnd();
    }
    const renderer = new Dotprompt({ partials });
    const host = '# Host Template\n\n{{>engraved-recall-rules}}\n';
    const result = await resolveSnippets(host, renderer);
    expect(result).toContain('docs/decisions/');
    expect(result).toContain('candidate new exception');
    expect(result).not.toContain('{{>engraved-recall-rules}}');
  });
});

describe('engraved-recall consultation snippets', () => {
  // US1 Slice 3 (review follow-up): the invariant halves of the planning
  // commands' Engraved-Knowledge Consultation block are shared once, so the
  // five commands (strike, ignite, render, mark, cut) restate only their
  // per-command dispatch context inline. `engraved-recall-advisory` carries
  // the sub-agent-path advisory-handling prose; `engraved-recall-degraded`
  // carries the direct-read {{else}} branch and nests the rules snippet.
  // Both must stay agent-agnostic (no {{#ifAgent}}), matching the snippets
  // README convention that the conditional lives in the consuming command.
  const ADVISORY = 'engraved-recall-advisory.md';
  const DEGRADED = 'engraved-recall-degraded.md';

  it('both snippets are loadable as partials via loadSnippets', () => {
    const snippets = loadSnippets();
    for (const name of [ADVISORY, DEGRADED]) {
      expect(snippets.has(name)).toBe(true);
      expect(snippets.get(name)!.length).toBeGreaterThan(0);
    }
  });

  it('advisory snippet carries the advisory-handling contract, agent-agnostic', () => {
    const content = loadSnippets().get(ADVISORY)!;
    expect(content).toContain('advisory planning context');
    expect(content).toContain('`## Specification Debt`');
    expect(content).toMatch(/candidate\s+invariant conflicts/);
    expect(content).toMatch(/superseded\/deprecated\s+citation\s+hazards/);
    expect(content).toContain('proceed normally');
    // Advisory prose is the sub-agent path's handling; it must not branch on
    // the agent or re-derive the rules body.
    expect(content).not.toContain('{{#ifAgent}}');
    expect(content).not.toContain('{{>engraved-recall-rules}}');
  });

  it('degraded snippet reads the rules directly and nests the rules snippet', () => {
    const content = loadSnippets().get(DEGRADED)!;
    expect(content).toContain('Read engraved durable knowledge directly');
    expect(content).toContain('{{>engraved-recall-rules}}');
    expect(content).not.toContain('{{#ifAgent}}');
  });

  it('both snippets compose (degraded resolves the nested rules partial)', async () => {
    const snippets = loadSnippets();
    const partials: Record<string, string> = {};
    for (const [filename, content] of snippets) {
      partials[filename.replace(/\.md$/, '')] = content.trimEnd();
    }
    const renderer = new Dotprompt({ partials });

    const advisory = await resolveSnippets(
      '# Host\n\n{{>engraved-recall-advisory}}\n',
      renderer,
    );
    expect(advisory).toContain('advisory planning context');
    expect(advisory).not.toContain('{{>engraved-recall-advisory}}');

    const degraded = await resolveSnippets(
      '# Host\n\n{{>engraved-recall-degraded}}\n',
      renderer,
    );
    // Nested partial resolution: the rules body is inlined transitively.
    expect(degraded).toContain('Read engraved durable knowledge directly');
    expect(degraded).toContain('## Engraved Recall Rules');
    expect(degraded).toContain('docs/decisions/');
    expect(degraded).not.toContain('{{>engraved-recall-degraded}}');
    expect(degraded).not.toContain('{{>engraved-recall-rules}}');
  });
});

/**
 * Render a snippet through the same partial machinery the deploy path uses,
 * so an assertion sees what a consumer actually receives — nested partials
 * included. `loadSnippets()` returns raw files, which is the wrong surface
 * for any rule that now lives one composition level down.
 */
async function composeSnippet(partialName: string): Promise<string> {
  const partials: Record<string, string> = {};
  for (const [filename, content] of loadSnippets()) {
    partials[filename.replace(/\.md$/, '')] = content.trimEnd();
  }
  const renderer = new Dotprompt({ partials });
  return resolveSnippets(`{{>${partialName}}}\n`, renderer);
}

describe('kind-gate snippet', () => {
  // Issue #553: the kind gate had two non-identical "canonical" homes —
  // `review-protocol` (third condition: human-only) and `smithy-clarify`
  // Step 3b (third condition: no-prescription, and no implementation/hygiene
  // kinds at all). This snippet is now the only definition; every consumer
  // composes it, so the two can no longer disagree.

  it('defines the three kinds and the three-part steering test', () => {
    const content = loadSnippets().get('kind-gate.md')!;
    expect(content).toContain('`steering`');
    expect(content).toContain('`implementation`');
    expect(content).toContain('`hygiene`');
    expect(content).toContain('**Open question**');
    expect(content).toContain('**Named alternatives**');
    expect(content).toContain('**Human-only**');
    expect(content).toContain('**Positive test:**');
    expect(content).toContain('#### Calibration');
    expect(content).toContain('Only `steering` findings may become specification debt.');
  });

  it('folds the no-prescription rule into the positive test rather than a fourth condition', () => {
    // Clarify used to carry "no prescription" as a third gate condition, which
    // made its gate structurally different from the review agents'. It is a
    // test of how the finding is *phrased*, not of who resolves it, so it
    // belongs with the positive test — one gate, same three conditions.
    const content = loadSnippets().get('kind-gate.md')!;
    const testIdx = content.indexOf('**Positive test:**');
    const conditionsIdx = content.indexOf('**Human-only**');
    expect(conditionsIdx).toBeGreaterThan(-1);
    expect(content).not.toMatch(/\*\*No prescription\*\*/);
    expect(content.slice(testIdx)).toMatch(/directive/);
    // Exactly three numbered conditions, so no consumer can add a fourth.
    const conditions = content.match(/^\d\. \*\*/gm) ?? [];
    expect(conditions.length).toBe(3);
    expect(testIdx).toBeGreaterThan(conditionsIdx);
  });

  it('routes every rejected kind to a named home, including the clarify leak kinds', () => {
    // The routing table used to be split: review-protocol held four rows and
    // pointed at clarify's six for the rest — a dead reference for Gemini,
    // which deploys no sub-agent files at all. All of them live here now.
    const content = loadSnippets().get('kind-gate.md')!;
    expect(content).toContain('## Open Implementation Questions');
    expect(content).toContain('### Functional Requirements');
    // The spec scaffold writes acceptance scenarios as a bold label under the
    // user story, not as a heading, so the routing table names it that way —
    // `### Acceptance Scenarios` resolved to nothing any template emits.
    expect(content).toContain('**Acceptance Scenarios**');
    expect(content).toContain('## Out of Scope');
    expect(content).toContain('## Assumptions');
    // Issue #554 D2: the routing table used to send dependency/coordination
    // notes to an "RFC Cross-Cutting Governance / touched-files matrix" that
    // no template defines. Every home named here must be a section that
    // actually exists in some artifact.
    expect(content).toContain('## Dependency Order');
    expect(content).not.toContain('Cross-Cutting Governance');
    expect(content).toContain('A wrong table is a fix, not a question');
    // No cross-file pointer to a prompt a consumer may never load.
    expect(content).not.toMatch(/smithy-clarify Step 3b's routing table/);
  });
});

describe('debt-row-shape snippet', () => {
  // Issue #553: Confidence was High|Low in review-protocol, High|Medium|Low
  // in clarify and in the debt section's own example rows, and "Medium/Low"
  // in refine's prose; Impact's enum was never positively stated anywhere in
  // the four authoring commands. One home now states both.

  it('states the Impact and Confidence enums positively', () => {
    const content = loadSnippets().get('debt-row-shape.md')!;
    expect(content).toContain('`Critical` / `High` / `Medium` / `Low`');
    expect(content).toContain('`High` / `Medium` / `Low`');
  });

  it('keeps the grading rubric out of the row shape the parents compose', async () => {
    // P-1: the row shape ships to every plan-review site (eleven of them),
    // but only clarify and refine ever pick a level from nothing — a parent
    // maps severity and copies confidence. The rubric lives one level up, in
    // `debt-grading`, which nests the shape so the enums are still stated once.
    const shape = loadSnippets().get('debt-row-shape.md')!;
    expect(shape).not.toMatch(/You would be surprised if the user disagreed/);
    const grading = await composeSnippet('debt-grading');
    expect(grading).toContain('You would be surprised if the user disagreed');
    // Nesting, not restating: the shape's rules arrive with the rubric.
    expect(grading.replace(/\s+/g, ' ')).toContain('`Important` becomes `High`');
    expect(loadSnippets().get('debt-grading.md')!).toContain('{{>debt-row-shape}}');
  });

  it('maps review severity into Impact instead of copying it', () => {
    const content = loadSnippets().get('debt-row-shape.md')!.replace(/\s+/g, ' ');
    expect(content).toContain('`Important` is **not** a valid `Impact` value.');
    expect(content).toContain('`Important` becomes `High`');
  });

  it('reconciles the binary review confidence with the three-level scale', () => {
    // A review finding's High/Low is the same scale's endpoints, not a rival
    // enum — which is what makes copying it into the Confidence column lossless.
    const content = loadSnippets().get('debt-row-shape.md')!;
    expect(content).toMatch(/endpoints of the same scale/);
    expect(content.replace(/\s+/g, ' ')).toContain(
      '`Medium` is produced only by clarification and refinement',
    );
  });
});

describe('drift-categories snippet', () => {
  // Issue #575: the review loop runs on every authoring pass but was not
  // looking for the classes the audit found by hand — a protocol restated
  // instead of cited, a reference that resolves to nothing, and content
  // addressed to the artifact's authors rather than its readers.

  it('is composed by both review agents rather than copied into either', async () => {
    // The categories are shared, so they live in one snippet — the rule the
    // categories themselves police.
    const raw = loadSnippets().get('drift-categories.md')!;
    for (const agent of ['smithy.plan-review.prompt', 'smithy.refine.prompt']) {
      const source = fs.readFileSync(
        path.join(skillsTemplateDir, '..', 'agents', agent), 'utf8',
      );
      expect(source, agent).toContain('{{>drift-categories}}');
    }
    const composed = await composeSnippet('drift-categories');
    expect(composed).toContain('**Restated protocol**');
    expect(composed).toContain('**Dead reference**');
    expect(composed).toContain('**Internal content in a deliverable**');
    expect(raw).not.toContain('{{#ifAgent');
  });

  it('routes all three through the kind gate as hygiene', () => {
    // None of the three is a choice a human has to make, so none may reach
    // the debt table; saying so in the snippet keeps the gate's answer from
    // being re-derived at each review surface.
    const content = loadSnippets().get('drift-categories.md')!.replace(/\s+/g, ' ');
    expect(content).toContain('`hygiene` by construction');
    expect(content).toContain('Run them through the kind gate');
  });

  it('reaches the degraded path, which loads no sub-agent', async () => {
    // Gemini deploys no sub-agent files, so anything living only in an agent
    // prompt never reaches it. refine composes the snippet in Step 1, which
    // renders on every variant.
    for (const variant of [undefined, 'claude', 'codex', 'gemini']) {
      const composed = await getComposedTemplates(variant);
      expect(composed.agents.get('smithy.refine.md'), String(variant))
        .toContain('**Restated protocol**');
    }
  });
});

describe('plan-review-triage snippet', () => {
  // Issue #553: the parent-side consequence table was hand-copied twice each
  // into mark, cut, ignite and render and once each into strike and forge —
  // about 500 source lines — while the canonical copy sat in a snippet only
  // the child review agents composed. This is the parents' canonical home.

  it('maps each destination to one parent action', async () => {
    // Issue #580: the parent used to receive three enum values and derive the
    // action itself. The review agent already composes the gate and grades
    // both scales, so it emits the routed `destination` and this snippet is
    // the four-row consequence of that one field.
    const content = await composeSnippet('plan-review-triage');
    for (const destination of ['apply', 'debt', 'iq', 'note']) {
      expect(content, destination).toMatch(
        new RegExp(`^\\|\\s*\`${destination}\`\\s*\\|`, 'm'),
      );
    }
    expect(content).toContain('## Specification Debt');
    expect(content).toContain('## Open Implementation Questions');
    expect(content).toContain('`proposed_fix`');
  });

  it('leaves the kind × severity × confidence derivation to the agent', () => {
    // The classification and its consequence now live in the same place —
    // the agent-side snippet — so a parent can no longer restate a triage row
    // and a `steering` finding cannot be spelled as an auto-apply at all.
    const content = loadSnippets().get('plan-review-triage.md')!;
    expect(content).not.toContain('kind × severity ×');
    expect(content).not.toMatch(/^\|\s*`?(steering|implementation|hygiene)`?\s*\|/m);
    // The one steering rule the parent still needs: `debt` is never also a fix.
    expect(content).toContain('Never apply the fix as well.');
    // Grading vocabulary survives only as the fields the parent may cite.
    expect(content).toContain('`kind`, `severity`, and `confidence`');
  });

  it('treats an absent or unknown destination as a note', () => {
    // The routing is one enum crossing an agent boundary; a parent that
    // silently dropped an unrecognized value would lose the finding.
    const content = loadSnippets().get('plan-review-triage.md')!.replace(/\s+/g, ' ');
    expect(content).toContain('A finding arriving with no `destination`');
    expect(content).toContain('is a `note` — report it and change nothing');
  });

  it('names its two per-command destinations instead of hard-coding one', () => {
    // strike and forge route unapplied findings to terminal output, not the
    // PR body (issue #385), so a canonical table cannot name a surface. Each
    // command binds "the target artifact" and "the review note surface" just
    // above the composition point.
    const content = loadSnippets().get('plan-review-triage.md')!;
    expect(content).toMatch(/\*\*[Tt]he target artifact\*\*/);
    expect(content).toMatch(/\*\*[Tt]he review note surface\*\*/);
    expect(content).not.toMatch(/PR body/);
  });

  it('carries the IQ row shape without re-deciding when an IQ row applies', () => {
    // Whether a target artifact can hold an `IQ-NNN` row at all is the
    // agent's call, made when it chose `iq` over `note`; the parent only
    // needs the shape of the row it writes.
    const content = loadSnippets().get('plan-review-triage.md')!;
    expect(content).toContain('`## Open Implementation Questions`');
    expect(content).toContain('`IQ-NNN`');
    expect(content.replace(/\s+/g, ' ')).toContain('120 characters or fewer');
    expect(content).not.toContain('.tasks.md');
  });

  it('composes the debt row shape rather than restating the enums', async () => {
    const raw = loadSnippets().get('plan-review-triage.md')!;
    expect(raw).toContain('{{>debt-row-shape}}');
    const content = await composeSnippet('plan-review-triage');
    expect(content).not.toContain('{{>debt-row-shape}}');
    expect(content.replace(/\s+/g, ' ')).toContain('`Important` becomes `High`');
  });
});

describe('review-protocol snippet', () => {
  // Story 4 Slice 1: the shared review-protocol snippet is the single source
  // of truth for the read-only, findings-based review protocol that both
  // `smithy-plan-review` and `smithy-implementation-review` compose. These
  // assertions lock down the snippet's contract so any regression (deleted
  // file, renamed file, dropped Finding structure section, dropped kind
  // gate, reintroduced auto-fix language) fails the test suite immediately.

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
    expect(content).toContain('`kind`');
    expect(content).toContain('`severity`');
    expect(content).toContain('`confidence`');
    expect(content).toContain('`destination`');
    expect(content).toContain('`description`');
    expect(content).toContain('`artifact_path`');
    expect(content).toContain('`proposed_fix`');
  });

  it('derives the routed destination here, where the gate already lives', async () => {
    // Issue #580: the agent composed the gate, set `kind`, and graded both
    // scales — then handed the parent three enums and a table to re-derive
    // the action from. The classification and its consequence belong in the
    // same place, which is also what makes the steering rule unrepresentable
    // rather than merely stated.
    const content = await composeSnippet('review-protocol');
    expect(content).toContain('### 5. Route the finding');
    expect(content).toContain('kind × severity × confidence');
    expect(content).toMatch(/`steering`\s*\|\s*Critical or Important\s*\|\s*Any\s*\|\s*`debt`/);
    expect(content).toMatch(
      /`implementation` or `hygiene`\s*\|\s*Critical or Important\s*\|\s*High\s*\|\s*`apply`/,
    );
    expect(content).toMatch(/`hygiene`\s*\|\s*Critical or Important\s*\|\s*Low\s*\|\s*`note`/);
    expect(content).toMatch(/Minor\s*\|\s*Any\s*\|\s*`note`/);
    // The `iq` cell is the reason the dispatch binds the target artifact:
    // only a tasks file carries the section that persists the row.
    expect(content).toMatch(/`iq` when the target artifact is a `\.tasks\.md`/);
    expect(content).toContain('### 6. Report; do not act');
    expect(content).toContain('The parent command owns the consequences');
    // Two rules bind the agent because they are properties of what it emits.
    expect(content).toContain(
      '**A `steering` finding is never auto-applied, at any confidence.**',
    );
    expect(content).toContain('**A wrong table is a fix, not a question.**');
  });

  it('binds the two per-command terms rather than naming a surface', async () => {
    // The agent resolves `iq` vs `note` itself, which it can only do knowing
    // which artifact the parent records into. Both terms arrive in the
    // dispatch; the snippet must not hard-code either, since strike and forge
    // note findings in terminal output and the rest in a PR body.
    const content = (await composeSnippet('review-protocol')).replace(/\s+/g, ' ');
    expect(content).toMatch(/\*\*the target artifact\*\*/i);
    expect(content).toMatch(/\*\*the review note surface\*\*/i);
    expect(content).not.toMatch(/PR body/);
    // A dispatch that binds nothing still has to route somewhere.
    expect(content).toContain('When the dispatch named no target artifact, choose `note`.');
  });

  it('never lets a steering finding carry an apply destination', async () => {
    // The point of moving the table: an agent that can only emit `debt` or
    // `note` for a `steering` finding cannot express the contradiction the
    // old parent-side table merely warned against.
    const content = await composeSnippet('review-protocol');
    const rows = content.split('\n').filter(l => /^\|\s*`?steering`?\s/.test(l));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row, row).not.toContain('`apply`');
    expect(content).not.toMatch(/`steering`[^|\n]*\|[^|\n]*\|\s*High\s*\|/);
    expect(content.replace(/\s+/g, ' ')).toContain('It takes `debt`, never `apply`');
  });

  it('snippet carries the whole kind gate, not a pointer to an agent prompt', async () => {
    // Gemini deploys no sub-agents and forge has a degraded inline review
    // branch; both compose this snippet and never see `smithy-plan-review`'s
    // body. `smithy-implementation-review` composes it without plan-review
    // too. The gate reaches all of them through the nested `kind-gate`
    // partial, so the full test must survive composition.
    const raw = loadSnippets().get('review-protocol.md')!;
    expect(raw).toContain('{{>kind-gate}}');
    const content = await composeSnippet('review-protocol');
    expect(content).not.toContain('{{>kind-gate}}');
    expect(content).toContain('**Open question**');
    expect(content).toContain('**Named alternatives**');
    expect(content).toContain('**Human-only**');
    expect(content).toContain('**Positive test:**');
    expect(content).toContain('#### Calibration');
    // No deferral to a file this snippet's consumers may never load.
    expect(content).not.toMatch(/live in `smithy-plan-review`/);
    expect(content).not.toMatch(/consult that section/);
  });

  it('snippet gates the debt table on kind, not on confidence alone', async () => {
    // The bug this closes: routing on severity × confidence alone sent every
    // Low-confidence finding to `## Specification Debt`, so implementation
    // unknowns and wrong-table corrections outnumbered the real decisions and
    // buried them. `kind` is the axis that says who resolves a finding, and
    // only a human-resolvable one belongs in a decision queue.
    const content = await composeSnippet('review-protocol');
    expect(content).toContain('Kind gate');
    // The three kinds and their resolvers.
    expect(content).toContain('`steering`');
    expect(content).toContain('`implementation`');
    expect(content).toContain('`hygiene`');
    // The load-bearing rule.
    expect(content).toContain('Only `steering` findings may become specification debt.');
    // Non-steering findings must be routed, not dropped.
    expect(content).toContain('## Open Implementation Questions');
    // The kind is set before severity × confidence are graded, matching the
    // order the agent applies them.
    const gateIdx = content.indexOf('### 4. Kind gate —');
    const reportIdx = content.indexOf('### 6. Report; do not act');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(reportIdx).toBeGreaterThan(gateIdx);
  });

  it('snippet no longer contains auto-fix language', async () => {
    const content = await composeSnippet('review-protocol');
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

describe('spec-debt-section snippet', () => {
  // The spec-debt-section snippet is the single source of the
  // `## Specification Debt` artifact section. Before it existed, the same
  // block was copy-pasted verbatim into seven sites across six command
  // templates. These assertions lock its contract.

  it('snippet has no YAML frontmatter (raw Markdown per snippets README)', () => {
    const content = loadSnippets().get('spec-debt-section.md')!;
    expect(content).not.toMatch(/^---\s*\n/);
  });

  it('snippet carries the index table header, detail section, and Resolved subsection', () => {
    const content = loadSnippets().get('spec-debt-section.md')!;
    expect(content).toContain('| ID | Title | Source Category | Impact | Confidence | Origin |');
    expect(content).toContain('### SD-001 — <Title>');
    expect(content).toContain('### Resolved');
    expect(content).toContain('**Question:**');
    expect(content).toContain('**Answer:**');
    // The empty state is one canonical string across every artifact type.
    expect(content).toContain('None — no specification debt was recorded.');
    // The legacy 7-column shape must not survive anywhere.
    expect(content).not.toContain('| ID | Description | Source Category |');
  });

  it('snippet carries its own well-formed voice tag', () => {
    const content = loadSnippets().get('spec-debt-section.md')!;
    // The tag moved into the snippet because `length: tables only` stopped
    // being true once detail prose joined the section — and because a value
    // duplicated across six templates drifts. The hosts no longer carry it.
    expect(content).toMatch(
      /## Specification Debt\n<!-- audience: reviewer; mode: reference; length: [^;]+; diagram: optional; examples: discouraged -->/,
    );
  });

  it('snippet contains no fenced code block', () => {
    // Load-bearing, and not obvious: all seven host sites embed this snippet
    // *inside* a ```markdown artifact fence. A fence in the snippet body would
    // close the host fence early. That breaks far more than this section —
    // the fence-extracting helpers in this file (extractFenceByAnchor and the
    // per-command Dependency Order regexes) would silently match the wrong
    // text, surfacing as failures about voice tags and dependency tables with
    // no visible connection to the real cause.
    const content = loadSnippets().get('spec-debt-section.md')!;
    expect(content).not.toContain('```');
    // Handlebars would re-process any expression left in the snippet body.
    expect(content).not.toContain('{{');
  });

  it('snippet composes via the {{>spec-debt-section}} partial', async () => {
    const snippets = loadSnippets();
    const partials: Record<string, string> = {};
    for (const [filename, content] of snippets) {
      partials[filename.replace(/\.md$/, '')] = content.trimEnd();
    }
    const renderer = new Dotprompt({ partials });
    const host = '# Host Template\n\n{{>spec-debt-section}}\n';
    const result = await resolveSnippets(host, renderer);
    expect(result).toContain('## Specification Debt');
    expect(result).toContain('| ID | Title | Source Category | Impact | Confidence | Origin |');
    expect(result).not.toContain('{{>spec-debt-section}}');
  });
});

describe('open-implementation-questions snippet', () => {
  // The second destination the kind gate needs. `## Specification Debt` is a
  // decision queue for a human; an unknown the implementer settles by building
  // is not a decision, and parking it in the debt table is what buries the few
  // real ones. `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit`
  // is the in-repo example: 12 debt rows on the spec, of which one was a
  // steering question. This section gives the rest a home so the gate can
  // reject them without losing them.

  it('snippet has no YAML frontmatter (raw Markdown per snippets README)', () => {
    const content = loadSnippets().get('open-implementation-questions.md')!;
    expect(content).not.toMatch(/^---\s*\n/);
  });

  it('snippet carries the IQ index table and its empty state', () => {
    const content = loadSnippets().get('open-implementation-questions.md')!;
    expect(content).toContain('| ID | Question | Slice | Settled By | Origin |');
    expect(content).toContain('IQ-001');
    // `Settled By` names how the question closes — never who to ask. Those
    // three values are the whole point: each one is a non-human resolver.
    expect(content).toContain('`building`');
    expect(content).toContain('`testing`');
    expect(content).toContain('`reading code`');
    expect(content).toContain('None — no open implementation questions.');
  });

  it('snippet keeps IQ numbering independent of the SD sequence', () => {
    const content = loadSnippets().get('open-implementation-questions.md')!;
    expect(content).toContain('independently of the `SD-NNN` sequence');
    // Provenance for a row demoted out of a parent's debt table lives in
    // Origin, so inheritance can reclassify without renumbering.
    expect(content).toContain('spec:SD-014');
  });

  it('snippet carries no lifecycle — the code is the answer', () => {
    // The deliberate difference from spec-debt-section: no Resolved
    // subsection, no answer column. A resolution ledger here would recreate
    // the bookkeeping the section exists to avoid.
    const content = loadSnippets().get('open-implementation-questions.md')!;
    expect(content).not.toContain('### Resolved');
    expect(content).not.toContain('**Answer:**');
  });

  it('snippet carries its own well-formed voice tag', () => {
    const content = loadSnippets().get('open-implementation-questions.md')!;
    expect(content).toMatch(
      /## Open Implementation Questions\n<!-- audience: builder; mode: reference; length: [^;]+; diagram: optional; examples: discouraged -->/,
    );
  });

  it('snippet contains no fenced code block', () => {
    // Same hazard as spec-debt-section: the host embeds this inside a
    // ```markdown artifact fence, so an inner fence would close it early.
    const content = loadSnippets().get('open-implementation-questions.md')!;
    expect(content).not.toContain('```');
    expect(content).not.toContain('{{');
  });

  it('snippet composes via the {{>open-implementation-questions}} partial', async () => {
    const snippets = loadSnippets();
    const partials: Record<string, string> = {};
    for (const [filename, content] of snippets) {
      partials[filename.replace(/\.md$/, '')] = content.trimEnd();
    }
    const renderer = new Dotprompt({ partials });
    const host = '# Host Template\n\n{{>open-implementation-questions}}\n';
    const result = await resolveSnippets(host, renderer);
    expect(result).toContain('## Open Implementation Questions');
    expect(result).toContain('| ID | Question | Slice | Settled By | Origin |');
    expect(result).not.toContain('{{>open-implementation-questions}}');
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
      'design',
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

describe('smithy.audit UI artifact routing', () => {
  let composed: ComposedTemplates;
  let audit: string;

  beforeAll(async () => {
    composed = await getComposedTemplates();
    audit = composed.commands.get('smithy.audit.md')!;
  });

  it('recognizes screen and flow durable artifacts as file-argument targets', () => {
    expect(audit).toContain('`.design.md` under `design/screens/`');
    expect(audit).toContain('Screen Design Annotation');
    expect(audit).toContain('`.flow.md` under `design/flows/`');
    expect(audit).toContain('Flow Definition');
  });

  it('routes UI artifact audits to the helper-skill contracts', () => {
    expect(audit).toContain('smithy.helper-screen-design');
    expect(audit).toContain('smithy.helper-flow-definition');
    expect(audit).toContain('review against its "Review checklist" section');
  });

  it('checks required screen contract fields and rationale-only body scope', () => {
    expect(audit).toContain('`component-path`');
    expect(audit).toContain('`design_system`');
    expect(audit).toContain('state inventories');
    expect(audit).toContain('do not judge visual fidelity');
  });

  it('checks required flow contract fields and excludes executable behavior', () => {
    expect(audit).toContain('`screens`');
    expect(audit).toContain('`test-body`');
    expect(audit).toContain('no matching `design/screens/<ScreenId>.design.md` annotation');
    expect(audit).toContain('ordered executable behavior');
  });

  it('keeps deployed audit guidance self-contained', () => {
    expect(audit).not.toContain('src/templates/');
    expect(audit).not.toContain('agent-skills/README.md');
    expect(audit).not.toContain('snippets/README.md');
  });
});

describe('getTemplateFilesByCategory', () => {
  it('returns the correct number of files per category', () => {
    const byCategory = getTemplateFilesByCategory();
    expect(byCategory.commands).toHaveLength(13);
    expect(byCategory.prompts).toHaveLength(2);
    expect(byCategory.agents).toHaveLength(14);
    expect(byCategory.skills).toHaveLength(8);
  });

  it('skills includes smithy.pr-review, smithy.status, smithy.gh-issue, smithy.helper-docker, smithy.helper-voice, smithy.helper-documentation, smithy.helper-screen-design, and smithy.helper-flow-definition', () => {
    const { skills } = getTemplateFilesByCategory();
    expect(skills).toContain('smithy.pr-review');
    expect(skills).toContain('smithy.status');
    expect(skills).toContain('smithy.gh-issue');
    expect(skills).toContain('smithy.helper-docker');
    expect(skills).toContain('smithy.helper-voice');
    expect(skills).toContain('smithy.helper-documentation');
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
    expect(commands).toContain('smithy.resolve.md');
    expect(commands).toContain('smithy.spark.md');
    expect(commands).toContain('smithy.engrave.md');
    expect(commands).toContain('smithy.persona.md');
    expect(commands).not.toContain('smithy.status.md');
  });

  it('prompts includes guidance and titles', () => {
    const { prompts } = getTemplateFilesByCategory();
    expect(prompts).toContain('smithy.guidance.md');
    expect(prompts).toContain('smithy.titles.md');
  });

  it('agents includes clarify, refine, implement, implementation-review, plan, plan-review, recall, reconcile, reconcile-slices, slice, prose, and survey', () => {
    const { agents } = getTemplateFilesByCategory();
    expect(agents).toContain('smithy.clarify.md');
    expect(agents).toContain('smithy.refine.md');
    expect(agents).toContain('smithy.implement.md');
    expect(agents).toContain('smithy.implementation-review.md');
    expect(agents).toContain('smithy.plan.md');
    expect(agents).toContain('smithy.plan-review.md');
    expect(agents).toContain('smithy.recall.md');
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
  let geminiComposed: ComposedTemplates;

  beforeAll(async () => {
    composed = await getComposedTemplates();
    claudeComposed = await getComposedTemplates('claude');
    codexComposed = await getComposedTemplates('codex');
    geminiComposed = await getComposedTemplates('gemini');
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

  // Issue #557: progressive disclosure. A skill directory may bundle
  // reference files the body links to but does not inline; the loader
  // surfaces them as `resources`, keyed by POSIX path relative to the skill
  // root, with `scripts/` and the SKILL.prompt itself excluded.
  it('skills map exposes bundled reference files as resources, excluding SKILL.prompt and scripts/', () => {
    const withResources = [...claudeComposed.skills].filter(([, s]) => s.resources.size > 0);
    // The four split skills are the current population; the assertion is
    // about the mechanism, so require at least one and check every entry.
    expect(withResources.length).toBeGreaterThan(0);
    for (const [name, skill] of claudeComposed.skills) {
      expect(skill.resources, name).toBeInstanceOf(Map);
      for (const [relPath, content] of skill.resources) {
        expect(relPath, name).not.toMatch(/^scripts\//);
        expect(relPath, name).not.toMatch(/SKILL\.(prompt|md)$/);
        expect(relPath, name).not.toMatch(/\.prompt$/);   // rendered → .md
        expect(relPath, name).not.toMatch(/^[/.]/);        // relative, no dot-entries
        expect(content.length, `${name}/${relPath}`).toBeGreaterThan(0);
      }
      // A skill's scripts and resources never overlap.
      for (const filename of skill.scripts.keys()) {
        expect(skill.resources.has(`scripts/${filename}`), name).toBe(false);
      }
    }
  });

  it('keeps a bundled binary as raw bytes instead of decoding it as utf8', async () => {
    // Only `.prompt` entries are decoded, because only they get rendered.
    // Reading a PNG/zip/fixture as utf8 would swap every invalid sequence for
    // U+FFFD and write the corruption back out, breaking the byte-for-byte
    // contract the non-`.prompt` path promises.
    const planted = path.join(
      skillsTemplateDir, 'smithy.helper-voice', 'references', 'fixture.bin',
    );
    // Bytes that are invalid UTF-8 (lone continuation, 0xFF, NUL).
    const bytes = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x41, 0xc3, 0x28]);
    fs.writeFileSync(planted, bytes);
    try {
      const reloaded = await getComposedTemplates('claude');
      const value = reloaded.skills.get('smithy.helper-voice')!.resources.get('references/fixture.bin');
      expect(Buffer.isBuffer(value)).toBe(true);
      expect((value as Buffer).equals(bytes)).toBe(true);
    } finally {
      fs.rmSync(planted, { force: true });
    }
  });

  it('every reference link in a SKILL body resolves to a file that skill owns', () => {
    // The reverse of the check below, and the one that catches a body linking
    // a sibling skill's file: `](references/x.md)` reads as "resolvable from
    // this skill's directory", so it must be. Prose that points at another
    // skill's bundle names the owning skill and is not written as a link.
    for (const [name, skill] of claudeComposed.skills) {
      const linked = [...skill.prompt.matchAll(/\]\((references\/[^)]+)\)/g)].map(m => m[1]!);
      for (const relPath of linked) {
        expect(skill.resources.has(relPath), `${name} links unowned ${relPath}`).toBe(true);
      }
    }
  });

  it('every bundled reference file is linked from the SKILL body that ships it', () => {
    // A bundled file nothing links to is dead weight the agent never loads,
    // and a link with no file behind it is a dangling reference. Both are
    // regressions this locks out.
    for (const [name, skill] of claudeComposed.skills) {
      for (const relPath of skill.resources.keys()) {
        expect(skill.prompt, `${name} does not link ${relPath}`).toContain(`(${relPath})`);
      }
    }
  });

  it('authors bundled prose as .prompt, keeping .md in the source tree "never deployed"', () => {
    // Every `.md` under src/templates/ is a README or a snippet — neither is
    // deployed. Authoring a bundled reference file as `.md` would break that
    // read of the tree AND cut it off from `{{artifactsRoot}}` / `{{#ifAgent}}`
    // / `{{>snippet}}`, which is how `{{artifactsRoot}}` ends up shipped as
    // literal text. Bundled prose is `.prompt` and deploys as `.md`.
    const skillDirs = fs.readdirSync(skillsTemplateDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
    const strayMarkdown: string[] = [];
    const walk = (dir: string, rel: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const childRel = `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), childRel);
        } else if (entry.name.endsWith('.md') && entry.name !== 'README.md') {
          strayMarkdown.push(childRel);
        }
      }
    };
    for (const name of skillDirs) walk(path.join(skillsTemplateDir, name), name);
    expect(strayMarkdown).toEqual([]);
  });

  it('every SKILL body stays under the 500-line ceiling Claude Code documents', () => {
    // Claude Code's guidance: keep SKILL.md under ~500 lines and move detail
    // into bundled files. This is the backstop that keeps a body from
    // creeping back up after issue #557 split the four biggest ones.
    for (const [name, skill] of claudeComposed.skills) {
      expect(skill.prompt.split('\n').length, name).toBeLessThan(500);
    }
  });

  it('every skill allowed-tools grant uses the one verified Bash grammar', () => {
    // Three wildcard grammars used to coexist across the permission surfaces
    // (issue #559). Bash rules are now written one way everywhere: a trailing
    // ` *`, never `:*`, and never a `*` glued to a command token — which
    // drops the word boundary, so `Bash(smithy status*)` also matched
    // `smithy statusfoo`. See docs/permission-grammar.md.
    for (const [name, skill] of claudeComposed.skills) {
      const grant = skill.prompt.match(/^allowed-tools:(.*)$/m)?.[1];
      if (grant === undefined) continue;
      for (const rule of grant.matchAll(/Bash\(([^)]*)\)/g)) {
        const pattern = rule[1]!;
        expect(pattern, `${name}: ${pattern}`).not.toContain(':*');
        expect(pattern, `${name}: ${pattern}`).not.toMatch(/[A-Za-z0-9_.-]\*/);
      }
    }
  });

  it('every skill reaches its bundled scripts through ${CLAUDE_SKILL_DIR}', () => {
    // Claude Code expands the variable in the rule and in the body alike, so
    // the grant matches the exact command the body names — no path-glob
    // guessing about where the skill got installed (issue #559).
    for (const [name, skill] of claudeComposed.skills) {
      const grant = skill.prompt.match(/^allowed-tools:(.*)$/m)?.[1];
      if (grant === undefined) continue;
      for (const rule of grant.matchAll(/Bash\(([^)]*\.sh[^)]*)\)/g)) {
        expect(rule[1], `${name}: ${rule[1]}`).toContain('${CLAUDE_SKILL_DIR}/scripts/');
      }
    }
  });

  it('smithy.status grants the CLI it wraps at a word boundary', () => {
    const skill = claudeComposed.skills.get('smithy.status')!;
    expect(skill.prompt).toContain('allowed-tools: Bash(smithy status *)');
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
    // gh-CLI script fallback. `${CLAUDE_SKILL_DIR}` is expanded by Claude
    // Code in the rule and in the body that names the script, so the grant
    // matches the exact command the skill tells the agent to run; the
    // argument suffix is the space-wildcard form (issue #559).
    expect(skill.prompt).toContain('Bash(${CLAUDE_SKILL_DIR}/scripts/find-pr.sh)');
    expect(skill.prompt).toContain('Bash(${CLAUDE_SKILL_DIR}/scripts/get-comments.sh *)');
    expect(skill.prompt).toContain('Bash(${CLAUDE_SKILL_DIR}/scripts/reply-comment.sh *)');
    expect(skill.prompt).toContain('Bash(${CLAUDE_SKILL_DIR}/scripts/add-comment.sh *)');
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
    expect(skill.prompt).not.toContain('./.gemini/skills/smithy.pr-review');
    // `${CLAUDE_SKILL_DIR}` survives composition in the shared frontmatter —
    // the Codex deployer is what drops the Claude grant (see
    // src/skill-frontmatter.ts and the codex deploy tests).
    const codexBody = skill.prompt.replace(/^---\n[\s\S]*?\n---\n/, '');
    expect(codexBody).not.toContain('${CLAUDE_SKILL_DIR}');
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

  it('smithy.persona renders the free-text persona writer contract', () => {
    const persona = claudeComposed.commands.get('smithy.persona.md')!;
    expect(persona).toContain('## Input Routing');
    expect(persona).toContain('If the resolved persona input is empty');
    expect(persona).toContain('command-argument placeholder');
    expect(persona).toContain('use it as the effective command input for');
    expect(persona).toContain('what persona to generate');
    expect(persona).toContain('continue directly through the two');
    expect(persona).toContain('mode-selection rules below');
    expect(persona).toContain('do not add an approval STOP');
    expect(persona).toContain('If the input ends in `.rfc.md`, select **RFC mode**');
    expect(persona).toContain('If the input is non-empty and does **not** end in `.rfc.md`, select');
    expect(persona).toContain('**free-text mode**');
    expect(persona).toContain('Dispatch **smithy-prose** with:');
    expect(persona).toContain('`section_assignment`: "Personas"');
    expect(persona).toContain('`idea_description`: the resolved persona input');
    expect(persona).toContain('Write one file at the target path using the canonical file shape');
    expect(persona).toContain('leave the existing file untouched');
    expect(persona).toContain('the skipped slug/path');
    expect(persona).toContain('## One-Shot Summary');
    expect(persona).toContain('one durable persona file was');
    expect(persona).toContain('written from free text with no intermediate approval gates');
    expect(persona).toContain('target persona slug already exists');
    expect(persona).toContain('written and skipped persona paths as explicit result');
  });

  it('smithy.persona renders RFC-mode routing, extraction, and persona writes', () => {
    const persona = claudeComposed.commands.get('smithy.persona.md')!;
    const routingIdx = persona.indexOf('If the input ends in `.rfc.md`, select **RFC mode**');
    const freeTextRoutingIdx = persona.indexOf(
      'If the input is non-empty and does **not** end in `.rfc.md`, select',
    );
    const rfcModeIdx = persona.indexOf('## RFC Mode');
    const freeTextModeIdx = persona.indexOf('## Free-Text Mode');

    expect(routingIdx).toBeGreaterThan(-1);
    expect(freeTextRoutingIdx).toBeGreaterThan(routingIdx);

    // The ask-fallback is the primary entry path on agents that leave
    // $ARGUMENTS literal, so a clarified answer must reach RFC mode too.
    expect(persona).toContain('Route the clarified answer by the same `.rfc.md`');
    expect(persona).toContain('an answer ending in `.rfc.md`');
    expect(persona).toContain('selects RFC mode, and any other clear answer selects free-text mode');

    expect(rfcModeIdx).toBeGreaterThan(freeTextRoutingIdx);
    expect(freeTextModeIdx).toBeGreaterThan(rfcModeIdx);

    const rfcMode = persona.slice(rfcModeIdx, freeTextModeIdx);
    expect(rfcMode).toContain('Read the input RFC file before drafting, writing');
    expect(rfcMode).toContain("Locate the RFC's `## Personas` section");
    expect(rfcMode).toContain('after that heading up to the next H2 heading');
    expect(rfcMode).toContain('Extract one persona candidate for each clearly named persona');
    expect(rfcMode).toContain('explicit');
    expect(rfcMode).toContain('bullet/list item, bold lead-in, or subheading');
    expect(rfcMode).toContain('Keep the extracted candidate set as a structured list');
    expect(rfcMode).toContain('its source of truth rather than rereading unrelated input');
    expect(rfcMode).toContain('For each RFC persona candidate, derive the filename slug');
    expect(rfcMode).toContain('Resolve each target path using the Persona Artifact Convention section');
    expect(rfcMode).toContain('Before drafting a candidate, check whether its target path already exists');
    expect(rfcMode).toContain('Continue processing the remaining candidates after any collision skip');
    expect(rfcMode).toContain('For each non-colliding candidate, dispatch **smithy-prose** with:');
    expect(rfcMode).toContain('`idea_description`: the candidate');
    expect(rfcMode).toContain('`rfc_file_path`: the resolved input RFC path');
    expect(rfcMode).toContain('Write one file per non-colliding candidate');
    expect(rfcMode).toContain('Each final file must contain exactly one persona');
    expect(rfcMode).toContain('Do not infer personas from');
    expect(rfcMode).toContain('narrative-only prose');
    expect(rfcMode).toContain('emit empty-section diagnostics');
  });

  it('smithy.persona renders RFC-mode collision reporting and summary fields', () => {
    const persona = claudeComposed.commands.get('smithy.persona.md')!;
    const rfcModeIdx = persona.indexOf('## RFC Mode');
    const summaryIdx = persona.indexOf('## One-Shot Summary');

    expect(rfcModeIdx).toBeGreaterThan(-1);
    expect(summaryIdx).toBeGreaterThan(rfcModeIdx);

    const rfcMode = persona.slice(rfcModeIdx, summaryIdx);
    const summary = persona.slice(summaryIdx);

    expect(rfcMode).toContain('add the candidate name, slug, and path to the skipped-collisions list');
    expect(rfcMode).toContain('leave the existing file untouched');
    expect(rfcMode).toContain('Continue processing the remaining candidates after any collision skip');
    expect(summary).toContain('For **RFC mode**, report only this block');
    expect(summary).toContain('Written persona paths');
    expect(summary).toContain('name/role and slug');
    expect(summary).toContain('Skipped collisions');
    expect(summary).toContain('target slug');
    expect(summary).toContain('Totals');
  });

  it('smithy.persona scopes each One-Shot Summary block to a single mode', () => {
    const persona = claudeComposed.commands.get('smithy.persona.md')!;
    const summary = persona.slice(persona.indexOf('## One-Shot Summary'));

    expect(summary).toContain('Report\nexactly one summary block');
    expect(summary).toContain('the blocks are mutually exclusive');
    expect(summary).toContain('For a successful **free-text mode** write, report:');
    expect(summary).toContain('For a **free-text mode** slug collision skip, report:');
    expect(summary).toContain(
      'the two free-text blocks above never\napply to an RFC run',
    );
    expect(summary).toContain(
      'In either mode, report the written and skipped persona paths',
    );

    // The RFC block must come last so its exclusivity clause can refer back to
    // the free-text blocks it supersedes.
    expect(summary.indexOf('For **RFC mode**, report only this block')).toBeGreaterThan(
      summary.indexOf('For a **free-text mode** slug collision skip, report:'),
    );
  });

  it('smithy.persona renders shared persona convention and artifact policy snippets across agents', async () => {
    const geminiComposed = await getComposedTemplates('gemini');
    for (const [agent, templates] of [
      ['claude', claudeComposed],
      ['codex', codexComposed],
      ['gemini', geminiComposed],
    ] as const) {
      const persona = templates.commands.get('smithy.persona.md')!;
      expect(persona, agent).toContain('## Authored Smithy Artifacts Location');
      expect(persona, agent).toContain('## Persona Artifact Convention');
      expect(persona, agent).toContain('docs/personas/<slug>.persona.md');
      expect(persona, agent).toContain('Persona files sit outside the `## Dependency Order` lineage');
      expect(persona, agent).not.toContain('{{>persona-convention}}');
      expect(persona, agent).not.toContain('{{artifactsRoot}}');
    }
  });

  it('smithy.ignite discovers and slug-matches durable personas before cold drafting', () => {
    const ignite = claudeComposed.commands.get('smithy.ignite.md')!;
    expect(ignite).toContain('## Persona Artifact Convention');
    expect(ignite).toContain('docs/personas/<slug>.persona.md');
    expect(ignite).not.toContain('{{>persona-convention}}');

    const subphase3bIdx = ignite.indexOf('Sub-phase 3b: Personas');
    const subphase3cIdx = ignite.indexOf('Sub-phase 3c: Goals + Out of Scope');
    expect(subphase3bIdx).toBeGreaterThan(-1);
    expect(subphase3cIdx).toBeGreaterThan(subphase3bIdx);
    const subphase3bBlock = ignite.slice(subphase3bIdx, subphase3cIdx);

    const discoveryIdx = subphase3bBlock.indexOf('Before drafting Personas cold');
    const dispatchIdx = subphase3bBlock.indexOf('dispatch **smithy-prose**');
    expect(discoveryIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(discoveryIdx);
    expect(subphase3bBlock).toContain('active artifacts root');
    expect(subphase3bBlock).toContain('derive deterministic kebab-case slugs');
    expect(subphase3bBlock).toMatch(/exact\s+filename-slug identity/);
    expect(subphase3bBlock).toContain('`<slug>.persona.md` covers');
    expect(subphase3bBlock).toMatch(/Avoid fuzzy\s+matching/);
    expect(subphase3bBlock).toContain('If no `.persona.md` files exist');
    expect(subphase3bBlock).not.toContain('coverage detection only');
    expect(subphase3bBlock).not.toContain('regardless of the match results');
  });

  it('smithy.ignite projects reusable personas and cold-drafts only uncovered gaps', () => {
    const ignite = claudeComposed.commands.get('smithy.ignite.md')!;
    const subphase3bIdx = ignite.indexOf('Sub-phase 3b: Personas');
    const subphase3cIdx = ignite.indexOf('Sub-phase 3c: Goals + Out of Scope');
    expect(subphase3bIdx).toBeGreaterThan(-1);
    expect(subphase3cIdx).toBeGreaterThan(subphase3bIdx);
    const subphase3bBlock = ignite.slice(subphase3bIdx, subphase3cIdx);

    const discoveryIdx = subphase3bBlock.indexOf('Before drafting Personas cold');
    const projectionIdx = subphase3bBlock.indexOf('For each covered persona, read the matching `.persona.md` file');
    const dispatchIdx = subphase3bBlock.indexOf('dispatch **smithy-prose** for only those gaps');
    expect(discoveryIdx).toBeGreaterThan(-1);
    expect(projectionIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(projectionIdx).toBeGreaterThan(discoveryIdx);
    expect(dispatchIdx).toBeGreaterThan(projectionIdx);
    expect(subphase3bBlock).toMatch(/preserve the\s+persona's role, context, and friction/);
    expect(subphase3bBlock).toContain('project it into the RFC-specific');
    expect(subphase3bBlock).toContain('narrowed to the uncovered persona names or roles');
    expect(subphase3bBlock).toContain('Do not regenerate personas covered by existing `.persona.md` files');
    expect(subphase3bBlock).toContain('If every needed persona is covered');
    expect(subphase3bBlock).toMatch(/do not\s+dispatch smithy-prose for Personas/);
    expect(subphase3bBlock).toContain('Combine the file-sourced projections and any cold-drafted uncovered gap content');
    expect(subphase3bBlock).toContain('exactly one `## Personas` section');
  });

  it('smithy.ignite re-discovers file-sourced personas during harmonize repair checks', () => {
    const ignite = claudeComposed.commands.get('smithy.ignite.md')!;
    const subphase3gIdx = ignite.indexOf('Sub-phase 3g: Harmonize');
    const phase4Idx = ignite.indexOf('## Phase 4', subphase3gIdx);
    expect(subphase3gIdx).toBeGreaterThan(-1);
    expect(phase4Idx).toBeGreaterThan(subphase3gIdx);
    const subphase3gBlock = ignite.slice(subphase3gIdx, phase4Idx);

    const provenanceIdx = subphase3gBlock.indexOf('Personas repair provenance pre-check');
    const repairIdx = subphase3gBlock.indexOf('3. **Personas repair.**');
    const dispatchIdx = subphase3gBlock.indexOf('re-dispatch **smithy-prose**');
    expect(provenanceIdx).toBeGreaterThan(-1);
    expect(repairIdx).toBeGreaterThan(provenanceIdx);
    expect(dispatchIdx).toBeGreaterThan(provenanceIdx);
    expect(subphase3gBlock).toMatch(/re-run the same\s+durable persona discovery and slug coverage procedure used by sub-phase\s+3b/);
    expect(subphase3gBlock).toContain('Read the **Persona Artifact Convention** above as the canonical');
    expect(subphase3gBlock).toContain('active artifacts root');
    expect(subphase3gBlock).toMatch(
      /list existing `\.persona\.md` files in that resolved persona\s+directory/,
    );
    expect(subphase3gBlock).toMatch(/derive\s+deterministic kebab-case slugs/);
    expect(subphase3gBlock).toMatch(/exact\s+filename-slug identity/);
    expect(subphase3gBlock).toContain('`<slug>.persona.md`');
    expect(subphase3gBlock).toContain('including resumes from an on-disk RFC');
    expect(subphase3gBlock).toContain('do not rely on');
    expect(subphase3gBlock).toContain('inline markers');
    expect(subphase3gBlock).toContain('sidecar files');
    expect(subphase3gBlock).toMatch(/interactive\s+selection/);
  });

  it('smithy.ignite classifies harmonize personas against durable file coverage', () => {
    const ignite = claudeComposed.commands.get('smithy.ignite.md')!;
    const subphase3gIdx = ignite.indexOf('Sub-phase 3g: Harmonize');
    const phase4Idx = ignite.indexOf('## Phase 4', subphase3gIdx);
    expect(subphase3gIdx).toBeGreaterThan(-1);
    expect(phase4Idx).toBeGreaterThan(subphase3gIdx);
    const subphase3gBlock = ignite.slice(subphase3gIdx, phase4Idx);

    expect(subphase3gBlock).toContain('from persona names or roles surfaced in');
    expect(subphase3gBlock).toContain('from the current on-disk `## Personas` section');
    expect(subphase3gBlock).toContain('Record matching personas as');
    expect(subphase3gBlock).toContain('file-sourced for harmonize/repair purposes');
    expect(subphase3gBlock).toContain('treat the matching durable');
    expect(subphase3gBlock).toContain('files as their source of truth');
    expect(subphase3gBlock).toContain('Personas with no matching durable file');
    expect(subphase3gBlock).toContain('remain eligible for the existing cold repair path');
    expect(subphase3gBlock).toContain('is not a repair failure solely because');
    expect(subphase3gBlock).toContain('projected from durable `.persona.md` files');
  });

  it('smithy.ignite re-projects file-sourced personas during harmonize repair', () => {
    const ignite = claudeComposed.commands.get('smithy.ignite.md')!;
    const subphase3gIdx = ignite.indexOf('Sub-phase 3g: Harmonize');
    const phase4Idx = ignite.indexOf('## Phase 4', subphase3gIdx);
    expect(subphase3gIdx).toBeGreaterThan(-1);
    expect(phase4Idx).toBeGreaterThan(subphase3gIdx);
    const subphase3gBlock = ignite.slice(subphase3gIdx, phase4Idx);

    const repairIdx = subphase3gBlock.indexOf('3. **Personas repair.**');
    const fileRepairIdx = subphase3gBlock.indexOf('For every persona recorded as file-sourced');
    const coldDispatchIdx = subphase3gBlock.indexOf('re-dispatch **smithy-prose** for only those gaps');
    expect(repairIdx).toBeGreaterThan(-1);
    expect(fileRepairIdx).toBeGreaterThan(repairIdx);
    expect(coldDispatchIdx).toBeGreaterThan(fileRepairIdx);
    expect(subphase3gBlock).toContain('read the matching `.persona.md` file again');
    expect(subphase3gBlock).toMatch(/Preserve the durable\s+persona's role, context, and friction/);
    expect(subphase3gBlock).toContain('re-projecting the');
    expect(subphase3gBlock).toContain('RFC-specific benefit language');
    expect(subphase3gBlock).toContain('not a byte-for-byte copy');
    expect(subphase3gBlock).toContain('must not be regenerated from clarify output');
    expect(subphase3gBlock).toMatch(/source\s+basis stays the matching durable file/);
  });

  it('smithy.ignite limits harmonize cold persona repair to uncovered gaps', () => {
    const ignite = claudeComposed.commands.get('smithy.ignite.md')!;
    const subphase3gIdx = ignite.indexOf('Sub-phase 3g: Harmonize');
    const phase4Idx = ignite.indexOf('## Phase 4', subphase3gIdx);
    expect(subphase3gIdx).toBeGreaterThan(-1);
    expect(phase4Idx).toBeGreaterThan(subphase3gIdx);
    const subphase3gBlock = ignite.slice(subphase3gIdx, phase4Idx);

    expect(subphase3gBlock).toContain('uncovered-persona repair gaps list');
    expect(subphase3gBlock).toContain('Covered personas MUST be');
    expect(subphase3gBlock).toContain('excluded from any cold Personas repair dispatch');
    expect(subphase3gBlock).toContain('re-dispatch **smithy-prose** for only those gaps');
    expect(subphase3gBlock).toContain('narrowed to the uncovered persona names or roles');
    expect(subphase3gBlock).toMatch(/Do not regenerate personas covered by\s+existing `\.persona\.md` files/);
    expect(subphase3gBlock).toMatch(/If every persona is file-sourced[\s\S]+do not dispatch\s+smithy-prose for Personas repair/);
    expect(subphase3gBlock).toContain('Combine the file-sourced re-projections and any cold-repaired uncovered gap');
    expect(subphase3gBlock).toContain('exactly one valid `## Personas` section');
    expect(subphase3gBlock).toContain('do not append a second Personas section');
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
    expect(skill.prompt).toContain('Bash(${CLAUDE_SKILL_DIR}/scripts/check-env.sh)');
    expect(skill.prompt).toContain('Bash(${CLAUDE_SKILL_DIR}/scripts/search-issues.sh *)');
    expect(skill.prompt).toContain('Bash(${CLAUDE_SKILL_DIR}/scripts/create-issue.sh *)');
    expect(skill.prompt).toContain('Bash(${CLAUDE_SKILL_DIR}/scripts/link-blocked-by.sh *)');
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

  it('smithy.forge renders sub-agent orchestration for Codex', () => {
    const forge = codexComposed.commands.get('smithy.forge.md')!;
    // Codex gained first-class subagent support, so it now renders the same
    // sub-agent dispatch branch as Claude rather than the inline degraded path.
    expect(forge).toContain('Dispatch a sub-agent for each task');
    expect(forge).toContain('smithy-implement');
    expect(forge).toContain('smithy-implementation-review');
    expect(forge).not.toContain('Use test-driven development for each task');
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
    // Auto-trigger description (frontmatter) must name the deliverable types
    // the skill covers, so calling agents recognize when to lazy-load it.
    const description = skill.prompt.match(/^description: "(.*)"$/m)![1]!;
    expect(description).toMatch(/drafting or reviewing prose/i);
    expect(description).toContain('migration plans');
    expect(description).toContain('ADRs');
    expect(description).toContain('runbooks');
    expect(description).toContain('READMEs');
    // The Role × Diátaxis-mode framing is the load-bearing claim of the
    // description — if it disappears, the skill no longer advertises its
    // actual content.
    expect(description).toMatch(/Role × Diátaxis-mode taxonomy/i);
    // Issue #555: trigger condition, not a table of contents. The skill is
    // reached through smithy.helper-documentation, so the description must
    // still say so — but the body's feature list stays in the body.
    expect(description).toMatch(/not a direct user entry point/i);
    expect(description.split(/\s+/).length).toBeLessThanOrEqual(55);
  });

  it('smithy.helper-voice body covers the section outline', () => {
    const skill = composed.skills.get('smithy.helper-voice')!;
    // Per issue #420, the body must cover every section of the outline.
    // Anchor on the numbered heading prefix so a regression that renumbers
    // or drops one section is caught. Issue #557 moved the two appendix
    // sections (worked examples, genre presets) out of the always-loaded
    // body; §9 is now the manifest that points at them.
    expect(skill.prompt).toContain('## 1. The two axes');
    expect(skill.prompt).toContain('## 2. Review-mode anti-pattern checklist');
    expect(skill.prompt).toContain('## 3. Voice rules per Role × Mode combination');
    expect(skill.prompt).toContain('## 4. Diagram guidance');
    expect(skill.prompt).toContain('## 5. Embedded examples — when code helps vs. hurts');
    expect(skill.prompt).toContain('## 6. Reference-prose anti-pattern');
    expect(skill.prompt).toContain('## 7. Depth-control rule');
    expect(skill.prompt).toContain('## 8. Audience tag grammar');
    expect(skill.prompt).toContain('## 9. Reference files — load on demand');
  });

  it('smithy.helper-voice bundles its appendix material as on-demand reference files', () => {
    const skill = composed.skills.get('smithy.helper-voice')!;
    // Issue #557: progressive disclosure. The always-loaded body links to
    // each bundled file, and the moved material must actually be in the
    // file the link names — a link with no file behind it is worse than
    // the inline version it replaced.
    for (const relPath of [
      'references/review-checklist.md',
      'references/audience-tags.md',
      'references/worked-examples.md',
      'references/genre-presets.md',
    ]) {
      expect(skill.resources.has(relPath)).toBe(true);
      expect(skill.prompt).toContain(`(${relPath})`);
    }
    // The worked before/after transformations and the non-Smithy genre
    // presets left the body but not the bundle.
    const examples = skill.resources.get('references/worked-examples.md')!;
    expect(examples).toContain('Wordy / depth-first Motivation');
    expect(examples).toContain('Commingled Requirements section');
    const genres = skill.resources.get('references/genre-presets.md')!;
    expect(genres).toMatch(/Migration plan/);
    expect(genres).toMatch(/ADR \(Architecture Decision Record\)/);
    expect(genres).toMatch(/Runbook/);
    // …and the body no longer carries them inline.
    expect(skill.prompt).not.toContain('Wordy / depth-first Motivation');
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
  });

  it('smithy.helper-voice review checklist names the prose-comprehension and self-check anti-patterns', () => {
    const skill = composed.skills.get('smithy.helper-voice')!;
    // The expanded review-mode checklist must cover the prose-comprehension
    // defects the original four structural anti-patterns missed, plus the
    // two review-pass self-checks. Anchor on the bolded check names so a
    // regression that quietly drops one fails the suite. Issue #557 moved
    // the checklist into a bundled reference file loaded in review mode.
    const checklist = skill.resources.get('references/review-checklist.md')!;
    expect(checklist).toBeDefined();
    expect(checklist).toContain('Unglossed terms-of-art');
    expect(checklist).toContain('Schema without a worked instance');
    expect(checklist).toContain('Internals leakage');
    expect(checklist).toContain('Conviction drift');
    expect(checklist).toContain('Bare cross-reference');
    expect(checklist).toContain('Authoring-process / author-directed commentary');
    expect(checklist).toContain("Diagram that doesn't earn its space");
    expect(checklist).toContain('Structural-vs-prose ratio');
    // Artifact-level commingling escalates to helper-documentation rather
    // than being retagged in place. That escalation stays in the
    // always-loaded body — it decides whether this skill runs at all.
    expect(skill.prompt).toContain('smithy.helper-documentation');
    expect(skill.prompt).toMatch(/Escalation — artifact-level commingling/);
  });

  // This rework: smithy.helper-documentation is the artifact-shape layer
  // above smithy.helper-voice. It is the user-facing entry point (voice
  // helper is reframed agent-only), runs a fit-for-purpose review, and
  // delegates prose cleanup down to the voice helper. These assertions
  // back-stop the deployment contract (body-only, frontmatter retained,
  // provider-neutral) and the review procedure (framing, audience
  // inventory, fit-for-purpose, artifact-quality review, recommendation,
  // navigation design, directed hand-off).
  it('smithy.helper-documentation is body-only (no scripts) with frontmatter retained', () => {
    const skill = composed.skills.get('smithy.helper-documentation');
    expect(skill).toBeDefined();
    expect(skill!.prompt).toMatch(/^---\s*\n/);
    expect(skill!.prompt).toContain('name: smithy.helper-documentation');
    expect(skill!.scripts.size).toBe(0);
  });

  it('smithy.helper-documentation body covers the procedure, artifact-quality review, and directed hand-off', () => {
    const skill = composed.skills.get('smithy.helper-documentation')!;
    // Step 1 frames how much structural freedom the document allows.
    expect(skill.prompt).toMatch(/governance and genre/i);
    expect(skill.prompt).toMatch(/template-governed/i);
    // The fit-for-purpose / split steps.
    expect(skill.prompt).toMatch(/Audience inventory/i);
    expect(skill.prompt).toMatch(/Fit-for-purpose check/i);
    expect(skill.prompt).toMatch(/Recommendation/);
    expect(skill.prompt).toMatch(/Navigation\/index design/i);
    // The mis-shaped heuristic is the load-bearing rule of the split decision.
    expect(skill.prompt).toMatch(/60%/);
    // The broadened artifact-quality review: presence, ordering, value.
    expect(skill.prompt).toMatch(/Artifact-quality review/i);
    expect(skill.prompt).toMatch(/completeness/i);
    expect(skill.prompt).toMatch(/Ordering \/ reading path/i);
    expect(skill.prompt).toMatch(/zero-value section/i);
    // The hand-off pulls in the voice helper and seeds it with findings so
    // its cleanup has direction rather than starting blind.
    expect(skill.prompt).toContain('Skill("smithy.helper-voice")');
    expect(skill.prompt).toMatch(/findings/i);
    // Cheap pass-through on well-shaped input keeps it from taxing healthy docs.
    expect(skill.prompt).toMatch(/pass-through/i);
  });

  it('smithy.helper-documentation is provider-neutral (no Claude/Gemini/Codex syntax in the body)', () => {
    const skill = composed.skills.get('smithy.helper-documentation')!;
    const body = skill.prompt.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
    expect(body).not.toMatch(/\$ARGUMENTS\b/);
    expect(body).not.toMatch(/allowed-tools\s*:/);
    expect(body).not.toMatch(/CLAUDE_SKILL_DIR/);
    expect(body).not.toMatch(/\.gemini\/skills/);
    expect(body).not.toMatch(/\.agents\/skills/);
  });

  it('narrative commands load smithy.helper-voice for direct prose authoring', () => {
    const commandNames = [
      'smithy.spark.md',
      'smithy.ignite.md',
      'smithy.strike.md',
      'smithy.engrave.md',
    ];

    for (const commandName of commandNames) {
      const command = composed.commands.get(commandName);
      expect(command, `${commandName} should be composed`).toBeDefined();
      expect(command!, `${commandName} should name the helper skill`).toContain(
        'Skill("smithy.helper-voice")',
      );
      expect(command!, `${commandName} should load the helper in draft mode`).toMatch(
        /draft mode/i,
      );
    }

    const spark = composed.commands.get('smithy.spark.md')!;
    expect(spark).toContain('Keep the Problem Statement path delegated to `smithy-prose`');

    const ignite = composed.commands.get('smithy.ignite.md')!;
    expect(ignite).toContain('Keep Summary, Motivation / Problem Statement, and Personas delegated');

    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).toContain('Reference and How-to sections as');

    const engrave = composed.commands.get('smithy.engrave.md')!;
    expect(engrave).toContain('preserving the decision schema');
    expect(engrave).toContain('preserving the invariant schema');
    expect(engrave).toContain('preserving the principle schema');
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
    // Auto-trigger description (frontmatter) must name the artifact path and
    // the two invocation modes (authoring + auditing) so calling agents
    // recognize when to lazy-load it.
    const description = skill.prompt.match(/^description: "(.*)"$/m)![1]!;
    expect(description).toContain('design/screens/<ScreenId>.design.md');
    expect(description).toMatch(/authoring or auditing/i);
    expect(description).toContain('kind: ui');
    // Issue #555: the description is a trigger condition, not a table of
    // contents. It must not summarize the body — the schema key list, the
    // skeleton template, and the worked example all live in the body, which
    // only loads once the skill is invoked. Every deployed repo pays for
    // this string in every session, so cap it.
    expect(description).not.toMatch(/skeleton template|worked .* example/i);
    expect(description.split(/\s+/).length).toBeLessThanOrEqual(55);
  });

  it('smithy.helper-screen-design body documents the four front-matter fields', () => {
    const skill = composed.skills.get('smithy.helper-screen-design')!;
    expect(skill.prompt).toContain('## YAML front-matter schema');
    for (const field of ['`id`', '`component-path`', '`design_system`', '`bundle`']) {
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
    // spec — the component owns layout/behavior, this file owns intent.
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
    // Issue #557 moved both out of the always-loaded body into a bundled
    // reference file; the body must link to it and the file must carry them.
    expect(skill.prompt).toContain('(references/examples.md)');
    const examples = skill.resources.get('references/examples.md')!;
    expect(examples).toBeDefined();
    expect(examples).toContain('## Skeleton — `design/screens/<ScreenId>.design.md`');
    expect(examples).toContain('## Worked example — `Library.design.md`');
    // Library example must be filled out, not a placeholder — at least the
    // component path and the rationale sections from the issue.
    expect(examples).toContain('id: Library');
    expect(examples).toContain('component-path:');
    expect(examples).toContain('LibraryScreen.kt');
    expect(examples).toContain('story-spider-design');
  });

  it('smithy.helper-screen-design ships a review checklist for the audit/lint surfaces', () => {
    const skill = composed.skills.get('smithy.helper-screen-design')!;
    // The checklist is what makes the skill usable by smithy.audit (and
    // later flow-lint #409) — it converts the prose contract into a
    // line-by-line list of findings. Guard the items that matter most.
    expect(skill.prompt).toContain('## Review checklist');
    expect(skill.prompt).toMatch(/Missing required front-matter key/i);
    expect(skill.prompt).toMatch(/component-path[\s\S]*does not resolve/i);
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
  // annotation) + one executable test body, keyed 1:1 by flat FlowId. The skill body is the single source
  // of truth for the YAML front-matter schema, the rationale-only body
  // rule, the driver-neutral selector contract, the testID naming convention,
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
    // two invocation modes (authoring + auditing), and the wire-phase
    // context, so calling agents recognize when to lazy-load it.
    const description = skill.prompt.match(/^description: "(.*)"$/m)![1]!;
    expect(description).toContain('design/flows/<FlowId>.flow.md');
    expect(description).toContain('<test-body>');
    expect(description).toMatch(/authoring or auditing/i);
    expect(description).toContain('kind: ui');
    expect(description).toMatch(/phase:\s*wire/);
    // Issue #555: the description is a trigger condition, not a table of
    // contents. It must not summarize the body — the schema key list, the
    // skeleton template, and the worked example all live in the body, which
    // only loads once the skill is invoked. Every deployed repo pays for
    // this string in every session, so cap it.
    expect(description).not.toMatch(/skeleton template|worked .* example/i);
    expect(description.split(/\s+/).length).toBeLessThanOrEqual(55);
  });

  it('smithy.helper-flow-definition body documents the three front-matter fields', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition')!;
    expect(skill.prompt).toContain('## YAML front-matter schema');
    for (const field of ['`id`', '`screens`', '`test-body`']) {
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
    // parallel narration of the test body — the test body owns the steps, the
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

  it('smithy.helper-flow-definition pins the driver-neutral selector contract (testIDs, not visible text)', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition')!;
    // Issue #406's load-bearing rule: selectors keyed to testIDs /
    // accessibility IDs / semantic tags — never visible text or layout
    // position. The executable test body becomes useless if this rule softens.
    expect(skill.prompt).toMatch(/testID/);
    expect(skill.prompt).toMatch(/accessibility/i);
    expect(skill.prompt).toMatch(/never visible text/i);
    expect(skill.prompt).toMatch(/never[^\n]*layout position/i);
    // The "asserts traversal AND guards" rule — a flow that only walks
    // the happy path is a smoke test, not a durable flow.
    expect(skill.prompt).toMatch(/traversal/i);
    expect(skill.prompt).toMatch(/guard/i);
    expect(skill.prompt).toMatch(/cannot reach\s+confirm without a valid URL/i);
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
    // Issue #557 moved both out of the always-loaded body into a bundled
    // reference file; the body must link to it and the file must carry them.
    expect(skill.prompt).toContain('(references/examples.md)');
    const examples = skill.resources.get('references/examples.md')!;
    expect(examples).toBeDefined();
    expect(examples).toContain('## Skeleton — `design/flows/<FlowId>.flow.md`');
    expect(examples).toContain('## Worked example');
    // AddTitle example must be filled out (not a placeholder), with both
    // halves of the pair: front-matter for `.flow.md` and a testID-keyed
    // executable test body exercising the URL guard.
    expect(examples).toContain('design/flows/AddTitle.flow.md');
    expect(examples).toContain('maestro/flows/AddTitle.yaml');
    expect(examples).toMatch(/id:\s*AddTitle/);
    expect(examples).toMatch(/screens:\s*\[Library,\s*AddTitle\]/);
    expect(examples).toMatch(/test-body:\s*maestro\/flows\/AddTitle\.yaml/);
    // The executable test body must include the URL-guard assertion the issue calls
    // out: confirm is not visible until URL is valid.
    expect(examples).toContain('add-title-url-field');
    expect(examples).toContain('add-title-confirm-button-enabled');
    expect(examples).toMatch(/assertNotVisible/);
  });

  it('smithy.helper-flow-definition documents the audio-service coverage caveat once', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition')!;
    // Coverage caveat: UI-driver flow tests cover navigable bookends.
    // Audio-service behaviors (auto-advance under lock, foreground TTS)
    // need instrumentation-level tests. A green UI-driver run must NOT
    // imply TTS coverage.
    expect(skill.prompt).toMatch(/navigable bookends/i);
    expect(skill.prompt).toMatch(/auto-advance/i);
    expect(skill.prompt).toMatch(/foreground TTS/i);
    expect(skill.prompt).toMatch(/instrumentation/i);
    expect(skill.prompt).toMatch(/must not be read as TTS coverage/i);
    // Issue #557 also deduped it: the body stated the caveat three times
    // (body-shape row, worked example, standalone section). One statement
    // in the body now, plus the example's own caveat in the reference file.
    expect(skill.prompt.match(/must not be read as TTS coverage/gi)!.length).toBe(1);
    expect(skill.prompt).not.toContain('## Coverage caveat — applies to every audio-touching flow');
  });

  it('smithy.helper-flow-definition ships a review checklist for the audit/lint surfaces', () => {
    const skill = composed.skills.get('smithy.helper-flow-definition')!;
    // The checklist is what makes the skill usable by smithy.audit (and
    // later flow-lint #409) — it converts the prose contract into a
    // line-by-line list of findings. Guard the items that matter most.
    expect(skill.prompt).toContain('## Review checklist');
    expect(skill.prompt).toMatch(/Missing required front-matter key/i);
    expect(skill.prompt).toMatch(/test-body[\s\S]*does not resolve/i);
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
    // are the failure modes the executable test body guards against.
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

  it('status skill defers the engraved payload contract to a bundled reference file', () => {
    const skill = composed.skills.get('smithy.status')!;
    // Issue #557: the engraved inventory answers a minority of questions, so
    // its wire shape moved out of the always-loaded body. The engraved branch
    // must still name the command and point at the file that describes the
    // payload, and the payload fields must live in that file.
    expect(skill.prompt).toContain('smithy status --engraved --format json');
    expect(skill.prompt).toContain('(references/engraved-inventory.md)');
    expect(skill.prompt).not.toContain('## Engraved inventory');
    const engraved = skill.resources.get('references/engraved-inventory.md')!;
    expect(engraved).toBeDefined();
    expect(engraved).toContain('`levels`');
    expect(engraved).toContain('`project`');
    expect(engraved).toContain('status_drift');
    expect(engraved).toContain('id_level_mismatch');
    expect(engraved).toContain('frontmatter_mismatch');
    expect(engraved).toMatch(/project > repo > user/);
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
      'argument-hint: "[<artifact-path>]"\n' +
      'disable-model-invocation: true\n' +
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

  it('recall agent is read-only, non-interactive, and returns the engraved recall contract', () => {
    const recall = composed.agents.get('smithy.recall.md')!;
    expect(recall).toBeDefined();
    expect(recall).toContain('name: smithy-recall');
    expect(recall).toMatch(/tools:\s*\n\s+-\s+Read\s*\n\s+-\s+Grep\s*\n\s+-\s+Glob/);
    expect(recall).not.toMatch(/^\s*-\s+Edit\b/m);
    expect(recall).not.toMatch(/^\s*-\s+Write\b/m);
    expect(recall).not.toMatch(/^\s*-\s+Bash\b/m);
    expect(recall).toContain('It is not user-invocable');
    expect(recall).toContain('Non-interactive');
    expect(recall).toContain('domain`, `topics`, `scope`, and `applies_to`');
    expect(recall).toContain('"relevant"');
    expect(recall).toContain('"conflicts"');
    expect(recall).toContain('"superseded_citations"');
    expect(recall).toContain('"empty"');
    expect(recall).toContain('"empty_reason"');
  });

  it('recall agent handles invariant exceptions, retired citations, and empty states', () => {
    const recall = composed.agents.get('smithy.recall.md')!;
    expect(recall).toContain('candidate new exception');
    expect(recall).toContain('Accepted:');
    expect(recall).toContain('Temporary:');
    expect(recall).toContain('empty placeholder ledger row');
    expect(recall).toContain('status` is `superseded` or `deprecated`');
    expect(recall).toContain('Do not independently derive supersession');
    expect(recall).toContain('"no_records"');
    expect(recall).toContain('"no_match"');
  });

  it('planning command templates wire inline engraved-knowledge consultation blocks', () => {
    const commandTemplatesDir = path.join(
      process.cwd(),
      'src/templates/agent-skills/commands',
    );
    const planningCommands = [
      'smithy.strike.prompt',
      'smithy.ignite.prompt',
      'smithy.render.prompt',
      'smithy.mark.prompt',
      'smithy.cut.prompt',
    ];

    for (const filename of planningCommands) {
      const template = fs.readFileSync(path.join(commandTemplatesDir, filename), 'utf8');
      expect(template, filename).toContain('### Engraved-Knowledge Consultation');
      expect(template, filename).toContain('{{#ifAgent}}');
      expect(template, filename).toContain('Dispatch the **smithy-recall** sub-agent');
      expect(template, filename).toContain('{{else}}');
      expect(template, filename).toContain('{{/ifAgent}}');
      // The invariant advisory-handling prose and the degraded direct-read
      // branch are shared through snippets, not restated inline per command.
      // Only the per-command dispatch context (planning context, description,
      // paths, domain hint) stays inline.
      expect(template, filename).toContain('{{>engraved-recall-advisory}}');
      expect(template, filename).toContain('{{>engraved-recall-degraded}}');
      // The command must not reach past the degraded snippet to include the
      // rules partial directly — the shared prose is single-sourced now.
      expect(template, filename).not.toContain('{{>engraved-recall-rules}}');
    }
  });

  it('sub-agent-capable planning commands dispatch smithy-recall during scan', () => {
    const planningCommands = [
      'smithy.strike.md',
      'smithy.ignite.md',
      'smithy.render.md',
      'smithy.mark.md',
      'smithy.cut.md',
    ];

    for (const templates of [claudeComposed, codexComposed]) {
      for (const commandName of planningCommands) {
        const command = templates.commands.get(commandName)!;
        expect(command, commandName).toContain('### Engraved-Knowledge Consultation');
        expect(command, commandName).toContain('Dispatch the **smithy-recall** sub-agent');
        expect(command, commandName).toContain('Planning context');
        expect(command, commandName).toContain('Domain hint');
        expect(command, commandName).toMatch(/candidate\s+invariant conflicts/);
        expect(command, commandName).toMatch(/superseded\/deprecated\s+citation\s+hazards/);
        expect(command, commandName).toMatch(/If\s+recall\s+returns `empty: true`[\s\S]*proceed normally/);
        expect(command, commandName).not.toContain('{{#ifAgent}}');
        expect(command, commandName).not.toContain('{{>engraved-recall-rules}}');
      }
    }
  });

  it('hands recall the project and nothing it can resolve itself', () => {
    // The parent's primary context pays for every line of this block, five
    // times over. Recall resolves the store roots from its own canonical
    // table, so the only input worth spending parent context on is the
    // project slug — the one fact recall cannot see.
    const templatesDir = path.join(process.cwd(), 'src/templates/agent-skills/commands');
    for (const filename of [
      'smithy.strike.prompt',
      'smithy.ignite.prompt',
      'smithy.render.prompt',
      'smithy.mark.prompt',
      'smithy.cut.prompt',
    ]) {
      const template = fs.readFileSync(path.join(templatesDir, filename), 'utf8');
      expect(template, filename).toContain('{{>engraved-recall-dispatch}}');
    }

    for (const templates of [claudeComposed, codexComposed]) {
      for (const commandName of [
        'smithy.strike.md',
        'smithy.ignite.md',
        'smithy.render.md',
        'smithy.mark.md',
        'smithy.cut.md',
      ]) {
        const command = templates.commands.get(commandName)!;
        // Measure the consultation block itself — the rest of the command
        // includes the artifact-location policy, which legitimately names the
        // engraved stores for the commands that author records.
        const start = command.indexOf('### Engraved-Knowledge Consultation');
        expect(start, commandName).toBeGreaterThan(-1);
        // The dispatch half — everything before the result-handling heading.
        const dispatch = command.slice(start, command.indexOf('### Handling the recall result'));

        // What the parent genuinely owns on the dispatch side: resolving the
        // project, which is the one input recall cannot see for itself.
        expect(dispatch, commandName).toContain('**Project**');
        expect(dispatch, commandName).toContain('--project <slug>');
        // What it does not: the store-root tables. Those belong to recall (and
        // to the degraded branch, which has no sub-agent to delegate to).
        expect(dispatch, commandName).not.toContain('~/.smithy/decisions/');
        expect(dispatch, commandName).not.toContain('docs/invariants/');
        expect(dispatch, commandName).not.toContain('**Scan roots**');

        // Result handling stays: precedence and severity escalation are the
        // parent's job and cannot be delegated to the sub-agent.
        expect(command, commandName).toContain('project > repo > user');
        expect(command, commandName).toMatch(/`severity`/);
      }
    }
  });

  it('keeps the scan roots in the degraded branch, which has no sub-agent', () => {
    for (const commandName of [
      'smithy.strike.md',
      'smithy.ignite.md',
      'smithy.render.md',
      'smithy.mark.md',
      'smithy.cut.md',
    ]) {
      const command = composed.commands.get(commandName)!;
      expect(command, commandName).toContain('~/.smithy/decisions/');
      expect(command, commandName).toContain('~/.smithy/projects/<project>/decisions/');
    }
  });

  it('engrave resolves a level before anything else and keeps counters per level', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    expect(engrave).toContain('## Phase 0: Resolve the level');
    expect(engrave).toContain('--level user|repo|project');
    // Level-prefixed ids: the collision that made a bare citation ambiguous.
    expect(engrave).toContain('`U-D-1`');
    expect(engrave).toContain('`PJ-INV-1`');
    expect(engrave).toContain('Counters never cross');
    // A narrower level carves out an exception; it never supersedes upward.
    expect(engrave).toContain('excepts');
    expect(engrave).toMatch(/Supersession is \*\*same-level only\*\*/);
  });

  it('audit covers engraved records, with the CLI inventory as its context', () => {
    const audit = composed.commands.get('smithy.audit.md')!;
    expect(audit).toContain('`.decision.md`');
    expect(audit).toContain('`.invariant.md`');
    expect(audit).toContain('Audit Checklist (engraved records');
    expect(audit).toContain('smithy status --engraved --format json');
    // The machine-checkable claims the checklist exists to enforce.
    expect(audit).toContain('id_level_mismatch');
    expect(audit).toContain('ledger.status_drift');
    expect(audit).toContain('Supersession Symmetry');
  });

  it('degraded planning commands retain direct engraved recall rules', () => {
    const planningCommands = [
      'smithy.strike.md',
      'smithy.ignite.md',
      'smithy.render.md',
      'smithy.mark.md',
      'smithy.cut.md',
    ];

    for (const templates of [composed, geminiComposed]) {
      for (const commandName of planningCommands) {
        const command = templates.commands.get(commandName)!;
        expect(command, commandName).toContain('### Engraved-Knowledge Consultation');
        expect(command, commandName).toContain('Read engraved durable knowledge directly');
        expect(command, commandName).toContain('## Engraved Recall Rules');
        expect(command, commandName).toContain('docs/decisions/');
        expect(command, commandName).toContain('candidate new exception');
        expect(command, commandName).toContain('superseded_citations');
        expect(command, commandName).toContain('empty_reason');
        expect(command, commandName).not.toContain('{{#ifAgent}}');
        expect(command, commandName).not.toContain('{{>engraved-recall-rules}}');
      }
    }
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

  it('mark template routes selected feature metadata by kind', () => {
    const mark = composed.commands.get('smithy.mark.md')!;
    expect(mark).toContain('### Feature Kind Path');
    expect(mark).toContain('Backend spec-triad path');
    expect(mark).toContain('UI authoring path');
    expect(mark).toContain('No `kind` field');
    expect(mark).toContain("selected feature's fenced `yaml` metadata block");
    expect(mark).toContain('feature-number validation');
    expect(mark).toContain('auto-selection semantics');
  });

  it('mark template defines the typed UI spec ledger', () => {
    const mark = composed.commands.get('smithy.mark.md')!;
    expect(mark).toContain('### UI Authoring Path Spec Ledger');
    expect(mark).toContain('| ID | Kind | Title | Depends On | Design | Artifact |');
    expect(mark).toContain('| SC1 | screen |');
    expect(mark).toContain('| FL1 | flow |');
    expect(mark).toContain('| US1 | story |');
    expect(mark).toContain('`SC<N>` for screen-build rows');
    expect(mark).toContain('`FL<N>` for flow-wire rows');
    expect(mark).toContain('`US<N>` for backend story rows');
    expect(mark).toContain('`Depends On` is exactly `—` or a comma-separated list of same-table IDs');
    expect(mark).toContain('`Design` is required for `screen` rows');
    expect(mark).toContain('`Artifact` is `—` for every row in mark');
    expect(mark).toContain('mark never');
    expect(mark).toContain('pre-fills a tasks path');
  });

  it('mark template keeps UI ledger rows pointer-only and allows minimal graphs', () => {
    const mark = composed.commands.get('smithy.mark.md')!;
    expect(mark).toContain('→ design/screens/<ScreenId>.design.md');
    expect(mark).toContain('→ design/flows/<FlowId>.flow.md');
    expect(mark).toContain('must not carry layout');
    expect(mark).toContain('state, interaction-step, visual-positioning');
    expect(mark).toContain('Flow rows are first-class `FL<N>` rows');
    expect(mark).toContain('not entries in a `flows: [...]` list');
    expect(mark).toContain('UI Spec Ledger and Screen/Flow node entities in the data model');
    expect(mark).toContain('A single pass-through screen');
    expect(mark).toMatch(/one `SC<N>`\s+row/);
    expect(mark).toContain('full UI ledger column set');
    expect(mark).toContain('Do not add UI-only columns');
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
      'Backend story table: `specs/<folder>/<NN>-<story-slug>.tasks.md`',
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

  it('cut template routes typed UI ledger nodes by kind', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    expect(cut).toContain('Typed UI Ledger Node Slicing');
    expect(cut).toContain('`ID | Kind | Title | Depends On | Design | Artifact`');
    expect(cut).toContain('`FL<N>`, and `US<N>` rows');
    expect(cut).toContain('Treat this as node-kind work, not as a');
    expect(cut).toContain('backend-only user-story list');
    expect(cut).toContain('`SC<N>` / `screen` rows');
    expect(cut).toContain('screen-build task planning');
    expect(cut).toContain('`FL<N>` / `flow` rows');
    expect(cut).toContain('flow-wire task planning');
    expect(cut).toContain('`US<N>` / `story` rows inside a typed UI ledger');
    expect(cut).toContain('existing');
    expect(cut).toContain('backend-story task planning');
  });

  it('cut template writes node-specific UI task artifacts', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    expect(cut).toContain('`<node-id-lower>-<node-slug>.tasks.md`');
    expect(cut).toContain('`sc1-add-title-screen.tasks.md`');
    expect(cut).toContain('`fl2-add-title-success.tasks.md`');
    expect(cut).toContain('**Node ID**: <SC1|FL1|US1>');
    expect(cut).toContain('**Node Kind**: <screen-build|flow-wire|backend-story>');
    expect(cut).toContain('**Durable Artifact**: `<design/screens/...design.md>` | `<design/flows/...flow.md>` | —');
    expect(cut).toContain('**Design Metadata**: <design_system/flag/bundle pointers available from the spec context, or —>');
    expect(cut).toContain('**Test Body**: `<repo-relative test-body path>`');
    expect(cut).toContain('they are not inherently atomic');
  });

  it('cut template preserves UI ledger dependency integrity and write-back', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    expect(cut).toContain('validate dependency integrity before any tasks file is');
    expect(cut).toContain('Every `Depends On` entry must be `—` or a comma-separated list of IDs');
    expect(cut).toContain('A mock-satisfiable flow');
    expect(cut).toContain('real-data flow may depend on its');
    expect(cut).toContain('screen node(s) plus backend `US` nodes');
    expect(cut).toContain('abort before writing');
    expect(cut).toContain('or modifying any artifact');
    expect(cut).toContain('typed UI ledgers use');
    expect(cut).toContain('`ID | Kind | Title | Depends On | Design | Artifact`');
    expect(cut).toContain('Do not touch the `ID`, `Kind`, `Title`, `Depends On`, or `Design` cells');
    expect(cut).toContain('cut may fill');
    expect(cut).toContain('`Artifact` cells but must not invent new screen, flow, or story rows');
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

    const cutMarkdownBlock = extractFenceByAnchor(cut, '# Tasks: <User Story Title>');
    const debtIdx = cutMarkdownBlock.indexOf('## Specification Debt');
    const dependencyIdx = cutMarkdownBlock.indexOf('## Dependency Order');

    expect(debtIdx).toBeGreaterThan(-1);
    expect(dependencyIdx).toBeGreaterThan(-1);

    expect(debtIdx).toBeLessThan(dependencyIdx);
  });

  it('cut template contains ## Open Implementation Questions between debt and dependency order', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    expect(cut).toBeDefined();

    // Scope to the tasks-file template fence. Bare `indexOf` over the whole
    // command measures whichever mention comes first in the prose, which is
    // not the artifact's section order — cut discusses `## Dependency Order`
    // in Phase 0 long before the template block.
    const fence = extractFenceByAnchor(cut, '# Tasks: <User Story Title>');
    const debtIdx = fence.indexOf('## Specification Debt');
    const questionsIdx = fence.indexOf('## Open Implementation Questions');
    const dependencyIdx = fence.indexOf('## Dependency Order');

    expect(questionsIdx).toBeGreaterThan(-1);
    expect(questionsIdx).toBeGreaterThan(debtIdx);
    expect(questionsIdx).toBeLessThan(dependencyIdx);

    // The partial must have been resolved, and the section must arrive with
    // its table shape intact.
    expect(cut).not.toContain('{{>open-implementation-questions}}');
    expect(cut).toContain('| ID | Question | Slice | Settled By | Origin |');
  });

  it('cut acts on the routed destination rather than re-deriving it', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    // Both plan-review dispatch sites (Phase 0c and Phase 5) compose the
    // destination mapping, so the count also proves neither site went back to
    // hand-copying a consequence table.
    const mappings = cut.match(/^\|\s*`debt`\s*\|/gm) ?? [];
    expect(mappings.length).toBe(2);
    const debtRoutes = cut.match(/For each `debt` finding, append a row/g) ?? [];
    expect(debtRoutes.length).toBe(2);
    const iqRoutes = cut.match(/For each `iq` finding, append a row/g) ?? [];
    expect(iqRoutes.length).toBe(2);
    // The grading axes reach cut only as fields it may cite, never as rows it
    // triages on — that derivation belongs to smithy-plan-review now.
    expect(cut).not.toContain('kind × severity ×');
    expect(cut).not.toMatch(/^\|\s*`?(steering|implementation|hygiene)`?\s*\|/m);
  });

  it('every review-dispatching command composes the destination mapping', () => {
    // Issue #553: the parent-side table was hand-copied twice each into mark,
    // cut, ignite and render and once each into strike and forge, and had
    // already diverged — ignite's Phase 0c mandated a debt "Description
    // column" the index has never had while its own second copy mandated the
    // detail-section shape. Composition is what makes that unrepresentable,
    // so assert on the source templates, not just the rendered output.
    // Issue #580 shrank what those sites compose from the kind × severity ×
    // confidence derivation to the four-row consequence of `destination`.
    const sources: Array<[string, string]> = [
      ['commands/smithy.mark.prompt', '2'],
      ['commands/smithy.cut.prompt', '2'],
      ['commands/smithy.ignite.prompt', '2'],
      ['commands/smithy.render.prompt', '2'],
      ['commands/smithy.strike.prompt', '1'],
      // forge composes twice: the sub-agent branch and the degraded inline one.
      ['commands/smithy.forge.prompt', '2'],
    ];
    for (const [file, expected] of sources) {
      const src = fs.readFileSync(
        path.join(__dirname, 'templates/agent-skills', file),
        'utf8',
      );
      const uses = src.match(/\{\{>plan-review-triage\}\}/g) ?? [];
      expect(uses.length, `${file} composition count`).toBe(Number(expected));
      // Each composition site binds the two terms the snippet leaves open.
      // These bindings wrap across lines, so collapse whitespace first.
      const flat = src.replace(/\s+/g, ' ');
      expect(flat, `${file} must bind the target artifact`).toMatch(
        /\*\*[Tt]he target artifact\*\*/,
      );
      expect(flat, `${file} must bind the review note surface`).toMatch(
        /\*\*[Tt]he review note surface\*\*/,
      );
      // No hand-written consequence table may survive beside the composed one.
      expect(src, `${file} still hand-copies a triage row`).not.toMatch(
        /^\|\s*`?(steering|implementation|hygiene)`?\s*\|/m,
      );
      // Nor the derivation itself, which is the agent's job now.
      expect(src, `${file} restates the triage derivation`).not.toContain(
        'kind × severity ×',
      );
      // Both bindings ride the dispatch so the agent can resolve `iq` vs
      // `note` before returning, rather than the parent resolving it after.
      expect(flat, `${file} must pass the bindings to the agent`).toMatch(
        /\*\*target_artifact\*\* and \*\*review_note_surface\*\*/,
      );
    }
  });

  it('scopes the Implementation questions heading to note-routed findings', () => {
    // The artifacts that carry no `## Open Implementation Questions` section
    // report the unknown in their PR body instead. That bucket is the `note`
    // route specifically — a Critical `implementation` finding that was
    // applied is also reported on the note surface, and filing it under
    // "questions" would describe a landed fix as an open unknown.
    for (const name of ['smithy.mark.md', 'smithy.render.md', 'smithy.ignite.md']) {
      const body = composed.commands.get(name)!;
      const headings = body.match(/\*\*Implementation questions\*\* heading/g) ?? [];
      expect(headings.length, `${name} questions-heading sites`).toBe(2);
      const flat = body.replace(/\s+/g, ' ');
      const scoped = flat.match(
        /report a `note` finding whose `kind` is `implementation` there under an \*\*Implementation questions\*\* heading/g,
      ) ?? [];
      expect(scoped.length, `${name} must scope the heading to note findings`).toBe(2);
    }
  });

  it('passes strike its drift severity floor before the agent routes', () => {
    // Strike floors assumption-output drift at Critical so it cannot be
    // dismissed as a Minor note. Severity is now an input to the agent's
    // destination derivation, so the floor has to reach the dispatch — left
    // downstream of the composed mapping it would describe a re-derivation
    // the parent is explicitly told not to perform.
    const strike = composed.commands.get('smithy.strike.md')!;
    const flat = strike.replace(/\s+/g, ' ');
    expect(flat).toContain('**severity floor** — grade every assumption-output drift finding `Critical`');
    // The floor is stated before the mapping, not as a second triage after it.
    const floorIdx = strike.indexOf('**severity floor**');
    const mappingIdx = strike.indexOf('| `destination` | This command does |');
    expect(floorIdx).toBeGreaterThan(-1);
    expect(mappingIdx).toBeGreaterThan(floorIdx);
    // No leftover parent-side re-derivation of the drift consequence.
    expect(flat).not.toContain('Treat drift findings as Critical for routing');
    expect(flat).not.toMatch(/apply the fix only when confidence is High/);
  });

  it('no command triage table lets a steering finding be auto-applied', () => {
    // The "steering is never auto-applied" rule has to hold at every rendered
    // site. It did not: forge's hand-copied table wrote its columns at a
    // different width and kept an `Any` kind + High row, which auto-applied
    // exactly the findings the shared protocol reserves for a human. The
    // table is composed now, and this sweeps all six rather than trusting it.
    for (const name of [
      'smithy.cut.md',
      'smithy.ignite.md',
      'smithy.mark.md',
      'smithy.render.md',
      'smithy.strike.md',
      'smithy.forge.md',
    ]) {
      const body = composed.commands.get(name)!;
      expect(body, `${name} should be composed`).toBeDefined();
      // No apply row may match every kind — that is how steering slipped
      // through — and no steering row may carry High confidence.
      const applyRows = body.match(/^\|\s*Any\s*\|[^|]*\|\s*High\s*\|/gm) ?? [];
      expect(applyRows, `${name} has a kind-agnostic auto-apply row`).toEqual([]);
      expect(body, `${name} lets a steering finding auto-apply`).not.toMatch(
        /`steering`\s*\|[^|]*\|\s*High\s*\|/,
      );
      // Issue #580: the same rule, now enforced on the field the parent
      // actually reads. No rendered site may pair `steering` with `apply`.
      for (const line of body.split('\n')) {
        if (!/`steering`/.test(line)) continue;
        expect(line, `${name} routes a steering finding to apply`).not.toMatch(
          /`apply`/,
        );
      }
    }
  });

  it('every review surface routes a steering finding to debt, never apply', async () => {
    // Issue #580: the guarantee is structural, not advisory — a `steering`
    // finding has no `apply` cell to land in. Sweep the composed review
    // agents as well as the commands, and both Gemini (no sub-agents, so the
    // whole protocol renders inline in forge) and the sub-agent variants.
    for (const variant of ['claude', 'gemini', 'codex']) {
      const c = await getComposedTemplates(variant);
      const bodies = [...c.commands, ...c.agents];
      for (const [name, body] of bodies) {
        const rows = body.split('\n').filter(l => /^\|\s*`?steering`?\s*\|/.test(l));
        for (const row of rows) {
          expect(row, `${name} (${variant}): ${row}`).not.toContain('`apply`');
        }
      }
      // The routing table itself reaches every review surface: the two review
      // agents always, and forge's command body only on the degraded branch,
      // where Gemini has no sub-agent to compute the destination for it.
      const routes = (body: string) =>
        /^\|\s*`?steering`?\s*\|\s*Critical or Important\s*\|\s*Any\s*\|\s*`debt`/m.test(body);
      expect(routes(c.agents.get('smithy.plan-review.md')!), variant).toBe(true);
      expect(routes(c.agents.get('smithy.implementation-review.md')!), variant).toBe(true);
      expect(routes(c.commands.get('smithy.forge.md')!), variant).toBe(variant === 'gemini');
    }
  });

  it('cut classifies inherited spec debt instead of copying it wholesale', () => {
    // Without this, a per-story tasks file re-inherits every implementation
    // unknown its spec recorded. `specs/2026-05-03-005-expand-evals-coverage-
    // planning-and-audit` shows the cost: the spec's 12 rows are copied into
    // all six of its tasks files — 72 rows carrying about one real decision.
    const cut = composed.commands.get('smithy.cut.md')!;
    const phase1Idx = cut.indexOf('## Phase 1: Intake');
    const phase2Idx = cut.indexOf('## Phase 2: Analyze');
    expect(phase1Idx).toBeGreaterThan(-1);
    const phase1 = cut.slice(phase1Idx, phase2Idx);

    expect(phase1).toContain('Classify each row before carrying it down');
    // Demoted rows keep their provenance without taking the upstream number.
    expect(phase1).toContain('`Origin` set to `spec:<the upstream SD-NNN>`');
    expect(phase1).toContain('## Open Implementation Questions');
    // Reclassification is one-directional: the child never edits the parent.
    expect(phase1).toContain("Never write back to the parent spec's debt table");
  });

  it('cut template carries the repo fields in the tasks file shape, marked conditional', () => {
    // The fields sit in the emitted template block so the shape is
    // visible, but each carries the condition inline: a single-repo or
    // monorepo tasks file should come out with neither.
    const cut = composed.commands.get('smithy.cut.md')!;
    expect(cut).toContain('**Story Number**: <NN>\n**Implementation repo**: `<repo>`');
    expect(cut).toContain('cross-repo project stores only');
    expect(cut).toContain('**Repo**: `<repo>`');
  });

  it('cut template states the single-repo slice invariant and scopes the declaration', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    // The invariant holds everywhere, declaration or not.
    expect(cut).toContain('implementable within **exactly one repository**');
    expect(cut).toContain('### Cross-Repo Notes');
    // The declaration itself is scoped to cross-repo planning.
    expect(cut).toContain('Declaring the implementation repo (cross-repo planning only)');
    expect(cut).toContain('**Omit the repo fields entirely.**');
  });

  it('forge template gates implementation on a declared repo, and only then', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toContain('**Check the implementation repo, if the slice declares one.**');
    expect(forge).toContain('**No declaration → nothing to check.**');
    expect(forge).toContain('git rev-parse --show-toplevel');
    expect(forge).toContain('Implementation repo mismatch');
  });

  it('forge template defines the screen-build profile for typed UI nodes', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toContain('### Typed UI Node Build Profiles');
    expect(forge).toContain('**`SC<N>` / `screen-build` tasks** select the screen-build profile');
    expect(forge).toContain('Read the referenced `design/screens/<ScreenId>.design.md` before editing');
    expect(forge).toContain('Read the task plan\'s `**Design Mode**` and `**Design Metadata**` lines');
    expect(forge).toMatch(/`Design Mode` must be one of `none`,\s+`import`, or `brief`/);
    expect(forge).toContain('the committed design skill named by the screen artifact');
    expect(forge).toContain('behind the resolved feature `flag`');
    expect(forge).toContain('Use mock data for screen-build work');
    expect(forge).toContain('Represent every brief state named by the screen intent');
    expect(forge).toContain('design-system');
    expect(forge).toContain('tokens and reusable project components');
    expect(forge).toContain('Route by design mode without creating a visual-gate stall');
    expect(forge).toContain('`Design: none` builds from the committed design skill');
    expect(forge).toContain('`Design: import` carries any supplied bundle context into the build');
    expect(forge).toContain('Bundle-less `Design: brief` builds from the committed design skill');
    expect(forge).toMatch(/no\s+prototype bundle was attached/);
    expect(forge).toContain('Honor any attached `bundle` for layout and visual intent regardless');
    expect(forge).toContain('was attached after `mark` for');
    expect(forge).toContain('fall back to the design skill and `.design.md` intent instead of stopping');
    expect(forge).toContain('Do not ask reviewers to judge visual fidelity');
    expect(forge).toContain('Refuse to author a new `.design.md` from scratch');
  });

  it('screen-build profile resolves the gating feature flag or stops', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toContain('Resolve the gating feature `flag` before writing code');
    expect(forge).toContain('`**Design Metadata**` line first');
    expect(forge).toContain("`**Source Feature Map**` pointer");
    expect(forge).toContain('never');
    expect(forge).toContain('ship an ungated screen');
  });

  it('forge template defines the flow-wire profile for typed UI nodes', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toContain('**`FL<N>` / `flow-wire` tasks** select the flow-wire profile');
    expect(forge).toContain('Read the referenced `design/flows/<FlowId>.flow.md` before editing');
    expect(forge).toContain('`**Test Body**` line');
    expect(forge).toContain("the flow artifact's `test-body` front-matter");
    expect(forge).toContain('`**Ledger Dependencies**` and `**Flow Data Path**`');
    expect(forge).toContain('real-data-dependent flow also depends on backend `US` nodes');
    expect(forge).toContain('Resolve the feature `flag`');
    expect(forge).toContain('Refuse to author a new `.flow.md` from scratch');
  });

  it('flow-wire profile keeps executable behavior in the paired test body', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toContain('Put executable user actions and assertions in the paired test body only');
    expect(forge).toContain('every guard and traversal assertion named by the `.flow.md`');
    expect(forge).toContain('stable test IDs, accessibility IDs, or');
    expect(forge).toContain('never rely on visible text, layout position');
    expect(forge).toContain('Run the paired flow test body as a validation gate');
    expect(forge).toContain(
      'do not add executable\n    steps, actions, assertions, or driver syntax to `.flow.md`',
    );
  });

  it('forge template keeps backend-story nodes on the existing forge path', () => {
    const forge = composed.commands.get('smithy.forge.md')!;
    expect(forge).toContain(
      '**`US<N>` / `backend-story` tasks inside a typed UI ledger** select the',
    );
    expect(forge).toContain('existing backend-story forge path');
    expect(forge).toContain('must not change backend implementation');
    expect(forge).toContain('skip the ordinary spec/data-model/contracts intake');
    expect(forge).toContain('Backend-story work must not author');
  });

  it('smithy-implement carries the same typed UI build profile as forge', () => {
    const implement = composed.agents.get('smithy.implement.md')!;
    expect(implement).toBeDefined();
    expect(implement).toContain('**`SC<N>` / `screen-build` tasks** select the screen-build profile');
    expect(implement).toContain('Resolve the gating feature `flag` before writing code');
    expect(implement).toContain('Refuse to author a new `.design.md` from scratch');
    expect(implement).toContain('**`FL<N>` / `flow-wire` tasks** select the flow-wire profile');
    expect(implement).toContain('Put executable user actions and assertions in the paired test body only');
    expect(implement).toContain('Refuse to author a new `.flow.md` from scratch');
    expect(implement).toContain(
      '**`US<N>` / `backend-story` tasks inside a typed UI ledger** select the',
    );
  });

  it('forge routes SC and FL slices to the ui-structural review profile', async () => {
    // The sub-agent dispatch block is inside forge's {{#ifAgent}} branch, so
    // the routing instruction only renders for an agent-capable variant.
    const claudeComposed = await getComposedTemplates('claude');
    const forge = claudeComposed.commands.get('smithy.forge.md')!;
    expect(forge).toContain("- **Review profile**: If the tasks file's `**Node Kind**:` is");
    expect(forge).toMatch(
      /`screen-build` \(`SC<N>`\) or `flow-wire` \(`FL<N>`\), request the\s+`ui-structural` profile/,
    );
    expect(forge).toContain('Otherwise use the default backend implementation');
    // The profile narrows the review; it does not fork the agent or the
    // output contract, and it never turns forge into a visual-fidelity judge.
    expect(forge).toMatch(
      /`ui-structural` profile is still the ordinary read-only implementation\s+review agent and output contract/,
    );
    expect(forge).toContain('Do not ask for pixel matching');
    expect(forge).toContain('visual-diff work, subjective taste changes, or visual fidelity judgments');
    expect(forge).toContain('default backend review profile and backend-story routing remain unchanged');
  });

  it('both typed UI build profiles request the ui-structural review, agent mode or not', () => {
    // The snippet side of the routing rides the build profiles, so the
    // degraded no-sub-agent variant still asks for a structural review.
    const forge = composed.commands.get('smithy.forge.md')!;
    const structuralRequests = forge.match(
      /Request forge's `ui-structural` implementation review profile after the/g,
    );
    expect(structuralRequests).toHaveLength(2);
    expect(forge).toMatch(
      /token-only\s+styling, reusable project components, project conventions, accessible\s+structure including touch-target roles and contrast-token usage/,
    );
    expect(forge).toMatch(
      /stable selector\s+usage, guard\/traversal coverage in the paired test body/,
    );
    expect(forge).toContain('Do not ask reviewers to judge visual fidelity, run');
    expect(forge).toContain('visual diffs, or propose');
  });

  it('implementation-review agent defines the structural UI review checks', () => {
    const review = composed.agents.get('smithy.implementation-review.md')!;
    expect(review).toBeDefined();
    expect(review).toContain('## UI Structural Profile');
    expect(review).toMatch(/\*\*Review profile\*\* — optional\. `ui-structural` means the diff comes from an/);
    expect(review).toMatch(/If omitted, use the default backend\s+implementation review behavior/);
    // Screen checks: tokens, component reuse and conventions, every brief state.
    expect(review).toContain('verify styling uses design-system tokens or existing');
    expect(review).toContain('rather than hardcoded colors or one-off style constants');
    expect(review).toMatch(/verify reusable components and local project\s+conventions are followed/);
    expect(review).toMatch(/verify every brief state named by the referenced\s+`\.design\.md` or task plan is represented/);
    // Flow checks: stable selectors, guard/traversal coverage in the test body.
    expect(review).toMatch(
      /verify executable behavior uses stable test IDs,\s+accessibility IDs, or semantic tags instead of visible text or layout\s+position/,
    );
    expect(review).toMatch(/guard\/traversal assertions from the `\.flow\.md` are\s+represented in the paired test body/);
    // Accessibility roles are checked structurally, not visually.
    expect(review).toMatch(
      /touch-target roles, accessible roles\/names, and\s+contrast-token usage structurally/,
    );
    expect(review).toContain('feature-flag boundaries, mock-data versus');
  });

  it('ui-structural review findings stay on the existing triage and skip pixel work', () => {
    const review = composed.agents.get('smithy.implementation-review.md')!;
    expect(review).toMatch(
      /When `Review profile` is `ui-structural`, keep the review read-only and use the\s+same `ReviewResult` shape and shared triage rules as every other implementation\s+review/,
    );
    expect(review).toContain('**UI structural conformance** — only when the `ui-structural` profile is');
    expect(review).toContain(
      'Do not emit findings for pixel matching, visual diffs, palette preference,',
    );
    expect(review).toMatch(/spacing taste, typography taste, or whether the result visually matches a\s+prototype/);
    expect(review).toContain('do not ask forge to iterate visual');
    // Triage itself is unchanged: severity x confidence still comes from the
    // shared review protocol, and forge still owns applying or recording it.
    expect(review).toContain('Each category combines with a severity (Critical, Important, Minor) and a');
    expect(review).toContain('## Review Protocol');
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

  it('plan-review agent applies a kind gate before severity × confidence triage', () => {
    // Before this gate, plan-review routed purely on severity × confidence,
    // so every Low-confidence finding became an SD-NNN row whether or not a
    // human had anything to decide. The gate mirrors `smithy-clarify` Step 3b
    // but routes by naming a different `kind` rather than into an assumption
    // stream, which plan-review does not have.
    const planReview = composed.agents.get('smithy.plan-review.md')!;
    expect(planReview).toBeDefined();
    expect(planReview).toContain('## Kind Gate');
    expect(planReview).toContain('`steering`');
    expect(planReview).toContain('`implementation`');
    expect(planReview).toContain('`hygiene`');

    // The three-part steering test reaches the agent through the composed
    // review-protocol snippet, not by being restated here. Condition 3 is the
    // one that separates a steering question from an implementation unknown.
    expect(planReview).toContain('**Open question**');
    expect(planReview).toContain('**Named alternatives**');
    expect(planReview).toContain('**Human-only**');
    // Single source: the agent points at the shared gate instead of copying
    // it, so the Gemini/degraded paths that never load this file stay in sync.
    expect(planReview).toContain('is defined');
    expect(planReview).toContain('Do not restate it here');

    // Non-steering findings have named destinations, so the gate filters
    // without discarding.
    expect(planReview).toContain('## Open Implementation Questions');
    expect(planReview).toContain('A wrong table is a fix, not a question');

    // The gate runs before grading, not after — a Low confidence score must
    // not be able to promote a hygiene finding into the debt table.
    const gateIdx = planReview.indexOf('## Kind Gate');
    const returnShapeIdx = planReview.indexOf('## ReviewResult return shape');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(returnShapeIdx).toBeGreaterThan(gateIdx);
    expect(planReview).toContain('Kind is mandatory and precedes grading');
  });

  it('plan-review agent collapses same-root-cause findings into one', () => {
    // In `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit`, two
    // pairs of debt rows say outright that they duplicate each other (SD-007
    // "closely related to SD-001"; SD-010 "same constraint as SD-004").
    // Emitting one finding per symptom is the second way a debt table inflates
    // past the point of being scannable.
    const planReview = composed.agents.get('smithy.plan-review.md')!;
    expect(planReview).toContain('One finding per root cause');
    expect(planReview).toContain('#### Calibration');
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

  it('prose agent loads the voice helper without duplicated taxonomy markers', () => {
    const prose = composed.agents.get('smithy.prose.md')!;
    expect(prose).toBeDefined();
    expect(prose).toContain('Skill("smithy.helper-voice")');
    expect(prose).not.toContain('Prose principles — follow these on every sentence');
    expect(prose).not.toContain('Anti-pattern to avoid');
    // Section-specific guidance carries audience tags in the shared grammar so
    // the sub-agent parameterizes the helper per section (PR #454 review).
    expect(prose).toContain('<!-- audience: stakeholder; mode: explanation; length: 2-3 sentences;');
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

  it('audit template renders the voice/audience tag lint snippet', () => {
    const audit = composed.commands.get('smithy.audit.md')!;
    expect(audit).toBeDefined();

    // The cross-cutting voice lint partial must be resolved (no unresolved ref).
    expect(audit).not.toContain('{{>audit-checklist-voice}}');

    // Key surfaces of the lint rule must be present in the composed prompt.
    expect(audit).toContain('Voice & Audience Tag Lint');
    expect(audit).toContain('Unknown key');
    expect(audit).toContain('Unknown value');
    expect(audit).toContain('mermaid');
    expect(audit).toContain('applicability');
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

  it.each([
    ['smithy.strike.md'],
    ['smithy.mark.md'],
    ['smithy.cut.md'],
    ['smithy.render.md'],
    ['smithy.ignite.md'],
    ['smithy.spark.md'],
  ])('%s emits the Specification Debt index-plus-details format', file => {
    const cmd = composed.commands.get(file)!;
    expect(cmd).toBeDefined();

    // Partial fully resolved — a stale literal would ship to target repos.
    expect(cmd).not.toContain('{{>spec-debt-section}}');

    expect(cmd).toContain('## Specification Debt');
    expect(cmd).toContain('| ID | Title | Source Category | Impact | Confidence | Origin |');
    expect(cmd).toContain('### Resolved');

    // Regression guard: the legacy 7-column table was identical in seven
    // sites and nothing asserted its columns, so it drifted silently.
    expect(cmd).not.toContain(
      '| ID | Description | Source Category | Impact | Confidence | Status | Resolution |',
    );
    // Status is derived from position + Origin, never stored as a column.
    expect(cmd).not.toMatch(/\|\s*Status\s*\|\s*Resolution\s*\|/);
    // One canonical empty state, not the two that used to coexist.
    expect(cmd).not.toContain('None — all ambiguities resolved');
    expect(cmd).toContain('None — no specification debt was recorded.');
  });

  it.each([
    ['smithy.strike.md'],
    ['smithy.mark.md'],
    ['smithy.cut.md'],
    ['smithy.render.md'],
    ['smithy.ignite.md'],
  ])('%s maps review severity into the Impact enum instead of copying it', file => {
    const cmd = composed.commands.get(file)!;
    expect(cmd).toBeDefined();
    // Review severities are Critical/Important/Minor (review-protocol), but
    // Impact admits only Critical/High/Medium/Low. Copying verbatim is how
    // `Important` ended up in 12 Impact cells across this repo's artifacts —
    // values plan-review's own debt lint now treats as malformed. Ignite's
    // Phase 0c said "copy severity into Impact" for months without tripping
    // this, because a line wrap fell between "copy" and "severity" — so
    // collapse whitespace before matching.
    const flat = cmd.replace(/\s+/g, ' ');
    expect(flat).not.toContain('copy severity into Impact');
    expect(flat).toContain('`Important` becomes `High`');
  });

  it.each([
    ['smithy.strike.md'],
    ['smithy.mark.md'],
    ['smithy.cut.md'],
    ['smithy.render.md'],
    ['smithy.ignite.md'],
  ])('%s routes plan-review findings into a detail section, not a column', file => {
    const cmd = composed.commands.get(file)!;
    expect(cmd).toBeDefined();
    // There is no Description column any more; a finding's prose belongs in
    // the item's detail section, and the row carries a short Title slug.
    // Prose wraps across lines in these templates, so match on collapsed
    // whitespace rather than a fixed line break — ignite's Phase 0c kept
    // mandating a "Description column" behind exactly such a wrap.
    const flat = cmd.replace(/\s+/g, ' ');
    expect(flat).not.toContain('Description column');
    expect(flat).toContain('`### SD-NNN — <Title>` detail section');
    expect(flat).toContain('A slug of 40 characters or fewer naming the unresolved choice');
  });

  it('cut distinguishes a legitimately empty upstream debt section from a broken one', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    expect(cut).toBeDefined();
    // An empty parent is the expected outcome, not a parse failure — warning
    // on it would cry wolf on most specs.
    expect(cut).toContain('legitimately empty is not an error');
    expect(cut).toMatch(/absent entirely\*\* or its index table is\s+\*\*malformed\*\*/);
  });

  it('cut carries debt provenance as an Origin field, not a description prefix', () => {
    const cut = composed.commands.get('smithy.cut.md')!;
    expect(cut).toBeDefined();
    // The old convention buried structured provenance inside prose, where it
    // survived neither rewording nor machine checking.
    expect(cut).not.toContain('inherited from spec:');
    expect(cut).toContain('spec:<the upstream SD-NNN>');
    // Carried-down rows must not duplicate the parent's prose downstream.
    expect(cut).toContain('Do not write a detail section for a carried-down row.');
  });

  it('clarify and refine return Origin-shaped debt items with no Status field', () => {
    const clarify = composed.agents.get('smithy.clarify.md')!;
    const refine = composed.agents.get('smithy.refine.md')!;
    for (const agent of [clarify, refine]) {
      expect(agent).toBeDefined();
      expect(agent).toContain('Origin');
      expect(agent).toContain('Title');
      expect(agent).not.toMatch(/Status\s*\(`open`\)/);
    }
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
    // structure.
    const cutMarkdownBlock = extractFenceByAnchor(cut, '# Tasks: <User Story Title>');
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
    expect(render).toContain('design: <none|import|brief>');
    expect(render).toMatch(/build\/wire/i);
    expect(render).not.toContain('{{>feature-kinds}}');
    expect(render).not.toContain('{{>');
  });

  it('feature-kind docs point UI routing and durable design truth at mark', () => {
    const readmePath = path.join(
      process.cwd(),
      'src',
      'templates',
      'agent-skills',
      'README.md',
    );
    const readme = fs.readFileSync(readmePath, 'utf8');
    expect(readme).toMatch(/branches on the selected\s+feature's `kind`/);
    expect(readme).toContain('absent-kind legacy features');
    expect(readme).toContain('owns the durable design truth');
    expect(readme).toContain('Selects the `smithy.mark` authoring path');
    expect(readme).toContain('the `.flow.md` design truth is authored by `mark`');
    expect(readme).not.toContain('Selects the downstream `forge` profile');
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

  // The engrave command is the first user of the engraved-knowledge schema
  // (EPIC #412). These assertions pin its contract against the schema doc:
  // the prompt must teach the three kinds, the four operations
  // (create/update/supersede/exception), the Known-Exceptions ledger
  // column shape, the YAML-safe quoted-title rule, and the explicit
  // "engraved records are not Dependency Order rows" carve-out. Any of
  // these going missing would silently let the agent emit non-schema
  // records that the future parser (#416) and audit (#418) would reject.
  it('engrave template teaches the three engraved kinds', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    expect(engrave).toBeDefined();
    expect(engrave).toMatch(/decision/);
    expect(engrave).toMatch(/invariant/);
    expect(engrave).toMatch(/principle/);
    // The three trigger forms must all be present.
    expect(engrave).toContain('decision: <topic>');
    expect(engrave).toContain('invariant: <topic>');
    expect(engrave).toContain('principle: <topic>');
  });

  it('engrave template defines every authoring operation the schema requires', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    // Each operation gets its own phase heading; the audit (#418) and the
    // parser (#416) inherit the operation taxonomy from this template.
    expect(engrave).toMatch(/## Phase 3a: Create a decision/);
    expect(engrave).toMatch(/## Phase 3b: Create an invariant/);
    expect(engrave).toMatch(/## Phase 3c: Create a principle/);
    expect(engrave).toMatch(/## Phase 4: Update an existing record/);
    expect(engrave).toMatch(/## Phase 5: Supersede a decision/);
    expect(engrave).toMatch(/## Phase 6: Add or resolve a Known-Exceptions ledger row/);
  });

  it('engrave template pins the Known-Exceptions ledger column order', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    // The ledger header row is load-bearing across the schema doc, the
    // engrave scaffolds, and the eventual audit / parser. Drift here
    // breaks every downstream consumer silently.
    expect(engrave).toContain(
      '| Where | What diverges | Disposition + Why | Tracking Issue | Severity |',
    );
  });

  it('engrave template requires quoted YAML titles to survive colon-bearing topics', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    // The schema doc + engrave scaffolds use quoted titles so titles
    // containing `: ` (e.g. `CLI: require JSON status`) survive the YAML
    // parser. The rule is asserted explicitly in the engrave prompt body.
    expect(engrave).toContain('title: "<topic>"');
    expect(engrave).toMatch(/Always quote the title/);
  });

  it('engrave template enforces the alignment-derivation rule from the ledger', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    // Both alignment states must appear (the scaffold seeds `status:
    // aligned`; `drifting` shows up in the recompute rule and the
    // kinds-at-a-glance table), and the derivation rule must mention
    // recomputing from the ledger. The audit (#418) inherits this rule
    // directly from the engrave template.
    expect(engrave).toMatch(/status: aligned/);
    expect(engrave).toMatch(/\bdrifting\b/);
    expect(engrave).toMatch(/recompute/i);
  });

  it('engrave template creates drift issues only for new Temporary exceptions', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    expect(engrave).toContain('Skill("smithy.gh-issue")');
    expect(engrave).toContain('create-issue.sh');
    expect(engrave).toMatch(/only when adding a new `Temporary:` ledger row/i);
    expect(engrave).toMatch(/write the issue body to a temporary file/i);
    expect(engrave).toMatch(/JSON `number`/);
    expect(engrave).toMatch(/write `#NNN` into that new row's `Tracking Issue` cell/i);
    expect(engrave).toMatch(/Accepted:` rows[\s\S]*do not create/i);
  });

  it('engrave template renders drift issue bodies from invariant context', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    expect(engrave).toMatch(/title from the `What diverges` text/i);
    expect(engrave).toMatch(/Invariant: `<INV id>` — `<invariant title>`/);
    expect(engrave).toMatch(/Divergence: `<What diverges>`/);
    expect(engrave).toMatch(/Establishing decisions: `<established_by ids>`/);
    expect(engrave).toMatch(/Accepted:` row.*`Tracking Issue`.*`—`/is);
  });

  it('engrave template preserves exception edits when drift issue creation fails', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    expect(engrave).toMatch(/auth, network, script, or JSON parsing failure/i);
    expect(engrave).toMatch(/leave the newly\s+added `Temporary:` ledger row in place/i);
    expect(engrave).toMatch(/`Tracking Issue` cell as `—`/);
    expect(engrave).toMatch(/terminal summary/i);
    expect(engrave).toMatch(/do not roll back/i);
    expect(engrave).toMatch(/do not close, comment on, label, or otherwise mutate/i);
  });

  it('engraved records stay out of orders template registries', () => {
    expect(ORDERS_TEMPLATE_TYPES).toEqual(['rfc', 'features', 'spec', 'tasks']);
    expect(Object.keys(ORDERS_DEFAULT_TEMPLATES).sort()).toEqual(
      [...ORDERS_TEMPLATE_TYPES].sort(),
    );
    const orderTypes: readonly string[] = ORDERS_TEMPLATE_TYPES;
    expect(orderTypes).not.toContain('decision');
    expect(orderTypes).not.toContain('invariant');
    expect(orderTypes).not.toContain('principle');
  });

  it('engrave template states the "engraved records are not Dependency Order rows" rule', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    // The carve-out is the load-bearing distinction between engraved
    // records and the planning-artifact hierarchy. Without it, an agent
    // could silently add engraved records to a parent artifact's table
    // and break the status graph.
    expect(engrave).toMatch(/NOT in `## Dependency Order` tables/);
  });

  it('engrave template inlines the schema instead of linking out to an undeployed doc', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    // The schema doc was deleted (PR #428 reshape) because `smithy init`
    // does not deploy `docs/`, so any cross-doc link would resolve to a
    // missing file in the target repo. The engrave prompt is now the
    // canonical source for the family; tests below assert the schema
    // content lives here. This assertion catches a reintroduction of
    // the broken cross-doc link.
    expect(engrave).not.toContain('docs/engraved-knowledge-schema.md');
    // The inlined schema heading must be present.
    expect(engrave).toMatch(/## The engraved-knowledge schema/);
  });

  it('engrave template uses canonical id prefixes for each kind', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    // The schema doc's conventional id prefixes are D- (decision),
    // INV- (invariant), P- (principle). The engrave prompt must use
    // the same prefixes when assigning new ids.
    expect(engrave).toMatch(/D-<N>/);
    expect(engrave).toMatch(/INV-<N>/);
    expect(engrave).toMatch(/P-<N>/);
  });

  it('engrave template wires the per-kind default repo locations from the schema', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    // Each kind × domain has a canonical default directory the schema
    // doc commits to. The engrave prompt must propose the same paths.
    expect(engrave).toContain('docs/decisions/');
    expect(engrave).toContain('docs/invariants/');
    expect(engrave).toContain('docs/constitution/');
    expect(engrave).toContain('docs/design/decisions/');
    expect(engrave).toContain('docs/design/invariants/');
    expect(engrave).toContain('docs/design/constitution/');
  });

  it('engrave template defines the managed projection marker pair', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    expect(engrave).toContain('<!-- smithy:engraved:begin -->');
    expect(engrave).toContain('<!-- smithy:engraved:end -->');
  });

  it('engrave template keeps projection pointer-only and existing-files-only', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    expect(engrave).toMatch(/pointer-only block/i);
    expect(engrave).toMatch(/not inline record bodies/i);
    expect(engrave).toMatch(/no per-record/i);
    expect(engrave).toMatch(/skip missing target files/i);
    expect(engrave).toMatch(/never create/i);
  });

  it('engrave template makes projection deterministic and idempotent', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    expect(engrave).toContain('docs/decisions/');
    expect(engrave).toContain('docs/invariants/');
    expect(engrave).toContain('docs/constitution/');
    expect(engrave).toContain('docs/design/decisions/');
    expect(engrave).toContain('docs/design/invariants/');
    expect(engrave).toContain('docs/design/constitution/');
    expect(engrave).toMatch(/deterministic/i);
    expect(engrave).toMatch(/byte-identical/i);
    expect(engrave).toMatch(/idempotent/i);
    // The directory roots must be enumerated in a fixed, deterministic order
    // so projection output is byte-identical across runs. Assert the numbered
    // discovery list keeps them in the canonical sequence.
    const order = [
      '| 1 | user | `~/.smithy/decisions/` |',
      '| 2 | user | `~/.smithy/invariants/` |',
      '| 3 | user | `~/.smithy/constitution/` |',
      '| 4 | user | `~/.smithy/design/decisions/` |',
      '| 5 | user | `~/.smithy/design/invariants/` |',
      '| 6 | user | `~/.smithy/design/constitution/` |',
      '| 7 | repo | `docs/decisions/` |',
      '| 8 | repo | `docs/invariants/` |',
      '| 9 | repo | `docs/constitution/` |',
      '| 10 | repo | `docs/design/decisions/` |',
      '| 11 | repo | `docs/design/invariants/` |',
      '| 12 | repo | `docs/design/constitution/` |',
      '| 13 | project | `~/.smithy/projects/<project>/decisions/` |',
      '| 14 | project | `~/.smithy/projects/<project>/invariants/` |',
      '| 15 | project | `~/.smithy/projects/<project>/constitution/` |',
      '| 16 | project | `~/.smithy/projects/<project>/design/decisions/` |',
      '| 17 | project | `~/.smithy/projects/<project>/design/invariants/` |',
      '| 18 | project | `~/.smithy/projects/<project>/design/constitution/` |',
    ];
    let prev = -1;
    for (const entry of order) {
      const idx = engrave.indexOf(entry);
      expect(idx).toBeGreaterThan(prev);
      prev = idx;
    }
  });

  it('engrave template warns on malformed projection markers without guessing', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    expect(engrave).toMatch(/malformed or duplicated markers/i);
    expect(engrave).toMatch(/warning/i);
    expect(engrave).toMatch(/do not guess/i);
    expect(engrave).toMatch(/leave that file unchanged/i);
  });

  it('engrave template states the supersede-by-new-file invariant', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    // Decisions are append-only — supersession creates a new file and
    // patches the old one's frontmatter, never rewrites the body.
    expect(engrave).toMatch(/append-only/);
    expect(engrave).toMatch(/Never rewrite an accepted or superseded decision body/i);
  });
});

describe('getComposedTemplates artifactsRoot', () => {
  // The {{artifactsRoot}} helper is the deploy-time variable that decides
  // whether planning-artifact paths in the deployed prompts render as
  // `docs/rfcs/...` (in-repo, default) or `~/.smithy/repos/<repo>/docs/rfcs/...`
  // (external mode). Each templatized command prompt must honor it; these
  // assertions lock that in against future template rewrites.

  it('defaults to an empty prefix so paths render unchanged', async () => {
    const c = await getComposedTemplates('claude');
    const strike = c.commands.get('smithy.strike.md')!;
    // Path in the Phase 3 write instruction renders without a prefix.
    expect(strike).toContain('Write a single strike document to `specs/strikes/YYYY-MM-DD-<slug>.strike.md`');
    expect(strike).not.toContain('{{artifactsRoot}}');
    // The policy snippet mentions ~/.smithy/repos/<repo>/ as part of its
    // explanation; that's expected. Make sure no actual artifact path got a
    // tilde prefix.
    expect(strike).not.toContain('~/.smithy/repos/<repo>/specs/strikes/YYYY');
  });

  it('substitutes the supplied prefix into every templatized path', async () => {
    const c = await getComposedTemplates('claude', '~/.smithy/myrepo/');
    const strike = c.commands.get('smithy.strike.md')!;
    expect(strike).toContain('~/.smithy/myrepo/specs/strikes/YYYY-MM-DD-<slug>.strike.md');
    expect(strike).not.toContain('{{artifactsRoot}}');
  });

  it('propagates to the ignite, mark, cut, render, spark, audit, orders, and persona prompts', async () => {
    const c = await getComposedTemplates('claude', '~/.smithy/myrepo/');
    for (const file of [
      'smithy.ignite.md',
      'smithy.mark.md',
      'smithy.cut.md',
      'smithy.render.md',
      'smithy.spark.md',
      'smithy.audit.md',
      'smithy.orders.md',
      'smithy.persona.md',
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
      'smithy.persona.md',
    ]) {
      const body = c.commands.get(file)!;
      expect(body, file).toContain('## Authored Smithy Artifacts Location');
    }
  });

  it('renders the gemini variant with the same artifactsRoot substitution', async () => {
    const c = await getComposedTemplates('gemini', '~/.smithy/x/');
    const strike = c.commands.get('smithy.strike.md')!;
    expect(strike).toContain('~/.smithy/x/specs/strikes/');
    expect(strike).not.toContain('{{artifactsRoot}}');
  });

  it('collapses the artifact-location policy in repo mode', async () => {
    // Issue #555: in repo mode `{{artifactsRoot}}` renders empty, so the
    // both-values prose came out as literal gibberish — "is already prefixed
    // with `` so it points…", "When `` is empty…" — ~35 lines explaining a
    // variable fixed at deploy time, in ten commands. The repo-mode branch
    // states the one true answer instead.
    const inRepo = await getComposedTemplates('claude');
    const strike = inRepo.commands.get('smithy.strike.md')!;
    // Empty inline code is the tell: a `{{artifactsRoot}}` interpolation that
    // rendered to nothing inside backticks. Bound the pattern on both sides
    // so fenced code blocks (```) do not match.
    expect(strike).not.toMatch(/(^|[^`])``($|[^`])/m);
    expect(strike).not.toContain('is already prefixed with');
    expect(strike).toContain('Authored Smithy artifacts live **in the repo**');
    // The two home-anchored engraved levels are unaffected by the mode, so
    // both branches must still name them.
    expect(strike).toContain('~/.smithy/projects/<project>/decisions/');

    // External mode keeps the full policy, minus the now-impossible
    // empty-root case.
    const external = await getComposedTemplates('claude', '~/.smithy/myrepo/');
    const extStrike = external.commands.get('smithy.strike.md')!;
    expect(extStrike).toContain('is already prefixed with');
    expect(extStrike).not.toContain('Authored Smithy artifacts live **in the repo**');
    expect(extStrike).toContain('~/.smithy/myrepo/docs/decisions/');
  });

  it('injects each heavyweight snippet at most once per rendered command', async () => {
    // Issue #555: `one-shot-output` (122 lines) was injected twice into mark
    // and twice into cut — verbatim duplicates ~250 lines apart in the same
    // context window — and `spec-debt-section` twice into spark. A second
    // occurrence is a cross-reference now. `plan-review-triage` is
    // deliberately excluded: issue #553 made both dispatch sites compose it
    // so the parent-side table cannot drift, and that contract still holds.
    for (const artifactsRoot of ['', '~/.smithy/myrepo/']) {
      for (const variant of ['claude', 'gemini', 'codex']) {
        const c = await getComposedTemplates(variant, artifactsRoot);
        for (const [file, body] of c.commands) {
          const where = `${file} (${variant}, root="${artifactsRoot}")`;
          const marker = (re: RegExp) => (body.match(re) ?? []).length;
          expect(marker(/^## One-Shot Output$/gm), `${where} one-shot-output`)
            .toBeLessThanOrEqual(1);
          expect(
            marker(/slug naming the unresolved choice/g),
            `${where} spec-debt-section`,
          ).toBeLessThanOrEqual(1);
          expect(
            marker(/Assign sequential `SD-NNN` identifiers, continuing from the highest/g),
            `${where} debt-from-clarify`,
          ).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('includes the store commit protocol only in external mode', async () => {
    // In repo mode the same instructions would tell the agent to commit the
    // *code* repo mid-plan, so the block has to be genuinely absent — not
    // merely prefaced with a condition the agent is trusted to evaluate.
    const external = await getComposedTemplates('claude', '~/.smithy/myrepo/');
    const strike = external.commands.get('smithy.strike.md')!;
    expect(strike).toContain('### Committing artifacts to the store');
    expect(strike).toContain('git -C ~/.smithy/myrepo/ add -A');
    // --no-gpg-sign must be in the instruction, matching what
    // `ensureArtifactStore` runs — otherwise a machine with `commit.gpgsign`
    // set blocks the agent on a passphrase prompt.
    expect(strike).toContain('git -C ~/.smithy/myrepo/ commit --no-gpg-sign -m');
    expect(strike).not.toContain('{{#ifExternalArtifacts}}');

    const inRepo = await getComposedTemplates('claude');
    const repoStrike = inRepo.commands.get('smithy.strike.md')!;
    expect(repoStrike).not.toContain('### Committing artifacts to the store');
    expect(repoStrike).not.toContain('git -C ');
    expect(repoStrike).not.toContain('{{#ifExternalArtifacts}}');
  });

  it('lets agents skip the commit when the store has no git repository', async () => {
    // `ensureArtifactStore` degrades to a warning when git is unavailable, so
    // a historyless store is a supported state. The prompt must not turn that
    // into a guaranteed failure at the end of every artifact-writing run.
    const c = await getComposedTemplates('claude', '~/.smithy/myrepo/');
    const strike = c.commands.get('smithy.strike.md')!;
    expect(strike).toContain('skip this step entirely and carry');
    expect(strike).toContain('not run `git init` yourself');
  });

  it('tells agents not to push the store', async () => {
    // The store may have a remote the user controls; pushing it is their
    // call, and a stray push could publish planning they kept off the repo.
    const c = await getComposedTemplates('claude', '~/.smithy/myrepo/');
    const strike = c.commands.get('smithy.strike.md')!;
    expect(strike).toContain('Do not `git push`');
  });
});

describe('command template frontmatter contract', () => {
  // Claude Code advertises `.claude/commands/*.md` through the same registry
  // skills use, and drives that entry from this block. Every command therefore
  // has to declare its registry metadata at the source, where all three
  // deployers can see it.
  const commandsDir = path.join(process.cwd(), 'src/templates/agent-skills/commands');
  const commandFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.prompt'));

  const frontmatterOf = (file: string): string => {
    const raw = fs.readFileSync(path.join(commandsDir, file), 'utf8');
    const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    expect(match, `${file} has no frontmatter block`).not.toBeNull();
    return match![1]!;
  };

  it('finds every command template', () => {
    expect(commandFiles.length).toBeGreaterThanOrEqual(13);
  });

  it.each(commandFiles)('%s declares a non-empty description', file => {
    const description = frontmatterOf(file).match(/^description:\s*(.+)$/m)?.[1]?.trim();
    expect(description, `${file} is missing description:`).toBeTruthy();
    // The H1 recycled as a description ("smithy.audit: smithy-audit") is the
    // failure mode this contract exists to prevent — a real description is a
    // sentence, not a slug.
    expect(description!.length).toBeGreaterThan(30);
  });

  it.each(commandFiles)('%s declares an argument-hint', file => {
    const hint = frontmatterOf(file).match(/^argument-hint:\s*(.+)$/m)?.[1]?.trim();
    expect(hint, `${file} is missing argument-hint:`).toBeTruthy();
  });

  it.each(commandFiles)('%s opts out of model invocation', file => {
    // Every Smithy command is an explicit pipeline step the operator drives.
    // Leaving them model-invocable spends registry context on 13 entries that
    // should never auto-fire.
    expect(frontmatterOf(file)).toMatch(/^disable-model-invocation:\s*true$/m);
  });

  it('keeps the source `name` for the Gemini and Codex skill-directory scheme', () => {
    for (const file of commandFiles) {
      expect(frontmatterOf(file), file).toMatch(/^name:\s*smithy-/m);
    }
  });

  it.each(commandFiles)('%s pairs any `context: fork` with `background: false`', file => {
    // Claude Code runs a forked command detached unless the frontmatter says
    // otherwise. Every command that is a plausible fork candidate — strike,
    // ignite, render, mark, cut — branches, commits, and pushes, and detached
    // it does that alongside whatever else the session is doing in the same
    // worktree. The rest still write artifact files, and a detached fork
    // writes them outside the session's checkpoints, where `/rewind` cannot
    // undo them. Forking is opt-in per command; blocking is not optional once
    // a command opts in.
    const block = frontmatterOf(file);
    if (!/^context:\s*fork\s*$/m.test(block)) return;
    expect(block, `${file} forks without declaring background: false`).toMatch(
      /^background:\s*false\s*$/m,
    );
  });
});

describe('command frontmatter reaches each agent', () => {
  it('Claude commands carry description, argument-hint, and the invocation opt-out', async () => {
    const claude = await getComposedTemplates('claude');
    for (const [file, content] of claude.commands) {
      const deployed = toClaudeCommandContent(content);
      expect(deployed.startsWith('---\n'), `${file} lost its frontmatter`).toBe(true);
      const block = deployed.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)![1]!;
      expect(block, file).toMatch(/^description:/m);
      expect(block, file).toMatch(/^argument-hint:/m);
      expect(block, file).toMatch(/^disable-model-invocation:\s*true$/m);
      // `name:` is the Codex spelling (smithy-audit); the Claude command is
      // named by its filename (smithy.audit.md → /smithy.audit).
      expect(block, file).not.toMatch(/^name:/m);
    }
  });

  it('Gemini and Codex still receive the source block verbatim, `name` included', async () => {
    for (const variant of ['gemini', 'codex'] as const) {
      const composed = await getComposedTemplates(variant);
      for (const [file, content] of composed.commands) {
        const block = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)?.[1];
        expect(block, `${variant}/${file} has no frontmatter`).toBeTruthy();
        expect(block!, `${variant}/${file}`).toMatch(/^name:\s*smithy-/m);
        expect(block!, `${variant}/${file}`).toMatch(/^description:/m);
      }
    }
  });
});

describe('issue #554 — audit defects D1–D10', () => {
  let composed: ComposedTemplates;
  let claudeComposed: ComposedTemplates;

  beforeAll(async () => {
    composed = await getComposedTemplates();
    claudeComposed = await getComposedTemplates('claude');
  });

  // D1 — ignite wrote `debt_items` into the RFC in the step *after* the commit
  // and the PR, so the committed artifact and the PR body both shipped without
  // the debt the run had already found. mark/cut populate debt at draft time;
  // ignite and render now do too, through the shared `debt-from-clarify`
  // snippet, and Phase 4 only reads what is already on disk.

  it('D1: debt-from-clarify snippet is the shared draft-time population rule', () => {
    const content = loadSnippets().get('debt-from-clarify.md')!;
    expect(content).not.toMatch(/^---\s*\n/);
    expect(content).toContain('SD-NNN');
    expect(content).toContain('never reword a description into a directive');
    expect(content).toContain('never add an item that did not come from `debt_items`');
  });

  it('D1: the snippet owns SD numbering, and no consumer contradicts it', () => {
    // Review feedback on #581: the snippet said "continue from whatever the
    // section already carries" while three lead-ins said "starting numbering
    // at SD-001", which would duplicate ids on a re-run over an existing
    // artifact. The snippet states the whole rule; consumers state none of it.
    const content = loadSnippets().get('debt-from-clarify.md')!;
    expect(content).toContain('`SD-001` only when the section');
    expect(content).toMatch(/never reused/);
    for (const file of ['smithy.ignite.md', 'smithy.render.md', 'smithy.mark.md', 'smithy.cut.md']) {
      const cmd = composed.commands.get(file)!;
      expect(cmd).not.toMatch(/starting numbering at `SD-001`/);
      expect(cmd).not.toMatch(/identifiers starting at SD-001/);
    }
  });

  it.each(['smithy.ignite.md', 'smithy.render.md', 'smithy.mark.md', 'smithy.cut.md'])(
    'D1: %s composes the draft-time debt population rule',
    file => {
      const cmd = composed.commands.get(file)!;
      expect(cmd).toBeDefined();
      expect(cmd).toContain('never add an item that did not come from `debt_items`');
    },
  );

  it('D1: ignite sub-phase 3e writes Specification Debt, matching the state map', () => {
    const ignite = claudeComposed.commands.get('smithy.ignite.md')!;
    // The state-detection map credits 3e with both sections; 3e must write both.
    expect(ignite).toContain('| `## Decisions`, `## Specification Debt`           | 3e        |');
    expect(ignite).toContain('### Sub-phase 3e: Decisions + Specification Debt');
    const heading = ignite.indexOf('### Sub-phase 3e: Decisions + Specification Debt');
    const next = ignite.indexOf('### Sub-phase 3f', heading);
    const block = ignite.slice(heading, next);
    expect(block).toContain('debt_items');
    expect(block).toMatch(/never add an item that did not come from `debt_items`/);
  });

  it.each(['smithy.ignite.md', 'smithy.render.md'])(
    'D1: %s verifies debt before the commit, not after the PR',
    file => {
      const cmd = claudeComposed.commands.get(file)!;
      // The artifact is complete before the commit; the post-PR step only
      // renders terminal output.
      expect(cmd).toMatch(/nothing after this step writes/);
      // The defect itself: a post-PR step that wrote debt into the artifact.
      expect(cmd).not.toMatch(/Write `debt_items` into \*\*both\*\*/);
    },
  );

  it.each(['smithy.ignite.md', 'smithy.render.md'])(
    'D1: %s composes the PR body from already-rendered output',
    file => {
      const cmd = claudeComposed.commands.get(file)!;
      expect(cmd).toMatch(/Leave the `## PR` section\s+unfilled for now|Leave the\s+`## PR` section unfilled for now/);
      expect(cmd).toContain('the snippet content composed in the previous step');
      // The old circular phrasing — the PR body being "the one-shot output
      // snippet content (rendered below)", which was rendered after the PR.
      expect(cmd).not.toContain('the one-shot output snippet content (rendered below) plus a');
    },
  );

  // D2 — "Cross-Cutting Governance / touched-files matrix" was named as a
  // routing destination in the kind gate and in refine, but no template ever
  // defined such a section. Every home the routing names must exist.

  it('D2: no template or snippet references the phantom governance matrix', () => {
    for (const content of loadSnippets().values()) {
      expect(content).not.toContain('Cross-Cutting Governance');
    }
    for (const cmd of composed.commands.values()) {
      expect(cmd).not.toContain('Cross-Cutting Governance');
    }
    for (const agent of composed.agents.values()) {
      expect(agent).not.toContain('Cross-Cutting Governance');
    }
  });

  it('D2: refine requires the refinement Target to name a real section', () => {
    const refine = composed.agents.get('smithy.refine.md')!;
    expect(refine).toMatch(/must name a section the artifact actually has/);
  });

  // D3 — smithy-prose Step 3 mandates `Skill("smithy.helper-voice")` while the
  // agent's grant was Read/Grep/Glob and its Rules forbade anything else.

  it('D3: prose grants the Skill tool it is ordered to call', () => {
    const prose = composed.agents.get('smithy.prose.md')!;
    expect(prose).toContain('Skill("smithy.helper-voice")');
    expect(prose).toMatch(/tools:\s*\n\s+-\s+Read\s*\n\s+-\s+Grep\s*\n\s+-\s+Glob\s*\n\s+-\s+Skill/);
    // The read-only rule no longer contradicts the Step 3 directive, and a
    // host without a Skill tool has a stated fallback rather than a dead end.
    expect(prose).not.toMatch(/Use only `Read`, `Grep`, and `Glob` to gather context\. Do not\n\s+create/);
    expect(prose).toMatch(/If the host exposes no `Skill` tool/);
  });

  // D4 — the gh-issue skill hard-required `gh`, so orders/engrave dead-ended on
  // gh-less hosts even though the GitHub MCP tools were already allowlisted.
  // The sibling pr-review skill is the MCP-first reference pattern.

  it('D4: gh-issue is MCP-first with the scripts as fallback', () => {
    const skill = claudeComposed.skills.get('smithy.gh-issue')!;
    expect(skill.prompt).toContain('mcp__github__issue_write');
    expect(skill.prompt).toContain('mcp__github__search_issues');
    expect(skill.prompt).toContain('## Path Selection');
    expect(skill.prompt).toMatch(/\*\*Try MCP first\.\*\*/);
    expect(skill.prompt).toMatch(/\*\*Fall back to the script\*\*/);
    // The script fallbacks survive — MCP is preferred, not exclusive.
    expect(skill.prompt).toContain('Bash(${CLAUDE_SKILL_DIR}/scripts/check-env.sh)');
    expect(skill.prompt).toContain('Bash(${CLAUDE_SKILL_DIR}/scripts/create-issue.sh *)');
    expect(skill.scripts.size).toBe(4);
  });

  it('D4: Validate Environment has a gh-free MCP path', () => {
    const skill = claudeComposed.skills.get('smithy.gh-issue')!;
    expect(skill.prompt).toContain('git config --get remote.origin.url');
    expect(skill.prompt).toMatch(/no `gh` involved|no `gh` needed|needs no `gh`/);
    // Review feedback on #581: "no shell" over-promised, since that path
    // still reads the git remote through a shell call.
    expect(skill.prompt).not.toMatch(/No shell, no `gh` CLI dependency/);
    expect(skill.prompt).toMatch(/Validate Environment is\s+the one exception/);
  });

  it('D4: Link Blocked-By states it has no MCP equivalent', () => {
    const skill = claudeComposed.skills.get('smithy.gh-issue')!;
    expect(skill.prompt).toMatch(/no MCP path for this operation/i);
    // sub_issue_write writes hierarchy, not blocked-by — do not substitute it.
    expect(skill.prompt).toContain('sub_issue_write');
  });

  it('D4: gh-issue refuses to report success when neither path exists', () => {
    const skill = claudeComposed.skills.get('smithy.gh-issue')!;
    expect(skill.prompt).toMatch(/Do not silently skip issue creation and report success/);
  });

  // D5 — orders loaded shell guidance whose first rule is "prefer MCP for issue
  // creation", then ruled that gh scripts were mandatory. Resolves with D4.

  it('D5: orders no longer mandates the gh scripts over the MCP path', () => {
    const orders = composed.commands.get('smithy.orders.md')!;
    expect(orders).not.toMatch(/Do NOT\*\* call `gh` directly for issue creation, search, or linking — go\n\s+through the `smithy\.gh-issue` skill scripts/);
    expect(orders).toMatch(/the skill owns the path choice/i);
    expect(orders).toMatch(/script-fallback form/);
    expect(orders).toMatch(/Do NOT\*\* treat a missing `gh` CLI as a dead end/);
  });

  it('D5: orders Phase 1 stops only when neither path resolves the repo', () => {
    const orders = composed.commands.get('smithy.orders.md')!;
    expect(orders).toMatch(/Stop only when\s+\*\*neither\*\* path resolves the repo/);
  });

  it('D5: engrave names both the MCP and script create paths', () => {
    const engrave = composed.commands.get('smithy.engrave.md')!;
    expect(engrave).toContain('mcp__github__issue_write');
    expect(engrave).toContain('create-issue.sh');
  });

  // D6 — forge's shared slice-completion text cited "TDD protocol step 5", but
  // the protocol snippet renders only in the Gemini/Codex `{{else}}` branch.

  it('D6: forge cites the TDD protocol only where it is actually rendered', () => {
    const claudeForge = claudeComposed.commands.get('smithy.forge.md')!;
    const defaultForge = composed.commands.get('smithy.forge.md')!;
    // Claude path: no inline protocol, so the citation points at the sub-agent.
    expect(claudeForge).not.toContain('## TDD Protocol');
    expect(claudeForge).not.toContain('(see TDD protocol step 5 above)');
    expect(claudeForge).toMatch(/step 5 of the TDD protocol that sub-agent\s+carries/);
    // Degraded path: the snippet is inline, so "above" resolves.
    expect(defaultForge).toContain('## TDD Protocol');
    expect(defaultForge).toContain('(see TDD protocol step 5 above)');
  });

  // D7 — mark scanned a bare `specs/` for existing spec folders, which is the
  // wrong root whenever artifacts live outside the repo.

  it('D7: mark honors an external artifactsRoot in both scan sites', async () => {
    const external = await getComposedTemplates(undefined, '~/.smithy/repos/demo/');
    const mark = external.commands.get('smithy.mark.md')!;
    expect(mark).toContain('Scan `~/.smithy/repos/demo/specs/` for existing folders');
    expect(mark).toContain('matching a `~/.smithy/repos/demo/specs/` folder');
  });

  // D8 — Phase 0 refinement runs sourced the one-shot `## Assumptions` section
  // from refine, but `RefineResult` is refinements + debt_items + summary. It
  // has no assumptions array to read.

  it('D8: the one-shot snippet names the no-clarify assumptions source', () => {
    const content = loadSnippets().get('one-shot-output.md')!;
    expect(content).toMatch(/On a run with no clarify pass/);
    expect(content).toContain('`RefineResult` carries `refinements`, `debt_items`, and `summary`');
    expect(content).toMatch(/Never synthesize\s+assumptions out of review findings/);
  });

  it.each(['smithy.mark.md', 'smithy.cut.md'])(
    'D8: %s Phase 0 no longer sources assumptions from refine',
    file => {
      const cmd = composed.commands.get(file)!;
      expect(cmd).not.toContain('Assumptions (from refine');
      expect(cmd).toContain('**no assumptions array**');
    },
  );

  // D9 — ignite's crash-recovery map omitted `## Dependency Order`, which
  // sub-phase 3f writes, so a file that died between the two sections
  // classified as `complete`.

  it('D9: the ignite state map credits 3f with Dependency Order', () => {
    const ignite = claudeComposed.commands.get('smithy.ignite.md')!;
    expect(ignite).toContain('| `## Milestones`, `## Dependency Order`            | 3f        |');
    // Every mandatory section in the harmonize order appears in the map.
    for (const section of [
      '## Summary',
      '## Motivation / Problem Statement',
      '## Goals',
      '## Out of Scope',
      '## Personas',
      '## Proposal',
      '## Design Considerations',
      '## Decisions',
      '## Specification Debt',
      '## Milestones',
      '## Dependency Order',
    ]) {
      expect(ignite).toContain(`\`${section}\``);
    }
  });

  // D10 — the terminal debt count came from clarify's return while the artifact
  // also carried whatever the plan-review pass appended, so the two diverged by
  // construction. The artifact is the source now.

  it('D10: the one-shot snippet sources debt from the artifact, not clarify', () => {
    const content = loadSnippets().get('one-shot-output.md')!;
    expect(content).toMatch(/\*\*the artifact is the source, not the clarify\s+return\.\*\*/);
    expect(content).toMatch(/plan-review pass\s+appends its `steering` findings to the artifact after clarify returns/);
    expect(content).toMatch(/number of unresolved rows in the artifact/);
    // Review feedback on #581: the empty-state condition still keyed on
    // clarify, which reintroduces the very mismatch D10 removes.
    expect(content).not.toMatch(/If clarify returned zero debt items/);
    expect(content).toMatch(/The condition is\s+the artifact's row count, not clarify's/);
  });

  it('D10: an inherited debt row resolves its description from the parent', () => {
    // Both reviewers on #581 flagged the same thing: a carried-down row has
    // no local detail section, and on a refinement run there is no clarify
    // return to fall back on either. Its prose lives in the parent.
    const content = loadSnippets().get('one-shot-output.md')!;
    expect(content).not.toMatch(/take the description from\s+the `debt_items` entry that produced it/);
    expect(content).toMatch(/its prose lives in the parent/);
    expect(content).toMatch(/reliable source on every kind of run/);
  });

  it('D4: the search_issues call is written against the host schema, not pinned', () => {
    // Review feedback on #581: `search_issues` differs across GitHub MCP
    // server versions — `query` is natural language on some and GitHub
    // search syntax on others, and response-trimming params are not
    // universal. Pinning either shape breaks the gh-less path on the other.
    const skill = claudeComposed.skills.get('smithy.gh-issue')!;
    expect(skill.prompt).toMatch(/Read the tool's own schema before composing the call/);
    expect(skill.prompt).not.toMatch(/`in:title` and friends are not query syntax here/);
    expect(skill.prompt).not.toMatch(/`fields` — `\["number", "title", "state", "body"\]`/);
  });

  it('D10: strike renders its debt summary from the committed artifact', () => {
    const strike = composed.commands.get('smithy.strike.md')!;
    expect(strike).not.toMatch(/copy `assumptions` and\s+`debt_items` from clarify's return/);
    expect(strike).toMatch(/source `## Specification Debt` from the committed strike/);
  });
});

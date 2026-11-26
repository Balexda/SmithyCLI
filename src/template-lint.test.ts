/**
 * The template-lint suite (issue #575).
 *
 * Each check below would have caught a confirmed finding from the 2026-08
 * skill-set audit (#551). The lints themselves live in `template-lint.ts`; this
 * file owns the thresholds, the allowlists, and the failure messages — so a
 * divergence is either fixed or written down here with a reason, and the
 * allowlists shrink as remediation lands rather than the check being deleted.
 *
 * Every check is paired with a planted-defect test, because a lint that
 * silently stopped looking passes exactly like a clean tree. The plants go
 * through `withTemplate`, which returns a modified copy of the in-memory
 * source: writing to the tracked tree would race with the other test files
 * vitest runs in parallel, and an interrupted worker would leave the mutation
 * behind.
 *
 * Two checks the issue scoped here are already asserted elsewhere and are not
 * restated: the Bash permission grammar is checked over generated settings.json
 * in `permissions.test.ts` ("writes every Bash rule in the space-wildcard
 * form") and over every skill's `allowed-tools` in `templates.test.ts` ("every
 * skill allowed-tools grant uses the one verified Bash grammar").
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DESCRIPTION_BUDGETS,
  ENUM_SCALES,
  emittedHeadings,
  crossTemplateCopyFindings,
  findCrossTemplateCopies,
  findBlankRenderedPlaceholders,
  findDeadRoutingDestinations,
  findDependencyOrderCheckboxes,
  findDuplicateInjections,
  findEnumDrift,
  findInternalReferences,
  findMissingSkillGrants,
  findMissingToolGrants,
  grantCovers,
  findOverBudgetDescriptions,
  findRestatedProtocol,
  findUnresolvedReferences,
  findUnresolvedSmithyNames,
  listAgentTemplates,
  listDescribedTemplates,
  listEnumStatements,
  listSkillGrants,
  loadTemplateSource,
  snippetCanaries,
  snippetConsumers,
  snippetNames,
  withTemplate,
  type LintFinding,
  type TemplateSource,
} from './template-lint.js';
import { agentsTemplateDir, promptsTemplateDir, snippetsTemplateDir } from './utils.js';

/** The three agent variants every deployable template is composed for. */
const VARIANTS = ['claude', 'codex', 'gemini'] as const;

/** The tree as committed. Read once; never mutated. */
let tree: TemplateSource;
beforeAll(() => { tree = loadTemplateSource(); });

/** A sub-agent with no snippet composition and a minimal grant — a clean slate to plant into. */
const PLANT_TARGET = 'agents/smithy.maid.prompt';

const report = (findings: LintFinding[]) =>
  findings.map(f => `  ${f.id} — ${f.detail}`).join('\n');

/** Drop the findings an allowlist entry accounts for, keyed `id → detail match`. */
function unallowed(findings: LintFinding[], allow: ReadonlyArray<[string, RegExp]>): LintFinding[] {
  return findings.filter(f => !allow.some(([id, re]) => f.id === id && re.test(f.detail)));
}

/** The tree with `extra` appended to one template — the standard plant. */
const plant = (id: string, extra: string) => withTemplate(tree, id, prev => `${prev}\n${extra}\n`);

describe('template lint — no duplicate snippet injection', () => {
  /**
   * A snippet's cost is its size times every deployment that composes it, so a
   * second injection into one command is charged to every agent that loads it.
   * These are the injections still standing; each is a real duplicate, and the
   * entry names what has to change for it to go away.
   */
  const ALLOWED: ReadonlyArray<[string, RegExp]> = [
    // The four authoring commands run two review loops — a Phase 0 pass over an
    // existing artifact and a post-generation pass over the one just written —
    // and each loop carries the full triage table so it can bind its own target
    // artifact and review-note surface. Removing the second copy means the
    // review agents returning a routed destination instead, which is #580.
    ['commands/smithy.cut.prompt', /\{\{>plan-review-triage\}\}/],
    ['commands/smithy.ignite.prompt', /\{\{>plan-review-triage\}\}/],
    ['commands/smithy.mark.prompt', /\{\{>plan-review-triage\}\}/],
    ['commands/smithy.render.prompt', /\{\{>plan-review-triage\}\}/],
    // `debt-row-shape` is nested inside `plan-review-triage`, so it is the same
    // duplication counted one level down and clears with the rows above.
    ['commands/smithy.cut.prompt', /\{\{>debt-row-shape\}\}/],
    ['commands/smithy.ignite.prompt', /\{\{>debt-row-shape\}\}/],
    ['commands/smithy.mark.prompt', /\{\{>debt-row-shape\}\}/],
    ['commands/smithy.render.prompt', /\{\{>debt-row-shape\}\}/],
    // `debt-row-append` is the one rule for adding a debt or IQ row, nested in
    // each producer's consumer rule: both `plan-review-triage` copies above,
    // `debt-from-clarify` at draft time, and `debt-from-refine` in Phase 0.
    // The triage pair clears with the rows above; the other two are distinct
    // steps whose rule would otherwise drift back into two spellings (INV-1).
    ['commands/smithy.cut.prompt', /\{\{>debt-row-append\}\}/],
    ['commands/smithy.ignite.prompt', /\{\{>debt-row-append\}\}/],
    ['commands/smithy.mark.prompt', /\{\{>debt-row-append\}\}/],
    ['commands/smithy.render.prompt', /\{\{>debt-row-append\}\}/],
  ];

  for (const variant of VARIANTS) {
    it(`composes each snippet at most once per template (${variant})`, async () => {
      const findings = unallowed(await findDuplicateInjections(variant, tree), ALLOWED);
      expect(findings, `unexpected duplicate snippet injections:\n${report(findings)}`).toEqual([]);
    });
  }

  it('detects a planted duplicate', async () => {
    const planted = plant(PLANT_TARGET, '{{>branch-policy}}\n{{>branch-policy}}');
    expect(await findDuplicateInjections('claude', planted)).toContainEqual({
      id: PLANT_TARGET,
      detail: 'injects {{>branch-policy}} 2 times',
    });
  });

  it('counts an injection nested inside another snippet', async () => {
    // `review-protocol` composes `kind-gate`; injecting the gate alongside it
    // is a duplicate the sentinel sees only because nested partials still
    // render and still emit their own marker.
    const planted = plant(PLANT_TARGET, '{{>review-protocol}}\n{{>kind-gate}}');
    const findings = await findDuplicateInjections('claude', planted);
    expect(findings).toContainEqual({ id: PLANT_TARGET, detail: 'injects {{>kind-gate}} 2 times' });
  });
});

describe('template lint — no restated protocol', () => {
  /**
   * A canonical protocol's text appearing in a template that did not compose it
   * is a hand-maintained copy, and drift in a copy of a safety protocol changes
   * behavior silently (INV-1).
   */
  const ALLOWED: ReadonlyArray<[string, RegExp]> = [
    // mark's Phase 0 refine categories restate eight rows of the spec audit
    // checklist verbatim while deliberately diverging on four (Priority
    // Ordering, Specification Debt, Dependency Order, and no Over-Specification
    // row); render's do the same against the feature-map checklist. That is
    // INV-1's "genuine variant" case, which the invariant says to resolve by
    // extracting the shared rows rather than by keeping two tables. Doing so
    // reconciles four divergences that look deliberate in both directions, so
    // it changes what the refine loop assesses: remediation work, tracked in
    // #595, rather than part of the prevention layer.
    ['commands/smithy.mark.prompt', /restates audit-checklist-spec/],
    ['commands/smithy.render.prompt', /restates audit-checklist-features/],
  ];

  for (const variant of VARIANTS) {
    it(`carries canonical protocol text only where it is composed (${variant})`, async () => {
      const findings = unallowed(await findRestatedProtocol(variant, tree), ALLOWED);
      expect(findings, `protocol text restated instead of composed:\n${report(findings)}`).toEqual([]);
    });
  }

  it('gives every snippet at least one line distinctive enough to detect', () => {
    // The check above is only as good as its canaries: a snippet with none is
    // silently unprotected. Raw source rather than rendered text is what makes
    // this hold — a nested snippet would otherwise have every line claimed by
    // its parent as well.
    const canaries = snippetCanaries(tree);
    const bare = snippetNames(tree).filter(n => (canaries.get(n) ?? []).length === 0);
    expect(bare, `snippets with no unique canary line: ${bare.join(', ')}`).toEqual([]);
  });

  it('detects a planted restatement', async () => {
    const planted = plant(PLANT_TARGET, snippetCanaries(tree).get('kind-gate')![0]!);
    expect((await findRestatedProtocol('claude', planted)).map(f => f.id)).toContain(PLANT_TARGET);
  });

  it('stays silent when the same text arrives by composing the snippet', async () => {
    // The count is per-snippet against its own injection count, not against
    // zero — otherwise every legitimate consumer would be a finding.
    const planted = plant(PLANT_TARGET, '{{>kind-gate}}');
    expect((await findRestatedProtocol('claude', planted)).map(f => f.id)).not.toContain(PLANT_TARGET);
  });
});

describe('template lint — no passage copied between templates', () => {
  /**
   * `findRestatedProtocol` sees only text a snippet owns; this sees a passage
   * pasted from one template into another before any snippet exists (INV-1,
   * D-1). Each entry is one side of a copy and names the issue that extracts
   * it; the extraction deletes both sides' entries.
   */
  const ALLOWED: ReadonlyArray<[string, RegExp]> = [
    // The copies still on the tree from when the lint landed, one INV-1
    // ledger row each. #646.
    // implement and implementation-review: the reference-document input list.
    ['agents/smithy.implement.prompt', /also in agents\/smithy\.implementation-review\.prompt: 4\. \*\*File paths\*\*/],
    ['agents/smithy.implementation-review.prompt', /also in agents\/smithy\.implement\.prompt: 4\. \*\*File paths\*\*/],
    // plan and slice: the dispatch input list and the Decisions/Risks shape.
    ['agents/smithy.plan.prompt', /also in agents\/smithy\.slice\.prompt: (3\. \*\*Codebase file paths\*\*|5\. \*\*Additional planning directives\*\*|\| Decision \| Alternatives \| Rationale \|)/],
    ['agents/smithy.slice.prompt', /also in agents\/smithy\.plan\.prompt: (3\. \*\*Codebase file paths\*\*|5\. \*\*Additional planning directives\*\*|\| Decision \| Alternatives \| Rationale \|)/],
    // slice and cut: the slice body scaffold.
    ['agents/smithy.slice.prompt', /also in commands\/smithy\.cut\.prompt: \*\*Addresses\*\*/],
    ['commands/smithy.cut.prompt', /also in agents\/smithy\.slice\.prompt: \*\*Addresses\*\*/],
    // ignite, render and mark: presenting the reconciled plan.
    ['commands/smithy.ignite.prompt', /also in commands\/smithy\.(mark|render)\.prompt: items annotated with/],
    ['commands/smithy.mark.prompt', /also in commands\/smithy\.(ignite|render)\.prompt: items annotated with/],
    ['commands/smithy.render.prompt', /also in commands\/smithy\.(ignite|mark)\.prompt: items annotated with/],
    // mark and render: scout-result handling and the plan dispatch inputs.
    ['commands/smithy.mark.prompt', /also in commands\/smithy\.render\.prompt: (- \*\*Warnings\*\*|- \*\*Scout report\*\*)/],
    ['commands/smithy.render.prompt', /also in commands\/smithy\.mark\.prompt: (- \*\*Warnings\*\*|- \*\*Scout report\*\*)/],
    // gh-issue and pr-review: parsing the origin remote into owner and repo.
    ['skills/smithy.gh-issue/SKILL.prompt', /also in skills\/smithy\.pr-review\/SKILL\.prompt: git config --get remote\.origin\.url/],
    ['skills/smithy.pr-review/SKILL.prompt', /also in skills\/smithy\.gh-issue\/SKILL\.prompt: git config --get remote\.origin\.url/],
  ];

  const passage = [
    'When the reviewer returns a finding with no evidence, discard it and record why.',
    'When the reviewer returns two findings for one line, keep the more severe one.',
    'When the reviewer cannot read a file, report the path as unread rather than clean.',
    'When the reviewer times out, rerun it once and then report the partial result.',
  ].join('\n');

  it('carries no passage in two templates outside a snippet', () => {
    const findings = unallowed(crossTemplateCopyFindings(tree), ALLOWED);
    expect(findings, `passages copied between templates:\n${report(findings)}`).toEqual([]);
  });

  it('detects a planted copy, from both sides', () => {
    const planted = withTemplate(
      plant(PLANT_TARGET, passage), 'agents/smithy.scout.prompt', prev => `${prev}\n\n${passage}\n`);
    const pair = findCrossTemplateCopies(planted)
      .filter(c => [PLANT_TARGET, 'agents/smithy.scout.prompt'].includes(c.id) && c.first.startsWith('When the reviewer'));
    expect(pair.map(c => [c.id, c.other, c.length])).toEqual(expect.arrayContaining([
      [PLANT_TARGET, 'agents/smithy.scout.prompt', 4],
      ['agents/smithy.scout.prompt', PLANT_TARGET, 4],
    ]));
  });

  it('excuses only the recorded passages, not every copy between an allowlisted pair', () => {
    // An entry is one ledger row; a new passage between the same two
    // templates has no row, so it must still fail.
    const planted = withTemplate(
      plant('agents/smithy.implement.prompt', passage), 'agents/smithy.implementation-review.prompt',
      prev => `${prev}\n\n${passage}\n`);
    const left = unallowed(crossTemplateCopyFindings(planted), ALLOWED);
    expect(left.map(f => f.id)).toEqual(expect.arrayContaining([
      'agents/smithy.implement.prompt', 'agents/smithy.implementation-review.prompt',
    ]));
  });

  it('sees a copy through re-indentation and blank lines', () => {
    const reflowed = passage.split('\n').map(l => `   ${l.replace(/ /g, '  ')}\n`).join('\n');
    const planted = withTemplate(
      plant(PLANT_TARGET, passage), 'agents/smithy.scout.prompt', prev => `${prev}\n${reflowed}`);
    expect(findCrossTemplateCopies(planted).some(c => c.id === 'agents/smithy.scout.prompt' && c.other === PLANT_TARGET))
      .toBe(true);
  });

  it('stays silent when both templates compose the text from a snippet', () => {
    // The comparison is over authored source, where a composed passage is one
    // `{{>…}}` line — the shape INV-1 asks for.
    const planted = withTemplate(
      plant(PLANT_TARGET, '{{>kind-gate}}'), 'agents/smithy.scout.prompt', prev => `${prev}\n{{>kind-gate}}\n`);
    expect(findCrossTemplateCopies(planted).filter(c => c.id === PLANT_TARGET)).toEqual([]);
  });

  it('ignores a run shorter than the threshold', () => {
    const three = passage.split('\n').slice(0, 3).join('\n');
    const planted = withTemplate(
      plant(PLANT_TARGET, three), 'agents/smithy.scout.prompt', prev => `${prev}\n\n${three}\n`);
    expect(findCrossTemplateCopies(planted).filter(c => c.id === PLANT_TARGET)).toEqual([]);
  });

  it('ignores shared headings, fences, table separators, and short lines', () => {
    const structure = [
      '## Phase 3: Review the reconciled plan against the spec',
      '```markdown',
      '| Field | Meaning | Required |',
      '|-------|---------|----------|',
      '```',
      '- **Yes** — proceed.',
      '### Output',
      '---',
    ].join('\n');
    const planted = withTemplate(
      plant(PLANT_TARGET, structure), 'agents/smithy.scout.prompt', prev => `${prev}\n${structure}\n`);
    expect(findCrossTemplateCopies(planted).filter(c => c.id === PLANT_TARGET)).toEqual([]);
  });
});

describe('template lint — Dependency Order is a table (INV-8)', () => {
  const ALLOWED: ReadonlyArray<[string, RegExp]> = [
    // Both decomposition agents emit their slice ordering as a numbered
    // checkbox list instead of the four-column table. #649.
    ['agents/smithy.slice.prompt', /checkbox under Dependency Order/],
    ['agents/smithy.reconcile-slices.prompt', /checkbox under Dependency Order/],
  ];

  it('shows no checkbox list under a Dependency Order heading', () => {
    const findings = unallowed(findDependencyOrderCheckboxes(tree), ALLOWED);
    expect(findings, `checkbox Dependency Order lists:\n${report(findings)}`).toEqual([]);
  });

  it('detects a planted checkbox list, at any heading level and inside a fence', () => {
    const planted = plant(PLANT_TARGET, [
      '## Dependency Order', '', '- [ ] US1 → specs/x', '',
      '```markdown', '#### Dependency Order', '1. [x] **Slice 1** — first', '```',
    ].join('\n'));
    const details = findDependencyOrderCheckboxes(planted).filter(f => f.id === PLANT_TARGET).map(f => f.detail);
    expect(details).toHaveLength(2);
    expect(details[0]).toContain('- [ ] US1');
    expect(details[1]).toContain('1. [x] **Slice 1**');
  });

  it('leaves task checkboxes in a Slice body alone', () => {
    const planted = plant(PLANT_TARGET, [
      '## Dependency Order', '', '| ID | Title | Depends On | Artifact |', '|----|----|----|----|',
      '| S1 | First | — | — |', '', '## Slice 1: First', '', '- [ ] Write the failing test',
      '### Slice 2 notes', '- [x] Done',
    ].join('\n'));
    expect(findDependencyOrderCheckboxes(planted).filter(f => f.id === PLANT_TARGET)).toEqual([]);
  });

  it('keeps a longer fence open across a shorter marker inside it', () => {
    const planted = plant(PLANT_TARGET, [
      '````markdown', '## Dependency Order', '```', '- [ ] US1 → specs/x', '````',
    ].join('\n'));
    expect(findDependencyOrderCheckboxes(planted).filter(f => f.id === PLANT_TARGET).map(f => f.detail))
      .toContainEqual(expect.stringContaining('- [ ] US1'));
  });

  it('closes the section at a fence boundary', () => {
    // An output example's heading scopes only that example; prose after the
    // fence belongs to the template's own section.
    const planted = plant(PLANT_TARGET, [
      '```markdown', '## Dependency Order', '| ID | Title | Depends On | Artifact |', '```',
      '- [ ] Confirm the table above parses',
    ].join('\n'));
    expect(findDependencyOrderCheckboxes(planted).filter(f => f.id === PLANT_TARGET)).toEqual([]);
  });
});

describe('template lint — routing destinations exist', () => {
  /**
   * A destination that exists only in a routing table sends every finding of
   * that kind nowhere — audit defect D2, where "Cross-Cutting Governance
   * matrix" was named by five references and defined by no template.
   */
  const ALLOWED: ReadonlyArray<[string, RegExp]> = [
    // Both of these name a block the sub-agent is told to *emit* in its own
    // response, not a section some template scaffolds: survey returns a
    // `### Error` block when it cannot search, and prose appends
    // `## Gaps / Missing Context` to what it drafts. The section exists at
    // runtime, in the agent's output. Level-blind matching used to hide these
    // by borrowing the other agent's heading at the wrong level.
    ['agents/smithy.survey.prompt', /### Error/],
    ['agents/smithy.prose.prompt', /## Gaps \/ Missing Context/],
  ];

  it('routes findings only to sections some template emits', () => {
    const findings = unallowed(findDeadRoutingDestinations(tree), ALLOWED);
    expect(findings, `findings routed to sections nothing produces:\n${report(findings)}`).toEqual([]);
  });

  it('detects a planted dead destination', () => {
    const planted = plant('snippets/kind-gate.md', 'Route leftovers to `## Cross-Cutting Governance matrix`.');
    expect(findDeadRoutingDestinations(planted).map(f => f.detail))
      .toContainEqual(expect.stringContaining('Cross-Cutting Governance matrix'));
  });

  it('holds the destination to the heading level it names', () => {
    // `## Error` and `### Error` are different insertion points, so one
    // template's scaffold must not satisfy another's reference at the other
    // level. `smithy.survey` makes the distinction explicitly in its own prose.
    expect(emittedHeadings(tree).has('## Specification Debt')).toBe(true);
    expect(emittedHeadings(tree).has('### Specification Debt')).toBe(false);

    const planted = plant('snippets/kind-gate.md', 'File it under `#### Specification Debt`.');
    expect(findDeadRoutingDestinations(planted).map(f => f.detail))
      .toContainEqual(expect.stringContaining('#### Specification Debt'));
  });

  it('recognises a heading a scaffold only illustrates', () => {
    // Scaffolds are shown blockquoted, fenced, and indented; a destination that
    // resolves to one of those is live, not dead.
    expect(emittedHeadings(tree).has('## Open Implementation Questions')).toBe(true);
  });
});

describe('template lint — agent tool grants cover what the body invokes', () => {
  it('grants every tool a sub-agent body names', () => {
    // Audit defect D3: smithy-prose was ordered to call
    // `Skill("smithy.helper-voice")` with a Read/Grep/Glob grant, so the voice
    // step silently could not happen.
    const findings = findMissingToolGrants(tree);
    expect(findings, `sub-agent bodies invoking ungranted tools:\n${report(findings)}`).toEqual([]);
  });

  it('detects a planted ungranted invocation', () => {
    const planted = plant(PLANT_TARGET, 'Run `Bash` to confirm the tree is clean.');
    expect(findMissingToolGrants(planted)).toContainEqual({
      id: PLANT_TARGET,
      detail: 'body invokes Bash but tools: grants only Read, Grep, Glob',
    });
  });

  it('detects a planted Skill call with no Skill grant', () => {
    // The exact shape of D3.
    const planted = plant(PLANT_TARGET, 'Then call Skill("smithy.helper-voice") on the draft.');
    expect(findMissingToolGrants(planted).map(f => f.detail))
      .toContainEqual(expect.stringContaining('body invokes Skill'));
  });

  it('reads a tools: grant off every sub-agent, in both authored forms', () => {
    // A parse that silently returned nothing would make the check above
    // vacuous; `tools:` is written inline on one agent and as a block list on
    // the rest.
    for (const agent of listAgentTemplates(tree)) {
      expect(agent.name, agent.id).toMatch(/^smithy-/);
      expect(agent.tools.length, `${agent.id} grants no tools`).toBeGreaterThan(0);
      expect(agent.tools, agent.id).toContain('Read');
    }
  });
});

describe('template lint — skill grants cover what the body invokes (INV-3)', () => {
  const ALLOWED: ReadonlyArray<[string, RegExp]> = [
    // Both GitHub skills tell the agent to write its body file with a
    // `cat > … << 'EOF'` heredoc that `allowed-tools` does not grant, so the
    // step prompts on every run. #652.
    ['skills/smithy.gh-issue/SKILL.prompt', /invokes Bash\(cat > \/tmp\//],
    ['skills/smithy.pr-review/SKILL.prompt', /invokes Bash\(cat > \/tmp\//],
  ];
  const SKILL = 'skills/smithy.status/SKILL.prompt';
  const CODEX_SKILL = 'skills/smithy.pr-review/SKILL.prompt';

  it('grants every script, shell command, MCP tool, and Codex action a skill body uses', async () => {
    const findings = unallowed(await findMissingSkillGrants(tree), ALLOWED);
    expect(findings, `skill bodies invoking ungranted tools:\n${report(findings)}`).toEqual([]);
  });

  it('reads the grant lists the deployers read', () => {
    // A parse that returned nothing would make every invocation look ungranted
    // and every skill without a grant look clean.
    const grants = new Map(listSkillGrants(tree).map(g => [g.id, g]));
    expect(grants.get(SKILL)!.allowed).toEqual(['Bash(smithy status *)']);
    expect(grants.get(CODEX_SKILL)!.codex).toContain('_fetch_pr_comments');
    expect(grants.get('skills/smithy.gh-issue/SKILL.prompt')!.allowed)
      .toContain('Bash(${CLAUDE_SKILL_DIR}/scripts/search-issues.sh *)');
  });

  it('detects a planted shell command outside the grant', async () => {
    const planted = plant(SKILL, '```bash\nrm -rf node_modules\n```');
    expect(await findMissingSkillGrants(planted)).toContainEqual({
      id: SKILL, detail: 'invokes Bash(rm -rf node_modules) but allowed-tools does not cover it',
    });
  });

  it('detects an ungranted command in a tilde fence', async () => {
    const planted = plant(SKILL, '~~~bash\nrm -rf node_modules\n~~~');
    expect((await findMissingSkillGrants(planted)).map(f => f.detail))
      .toContainEqual('invokes Bash(rm -rf node_modules) but allowed-tools does not cover it');
  });

  it('splits compound commands whatever the spacing around the operator', async () => {
    // Otherwise the granted prefix's wildcard absorbs the second command.
    const planted = plant(SKILL, '```bash\nsmithy status --format json; rm -rf node_modules&touch x\n```');
    const details = (await findMissingSkillGrants(planted)).filter(f => f.id === SKILL).map(f => f.detail);
    expect(details).toContainEqual('invokes Bash(rm -rf node_modules) but allowed-tools does not cover it');
    expect(details).toContainEqual('invokes Bash(touch x) but allowed-tools does not cover it');
  });

  it('checks Codex actions in a skill that omits codex-allowed-tools', async () => {
    const planted = withTemplate(tree, CODEX_SKILL, prev => prev.replace(/^codex-allowed-tools:.*\n/m, ''));
    expect((await findMissingSkillGrants(planted)).map(f => f.detail))
      .toContainEqual('invokes _fetch_pr_comments on Codex but codex-allowed-tools does not list it');
  });

  it('detects a planted bundled script with arguments under an exact-match grant', async () => {
    // `Bash(…/find-pr.sh)` matches the bare script only; arguments need ` *`.
    const planted = plant(CODEX_SKILL, '```bash\n{{#ifAgent \'claude\'}}${CLAUDE_SKILL_DIR}/scripts/find-pr.sh --all{{/ifAgent}}\n```');
    expect((await findMissingSkillGrants(planted)).map(f => f.detail))
      .toContainEqual('invokes Bash(${CLAUDE_SKILL_DIR}/scripts/find-pr.sh --all) but allowed-tools does not cover it');
  });

  it('detects a planted MCP tool, Skill call, and Codex action', async () => {
    const planted = plant(CODEX_SKILL,
      'Call `mcp__github__merge_pull_request`, then Skill("smithy.status"), then `_merge_pull_request`.');
    const details = (await findMissingSkillGrants(planted)).filter(f => f.id === CODEX_SKILL).map(f => f.detail);
    expect(details).toContainEqual('invokes mcp__github__merge_pull_request but allowed-tools does not cover it');
    expect(details).toContainEqual('invokes Skill(smithy.status) but allowed-tools does not cover it');
    expect(details).toContainEqual('invokes _merge_pull_request on Codex but codex-allowed-tools does not list it');
  });

  it('stays silent on granted uses, continued lines, quoted operators, heredoc bodies, and other agents\' script paths', async () => {
    const planted = plant(SKILL, [
      '```bash', 'smithy status --format json && smithy status --graph', '```',
      '```bash', 'smithy status \\', '  --format json 2>&1 | smithy status --graph', '```',
      '```bash', 'smithy status --root "a;b|c"', '```',
      '```bash', 'smithy status > /dev/null <<EOF', 'rm -rf /', 'EOF', '```',
      '```bash', '{{#ifAgent \'codex\'}}./.agents/skills/smithy.status/scripts/nope.sh{{/ifAgent}}', '```',
    ].join('\n'));
    expect((await findMissingSkillGrants(planted)).filter(f => f.id === SKILL)).toEqual([]);
  });

  it('matches rules by the documented permission grammar', () => {
    expect(grantCovers('Bash(smithy status *)', 'Bash(smithy status)')).toBe(true);
    expect(grantCovers('Bash(smithy status *)', 'Bash(smithy status --format json)')).toBe(true);
    expect(grantCovers('Bash(smithy status *)', 'Bash(smithy statusline)')).toBe(false);
    expect(grantCovers('Bash(git branch --show-current)', 'Bash(git branch --show-current)')).toBe(true);
    expect(grantCovers('Bash(git branch --show-current)', 'Bash(git branch --show-current -v)')).toBe(false);
    expect(grantCovers('Skill(smithy.status)', 'Skill(smithy.status)')).toBe(true);
    expect(grantCovers('mcp__github__*', 'mcp__github__issue_write')).toBe(true);
    expect(grantCovers('mcp__github__issue_read', 'mcp__github__issue_write')).toBe(false);
  });
});

describe('template lint — references resolve', () => {
  it('composes only snippets that exist and invokes only skills that exist', () => {
    const findings = findUnresolvedReferences(tree);
    expect(findings, `unresolved snippet or skill references:\n${report(findings)}`).toEqual([]);
  });

  it('names only smithy identifiers that are deployed', () => {
    const findings = findUnresolvedSmithyNames(tree);
    expect(findings, `dispatch names matching nothing deployed:\n${report(findings)}`).toEqual([]);
  });

  it('detects a planted dead dispatch in the dashed spelling', () => {
    const planted = plant(PLANT_TARGET, 'Dispatch the **smithy-harmonize** sub-agent.');
    expect(findUnresolvedSmithyNames(planted)).toContainEqual({
      id: PLANT_TARGET,
      detail: 'names `smithy-harmonize`, which matches no deployed agent, command, prompt, or skill',
    });
  });

  it('detects a planted dead reference in the dotted spelling', () => {
    // Claude names a command by its filename and a skill by its directory, so
    // a rename can leave a broken `/smithy.…` instruction that the dashed
    // Codex spelling never shows.
    const planted = plant(PLANT_TARGET, 'Hand the result to `/smithy.harmonize` when finished.');
    expect(findUnresolvedSmithyNames(planted).map(f => f.detail))
      .toContainEqual(expect.stringContaining('smithy.harmonize'));
  });

  it('accepts both deployed spellings of a name that exists', () => {
    const planted = plant(PLANT_TARGET, 'See `/smithy.forge`, smithy-forge, and Skill("smithy.status").');
    expect(findUnresolvedSmithyNames(planted).filter(f => f.id === PLANT_TARGET)).toEqual([]);
  });

  it('detects a planted dead snippet reference', () => {
    const planted = plant(PLANT_TARGET, '{{>no-such-snippet}}');
    expect(findUnresolvedReferences(planted).map(f => f.detail))
      .toContainEqual(expect.stringContaining('no-such-snippet'));
  });
});

describe('template lint — portability (INV-2)', () => {
  it('ships no reference that resolves only inside SmithyCLI', () => {
    const findings = findInternalReferences(tree);
    expect(findings, `SmithyCLI-internal references in deployable text:\n${report(findings)}`).toEqual([]);
  });

  it('detects planted internal references', () => {
    const planted = plant(PLANT_TARGET, 'See `src/manifest.ts:38-43` and issue #551 for the rationale.');
    const details = findInternalReferences(planted).filter(f => f.id === PLANT_TARGET).map(f => f.detail);
    expect(details).toContainEqual(expect.stringContaining('source path with a line number'));
    expect(details).toContainEqual(expect.stringContaining('SmithyCLI issue or PR number'));
  });

  it('leaves an illustrative example path alone', () => {
    // INV-2 exempts purely illustrative paths — an example is not an
    // instruction — so the lint must not fire on the tree's deliberate ones.
    const spark = tree.templates.find(t => t.id === 'commands/smithy.spark.prompt')!;
    expect(spark.source).toContain('src/templates/agent-skills/');
    expect(findInternalReferences(tree).some(f => f.id === 'commands/smithy.spark.prompt')).toBe(false);
  });
});

describe('template lint — description budgets (P-1)', () => {
  /**
   * Descriptions sit in context before any work begins, so they are dispatch
   * triggers rather than documentation.
   */
  const EXEMPT = new Set([
    // The status skill's description *is* its trigger list — the natural-language
    // questions the model matches on to load the body instead of guessing. P-1
    // bounds unrequested context; this is the content that decides whether the
    // rest of the skill is requested at all.
    'smithy.status',
  ]);

  it('keeps every description inside its surface budget', () => {
    const findings = findOverBudgetDescriptions(EXEMPT, tree);
    expect(findings, `descriptions over budget or missing:\n${report(findings)}`).toEqual([]);
  });

  it('declares a description on every command, sub-agent, and skill', () => {
    const described = listDescribedTemplates(tree);
    expect(described.length).toBeGreaterThan(30);
    for (const t of described) {
      expect(t.description, `${t.id} declares no description`).not.toBe('');
    }
  });

  it('detects a planted over-budget description', () => {
    const bloat = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const planted = withTemplate(tree, PLANT_TARGET, prev =>
      prev.replace(/^description:.*$/m, `description: "${bloat}"`));
    expect(findOverBudgetDescriptions(EXEMPT, planted).map(f => f.detail))
      .toContainEqual(expect.stringContaining('over the 40-word agents budget'));
  });

  it('budgets the always-advertised surfaces at least as tightly as the lazy one', () => {
    // The ordering is the rule, not the numbers: a sub-agent's description is
    // carried by every parent that can dispatch it, while a skill's buys the
    // decision not to load its body.
    expect(DESCRIPTION_BUDGETS.agents).toBeLessThanOrEqual(DESCRIPTION_BUDGETS.skills);
    expect(DESCRIPTION_BUDGETS.commands).toBeLessThanOrEqual(DESCRIPTION_BUDGETS.skills);
  });
});

describe('template lint — one enum per scale', () => {
  it('states each grading scale with the values it admits', () => {
    // The audit found Confidence incompatible across the pipeline. A template
    // stating a subset agrees; one offering an outside value has invented a
    // scale, which is what this rejects.
    const findings = findEnumDrift(tree);
    expect(findings, `grading scales stated with foreign values:\n${report(findings)}`).toEqual([]);
  });

  it('harvests the enumerations the tree actually carries', () => {
    // A harvest that matched nothing would make the check above vacuous.
    const statements = listEnumStatements(tree);
    expect(statements.length).toBeGreaterThan(5);
    for (const field of Object.keys(ENUM_SCALES)) {
      expect(statements.some(s => s.field === field), `no ${field} enumeration harvested`).toBe(true);
    }
  });

  it('keeps debt-row-shape the canonical home of all three scales', () => {
    const canonical = tree.snippets.get('debt-row-shape.md')!;
    expect(canonical).toContain('`Critical` / `High` / `Medium` / `Low`');
    expect(canonical).toContain('`High` / `Medium` / `Low`');
    expect(canonical).toContain('`Critical` / `Important` / `Minor`');
  });

  it('detects a planted foreign value', () => {
    const planted = plant(PLANT_TARGET, 'Grade each **Impact** as Critical / Important / Minor.');
    expect(findEnumDrift(planted).map(f => f.detail))
      .toContainEqual(expect.stringContaining('Important, Minor are not impact values'));
  });
});

describe('template lint — rosters match the tree', () => {
  const agentNames = () => listAgentTemplates(tree).map(a => a.name).sort();

  it('lists every sub-agent in agents/README.md and nothing else', () => {
    const readme = fs.readFileSync(path.join(agentsTemplateDir, 'README.md'), 'utf8');
    const listed = [...new Set([...readme.matchAll(/\bsmithy-[a-z][a-z-]*/g)].map(m => m[0]))].sort();
    expect(listed).toEqual(agentNames());
  });

  it('lists every sub-agent in CLAUDE.md and nothing else', () => {
    const claudeMd = fs.readFileSync(path.join(agentsTemplateDir, '../../../../CLAUDE.md'), 'utf8');
    const listed = [...new Set([...claudeMd.matchAll(/\bsmithy-[a-z][a-z-]*\b(?![.:])/g)].map(m => m[0]))].sort();
    expect(listed).toEqual(agentNames());
  });

  it('matches the snippets README Used By column against actual composition', () => {
    const readme = fs.readFileSync(path.join(snippetsTemplateDir, 'README.md'), 'utf8');
    const consumers = snippetConsumers(tree);
    const rows = [...readme.matchAll(/^\|\s*`([a-z0-9-]+)\.md`\s*\|[^|]*\|([^|]*)\|\s*$/gm)];
    expect(rows.length, 'snippets README has no Used By table').toBeGreaterThan(0);

    const documented = new Set(rows.map(r => r[1]!));
    expect([...consumers.keys()].filter(n => !documented.has(n)), 'snippets missing from the README table').toEqual([]);

    for (const row of rows) {
      const name = row[1]!;
      // The column is prose: entries carry qualifiers ("forge (degraded
      // branch)") and name kinds ("recall agent", "guidance (the prompt)").
      const listed = new Set(
        row[2]!.split(/[,;]/)
          .map(s => s.replace(/\([^)]*\)/g, '').replace(/\b(agent|prompt|the)\b/g, '').trim())
          .filter(Boolean)
          .map(s => s.replace(/^smithy[.-]/, '')),
      );
      const actual = new Set([...(consumers.get(name) ?? [])].filter(c => c !== 'README'));
      expect([...listed].sort(), `${name}.md Used By column`).toEqual([...actual].sort());
    }
  });

  it('matches the prompts README Referenced By column against actual references', () => {
    const readme = fs.readFileSync(path.join(promptsTemplateDir, 'README.md'), 'utf8');
    const rows = [...readme.matchAll(/^\|\s*`smithy\.([a-z-]+)`\s*\|[^|]*\|([^|]*)\|\s*$/gm)];
    expect(rows.length, 'prompts README has no Referenced By table').toBeGreaterThan(0);

    for (const row of rows) {
      const promptName = row[1]!;
      const listed = new Set(
        row[2]!.split(/[,—]/)
          .map(s => s.trim())
          .filter(s => /^[a-z]+$/.test(s)),
      );
      const actual = new Set(
        tree.templates
          .filter(t => t.category === 'commands' || t.category === 'agents')
          .filter(t => t.source.includes(`smithy.${promptName}`) || t.source.includes(`smithy-${promptName}`))
          .map(t => path.basename(t.id).replace(/^smithy\./, '').replace(/\.prompt$/, '')),
      );
      expect([...listed].sort(), `smithy.${promptName} Referenced By column`).toEqual([...actual].sort());
    }
  });
});

describe('template lint — no placeholder renders blank', () => {
  // Deploy-time Handlebars renders with an empty context, so a bare
  // `{{name}}` the agent was meant to substitute at run time deploys as an
  // empty string. Escaped (`\{{name}}`), partial, block, and comment forms
  // are not bare, and `artifactsRoot` / `else` are defined by the renderer.
  it('finds no bare mustache outside the render-time names', () => {
    const findings = findBlankRenderedPlaceholders(tree);
    expect(findings, `placeholders that deploy blank:\n${report(findings)}`).toEqual([]);
  });

  it('detects a planted bare placeholder', () => {
    const planted = plant(PLANT_TARGET, '- `{{issue_title}}` ← the title');
    const findings = findBlankRenderedPlaceholders(planted);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.id).toBe(PLANT_TARGET);
    expect(findings[0]!.detail).toMatch(/\{\{issue_title\}\} renders blank/);
  });

  it('passes escaped placeholders, helpers, partials, blocks, and comments', () => {
    const planted = plant(PLANT_TARGET, [
      '- `\\{{issue_title}}` ← the title',
      '{{artifactsRoot}}specs/',
      '{{#ifAgent}}a{{else}}b{{/ifAgent}}',
      '{{>branch-policy}}',
      '{{!-- a comment --}}',
      '{{!-- Example: {{issue_title}} --}}',
      '{{!-- spans',
      'two lines: {{issue_title}} --}}',
      '{{! short comment }}',
    ].join('\n'));
    expect(findBlankRenderedPlaceholders(planted)).toEqual([]);
  });

  it('detects a bare placeholder split across lines, at the line it opens on', () => {
    const planted = withTemplate(tree, PLANT_TARGET, () => 'intro\n- `{{\nissue_title\n}}` ← the title\n');
    expect(findBlankRenderedPlaceholders(planted)).toEqual([
      { id: PLANT_TARGET, detail: 'line 2: {{issue_title}} renders blank; escape it as \\{{issue_title}}' },
    ]);
  });

  it('still reports a bare placeholder after a comment, on its own line number', () => {
    const planted = withTemplate(tree, PLANT_TARGET, () => '{{!-- a\ncomment {{x}} --}} {{issue_title}}\n');
    expect(findBlankRenderedPlaceholders(planted)).toEqual([
      { id: PLANT_TARGET, detail: 'line 2: {{issue_title}} renders blank; escape it as \\{{issue_title}}' },
    ]);
  });
});

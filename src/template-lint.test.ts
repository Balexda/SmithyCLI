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
  findDeadRoutingDestinations,
  findDuplicateInjections,
  findEnumDrift,
  findInternalReferences,
  findMissingToolGrants,
  findOverBudgetDescriptions,
  findRestatedProtocol,
  findUnresolvedReferences,
  findUnresolvedSmithyNames,
  listAgentTemplates,
  listDescribedTemplates,
  listEnumStatements,
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
    // A single sentence naming the PR-creation tool preference, bound into two
    // different phase steps that each hand the reader a command to run. The
    // second injection costs one line, and collapsing the two phases to share
    // one mention would put the instruction far from one of its uses.
    ['commands/smithy.cut.prompt', /\{\{>pr-create-tool-choice\}\}/],
    ['commands/smithy.ignite.prompt', /\{\{>pr-create-tool-choice\}\}/],
    ['commands/smithy.render.prompt', /\{\{>pr-create-tool-choice\}\}/],
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

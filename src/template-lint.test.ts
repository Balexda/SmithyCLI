/**
 * The template-lint suite (issue #575).
 *
 * Each check below would have caught a confirmed finding from the 2026-08
 * skill-set audit (#551). The lints themselves live in `template-lint.ts`; this
 * file owns the thresholds, the allowlists, and the failure messages — so a
 * divergence is either fixed or written down here with a reason, and the
 * allowlists shrink as remediation lands rather than the check being deleted.
 *
 * Two checks the issue scoped here are already asserted elsewhere and are not
 * restated: the Bash permission grammar is checked over generated settings.json
 * in `permissions.test.ts` ("writes every Bash rule in the space-wildcard
 * form") and over every skill's `allowed-tools` in `templates.test.ts` ("every
 * skill allowed-tools grant uses the one verified Bash grammar").
 */
import { describe, it, expect } from 'vitest';
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
  listDeployableTemplates,
  listDescribedTemplates,
  listEnumStatements,
  snippetCanaries,
  snippetConsumers,
  snippetNames,
  type LintFinding,
} from './template-lint.js';
import { agentsTemplateDir, promptsTemplateDir, snippetsTemplateDir } from './utils.js';

/** The three agent variants every deployable template is composed for. */
const VARIANTS = ['claude', 'codex', 'gemini'] as const;

const report = (findings: LintFinding[]) =>
  findings.map(f => `  ${f.id} — ${f.detail}`).join('\n');

/** Drop the findings an allowlist entry accounts for, keyed `id → detail match`. */
function unallowed(findings: LintFinding[], allow: ReadonlyArray<[string, RegExp]>): LintFinding[] {
  return findings.filter(f => !allow.some(([id, re]) => f.id === id && re.test(f.detail)));
}

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
      const findings = unallowed(await findDuplicateInjections(variant), ALLOWED);
      expect(findings, `unexpected duplicate snippet injections:\n${report(findings)}`).toEqual([]);
    });
  }

  it('detects a planted duplicate', async () => {
    // Without this the check above is indistinguishable from one that never
    // looks: plant a second injection of a snippet nothing else composes twice
    // and require the lint to name it.
    const target = path.join(snippetsTemplateDir, '..', 'agents', 'smithy.maid.prompt');
    const original = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, `${original}\n{{>branch-policy}}\n{{>branch-policy}}\n`);
    try {
      const findings = await findDuplicateInjections('claude');
      expect(findings).toContainEqual({
        id: 'agents/smithy.maid.prompt',
        detail: 'injects {{>branch-policy}} 2 times',
      });
    } finally {
      fs.writeFileSync(target, original);
    }
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
      const findings = unallowed(await findRestatedProtocol(variant), ALLOWED);
      expect(findings, `protocol text restated instead of composed:\n${report(findings)}`).toEqual([]);
    });
  }

  it('gives every snippet at least one line distinctive enough to detect', () => {
    // The check above is only as good as its canaries: a snippet with none is
    // silently unprotected. Raw source rather than rendered text is what makes
    // this hold — a nested snippet would otherwise have every line claimed by
    // its parent as well.
    const canaries = snippetCanaries();
    const bare = snippetNames().filter(n => (canaries.get(n) ?? []).length === 0);
    expect(bare, `snippets with no unique canary line: ${bare.join(', ')}`).toEqual([]);
  });

  it('detects a planted restatement', async () => {
    const target = path.join(agentsTemplateDir, 'smithy.maid.prompt');
    const original = fs.readFileSync(target, 'utf8');
    const stolen = snippetCanaries().get('kind-gate')![0]!;
    fs.writeFileSync(target, `${original}\n${stolen}\n`);
    try {
      const findings = await findRestatedProtocol('claude');
      expect(findings.map(f => f.id)).toContain('agents/smithy.maid.prompt');
    } finally {
      fs.writeFileSync(target, original);
    }
  });
});

describe('template lint — routing destinations exist', () => {
  it('routes findings only to sections some template emits', () => {
    // Audit defect D2: "Cross-Cutting Governance matrix" was a routing
    // destination defined in no template, so five references sent findings
    // nowhere.
    const findings = findDeadRoutingDestinations();
    expect(findings, `findings routed to sections nothing produces:\n${report(findings)}`).toEqual([]);
  });

  it('detects a planted dead destination', () => {
    const target = path.join(snippetsTemplateDir, 'kind-gate.md');
    const original = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, `${original}\n\nRoute leftovers to \`## Cross-Cutting Governance matrix\`.\n`);
    try {
      expect(findDeadRoutingDestinations().map(f => f.detail))
        .toContainEqual(expect.stringContaining('Cross-Cutting Governance matrix'));
    } finally {
      fs.writeFileSync(target, original);
    }
  });

  it('recognises a heading a scaffold only illustrates', () => {
    // Scaffolds are shown blockquoted, fenced, and indented; a destination that
    // resolves to one of those is live, not dead.
    expect(emittedHeadings().has('Specification Debt')).toBe(true);
    expect(emittedHeadings().has('Open Implementation Questions')).toBe(true);
  });
});

describe('template lint — agent tool grants cover what the body invokes', () => {
  it('grants every tool a sub-agent body names', () => {
    // Audit defect D3: smithy-prose was ordered to call
    // `Skill("smithy.helper-voice")` with a Read/Grep/Glob grant, so the voice
    // step silently could not happen.
    const findings = findMissingToolGrants();
    expect(findings, `sub-agent bodies invoking ungranted tools:\n${report(findings)}`).toEqual([]);
  });

  it('detects a planted ungranted invocation', () => {
    const target = path.join(agentsTemplateDir, 'smithy.maid.prompt');
    const original = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, `${original}\n\nRun \`Bash\` to confirm the tree is clean.\n`);
    try {
      expect(findMissingToolGrants()).toContainEqual({
        id: 'agents/smithy.maid.prompt',
        detail: 'body invokes Bash but tools: grants only Read, Grep, Glob',
      });
    } finally {
      fs.writeFileSync(target, original);
    }
  });

  it('reads a tools: grant off every sub-agent', () => {
    // A parse that silently returned nothing would make the check above vacuous.
    for (const agent of listAgentTemplates()) {
      expect(agent.name, agent.id).toMatch(/^smithy-/);
      expect(agent.tools.length, `${agent.id} grants no tools`).toBeGreaterThan(0);
    }
  });
});

describe('template lint — references resolve', () => {
  it('composes only snippets that exist and invokes only skills that exist', () => {
    const findings = findUnresolvedReferences();
    expect(findings, `unresolved snippet or skill references:\n${report(findings)}`).toEqual([]);
  });

  it('names only smithy identifiers that are deployed', () => {
    const findings = findUnresolvedSmithyNames();
    expect(findings, `dispatch names matching nothing deployed:\n${report(findings)}`).toEqual([]);
  });

  it('detects a planted dead dispatch', () => {
    const target = path.join(agentsTemplateDir, 'smithy.maid.prompt');
    const original = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, `${original}\n\nDispatch the **smithy-harmonize** sub-agent.\n`);
    try {
      expect(findUnresolvedSmithyNames()).toContainEqual({
        id: 'agents/smithy.maid.prompt',
        detail: 'names `smithy-harmonize`, which matches no deployed agent, command, or prompt',
      });
    } finally {
      fs.writeFileSync(target, original);
    }
  });
});

describe('template lint — portability (INV-2)', () => {
  it('ships no reference that resolves only inside SmithyCLI', () => {
    const findings = findInternalReferences();
    expect(findings, `SmithyCLI-internal references in deployable text:\n${report(findings)}`).toEqual([]);
  });

  it('detects planted internal references', () => {
    const target = path.join(agentsTemplateDir, 'smithy.maid.prompt');
    const original = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, `${original}\n\nSee \`src/manifest.ts:38-43\` and issue #551 for the rationale.\n`);
    try {
      const details = findInternalReferences()
        .filter(f => f.id === 'agents/smithy.maid.prompt')
        .map(f => f.detail);
      expect(details).toContainEqual(expect.stringContaining('source path with a line number'));
      expect(details).toContainEqual(expect.stringContaining('SmithyCLI issue or PR number'));
    } finally {
      fs.writeFileSync(target, original);
    }
  });

  it('leaves an illustrative example path alone', () => {
    // INV-2 exempts purely illustrative paths — an example is not an
    // instruction — so the lint must not fire on the tree's deliberate ones.
    const spark = listDeployableTemplates().find(t => t.id === 'commands/smithy.spark.prompt')!;
    expect(spark.source).toContain('src/templates/agent-skills/');
    expect(findInternalReferences().some(f => f.id === 'commands/smithy.spark.prompt')).toBe(false);
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
    const findings = findOverBudgetDescriptions(EXEMPT);
    expect(findings, `descriptions over budget or missing:\n${report(findings)}`).toEqual([]);
  });

  it('declares a description on every command, sub-agent, and skill', () => {
    for (const t of listDescribedTemplates()) {
      expect(t.description, `${t.id} declares no description`).not.toBe('');
    }
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
    const findings = findEnumDrift();
    expect(findings, `grading scales stated with foreign values:\n${report(findings)}`).toEqual([]);
  });

  it('harvests the enumerations the tree actually carries', () => {
    // A harvest that matched nothing would make the check above vacuous.
    const statements = listEnumStatements();
    expect(statements.length).toBeGreaterThan(5);
    for (const field of Object.keys(ENUM_SCALES)) {
      expect(statements.some(s => s.field === field), `no ${field} enumeration harvested`).toBe(true);
    }
  });

  it('keeps debt-row-shape the canonical home of all three scales', () => {
    const canonical = fs.readFileSync(path.join(snippetsTemplateDir, 'debt-row-shape.md'), 'utf8');
    expect(canonical).toContain('`Critical` / `High` / `Medium` / `Low`');
    expect(canonical).toContain('`High` / `Medium` / `Low`');
    expect(canonical).toContain('`Critical` / `Important` / `Minor`');
  });

  it('detects a planted foreign value', () => {
    const target = path.join(agentsTemplateDir, 'smithy.maid.prompt');
    const original = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, `${original}\n\nGrade each **Impact** as Critical / Important / Minor.\n`);
    try {
      expect(findEnumDrift().map(f => f.detail))
        .toContainEqual(expect.stringContaining('Important, Minor are not impact values'));
    } finally {
      fs.writeFileSync(target, original);
    }
  });
});

describe('template lint — rosters match the tree', () => {
  const agentNames = () => listAgentTemplates().map(a => a.name).sort();

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
    const consumers = snippetConsumers();
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
        listDeployableTemplates()
          .filter(t => t.category === 'commands' || t.category === 'agents')
          .filter(t => t.source.includes(`smithy.${promptName}`) || t.source.includes(`smithy-${promptName}`))
          .map(t => path.basename(t.id).replace(/^smithy\./, '').replace(/\.prompt$/, '')),
      );
      expect([...listed].sort(), `smithy.${promptName} Referenced By column`).toEqual([...actual].sort());
    }
  });
});

---
name: smithycli-review-templates
description: "Review procedure for pull requests that change SmithyCLI's deployable templates under src/templates/agent-skills/ (commands, sub-agents, skills, snippets, reference files). Use during code review when a change touches that tree and you need the per-file checks beyond the always-loaded rules."
---
# Reviewing a template change in SmithyCLI

Work through each changed file. The questions are always the same: does the
rendered text read correctly in a target repository, and does each sentence
change what the agent does?

## 1. Classify each changed file

| Path under `src/templates/agent-skills/` | Kind | Reaches a target repository as |
|------------------------------------------|------|--------------------------------|
| `commands/*.prompt` | operator-run command | a Claude command, and a Codex and Gemini skill |
| `agents/*.prompt` | sub-agent | a Claude agent file and a Codex agent TOML; not deployed for Gemini |
| `skills/<name>/SKILL.prompt` | lazy-loaded skill | a skill for all three agents |
| `skills/<name>/references/*`, `scripts/*` | bundled files | the same relative path beside the skill |
| `prompts/*.prompt` | reference prompt | a file an agent may read, never invocable |
| `snippets/*.md` | shared fragment | inlined text only, never a file |

The schema for each kind is in `src/templates/agent-skills/README.md` and the
`README.md` beside each directory. Those are source-only documents: fine for
you to read, never fine for a template to cite.

## 2. Read the change where it lands

- **A snippet** changes every template that composes it. Search for
  `{{>snippet-name}}` and read the edit inside each consumer. A sentence that
  fits one command may contradict another.
- **A command with `{{#ifAgent}}`** renders differently per agent. Read both
  branches. The bare form selects Claude and Codex; `{{else}}` is Gemini,
  which has no sub-agents. Text in one branch must not cite a section only
  the other renders.
- **A sub-agent** is read by its parent's dispatch. Check that the parent
  still passes what the agent now expects, and the reverse.
- **Artifact paths** carry `{{artifactsRoot}}`. Instructions that only make
  sense when artifacts live in a separate store sit inside
  `{{#ifExternalArtifacts}}`.

## 3. Frontmatter

- **Commands** declare `description`, `argument-hint`, and
  `disable-model-invocation: true`. Every command is a pipeline step the
  operator runs, so none may auto-fire. `name` uses the dashed spelling.
- **Sub-agents** declare `name`, `description`, `tools`, and a
  provider-neutral `tier` (`light`, `standard`, `deep`). The `tools` list must
  cover every tool the body tells the agent to use.
- **Skills** declare `name` and `description`. A tool grant is written twice
  on purpose: `allowed-tools` in Claude's grammar, `codex-allowed-tools` for
  Codex. Helper skills are named `smithy.helper-<topic>`.
- A description inside its word budget can still fail: one that explains the
  template, where it should say when to dispatch it.

## 4. Judgement the lint cannot make

`src/template-lint.test.ts` already fails on duplicate snippet injection,
verbatim restated protocol text, dead snippet and skill references,
sub-agent tool use with no matching grant, SmithyCLI-only references,
over-budget descriptions, and foreign enum values. Do not re-report those.
Look instead for:

- **Paraphrased duplication.** The same rule written three ways in one
  template, or the same block added to several commands in one change, when
  one snippet would do (INV-1).
- **A snippet that should not exist.** A new snippet with a single consumer is
  usually better inline. One that restates what a sub-agent's own prompt
  already says should not exist at all.
- **Sentences that do not steer.** Preamble, restated context, and steps that
  describe what any agent does unprompted.
- **Load placement.** Detail every run pays for that only some runs need. It
  belongs in a skill, or in a skill's `references/` file with a link that says
  when to read it.
- **Pattern drift.** A new command that skips the competing-lenses planning
  step, hand-rolls a review loop instead of the shared review protocol, or
  invents a comment or tag format where one exists.
- **Artifacts written before this change.** A newly required field, section,
  or heading with no stated behaviour when it is absent.
- **A skill body past its ceiling.** Bodies stay under about 500 lines, every
  bundled file is linked from the body, and each link says when to follow it.

## 5. What should move with the change

- `src/templates.test.ts` when composition, frontmatter contracts, or a
  skill's bundled files change.
- `src/template-lint.test.ts` allowlists **and** the matching record's Known
  Exceptions ledger, together, when a divergence is deliberate.
- `src/orders-templates.ts` when the built-in issue bodies in
  `smithy.orders.prompt` change. A parity test holds the two together.
- `evals/baselines/` when a command's output structure changes.
- `CLAUDE.md` when a command, sub-agent, or skill is added, renamed, or
  changes its role.

## 6. Records to cite

| ID | Rule | File |
|----|------|------|
| INV-1 | Shared protocols are composed or cited, never restated | `docs/invariants/protocol-canonical-home.invariant.md` |
| INV-2 | Deployable templates read correctly outside SmithyCLI | `docs/invariants/deployable-template-portability.invariant.md` |
| INV-3 | Deployers emit the metadata their target runtime reads | `docs/invariants/deployed-metadata-fidelity.invariant.md` |
| P-1 | Always-loaded context is a budget | `docs/constitution/context-budget.md` |

Each invariant carries a Known Exceptions ledger. A divergence listed there
with a tracking issue is already known; do not report it again.

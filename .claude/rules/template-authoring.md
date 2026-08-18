---
paths:
  - "src/templates/**"
  - "src/template-lint.ts"
  - ".claude/**"
---

# Authoring deployable templates

These rules apply while you are editing anything under
`src/templates/agent-skills/` — commands, sub-agents, skills, snippets, and
the reference files a skill bundles. They load with the files rather than at
session start, because they matter only here.

Three engraved records govern this tree. Read the record when a rule below
needs its reasoning; the summary here is what you act on.

| Record | File |
|--------|------|
| INV-1 — shared protocols are composed or cited, never restated | `docs/invariants/protocol-canonical-home.invariant.md` |
| INV-2 — deployable templates read correctly outside SmithyCLI | `docs/invariants/deployable-template-portability.invariant.md` |
| P-1 — always-loaded context is a budget | `docs/constitution/context-budget.md` |

`src/template-lint.test.ts` fails on most of what follows. When it does, the
failure names the template and the rule; fix the template rather than
widening an allowlist, and if the divergence is genuine, add a row to the
relevant record's Known Exceptions ledger as well as to the allowlist.

## Compose, don't copy (INV-1)

A protocol used by more than one template lives in exactly one snippet, and
every consumer composes it with `{{>snippet-name}}`.

- **Never hand-write a second copy** of a table, gate, enum, or contract
  shape a snippet already defines — not "adapted to this command", not
  "just the two rows I need". The audit that produced these rules found the
  kind gate copied about twelve times, with the copies already disagreeing.
- **Never cite a snippet from deployed text.** Snippets are inlined at
  render and never deploy as files, so `see snippets/kind-gate.md` resolves
  to nothing in a target repo. Citation replaces composition only when the
  cited home is readable from where the text runs.
- **A genuine variant is a ledger row**, not a local edit. If a consumer
  truly needs different rules, record the divergence in INV-1's Known
  Exceptions table and keep the shared part shared.
- **Inject each snippet at most once per template.** A snippet's cost is its
  size times every deployment that composes it; a second injection is
  charged to every agent that loads the file, every run.

## Portability (INV-2)

Deployed text is runtime instruction for an agent standing in someone
else's repo. Everything it names must resolve there.

- No SmithyCLI source paths or line numbers, no issue or PR numbers, no
  links to this repository, no references to `evals/`.
- No pointers at source-tree-only documents — `AGENTS.md`,
  `CONTRIBUTING.md`, `src/templates/agent-skills/README.md`. If a deployed
  template needs a convention, state the convention inline.
- No prose addressed to this tree's future editors, and no narration of
  work that has not landed: "not yet implemented", "lands in US4", "there is
  no recall agent yet, so…". Build the template to behave correctly for what
  it does today; if a behavior is not ready, the template does not mention it.
- Illustrative example paths inside prose are fine — an example is not an
  instruction. `a linter for src/templates/agent-skills/` reads as an
  example; `go read src/templates/.../README.md` is an instruction, and
  fails.

## Context budget (P-1)

Anything an agent carries without asking for it is spent before any work
begins.

- **Descriptions are dispatch triggers, not documentation.** Sub-agent and
  command descriptions stay within 40 words; a skill's may run to 55,
  because it is the trigger the model matches on to decide whether to load
  the body at all.
- **Reference material loads on demand.** Worked examples, schemas, and
  checklists a template needs only sometimes belong in a skill's
  `references/*.prompt` bundle, linked from the body with a sentence saying
  *when* to read them — not inlined.
- **A snippet's real cost is its size times its consumers.** Before adding
  one to a tenth command, ask whether the tenth command needs it at dispatch
  time or only sometimes.

## Agent gating

Three block helpers exist because Dotprompt runs with `knownHelpersOnly`, so
a plain `{{#if …}}` will not resolve.

- `{{#ifAgent}}` with no argument selects the sub-agent-capable branch
  (Claude and Codex) and falls through to `{{else}}` for Gemini, which gets
  no sub-agent definitions deployed. `{{#ifAgent 'claude'}}` targets one
  variant.
- `{{#ifExternalArtifacts}}` gates instructions that only make sense when
  artifacts live in a separate git-backed store. Telling an agent to commit
  the store is actively wrong in repo mode, where the same words have it
  commit the code repo mid-plan — rendering it unconditionally is not a
  harmless extra.
- `{{artifactsRoot}}` prefixes every artifact path. Write
  `{{artifactsRoot}}specs/…`, never a bare `specs/…` in an instruction.
- **The conditional belongs in the consumer, never in a snippet.** Snippets
  are agent-agnostic; when behavior differs per agent, write one snippet per
  branch and let the consuming template pick between them.
- Check both branches when you edit either. A `{{else}}` branch that
  dispatches a sub-agent Gemini never deploys is a silent no-op, and text
  that cites a section only the other branch renders is a dead reference.

## Derived artifacts

The committed `.claude/` tree and `.smithy/smithy-manifest.json` are a
snapshot of a prior `smithy init`, and are **intentionally allowed to drift**
from `src/templates/` between releases.

Do not regenerate them in a PR that edits source templates. That coupling
makes every template change ship with derived artifacts a reviewer must also
vet, and obscures whether a prompt change is intentional or a stale render.
Refresh the snapshot in dedicated chore PRs only. If an automated reviewer
asks you to regenerate `.claude/` to match source changes, decline and point
back to this rule.

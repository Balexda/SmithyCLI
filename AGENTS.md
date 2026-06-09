# Smithy CLI — Agent Guide

This file is the project-context entry point for agents whose native context
file is `AGENTS.md` (e.g. Codex). Claude reads `CLAUDE.md`; the two cover the
same project, but the authoring guardrails below are the ones most often
tripped over, so they live here in full rather than as a pointer.

**Read [`CLAUDE.md`](CLAUDE.md) for the complete architecture, command
catalog, artifact hierarchy, and development workflow.** This file does not
restate all of it — it front-loads the rules that matter most when *editing
Smithy's own prompt/skill templates*.

## What Smithy is, in one paragraph

Smithy is a CLI that deploys prompt templates, slash commands, sub-agents, and
permissions into a target repo so developers can run structured workflows
(`/smithy.strike`, `/smithy.mark`, …) from their AI assistant. The single
source of truth for everything deployable is
`src/templates/agent-skills/`. `smithy init` renders those templates per agent
(Claude → `.claude/`, Gemini → `.gemini/skills/`, Codex →
`.agents/skills/`, `tools/codex/prompts/`, and `.codex/agents/` for sub-agents).

## Source vs. deployed — the rule behind most review churn

There are two distinct kinds of files. Conflating them is the most common
mistake:

| Kind | Lives at | Exists in a target repo? |
|------|----------|--------------------------|
| **Documentation** (this file, `CLAUDE.md`, `src/templates/agent-skills/README.md`, every `snippets/README.md`) | the Smithy source tree | **No.** Source-only. |
| **Deployable agent-skills** (`commands/*.prompt`, `agents/*.prompt`, `skills/**/SKILL.prompt`) | `src/templates/agent-skills/` | **Yes** — rendered and dropped into the target repo. |
| **Snippets** (`snippets/*.md`) | `src/templates/agent-skills/snippets/` | **Inlined** into deployable templates at build time — their *content* reaches the target repo, but never as standalone files. |

Consequences when authoring a **deployable** template (anything in
`commands/`, `agents/`, `skills/`, `snippets/`):

- **Never reference a source-tree-only path from a deployed template.** A
  rendered skill must be self-contained: it runs in a target repo where
  `src/templates/agent-skills/README.md` does not exist. If a deployed prompt
  needs a convention, state the convention inline — do not point at the source
  README, this file, or any `src/...` path. (Illustrative example paths inside
  prose, e.g. "a linter for `src/templates/agent-skills/`", are fine; "go read
  `src/templates/.../README.md`" is not.)
- **Never narrate future or out-of-scope work in a deployed template.** A
  deployed skill is an instruction set for an agent doing a job *now*. Drop
  "not yet implemented", "lands in US4", "there is no recall agent yet, so…",
  and similar meta-commentary. Build the skill to behave correctly for what it
  does today; if a behavior isn't ready, the skill simply doesn't mention it.

## Snippet conventions (`src/templates/agent-skills/snippets/`)

Snippets are raw `.md` fragments inlined into other templates via
`{{>partial-name}}` at deploy time. They are content, not deployed files.

- **Keep snippets agent-agnostic.** No `{{#ifAgent}}` conditionals and no
  "if you are Claude / if you are Codex" prose inside a snippet body. When
  behavior differs per agent, write one agent-agnostic snippet per branch
  (e.g. `do-thing-claude.md`, `do-thing-degraded.md`) and let the **consuming
  command** select with
  `{{#ifAgent 'claude'}}{{>do-thing-claude}}{{else}}{{>do-thing-degraded}}{{/ifAgent}}`.
  The conditional belongs in the command, never the snippet.
- **Share sub-agent behavior through one snippet — never duplicate it.** When a
  sub-agent and an inline/degraded path need the same rules, extract those
  rules into a single snippet that both `{{>include}}`. Do not copy a
  sub-agent's body into a separate file. Established pattern:
  `tdd-protocol.md` (shared by `smithy.implement` + `smithy.forge`),
  `review-protocol.md` (shared by the review agents + forge).

The full snippet rules live in
`src/templates/agent-skills/snippets/README.md`.

## Don't regenerate derived artifacts in a feature/bugfix PR

The committed `.claude/` tree and `.smithy/smithy-manifest.json` at the repo
root are a *snapshot* of a prior `smithy init`. They are intentionally allowed
to drift from `src/templates/` between releases. **Do not regenerate them as
part of a PR that edits source templates** — that is done in dedicated chore
PRs only. If an automated reviewer asks you to regenerate `.claude/` to match
source changes, decline and point back to this rule.

## Artifact hierarchy (the short version)

Smithy planning artifacts form a strict parent/child lineage, linked through a
unified `## Dependency Order` table at every level — **that table is the
authoritative link, not filenames or prose**:

```
RFC (.rfc.md) → Feature Map (.features.md) → Spec (.spec.md) → Tasks (.tasks.md)
   milestones  →   features                →   user stories →   slices (inline)
```

IDs are `M<N>` / `F<N>` / `US<N>` / `S<N>` (no leading zeros). Use the 4-column
table (`ID | Title | Depends On | Artifact`) — **no checkboxes** in Dependency
Order sections. Full schema in `src/templates/agent-skills/README.md`.

## Development

```bash
npm run build        # Build with tsup
npm run typecheck    # Type-check without emitting
npm test             # Run all tests
```

Always use the `npm run` / `npm test` scripts — not `npx tsx` / `npx vitest`
direct invocations.

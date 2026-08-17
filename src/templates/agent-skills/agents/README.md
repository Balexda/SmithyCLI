# Agents (Sub-Agents)

Sub-agent definitions dispatched by parent commands. These are **not** invoked
directly by users — they are called by orchestrating commands (forge, mark, cut,
render, etc.) during specific workflow phases.

Deployed to:
- **Claude**: `.claude/agents/smithy.<name>.md` (**frontmatter kept**, with the
  provider-neutral `tier:` translated to a native `model:` line — see
  [*Sub-Agent Model Tiers*](../README.md#sub-agent-model-tiers)). The deployed
  filename comes from the **source filename** (`smithy.plan.prompt` →
  `smithy.plan.md`).
- **Codex**: `.codex/agents/smithy-<name>.toml` (custom-agent TOML — `tier:`
  becomes `model_reasoning_effort`, the declared `tools` pick `sandbox_mode`,
  and the body becomes `developer_instructions`). The deployed filename comes
  from the frontmatter **`name`** (`smithy-plan` → `smithy-plan.toml`).
- **Gemini**: not deployed (Gemini does not support sub-agent dispatch, so its
  commands render the inline `{{else}}` fallback instead).

## Current Agents

The **Invoked By** column names the parent commands that actually dispatch the
agent. Where a command dispatches through a shared snippet, the snippet is
named in parentheses — that snippet is the dispatch site, so a command joins or
leaves the list by composing it.

| Agent | Role | Invoked By | Tier |
|-------|------|------------|------|
| `smithy-clarify` | Ambiguity scanning, triage to assumptions and specification debt | strike, ignite, render, mark, cut, spark | deep |
| `smithy-refine` | Artifact review, audit categories, refinement questions | ignite, render, mark, cut (Phase 0), spark | deep |
| `smithy-plan` | Design planning under a focus lens; run in parallel for competing perspectives | strike (`competing-lenses-implementation`), ignite, render, mark (`competing-lenses-scoping`) | deep |
| `smithy-reconcile` | Synthesize competing `smithy-plan` outputs into one coherent plan | strike (`competing-lenses-implementation`), ignite, render, mark (`competing-lenses-scoping`) | deep |
| `smithy-slice` | Task decomposition under a focus lens; run in parallel for competing perspectives | cut (`competing-lenses-decomposition`) | standard |
| `smithy-reconcile-slices` | Synthesize competing `smithy-slice` outputs, reconciling both slice boundaries and task lists | cut (`competing-lenses-decomposition`) | deep |
| `smithy-implement` | TDD implementation: failing test → code → commit | forge (per task) | deep |
| `smithy-implementation-review` | Read-only code review; returns findings for forge to apply | forge (after implementation) | deep |
| `smithy-plan-review` | Read-only self-consistency review of planning artifacts; returns structured findings for the parent command to apply | strike, ignite, render, mark, cut (after artifact generation, before PR) | deep |
| `smithy-recall` | Read-only engraved-knowledge recall across the user / repo / project levels; ranks level-tagged records, flags candidate invariant exceptions with their ledger severity, reports declared vs. undeclared cross-level conflicts, and flags retired-decision citation hazards | strike, ignite, render, mark, cut (`engraved-recall-dispatch`, scan phase) | standard |
| `smithy-scout` | Pre-planning consistency scan | render, mark, cut | standard |
| `smithy-maid` | Post-implementation doc staleness scan | forge (after review) | standard |
| `smithy-prose` | Narrative/persuasive prose drafting for planning artifact sections | ignite (sub-phases 3a, 3b), spark (sub-phase 3a), persona | deep |
| `smithy-survey` | Off-the-shelf landscape survey with WebFetch/WebSearch; returns alternatives comparison and build-vs-buy rationale | spark (Phase 2.5) | deep |

## Frontmatter Fields

```yaml
---
name: smithy-<name>
description: "One-line description of what this agent does."
tools:
  - Read
  - Grep
  - Glob
tier: deep  # light | standard | deep
---
```

- **`tools`**: Which tools the sub-agent has access to. Read-only agents
  (clarify, refine, plan, reconcile, slice, reconcile-slices, plan-review,
  implementation-review, recall, scout, maid) get `Read, Grep, Glob`.
  `smithy-implement` also gets `Edit, Write, Bash`. `smithy-prose` adds `Skill`
  so it can load `smithy.helper-voice`. `smithy-survey` is the only sub-agent
  with `WebFetch` and `WebSearch` — reserved for the landscape survey phase of
  `smithy.spark`. On Codex the declared tools also pick the sandbox: an agent
  holding `Write`, `Edit`, or `Bash` deploys `workspace-write`, everything else
  `read-only`.
- **`tier`**: How much model horsepower the agent needs, stated
  provider-neutrally — **never** a raw model name. `deep` for complex reasoning
  (clarify, refine, plan, reconcile, reconcile-slices, implement,
  implementation-review, plan-review, prose, survey); `standard` for
  pattern-matching and lookup work (slice, recall, scout, maid). An optional
  `effort:` refines the Codex reasoning effort. Both fields and their
  per-provider translation are documented in
  [*Sub-Agent Model Tiers*](../README.md#sub-agent-model-tiers); the table
  itself lives in [`src/agent-models.ts`](../../../agent-models.ts).

## Interaction Patterns

**Every sub-agent is non-interactive.** None of them talk to the user: each one
does its work against the context the parent passed it and returns a structured
result, and the parent command decides what to surface and what to write to
disk. That includes `smithy-clarify` and `smithy-refine`, which triage their own
findings into assumptions and specification debt rather than asking questions —
the debt row *is* how an unresolved choice reaches a human, and `smithy.resolve`
is the command that later poses it.

Two consequences worth keeping in mind when writing an agent prompt:

- **Report, don't act.** The review agents (`smithy-plan-review`,
  `smithy-implementation-review`) return findings; the parent applies them. The
  shared rule lives in [`snippets/review-protocol.md`](../snippets/review-protocol.md),
  and the parent-side consequence table in
  [`snippets/plan-review-triage.md`](../snippets/plan-review-triage.md).
- **Advisory, not blocking.** `smithy-recall` reports conflicts and hazards but
  never stops a run; escalation is keyed on the reported `severity` by the
  parent command.

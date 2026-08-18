---
id: D-3
kind: decision
domain: system
title: "Deployed frontmatter is translated per target, not stripped by default"
status: proposed
decided_at: 2026-08-15
topics: [frontmatter, deployers, command-registry, target-runtime, template-authoring]
scope: [src/agents/**, src/command-frontmatter.ts, src/skill-frontmatter.ts, src/agent-models.ts]
applies_to: [deployed commands, deployed skills, deployed sub-agents, Claude command registry]
supersedes: []
superseded_by: []
establishes: [INV-3]
---
# Deployed frontmatter is translated per target, not stripped by default

## Context

Stripping the frontmatter from Claude command deploys was correct when it was
chosen: Claude Code read nothing off a `.claude/commands/*.md` block, so the
block was weight with no reader, and Gemini and Codex kept it only because
their skill loaders consume `name` and `description`. Then Claude Code unified
slash commands with skills. A command file is now advertised to the model
through the same registry skills use, and its frontmatter *is* that registry
entry.

The 2026-08 audit ([#551](https://github.com/Balexda/SmithyCLI/issues/551),
priority 1) observed the consequence in a live session of this repo: twelve
or more model-invocable commands advertised as `smithy.audit: smithy-audit`
and `smithy.cut: smithy.cut`, the H1 recycled as description — zero trigger
signal, pure registry noise, and misfire risk on every one of them. Stripping
also forfeited the whole control surface built on that block:
`disable-model-invocation`, `argument-hint`, per-command `allowed-tools`,
`context` / `agent` / `background`, and command-scoped `hooks`.

Three options were on the table. Keep stripping and live with the noise.
Rewrite the source block into Claude's vocabulary — which breaks Gemini and
Codex, since all three read the same block. Or translate at deploy, giving
each target the keys its runtime reads.

## Decision

A deployer emits the frontmatter keys its target runtime reads, in that
runtime's spelling, and drops the rest. Each deploy path names those keys
explicitly: the Claude command path keeps `description`, `argument-hint`,
`allowed-tools`, `disable-model-invocation`, `model`, `context`, `agent`,
`background`, and `hooks`; the sub-agent paths translate the provider-neutral
`tier:` into Claude's `model:` and Codex's `model_reasoning_effort`; the skill
paths pick the tool-grant key that belongs to the runtime being deployed to.
Stripping the whole block stays correct on exactly one class of file —
reference prompts, which neither runtime registers — and there it is a
positive finding about the target, not the default.

Unknown keys are dropped rather than rejected, which is what lets one source
block carry the union of what all three targets need. The corollary is the
part that binds: declaring a key in a template is not enough to deploy it, so
every key a target reads has to appear on that target's list.

## Consequences

Good: descriptions and argument hints reach the registry as written;
`disable-model-invocation: true` on the thirteen explicit pipeline commands
drops them out of the model registry entirely, recovering that always-loaded
context (P-1) and removing the misfire risk with it. The modern control
surface becomes reachable without further deployer work — the `context: fork`
evaluation ([#556](https://github.com/Balexda/SmithyCLI/issues/556)) found it
needed no fork-side deployer change at all, because `context` and `agent` were
already on the list.

Bad: three key lists now track three runtimes' evolving vocabularies, and the
failure mode is silent by construction. Because unknown keys are dropped and
not rejected, a key the target reads but the list omits deploys as though the
template never declared it. That trap has already fired once: `background` was
missing from the Claude command list, so a template declaring
`background: false` would have deployed without it and forked detached —
precisely the mode it was written to avoid. Closing it cost a unit test and a
template lint, and the class of failure is now this decision's invariant to
watch.

## Establishes

INV-3 — Deployers emit the metadata their target runtime reads.

## Citations

P-1 (always-loaded context is a budget — this decision spends a few hundred
bytes of deployed frontmatter to take thirteen command bodies out of the
model registry, which is the larger saving by two orders of magnitude).
Evidence and remediation: audit
[#551](https://github.com/Balexda/SmithyCLI/issues/551), sub-issue
[#552](https://github.com/Balexda/SmithyCLI/issues/552). The control surface
this unlocked is exercised by D-4.

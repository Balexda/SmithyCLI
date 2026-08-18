---
id: INV-3
kind: invariant
domain: system
title: "Deployers emit the metadata their target runtime reads"
status: drifting
topics: [frontmatter, deployers, command-registry, target-runtime, template-authoring]
scope: [src/agents/**, src/command-frontmatter.ts, src/skill-frontmatter.ts, src/agent-models.ts]
applies_to: [deployed commands, deployed skills, deployed sub-agents, Claude command registry]
established_by: [D-3]
---
# Deployers emit the metadata their target runtime reads

## Rule

Every deploy path emits the frontmatter keys its target runtime reads, in that
runtime's spelling, and drops the rest. A key is dropped because the target
does not read it — never because the block as a whole is inconvenient. A key
the target reads under another name or another value domain is translated
rather than passed through, and the translation is what preservation means
there. Deliberate divergences — a transform, or a key shipped inert because
one source block serves three targets — are rows in this ledger, not
undocumented behavior inside a deployer.

## Rationale

These runtimes drop unknown frontmatter keys instead of rejecting them, so a
key the target reads and the deploy path omits fails silently: the template
declares it, the deployed file does not carry it, and nothing anywhere reports
a problem. The establishing decision (D-3) records the case that made this
visible — a stripped command block costing every command its registry
description — and the `background` key that was being dropped the same way
long after `context` and `agent` were being kept.

## Known Exceptions

| Where | What diverges | Disposition + Why | Tracking Issue | Severity |
|-------|---------------|-------------------|----------------|----------|
| `src/agent-models.ts` (`toClaudeAgentContent`, `toCodexAgentToml`) | Sub-agents declare a provider-neutral `tier:`, and neither deploy emits that key — Claude receives `model:`, Codex receives `model_reasoning_effort` | Accepted: `tier` is Smithy vocabulary that no runtime reads; rendering it into each provider's own horsepower knob is what carrying the author's intent across means here | — | low |
| `src/agent-models.ts` (`toClaudeAgentContent`) | An `effort:` declared on a sub-agent reaches Codex but is dropped on the Claude path, although Claude Code reads `effort:` on a sub-agent | Temporary: no agent template declares `effort:` today, so nothing is lost yet — but the first one that does gets it honored on one target and silently ignored on the other | #593 | low |
| `src/skill-frontmatter.ts` | Skills declare both `allowed-tools` and `codex-allowed-tools`; Claude keeps the first, Codex receives the second promoted into the first's name, Gemini receives neither | Accepted: a tool grant is written in one runtime's permission grammar and is dead text in the other two — Gemini's allowlist lives in `.gemini/settings.json`, not in frontmatter | — | low |
| `src/agents/claude.ts` and `src/agents/codex.ts`, reference-prompt deploys | Reference prompts deploy with the block stripped entirely rather than filtered key by key | Accepted: `.claude/prompts/` and `tools/codex/prompts/` are read on demand, never registered, so the empty key list is a finding about those targets rather than a shortcut | — | low |
| `src/agents/gemini.ts` and `src/agents/codex.ts`, command-skill deploys | Both receive the source block verbatim, Claude-only command keys included (`disable-model-invocation`, `argument-hint`, `context`, `agent`, `background`, `hooks`) | Accepted: one source block serves three targets and the union has to live somewhere; these keys are inert metadata that reaches no agent as instruction, which is what separates them from a tool grant | — | low |
| `src/command-frontmatter.ts` | `name` is dropped on the Claude command path although the other two targets consume it | Accepted: a Claude command is named by its filename, and the source `name` carries the dashed Codex spelling (`smithy-audit`), so emitting it would advertise a command that does not exist | — | low |

## Citations

Established by D-3. The three key lists this invariant governs live in
`src/command-frontmatter.ts`, `src/skill-frontmatter.ts`, and
`src/agent-models.ts`. Current-state evidence: audit
[#551](https://github.com/Balexda/SmithyCLI/issues/551), sub-issue
[#552](https://github.com/Balexda/SmithyCLI/issues/552).

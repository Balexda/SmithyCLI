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
| `src/agent-models.ts` (`toCodexAgentToml`) | A sub-agent's `tools:` list reaches Claude verbatim but never reaches the Codex TOML — `sandboxModeForTools` collapses it into `sandbox_mode`, `workspace-write` when any of Write/Edit/Bash appears and `read-only` otherwise | Accepted: Codex grants filesystem access by sandbox mode rather than by tool name, so there is no per-tool key to emit; the collapse keeps the capability the tool list implies and drops only distinctions Codex has no way to express | — | low |
| `src/agent-models.ts` (`toClaudeAgentContent`) | An `effort:` declared on a sub-agent reaches Codex but is dropped on the Claude path, although Claude Code reads `effort:` on a sub-agent | Temporary: no agent template declares `effort:` today, so nothing is lost yet — but the first one that does gets it honored on one target and silently ignored on the other | #593 | low |
| `src/skill-frontmatter.ts` | Skills declare both `allowed-tools` and `codex-allowed-tools`; Claude keeps the first, Codex receives the second promoted into the first's name, Gemini receives neither | Accepted: a tool grant is written in one runtime's permission grammar and is dead text in the other two — Gemini's allowlist lives in `.gemini/settings.json`, not in frontmatter | — | low |
| `src/agents/claude.ts` and `src/agents/codex.ts`, raw reference-prompt deploys | The `.claude/prompts/` and `tools/codex/prompts/` copies deploy with the block stripped entirely rather than filtered key by key | Accepted: both paths write text that is read on demand and registered by nothing, so the empty key list is a finding about them rather than a shortcut. The path is what is exempt, not the file — `src/agents/codex.ts` also deploys every one of those prompts as a skill under `.agents/skills/`, and that copy keeps its block | — | low |
| `src/agents/gemini.ts` and `src/agents/codex.ts`, command-skill deploys | Both receive the source block verbatim, Claude-only command keys included (`disable-model-invocation`, `argument-hint`, `context`, `agent`, `background`, `hooks`) | Accepted: one source block serves three targets and the union has to live somewhere; these keys are inert metadata that reaches no agent as instruction, which is what separates them from a tool grant | — | low |
| `src/command-frontmatter.ts` | `name` is dropped on the Claude command path although the other two targets consume it | Accepted: a Claude command is named by its filename, and the source `name` carries the dashed Codex spelling (`smithy-audit`), so emitting it would advertise a command that does not exist | — | low |

## Citations

Established by D-3. The three key lists this invariant governs live in
`src/command-frontmatter.ts`, `src/skill-frontmatter.ts`, and
`src/agent-models.ts`. Current-state evidence: audit
[#551](https://github.com/Balexda/SmithyCLI/issues/551), sub-issue
[#552](https://github.com/Balexda/SmithyCLI/issues/552).

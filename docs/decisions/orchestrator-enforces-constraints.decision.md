---
id: D-9
kind: decision
domain: system
title: "Declared constraints are defaults; the orchestrator enforces"
status: proposed
decided_at: 2026-11-22
topics: [sub-agent-sandbox, read-only-dispatch, untrusted-input, scope-binding, outbound-queries, codex, template-authoring]
scope: [src/templates/agent-skills/commands/**, src/templates/agent-skills/agents/**, src/templates/agent-skills/snippets/**, src/agent-models.ts, src/agents/codex.ts]
applies_to: [deployed commands, sub-agents, Codex agent TOML, review-finding apply step, web research]
supersedes: []
superseded_by: []
establishes: [INV-7]
excepts: []
---
# Declared constraints are defaults; the orchestrator enforces

## Context

A sub-agent's limits are declared in prose ("read-only"), in `tools:`
frontmatter, and, on Codex, in `sandbox_mode`. These declarations bind only
where a runtime enforces them. A Codex agent's `sandbox_mode` is a default
that the parent turn's sandbox overrides. An agent that works from untrusted
text, such as a diff, a review finding, or a web page, can be steered by that
text. If a limit is only declared, a prompt-injection path can get past it.

## Decision

Declarations state intent. Where a limit matters, the dispatching
orchestrator enforces it with a check it runs itself.

- **Read-only dispatches are verified.** Before the dispatch, the
  orchestrator snapshots `HEAD`, the index, and the content and mode of every
  tracked and untracked file. It compares the snapshot afterwards and stops on any
  difference. A status listing alone does not count: it cannot see a second
  edit to an already-modified file, and without the index a `git add` goes
  unseen.
- **Edits derived from untrusted text stay inside the bound scope.** That
  scope is repo-relative paths inside the checkout. Anything outside it is
  reported, not applied.
- **Outbound queries carry no non-public identifiers.**

## Consequences

Good: a limit holds whatever sandbox the host provides, and an injected write
is caught and stops the run.

Bad: each dispatch gains a few orchestrator steps, and every composer of the
`apply` step must bind a scope. Detection does not undo a write, so
uncommitted work a dispatch overwrote stays overwritten until the user
recovers it.

## Establishes

INV-7 — The orchestrator enforces what a dispatch declares.

## Citations

D-3 (the Codex translation of `tools:` to `sandbox_mode`; see INV-3).

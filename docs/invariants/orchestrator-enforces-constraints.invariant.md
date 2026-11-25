---
id: INV-7
kind: invariant
domain: system
title: "The orchestrator enforces what a dispatch declares"
status: drifting
topics: [sub-agent-sandbox, read-only-dispatch, untrusted-input, scope-binding, outbound-queries, codex, template-authoring]
scope: [src/templates/agent-skills/commands/**, src/templates/agent-skills/agents/**, src/templates/agent-skills/snippets/**, src/agent-models.ts, src/agents/codex.ts]
applies_to: [deployed commands, sub-agents, Codex agent TOML, review-finding apply step, web research]
established_by: [D-9]
excepts: []
---
# The orchestrator enforces what a dispatch declares

## Rule

No template relies on prose, `tools:`, or `sandbox_mode` as a boundary. A
read-only dispatch is verified by comparing `HEAD`, the index, and file
contents and modes before and after it. Status alone is not enough. Edits derived from untrusted text
touch only the scope the dispatcher bound. Outbound web queries carry no
non-public identifiers.

## Rationale

A declared limit binds only where a runtime enforces it. Anything else is
open to injected text (D-9).

## Known Exceptions

| Where | What diverges | Disposition + Why | Tracking Issue | Severity |
|-------|---------------|-------------------|----------------|----------|
| `src/agent-models.ts` (`smithy-implement`) | A read-only parent overrides the agent's `workspace-write` default, and forge does not probe for it | Accepted: forge writes the branch and base state before any dispatch, so a read-only parent fails there first | — | low |
| `src/templates/agent-skills/snippets/plan-review-triage.md` (`apply`) | Edits any path a finding names | Temporary: every composer binds a scope | #648 | medium |
| `src/templates/agent-skills/agents/smithy.survey.prompt` (queries) | Constraint text goes into queries verbatim | Temporary: use generic public terms | #651 | medium |

## Citations

D-9, INV-3.

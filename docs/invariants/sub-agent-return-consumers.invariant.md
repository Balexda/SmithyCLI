---
id: INV-4
kind: invariant
domain: system
title: "Every sub-agent return field has a consumer"
status: aligned
topics: [sub-agent-contracts, dispatch, control-signals, template-authoring]
scope: [src/templates/agent-skills/commands/**, src/templates/agent-skills/agents/**, src/templates/agent-skills/snippets/**]
applies_to: [deployed commands, sub-agents, sub-agent return contracts]
established_by: [D-5]
excepts: []
---
# Every sub-agent return field has a consumer

## Rule

A dispatching template acts on every control field the sub-agent returns:
`bail_out`, `debt_items`, `destination`, `assumptions`, and each error or gap
shape. Otherwise it states why that field cannot occur in its context.
Passing the response through verbatim does not count as acting on it. A
field that no dispatcher consumes is removed from the contract.

## Rationale

An unread signal fails silently: the agent did its job and the run discarded
the answer (D-5).

## Known Exceptions

| Where | What diverges | Disposition + Why | Tracking Issue | Severity |
|-------|---------------|-------------------|----------------|----------|
| — | — | — | — | — |

## Citations

D-5. Paths are relative to `src/templates/agent-skills/`.

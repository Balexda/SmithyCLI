---
id: INV-4
kind: invariant
domain: system
title: "Every sub-agent return field has a consumer"
status: drifting
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
| `commands/smithy.ignite.prompt` (clarify log) | `debt_items` are not persisted, so a resumed run loses them | Temporary: persist them | #648 | medium |
| `commands/smithy.strike.prompt` (document template) | `assumptions` reach only the terminal | Temporary: add `## Assumptions` | #648 | low |
| `snippets/typed-ui-build-profiles.md` (flow-wire review handoff) | The reviewer never gets the worker's `test-body` fallback | Temporary: pass the same resolution | #650 | low |
| `agents/smithy.prose.prompt` consumers (ignite, spark, persona) | The gaps section and markers are committed verbatim | Temporary: split them out and surface them | #651 | medium |
| `agents/smithy.survey.prompt`, `commands/smithy.spark.prompt` | A failed verification falls through to the empty-market stub | Temporary: add an incomplete result and consume it | #651 | medium |

## Citations

D-5. Paths are relative to `src/templates/agent-skills/`.

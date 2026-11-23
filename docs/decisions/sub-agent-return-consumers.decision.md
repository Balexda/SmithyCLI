---
id: D-5
kind: decision
domain: system
title: "Every sub-agent return field has a consumer"
status: proposed
decided_at: 2026-11-22
topics: [sub-agent-contracts, dispatch, control-signals, template-authoring]
scope: [src/templates/agent-skills/commands/**, src/templates/agent-skills/agents/**, src/templates/agent-skills/snippets/**]
applies_to: [deployed commands, sub-agents, sub-agent return contracts]
supersedes: []
superseded_by: []
establishes: [INV-4]
excepts: []
---
# Every sub-agent return field has a consumer

## Context

Some sub-agent return fields are control signals, not content. `bail_out`
says stop, `debt_items` carries decisions a human must make, `destination`
routes a finding, and a gaps or error shape says what the agent could not
do. A signal does nothing unless the dispatcher reads it. A dispatcher that
ignores one still finishes cleanly, so the run reports success while doing
the thing the agent warned against.

## Decision

A sub-agent's return contract and its dispatchers form one interface. Each
dispatcher acts on every control field the contract defines: it stops,
records the item in the artifact, or surfaces it to the operator. Where a
field cannot occur in a dispatcher's context, the dispatcher says so. A field
no dispatcher consumes is removed from the contract. A dispatch passes every
input the contract needs.

## Consequences

Good: a dispatch can be reviewed by reading the agent's output contract
beside the call site. Handling shared by several dispatchers, such as the
bail-out check, lives in one snippet (D-1).

Bad: adding a field to a contract means editing every dispatcher in the same
change.

## Establishes

INV-4 — Every sub-agent return field has a consumer.

## Citations

D-1, P-2.

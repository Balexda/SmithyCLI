---
id: D-10
kind: decision
domain: system
title: "Examples obey the contract they illustrate"
status: proposed
decided_at: 2026-11-22
topics: [worked-examples, sample-payloads, output-contracts, template-authoring]
scope: [src/templates/agent-skills/**]
applies_to: [deployed commands, sub-agents, skills, skill reference files, snippets]
supersedes: []
superseded_by: []
establishes: [INV-8]
excepts: []
---
# Examples obey the contract they illustrate

## Context

A sample payload or worked example is the pattern an agent copies. When it
disagrees with the rule beside it, the agent reproduces the defect, and a
reviewer who compares the output against the sample passes it. In practice
the example becomes the contract.

## Decision

Every worked example, sample payload, and triage example is a valid instance
of the rules beside it:

- it uses the current schema;
- it applies every gate the contract applies;
- its guards and its tests match one for one;
- it invents no evidence.

A rule change updates its examples in the same commit.

## Consequences

Good: an agent that copies an example does the right thing, and examples can
be linted as fixtures.

Bad: rule changes get larger, and a minimal example may have to grow.

## Establishes

INV-8 — Examples obey the contract they illustrate.

## Citations

D-1 (an example in an old shape is a stale copy of the schema).

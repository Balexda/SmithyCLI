---
id: INV-8
kind: invariant
domain: system
title: "Examples obey the contract they illustrate"
status: drifting
topics: [worked-examples, sample-payloads, output-contracts, template-authoring]
scope: [src/templates/agent-skills/**]
applies_to: [deployed commands, sub-agents, skills, skill reference files, snippets]
established_by: [D-10]
excepts: []
---
# Examples obey the contract they illustrate

## Rule

Every worked example, sample payload, and triage example in a template is a
valid instance of the rules beside it. It uses the current schema, applies
every gate, matches each guard to a test, and invents no evidence.

## Rationale

Agents imitate the example before they apply the rule, so a wrong example
teaches the defect (D-10).

## Known Exceptions

| Where | What diverges | Disposition + Why | Tracking Issue | Severity |
|-------|---------------|-------------------|----------------|----------|
| `agents/smithy.slice.prompt`, `agents/smithy.reconcile-slices.prompt` (output) | Dependency Order is a checkbox list with no `Depends On` | Temporary: emit the table | #649 | medium |
| `agents/smithy.recall.prompt` (sample output) | An undeclared conflict names a `governing_id` | Temporary: `null` when undeclared | #651 | low |
| `skills/smithy.helper-flow-definition/references/examples.prompt` | The test body asserts one of the three declared guards | Temporary: assert every guard | #650 | low |
| `skills/smithy.helper-voice/references/worked-examples.prompt` | The "after" text invents incidents | Temporary: use only facts from the "before" | #653 | low |

## Citations

D-10. Paths are relative to `src/templates/agent-skills/`.

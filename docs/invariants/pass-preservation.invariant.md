---
id: INV-5
kind: invariant
domain: system
title: "Passes preserve what earlier passes recorded"
status: drifting
topics: [artifact-writes, specification-debt, stable-ids, template-authoring]
scope: [src/templates/agent-skills/commands/**, src/templates/agent-skills/snippets/**, src/templates/agent-skills/agents/**]
applies_to: [planning artifacts, engraved records, durable UI artifacts, deployed commands]
established_by: [D-6]
excepts: []
---
# Passes preserve what earlier passes recorded

## Rule

A command writing to an existing artifact or store keeps its rows, ids,
sibling files, and citations. An empty-state line is written only when the
section has no rows; the first added row replaces it. Once anything
references an id, that id is never renumbered. A write never overwrites an
existing record or durable UI artifact. A two-sided change lands in one
commit.

## Rationale

A write that assumes an empty page erases earlier work silently, and a
renumbered id misdirects every citation to it (D-6).

## Known Exceptions

| Where | What diverges | Disposition + Why | Tracking Issue | Severity |
|-------|---------------|-------------------|----------------|----------|
| `commands/smithy.persona.prompt` (RFC mode) | Duplicate slugs in one batch overwrite each other | Temporary: detect in-batch collisions | #651 | low |
| `snippets/engraved-recall-rules.md` (empty states) | The empty state clears recorded citation hazards | Temporary: decide it after the hazards | #651 | medium |

## Citations

D-6. Paths are relative to `src/templates/agent-skills/`.

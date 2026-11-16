---
applyTo: "specs/**,docs/rfcs/**,docs/prds/**"
excludeAgent: "coding-agent"
---
# Planning artifacts in this repository

The general rules for Smithy artifacts apply. Three things are specific to
SmithyCLI:

- **The current checklists are the source snippets**,
  `src/templates/agent-skills/snippets/audit-checklist-*.md`, and the schema
  reference is `src/templates/agent-skills/README.md`. The copies inside
  `.claude/commands/smithy.audit.md` are a snapshot and may be older. When
  they differ, the source wins.
- **These plans change Smithy itself.** A requirement or task that would make
  a deployed template cite a source-only document, restate a shared protocol,
  or add always-loaded text conflicts with INV-2, INV-1, or P-1. Catching that
  in the plan is cheaper than catching it in the implementation. Raise it and
  name the record.
- **Smithy plans only for what it owns.** It deploys prompts and reads
  planning artifacts. A plan that has Smithy dictate how a target repository
  tests, builds, or lays out its code is a **Steering question:**, not a
  detail.

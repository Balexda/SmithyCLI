---
applyTo: "**/*.rfc.md,**/*.features.md,**/*.spec.md,**/*.data-model.md,**/*.contracts.md,**/*.tasks.md,**/*.strike.md,**/*.prd.md"
excludeAgent: "coding-agent"
---
<!-- Smithy-general layer: true in any repository that uses Smithy. Keep repository-specific rules out of this file. -->

# Reviewing Smithy planning artifacts

These files are plans. Smithy commands write them; later commands and the
person steering the work read them. Review whether the plan is right and
complete, not whether the prose is polished.

## The lineage

| Artifact | Holds | Row IDs | Written by |
|----------|-------|---------|------------|
| `.rfc.md` | milestones | `M1`, `M2` | `smithy.ignite` |
| `.features.md` | features | `F1`, `F2` | `smithy.render` |
| `.spec.md`, with `.data-model.md` and `.contracts.md` | user stories | `US1`, `US2` | `smithy.mark` |
| `.tasks.md` | slices, inline | `S1`, `S2` | `smithy.cut` |

- A parent links to its children through a `## Dependency Order` table with
  exactly four columns: `ID | Title | Depends On | Artifact`. That table is
  the link, not filenames, prose, or folder layout.
- `Depends On` lists IDs from the same table, or `—`. `Artifact` is a
  repo-relative path to the child, or `—` when it does not exist yet. Slice
  rows always use `—`. Checkboxes are not valid in this table.
- `AS 2.1` is the first acceptance scenario of user story 2 in the parent
  spec, which numbers them 1, 2, 3 under each story. Tasks cite scenarios by
  that ID on purpose.

## What each command's pull request should change

| Command | Expected change |
|---------|-----------------|
| `render` | One new `.features.md`, and the milestone's `Artifact` cell in the RFC |
| `mark` | A new spec folder, and the feature's `Artifact` cell in the feature map |
| `cut` | One new `.tasks.md`, and the story's `Artifact` cell in the spec |

Corrections written back to the parent artifact are normal. Flag a planning
pull request that also changes source code, tests, or configuration, and flag
a new child artifact whose parent row still shows `—`.

## What deserves a comment

- **A decision made silently.** `## Specification Debt` is a queue of choices
  a person must make. If a requirement, task, or acceptance criterion assumes
  an answer to an open `SD-NNN` row, raise it as a **Steering question:**.
- **Debt that is not a decision.** A row the implementer settles by building,
  testing, or reading code belongs in the tasks file's
  `## Open Implementation Questions` as `IQ-NNN`. A wrong table or stale path
  is a fix, not a question.
- **Broken traceability.** A slice with no requirement or acceptance scenario
  behind it; a requirement no story covers; a story nothing in the contracts
  or data model supports; a `Depends On` that contradicts the parent's table.
- **Wrong altitude.** Features that read like user stories, stories that read
  like tasks, tasks that restate scenarios or dictate test mechanics and exact
  signatures.
- **Behaviour an agent already performs**, such as "detect the project's
  language", mandated with no new contract or observable output. Recommend
  keeping the outcome and dropping the mechanism.

Do not comment on the `AS N.M` shorthand or on older table shapes in files the
change did not touch. For the per-artifact checklist, use the
`smithy-review-planning` skill.

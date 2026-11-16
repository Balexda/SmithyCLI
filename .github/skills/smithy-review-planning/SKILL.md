---
name: smithy-review-planning
description: "Per-artifact review procedure for pull requests that add or change Smithy planning artifacts (.rfc.md, .features.md, .spec.md, .data-model.md, .contracts.md, .tasks.md, .strike.md). Use during code review when a change touches one of these files and you need the checks for that artifact type."
---
<!-- Smithy-general layer: true in any repository that uses Smithy. Keep repository-specific rules out of this file. -->

# Reviewing Smithy planning artifacts

A planning pull request is reviewed against two things: the checklist for its
artifact type, and its parent artifact. Work through the steps in order.

## 1. Identify the artifact and open its parent

| Suffix | What it is | Parent to open | Written by |
|--------|------------|----------------|------------|
| `.rfc.md` | milestones for one initiative | a `.prd.md`, when the header names one | `smithy.ignite` |
| `.features.md` | features for one RFC milestone | the RFC named in its header | `smithy.render` |
| `.spec.md`, `.data-model.md`, `.contracts.md` | user stories for one feature | the feature map and RFC named in its header | `smithy.mark` |
| `.tasks.md` | slices for one user story | the spec named on its `**Source**:` line | `smithy.cut` |
| `.strike.md` | one self-contained slice | none | `smithy.strike` |

## 2. Load the checklist for that artifact type

The checklists are maintained in one place: Smithy's audit command, which
`smithy init` deploys into the repository. Open whichever of these exists and
find the table headed `Audit Checklist (<suffix>)`:

- `.claude/commands/smithy.audit.md`
- `.agents/skills/smithy-audit/SKILL.md`
- `.gemini/skills/smithy-audit/SKILL.md`

Apply every row of that table to the changed artifact. When the repository's
own instructions name a newer source for the same checklists, prefer it.

## 3. Check the artifact against its parent

- **The link exists.** The parent's `## Dependency Order` row for this child
  has its `Artifact` cell set to this file or folder, in the same pull
  request.
- **Nothing is widened.** No requirement, story, or slice appears without a
  parent row behind it. Narrowing is fine when the parent's out-of-scope
  section or debt table records it.
- **References resolve.** A tasks file cites `AS <story>.<n>` scenarios and
  `FR-NNN` requirements that exist in the spec. `Depends On` cells in the
  child do not contradict the ordering the parent declares.
- **Open debt is handled, not decided.** Each open row in the parent is
  carried down with an `Origin` naming the parent row, resolved with a
  recorded answer, or left untouched. A child that quietly assumes one answer
  is the most valuable thing you can catch.

## 4. Checks that matter most, by command

| Command | Look hardest at |
|---------|-----------------|
| `cut` | Tasks that assume an answer to open debt. A dependency the tasks file declares on another story that the spec's `## Dependency Order` does not show. Slices that are not one pull request each. Standalone test, research, or verification tasks. |
| `mark` | Stories at the wrong altitude. A story with nothing in the contracts or data model to support it. Requirements that mandate behaviour an agent already performs. Priority order. |
| `render` | Features small enough to be user stories. Missing or invalid feature-kind metadata. Dependencies stated in prose but absent from the table. |
| `ignite` | Goals that name milestones. Exclusions phrased as "deferred to a later milestone". Unresolved questions left in prose instead of the debt table. |

## 5. Weigh what you found

- A choice only a person can make is a **Steering question:**. Phrase it so
  it can be answered in one sitting without opening an editor, and name the
  alternatives. The full test is under "The steering test" in the deployed
  `smithy-plan-review` agent.
- An unknown that building, testing, or reading the code will settle is not
  debt. In a tasks file it belongs under `## Open Implementation Questions`.
- A wrong table, stale path, or contradiction with a cited source is a defect
  with a known fix. State the fix.
- Several symptoms of one cause are one finding. Name the cause.

## 6. Not findings

- The `AS N.M` shorthand, the `—` placeholder, or slices living inline in the
  tasks file.
- A UI spec's six-column typed ledger
  (`ID | Kind | Title | Depends On | Design | Artifact`, with `SC<N>`, `FL<N>`,
  and `US<N>` rows) where a backend spec has the four-column table. The spec
  checklist describes the backend shape; both are valid.
- Older table shapes or headings in files the change did not touch, and
  completed tasks files that no longer match later work.
- Wording preferences, where the meaning is unambiguous to the next command.
- Table or list formatting you have not confirmed in the raw file.

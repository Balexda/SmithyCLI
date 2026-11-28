---
name: smithy-review-planning
description: "Review procedure for pull requests that add or change Smithy planning artifacts (.rfc.md, .features.md, .spec.md, .data-model.md, .contracts.md, .tasks.md, .strike.md): parent checks, the per-artifact checklist, and what each command's change should contain. Use during code review before commenting on one of these files."
---
<!-- Smithy-general layer: true in any repository that uses Smithy. Keep repository-specific rules out of this file. -->

# Reviewing Smithy planning artifacts

A planning pull request is reviewed against two things: the checklist for its
artifact type, and its parent artifact. Review whether the plan is right and
complete, not whether the prose is polished. Work through the steps in order.

## 1. Open the parent

| Changed file | Parent to open |
|--------------|----------------|
| `.rfc.md` | a `.prd.md`, when the header names one |
| `.features.md` | the RFC named in its header |
| `.spec.md` | the feature map and RFC named in its header, when the header names them |
| `.data-model.md`, `.contracts.md` | the sibling `.spec.md` in the same folder, then the feature map and RFC named in the spec's header, when it names them |
| `.tasks.md` | the spec named on its `**Source**:` line |
| `.strike.md` | none; it is one self-contained slice |

Only the parents qualified with "when the header names" are optional: a PRD
for an RFC, and the feature map and RFC for a spec marked from a direct
description (and so for that spec's companions). When an optional parent is absent, skip step 3 for it and review
against the checklist alone; the absence is not a finding. Every other parent
is required. A `.features.md` with no RFC, or a `.tasks.md` with no
`**Source**:` spec, is a finding: report the missing parent and the checks it
blocks.

## 2. Load the checklist for that artifact type

The checklists are maintained in one place: Smithy's audit command, which
`smithy init` deploys into the repository. Open whichever of these exists and
find the table headed `Audit Checklist (<suffix>)`:

- `.claude/commands/smithy.audit.md`
- `.agents/skills/smithy-audit/SKILL.md`
- `.gemini/skills/smithy-audit/SKILL.md`

Apply every row of that table to the changed artifact. A `.data-model.md` or
`.contracts.md` change uses the `.spec.md` table: apply its Cross-Document
Consistency, Data Model Integrity, and Contract Completeness rows to the
companion, read against the sibling spec, and apply the other rows only when
the pull request also changes the spec. When the repository's
own instructions name a newer source for the same checklists, prefer it. The
spec checklist describes the backend table; a UI spec's typed ledger
satisfies the same row.

## 3. Check the artifact against its parent

- **The link exists.** The immediate parent's row for this child has its
  `Artifact` cell set to this file or folder. A link set by an earlier pull
  request counts when it still resolves; the parent must change in the same
  pull request only when this one adds the child or moves it. Only
  the adjacent level holds that row: a spec's link is in the feature map, and
  the feature map's link is in the RFC. The RFC has no row for the spec. A
  `.data-model.md` or `.contracts.md` has no `Artifact` row. It links to its
  spec by sitting in the spec's folder under the same file stem, so check that
  instead and compare its content against the sibling spec.
- **Nothing is widened.** No requirement, story, or slice appears without a
  parent row behind it. Narrowing is fine when the parent's out-of-scope
  section or debt table records it.
- **References resolve.** A tasks file cites acceptance scenarios and
  `FR-NNN` requirements that exist in the spec. `Depends On` cells in the
  child do not contradict the ordering the parent declares.
- **Open debt is handled, not decided.** Each open row in the parent is
  carried down with an `Origin` naming the parent row, resolved with a
  recorded answer, or left untouched. A child that quietly assumes one answer
  is the most valuable thing you can catch.

## 4. Check the change against the command that made it

| Command | The pull request should change | Look hardest at |
|---------|--------------------------------|-----------------|
| `ignite` | One new `.rfc.md` | Goals that name milestones. Exclusions phrased as "deferred to a later milestone". Unresolved questions left in prose instead of the debt table. |
| `render` | One new `.features.md`, and the milestone's `Artifact` cell in the RFC | Features small enough to be user stories. Missing or invalid feature-kind metadata. Dependencies stated in prose but absent from the table. |
| `mark` | A new spec folder, and the feature's `Artifact` cell in the feature map. For a UI feature, also its `.design.md` and `.flow.md` files and one stub test body per flow | Stories at the wrong altitude. A story with nothing in the contracts or data model to support it. Requirements that mandate behaviour an agent already performs. Priority order. |
| `cut` | One new `.tasks.md`, and the story's `Artifact` cell in the spec | Tasks that assume an answer to open debt. A dependency the tasks file declares on another story that the spec's table does not show. Slices that are not one pull request each. Standalone test, research, or verification tasks. |

Corrections written back to the parent artifact are normal. Flag a planning
pull request that changes source code, configuration, or tests beyond those
stubs.

## 5. Audit every debt row the change adds

An open `SD-NNN` row says a person must choose before the work can go on.
Rows added in follow-up commits that answer review comments are the ones most
likely to fail that bar. Check every open row the pull request adds or edits,
including the rows' detail sections, against the deployed kind gate:
"The steering test", "Alternatives that do not count", and "Recommend first".
The gate ships in whichever of these exists:

- `.claude/agents/smithy.plan-review.md`
- `.codex/agents/smithy-plan-review.toml`
- `.gemini/skills/smithy-forge/SKILL.md`, which inlines the gate because
  Gemini installs no sub-agents

Flag the row when:

- **One option keeps the defect.** An alternative is "document current
  behavior", "accept the attempted semantics", or "leave as shipped" for code
  that is broken or contradicts the artifact. Ask for a requirement that
  states the target behavior and names the recommended fix.
- **The artifact already decided.** Another requirement, contract,
  assumption, or `### Resolved` item in the same artifact picks one of the
  options. Ask for the row to be resolved and the disagreeing text aligned.
- **It defers to the slice.** "The slice must decide …" with no reason only a
  person can weigh. It is an `IQ-NNN` row, settled by building, or it needs a
  recommendation.
- **It has no recommendation.** The detail section has no
  `**Recommendation:**` line naming the pick, why, and what keeps it open.
- **It is a task.** "The slice must separate X from Y" or "the slice
  implements the split" is work for a slice, not a question.

Flag hedged requirements and success criteria the same way: "target
contract, not current behavior", "accepted but ignored until `SD-NNN`", or a
success criterion that asserts the broken current behavior. The requirement
states the target, and the gap in current code is noted once in
`## Dependency Order` or the slice notes.

More than a handful of open rows on one artifact is itself a finding. Say so
in one top-level comment and name the rows that fail the gate.

## 6. Weigh what you found

- **A gap between shipped code and the artifact** is a requirement, not debt.
  Phrase the suggestion as the requirement and its fix ("add FR: X MUST …;
  the slice fixes Y"). Never suggest recording it as specification debt.
- **A choice only a person can make.** Phrase it so it can be answered in one
  sitting without opening an editor, name the alternatives, and say which you
  would pick and why. The full test is under "The steering test" in the
  deployed kind gate (step 5 lists where it ships).
- **An unknown that building, testing, or reading the code will settle** is
  not debt. In a tasks file it belongs under
  `## Open Implementation Questions`.
- **A wording preference** is not a finding where the meaning is unambiguous
  to the next command.

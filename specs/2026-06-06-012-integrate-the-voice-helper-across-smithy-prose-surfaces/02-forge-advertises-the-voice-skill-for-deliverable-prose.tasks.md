# Tasks: Forge Advertises the Voice Skill for Deliverable Prose

**Source**: `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/integrate-the-voice-helper-across-smithy-prose-surfaces.spec.md` — User Story 2
**Data Model**: `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/integrate-the-voice-helper-across-smithy-prose-surfaces.data-model.md`
**Contracts**: `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/integrate-the-voice-helper-across-smithy-prose-surfaces.contracts.md`
**Story Number**: 02

---

## Slice 1: Advertise Voice Discipline for Forge Deliverables

**Goal**: `smithy.forge` advertises `smithy.helper-voice` for substantive deliverable prose, and `smithy.maid` may report voice issues through its existing read-only findings channel.

**Justification**: The forge skill-table advertisement and maid flagging permission are the complete behavioral surface for US2. They are small prompt-template edits that should be reviewed together because the trigger boundary must cover substantive README / ADR / runbook / migration-plan / inline-doc authoring without firing on routine code comments.

**Addresses**: FR-003, FR-004, FR-005, FR-016; AS 2.1, AS 2.2, AS 2.3, AS 2.4

### Tasks

- [ ] **Advertise the helper in forge's operational skills table**

  Update `src/templates/agent-skills/commands/smithy.forge.prompt` so the Operational Skills table includes `smithy.helper-voice` with a load-when trigger for README, ADR, runbook, migration-plan, and substantive inline-doc authoring. The row should advertise draft-mode usage for deliverable prose and should not paste the helper's taxonomy into the forge prompt.

  _Acceptance criteria:_
  - The Operational Skills table contains a `smithy.helper-voice` row.
  - The trigger condition explicitly covers README, ADR, runbook, migration-plan, and substantive inline-doc authoring.
  - Routine, non-substantive code comments are excluded from the trigger boundary.
  - No helper taxonomy text is inlined in the forge prompt.

- [ ] **Permit maid to flag voice anti-patterns without fixing them**

  Update `src/templates/agent-skills/agents/smithy.maid.prompt` so documentation review may report voice anti-patterns in changed README or inline-doc prose through the existing findings format. Preserve maid's read-only posture for these issues: it may flag and explain, but must not rewrite prose in place.

  _Acceptance criteria:_
  - Maid can emit a finding for voice anti-patterns in changed README or substantive inline-doc prose.
  - The prompt states that voice findings are flags only, not in-place edits.
  - Existing stale-doc and missing-doc review responsibilities remain intact.

- [ ] **Add forge and maid regression coverage and validate**

  Add focused coverage in `src/templates.test.ts` (or its existing helpers) asserting that composed forge output advertises `smithy.helper-voice` with the deliverable-prose trigger and that composed maid output permits read-only voice findings. Keep assertions structural: check for the named helper, trigger categories, and flag-only boundary rather than long taxonomy wording. Then run template parsing and type checking without regenerating derived snapshots.

  _Acceptance criteria:_
  - Tests assert forge composes with a `smithy.helper-voice` Operational Skills row and the named deliverable-prose trigger categories.
  - Tests assert maid composes with read-only voice finding permission for changed README or substantive inline-doc prose.
  - `npm test` and `npm run typecheck` pass.
  - `.claude/` and `.smithy/smithy-manifest.json` remain unchanged.

**PR Outcome**: Forge advertises the shared voice helper for substantive deliverable prose, maid can flag voice issues without editing prose, and regression coverage guards the trigger boundary plus the no-inlined-taxonomy invariant.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Unresolved choice for the arbitrary-text voice-cleanup trigger: (a) description-tuning only — sharpen the skill's frontmatter `description` so review/cleanup mode auto-activates on standalone phrasings and document that review mode accepts an arbitrary file path or pasted text (no new surface); versus (b) add a dedicated `/smithy.voice` (or similar) slash command as an explicit invocation point. The user explicitly asked for "proper triggers," and the reconciled plan recommends (a), but the emphasis on "proper triggers" makes the choice a genuine steering decision the codebase cannot settle. | Interaction & UX / Edge Cases | High | Medium | inherited | — |
| SD-002 | inherited from spec: Unresolved direction for the `examples`-enum reconciliation: the shipped audit lint (`audit-checklist-voice.md`) accepts a 5th value `optional` ("imposes no example constraint"), but the skill §8 and README omit it. Either (a) the skill + README adopt `optional` to match the already-shipped lint, or (b) the lint drops `optional` to match the skill's four-value enum. Option (a) is lower-risk because the lint is live and re-flagging existing tags is undesirable; option (b) keeps the canonical taxonomy minimal. The choice changes which surface is edited and whether existing tags must be re-audited. | Integration / Terminology | Medium | Medium | inherited | — |
| SD-003 | inherited from spec: The draft-time hook point for `smithy.strike` and `smithy.engrave` is named as a target (FR-002, US1 Acceptance Scenario 3) but not pinned: `strike` is one-shot and may lack a discrete narrative Explanation section comparable to ignite's Summary/Motivation, and `engrave`'s decision/invariant prose has no specified load point in its flow. Confirm whether each command has a narrative section warranting a draft-mode skill load (and where), or whether one or both belong in a follow-on alongside the other deferred surfaces. | plan-review:Logical gap | Important | Low | inherited | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Advertise Voice Discipline for Forge Deliverables | — | — |

### Cross-Story Dependencies

None — this story is self-contained.

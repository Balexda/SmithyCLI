# Tasks: Reliable Trigger for Arbitrary-Text Voice Cleanup

**Source**: `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/integrate-the-voice-helper-across-smithy-prose-surfaces.spec.md` — User Story 4
**Data Model**: `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/integrate-the-voice-helper-across-smithy-prose-surfaces.data-model.md`
**Contracts**: `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/integrate-the-voice-helper-across-smithy-prose-surfaces.contracts.md`
**Story Number**: 04

---

## Slice 1: Tune Standalone Voice Cleanup Activation
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: `smithy.helper-voice` reliably activates for standalone arbitrary-text cleanup requests, documents the accepted input shapes, and stays quiet when a parent Smithy workflow already governs prose drafting.

**Justification**: US4 has one behavioral surface: the voice helper skill's discoverability and review / cleanup contract. The frontmatter trigger, body documentation, and regression coverage should land together because over-activation and under-activation are opposite edges of the same routing behavior.

**Addresses**: FR-011, FR-012, FR-013, FR-016; AS 4.1, AS 4.2, AS 4.3

### Tasks

- [ ] **Sharpen the standalone cleanup trigger**

  Update `src/templates/agent-skills/skills/smithy.helper-voice/SKILL.prompt` so the frontmatter `description` advertises review / cleanup mode as a valid direct response to standalone arbitrary-text requests. Keep the description provider-neutral and name the positive trigger phrasing family from AS 4.1 without adding a new slash command.

  _Acceptance criteria:_
  - The frontmatter no longer states that the helper is never a direct user entry point.
  - The description names standalone cleanup phrasings such as voice cleanup, prose improvement, and audience-tag application.
  - The description routes those phrasings to review / cleanup mode.
  - `src/templates.test.ts` asserts the composed skill description covers the positive trigger phrase families.
  - No helper taxonomy text is duplicated outside the skill body.
  - No dedicated `/smithy.voice` or adjacent command surface is introduced.

- [ ] **Document arbitrary file and pasted-text cleanup**

  Extend the review / cleanup mode documentation in `src/templates/agent-skills/skills/smithy.helper-voice/SKILL.prompt` so an agent loading the skill knows it may accept either a file path or pasted text outside any Smithy planning workflow. Preserve the existing side-by-side original-vs-revised output contract from AS 4.1 and AS 4.2.

  _Acceptance criteria:_
  - The skill body explicitly accepts an arbitrary file path for review / cleanup mode.
  - The skill body explicitly accepts pasted text for review / cleanup mode.
  - The side-by-side original-vs-revised return shape remains documented.
  - `src/templates.test.ts` asserts the composed skill body documents file paths, pasted text, and side-by-side output.
  - The workflow remains prose-only and does not require planning-artifact wrapping.
  - The body remains provider-neutral with no Claude, Gemini, or Codex-specific syntax.

- [ ] **Bound activation during Smithy drafting**

  Add guidance in `src/templates/agent-skills/skills/smithy.helper-voice/SKILL.prompt` that standalone cleanup triggers apply only when the user is asking to revise existing text, not when a parent Smithy command is already drafting prose under its own voice instructions. This satisfies AS 4.3 without weakening the draft-mode integrations from US1.

  _Acceptance criteria:_
  - The skill distinguishes standalone cleanup from parent-governed Smithy drafting.
  - Mid-`smithy.mark` or similar draft-time prose authoring is called out as governed by the parent template.
  - Existing draft-mode behavior for authoring commands and `smithy.prose` remains compatible.
  - Review / cleanup mode still works for explicit file or pasted-text cleanup requests.
  - `src/templates.test.ts` asserts the composed skill body preserves the mid-workflow over-activation boundary.
  - `npm test` and `npm run typecheck` pass.
  - `.claude/` and `.smithy/smithy-manifest.json` remain unchanged.

**PR Outcome**: The voice helper becomes a reliable direct cleanup target for arbitrary files or pasted text while keeping Smithy workflow drafting under parent-template control, with regression coverage for both trigger edges.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Unresolved choice for the arbitrary-text voice-cleanup trigger: (a) description-tuning only — sharpen the skill's frontmatter `description` so review/cleanup mode auto-activates on standalone phrasings and document that review mode accepts an arbitrary file path or pasted text (no new surface); versus (b) add a dedicated `/smithy.voice` (or similar) slash command as an explicit invocation point. The user explicitly asked for "proper triggers," and the reconciled plan recommends (a), but the emphasis on "proper triggers" makes the choice a genuine steering decision the codebase cannot settle. | Interaction & UX / Edge Cases | High | Medium | inherited | — |
| SD-002 | inherited from spec: Unresolved direction for the `examples`-enum reconciliation: the shipped audit lint (`audit-checklist-voice.md`) accepts a 5th value `optional` ("imposes no example constraint"), but the skill §8 and README omit it. Either (a) the skill + README adopt `optional` to match the already-shipped lint, or (b) the lint drops `optional` to match the skill's four-value enum. Option (a) is lower-risk because the lint is live and re-flagging existing tags is undesirable; option (b) keeps the canonical taxonomy minimal. The choice changes which surface is edited and whether existing tags must be re-audited. | Integration / Terminology | Medium | Medium | inherited | — |
| SD-003 | inherited from spec: The draft-time hook point for `smithy.strike` and `smithy.engrave` is named as a target (FR-002, US1 Acceptance Scenario 3) but not pinned: `strike` is one-shot and may lack a discrete narrative Explanation section comparable to ignite's Summary/Motivation, and `engrave`'s decision/invariant prose has no specified load point in its flow. Confirm whether each command has a narrative section warranting a draft-mode skill load (and where), or whether one or both belong in a follow-on alongside the other deferred surfaces. | plan-review:Logical gap | Important | Low | inherited | — |

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Tune Standalone Voice Cleanup Activation | — | — |

### Cross-Story Dependencies

None — this story is self-contained.

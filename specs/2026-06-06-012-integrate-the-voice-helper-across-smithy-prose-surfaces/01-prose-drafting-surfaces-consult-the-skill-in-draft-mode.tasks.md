# Tasks: Prose-Drafting Surfaces Consult the Skill in Draft Mode

**Source**: `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/integrate-the-voice-helper-across-smithy-prose-surfaces.spec.md` — User Story 1
**Data Model**: `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/integrate-the-voice-helper-across-smithy-prose-surfaces.data-model.md`
**Contracts**: `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/integrate-the-voice-helper-across-smithy-prose-surfaces.contracts.md`
**Story Number**: 01

---

## Slice 1: Trim smithy.prose to Load the Voice Skill

**Goal**: `smithy.prose` loads `smithy.helper-voice` in draft mode for shared voice taxonomy while retaining its section-specific drafting protocol.

**Justification**: This slice removes the canonical duplicate taxonomy from the only prose-drafting sub-agent and leaves the spark/ignite narrative path working through the same entry point. It is independently reviewable because the observable change is limited to one prompt template plus parse/eval verification for the two callers that already use it.

**Addresses**: FR-001, FR-003, FR-016; AS 1.1, AS 1.2, AS 1.4

### Tasks

- [ ] **Replace duplicated prose rules with skill load**

  Update `src/templates/agent-skills/agents/smithy.prose.prompt` so Step 3 explicitly loads `Skill("smithy.helper-voice")` in draft mode before drafting assigned sections. Remove the inlined shared-principles and anti-pattern taxonomy, but keep the context-gathering flow and prose-agent responsibilities intact for AS 1.1 and AS 1.4.

  _Acceptance criteria:_
  - Step 3 references `Skill("smithy.helper-voice")` for draft-mode voice guidance.
  - The removed text includes the duplicated shared-principles list and anti-pattern block.
  - No replacement text re-inlines the skill's taxonomy or examples.

- [ ] **Preserve section-specific prose protocol**

  Verify and, if needed, adjust `src/templates/agent-skills/agents/smithy.prose.prompt` so the gap-marker rule, no-invented-figures rule, and Summary / Motivation / Personas structure remain available after the trim. The prose-specific rules the helper skill does not carry must remain in the prompt for AS 1.2.

  _Acceptance criteria:_
  - Gap markers such as `[X hours]` remain part of the drafting protocol.
  - The prompt still forbids invented figures when context lacks numbers.
  - Summary, Motivation / Problem Statement, and Personas guidance remains present.

- [ ] **Validate prose template parsing and eval coverage**

  Run the repository's template parse test and the spark/ignite eval scenarios after editing `smithy.prose`. Record any eval limitations in the implementation notes rather than widening this slice beyond FR-001 and FR-016.

  _Acceptance criteria:_
  - `npm test` passes, including `src/templates.test.ts`.
  - The spark and ignite eval scenarios complete without a narrative-quality regression attributable to the trim.
  - The `.claude/` snapshot and `.smithy/smithy-manifest.json` remain unchanged.

**PR Outcome**: Spark and ignite narrative drafting now reaches shared voice guidance through `smithy.prose`, with the duplicated taxonomy removed and prose-specific rules preserved.

---

## Slice 2: Wire Reference Planning Commands to Draft-Mode Discipline

**Goal**: Reference- and How-to-shaped planning commands load `smithy.helper-voice` in draft mode when they author feature maps, specs, data models, contracts, and task artifacts directly.

**Justification**: `smithy.render`, `smithy.mark`, and `smithy.cut` share the same failure mode: dense prose drifting into Reference/How-to artifacts that should stay table-shaped and concise. These command templates can be updated and reviewed together without touching narrative-only sub-agent behavior.

**Addresses**: FR-002, FR-003, FR-016; AS 1.3, AS 1.4

### Tasks

- [ ] **Add voice load to render authoring**

  Update `src/templates/agent-skills/commands/smithy.render.prompt` so the feature-map drafting phase invokes `Skill("smithy.helper-voice")` in draft mode for Reference discipline before writing artifact prose. Keep the command's existing feature-map structure, dependency table, and specification-debt conventions intact for AS 1.3.

  _Acceptance criteria:_
  - The render prompt contains a named `Skill("smithy.helper-voice")` draft-mode invocation at feature-map authoring time.
  - The invocation describes Reference discipline without inlining taxonomy text.
  - Existing feature-map template sections and audience tags remain parseable.

- [ ] **Add voice load to mark authoring**

  Update `src/templates/agent-skills/commands/smithy.mark.prompt` so spec, data-model, and contracts drafting invokes `Skill("smithy.helper-voice")` in draft mode for Reference discipline. Preserve the existing artifact templates, `N/A — <reason>` fallback, and no-derived-snapshot rule for AS 1.3 and AS 1.4.

  _Acceptance criteria:_
  - The mark prompt contains a named draft-mode helper load before direct artifact rendering.
  - The data-model and contracts instructions still support `N/A — <reason>` when no code-shaped entity or contract exists.
  - No helper taxonomy text is pasted into the mark template.

- [ ] **Add voice load to cut authoring**

  Update `src/templates/agent-skills/commands/smithy.cut.prompt` so task-slice artifact drafting invokes `Skill("smithy.helper-voice")` in draft mode for How-to and Reference discipline. Preserve the mandatory task structure, dependency-order table, and debt inheritance rules for AS 1.3.

  _Acceptance criteria:_
  - The cut prompt contains a named draft-mode helper load before writing `.tasks.md` content.
  - The task format remains the mandatory checkbox task structure consumed by forge.
  - No helper taxonomy text is pasted into the cut template.

- [ ] **Validate reference command templates**

  Run template parsing after the render, mark, and cut edits. Add or adjust focused regression coverage only if the existing parse tests do not compose the edited templates.

  _Acceptance criteria:_
  - `npm test` passes, including composed template parsing for render, mark, and cut.
  - No `.claude/` or `.smithy/smithy-manifest.json` files are regenerated.
  - A grep for `Skill("smithy.helper-voice")` shows the new command-level invocations.

**PR Outcome**: Planning artifacts authored directly by render, mark, and cut now load the shared voice helper as a Reference/How-to discipline guard without duplicating taxonomy text.

---

## Slice 3: Wire Narrative and Durable-Knowledge Commands

**Goal**: Commands that author PRD, RFC, strike, and engraved decision/invariant/principle prose invoke `smithy.helper-voice` in draft mode at their direct prose-writing points.

**Justification**: These command templates include Explanation-mode or durable narrative sections that are distinct from the table-shaped planning surfaces in Slice 2. Grouping them keeps the implementation focused on narrative authoring while preserving the existing spark/ignite delegation to the trimmed `smithy.prose` where that delegation already owns Summary, Motivation, and Personas.

**Addresses**: FR-002, FR-003, FR-016; AS 1.3, AS 1.4

### Tasks

- [ ] **Add voice load to spark direct prose**

  Update `src/templates/agent-skills/commands/smithy.spark.prompt` so directly authored PRD prose invokes `Skill("smithy.helper-voice")` in draft mode, while narrative sections already delegated to `smithy.prose` continue through that sub-agent. The command should not duplicate taxonomy text or route every section through `smithy.prose` for AS 1.3.

  _Acceptance criteria:_
  - Spark direct prose authoring has a named draft-mode helper load.
  - Existing `smithy.prose` delegation remains the path for sections it already drafts.
  - The PRD template remains parseable and does not inline helper taxonomy.

- [ ] **Add voice load to ignite direct prose**

  Update `src/templates/agent-skills/commands/smithy.ignite.prompt` so direct RFC prose authoring invokes `Skill("smithy.helper-voice")` in draft mode, while Summary / Motivation / Personas delegation continues through `smithy.prose`. Preserve the one-shot output contract and RFC template structure for AS 1.3.

  _Acceptance criteria:_
  - Ignite direct prose authoring has a named draft-mode helper load.
  - Summary / Motivation / Personas remain delegated to `smithy.prose` where applicable.
  - The RFC template and one-shot output block still parse.

- [ ] **Add voice load to strike authoring**

  Update `src/templates/agent-skills/commands/smithy.strike.prompt` so strike-document prose drafting invokes `Skill("smithy.helper-voice")` in draft mode for Explanation sections and concise task guidance. Keep the existing one-shot behavior and artifact template shape intact for AS 1.3.

  _Acceptance criteria:_
  - Strike invokes the helper by name before writing prose-bearing strike sections.
  - Reference and How-to sections remain concise and structured.
  - No helper taxonomy text is pasted into the strike prompt.

- [ ] **Add voice load to engrave authoring**

  Update `src/templates/agent-skills/commands/smithy.engrave.prompt` so decision, invariant, and principle prose authoring invokes `Skill("smithy.helper-voice")` in draft mode at the record-writing points. Preserve the durable-knowledge schema and append-only lifecycle rules for AS 1.3.

  _Acceptance criteria:_
  - Engrave invokes the helper by name before authoring record body prose.
  - Decision, invariant, and principle schemas remain unchanged.
  - No helper taxonomy text is pasted into the engrave prompt.

- [ ] **Validate narrative command templates**

  Run the repository's template parse tests and relevant eval scenarios after editing spark, ignite, strike, and engrave. Keep the `.claude/` snapshot unchanged per FR-016.

  _Acceptance criteria:_
  - `npm test` passes for composed command templates.
  - Relevant eval scenarios complete or any unavailable scenario is explicitly noted.
  - `.claude/` and `.smithy/smithy-manifest.json` remain unchanged.

**PR Outcome**: Spark, ignite, strike, and engrave load the shared voice helper for direct prose authoring while preserving existing delegation boundaries and artifact schemas.

---

## Slice 4: Add Voice Integration Regression Coverage

**Goal**: Tests and evals prove the draft-mode integrations exist, templates remain parseable, and no prompt in this story reintroduces inlined helper taxonomy.

**Justification**: The integration touches multiple prompt templates, so a final verification slice gives maintainers a durable guardrail after the prompt edits land. This slice is independently useful because it turns the story's controlling invariant into automated checks without changing the authoring behavior itself.

**Addresses**: FR-001, FR-002, FR-003, FR-016; AS 1.1, AS 1.2, AS 1.3, AS 1.4

### Tasks

- [ ] **Add template regression tests for helper loads**

  Add focused coverage in `src/templates.test.ts` or the existing template-test helpers to assert that `smithy.prose` and the direct prose-authoring commands compose with `Skill("smithy.helper-voice")` references. Keep the assertions structural and avoid testing exact prose strings that would make future wording changes brittle.

  _Acceptance criteria:_
  - Tests cover `smithy.prose`, render, mark, cut, spark, ignite, strike, and engrave template composition.
  - Tests assert named helper references are present where the story requires them.
  - Tests do not require exact taxonomy wording copied from the helper skill.

- [ ] **Add no-inline-taxonomy regression check**

  Add or extend a test that fails if the removed `smithy.prose` shared-principles heading or anti-pattern block returns in the edited templates. Scope the check to the story's touched templates so unrelated documentation can still describe the helper at a high level.

  _Acceptance criteria:_
  - The old `Prose principles — follow these on every sentence` heading is absent from `smithy.prose`.
  - The old anti-pattern block is absent from `smithy.prose`.
  - The story's command templates reference the helper by name instead of embedding copied taxonomy text.

- [ ] **Exercise evals for draft-mode activation**

  Run `npm run eval` with the scenarios that cover spark, ignite, and any available command-template smoke cases for direct authoring. Capture whether at least one scenario demonstrates an actual `Skill("smithy.helper-voice")` invocation per SC-001.

  _Acceptance criteria:_
  - `npm run eval` completes or unsupported cases are documented with the exact limitation.
  - At least one eval or smoke output demonstrates a `Skill("smithy.helper-voice")` invocation.
  - Spark and ignite narrative output shows no regression from the `smithy.prose` trim.

- [ ] **Run final repository validation**

  Run the required repository validation commands after the prompt and test changes. Confirm generated snapshots remain untouched and summarize any skipped eval coverage in the PR notes.

  _Acceptance criteria:_
  - `npm test` passes.
  - `npm run typecheck` passes.
  - `.claude/` and `.smithy/smithy-manifest.json` have no diff.

**PR Outcome**: CI and eval coverage guard the draft-mode voice integrations, ensuring future prompt edits keep helper loads parseable and avoid reintroducing duplicated taxonomy.

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
| S1 | Trim smithy.prose to Load the Voice Skill | — | — |
| S2 | Wire Reference Planning Commands to Draft-Mode Discipline | S1 | — |
| S3 | Wire Narrative and Durable-Knowledge Commands | S1 | — |
| S4 | Add Voice Integration Regression Coverage | S1, S2, S3 | — |

### Cross-Story Dependencies

None — this story is self-contained.

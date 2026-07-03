# Tasks: Reconcile Stale Voice-Status Claims and the Examples-Enum Divergence

**Source**: `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/integrate-the-voice-helper-across-smithy-prose-surfaces.spec.md` — User Story 5
**Data Model**: `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/integrate-the-voice-helper-across-smithy-prose-surfaces.data-model.md`
**Contracts**: `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/integrate-the-voice-helper-across-smithy-prose-surfaces.contracts.md`
**Story Number**: 05

---

## Slice 1: Align Voice Documentation with Shipped Audit Lint

**Goal**: The voice helper skill, template README, CLAUDE.md, and audit checklist agree that the voice-tag lint has shipped and share one `examples` enum.

**Justification**: US5 is a documentation-correctness story with one coherent review surface: stale shipped-status language and enum drift across the same voice-tag convention. Keeping the edits together lets reviewers compare the three authoritative prose surfaces and the audit snippet in one patch, while the regression guard prevents the same drift from returning.

**Addresses**: FR-014, FR-015, FR-016; AS 5.1, AS 5.2

### Tasks

- [ ] **Update stale voice-lint status language**

  Update `src/templates/agent-skills/skills/smithy.helper-voice/SKILL.prompt` §8, the `src/templates/agent-skills/README.md` voice convention section, and the `CLAUDE.md` `smithy.helper-voice` skill description so each describes the audit voice-tag lint as shipped. Remove any wording that frames the lint as planned future EPIC #419 slice work, while preserving the source-vs-deployed boundary: deployable templates must not point readers at source-only documentation paths as instructions.

  _Acceptance criteria:_
  - `grep -r "planned in slice 4" src/templates/agent-skills/skills/smithy.helper-voice/SKILL.prompt src/templates/agent-skills/README.md CLAUDE.md` returns no matches.
  - The skill §8, README convention section, and CLAUDE.md skill line all describe the voice-tag lint as an existing `smithy.audit` enforcement surface.
  - No deployable prompt adds a source-tree-only README or `src/...` path as a required runtime reference.

- [ ] **Reconcile the `examples` enum by adopting `optional`**

  Resolve SD-002 by keeping the shipped audit checklist's `optional` value and adding it to the skill §8 grammar plus the README voice convention grammar and key table. The three surfaces should use the same enum order and explain that `optional` imposes no example constraint, without changing the audit lint's existing accepted domain.

  _Acceptance criteria:_
  - The skill §8 grammar lists `examples: <required|recommended|discouraged|optional|forbidden>`.
  - The README grammar lists `examples: <required|recommended|discouraged|optional|forbidden>`.
  - The skill §8, README key table, and `src/templates/agent-skills/snippets/audit-checklist-voice.md` all describe the `examples` values as `required`, `recommended`, `discouraged`, `optional`, and `forbidden`, with `optional` meaning no example constraint.

- [ ] **Add drift coverage and validate**

  Add focused regression coverage in `src/templates.test.ts` or an existing template/documentation test so the stale status phrase cannot reappear and the `examples` enum remains identical across the skill, README, and audit checklist. Keep assertions structural: compare the enum markers and stable phrase, not long prose paragraphs. Then run the standard validation scripts without regenerating derived snapshots.

  _Acceptance criteria:_
  - A test fails if `planned in slice 4` appears in the skill, README, or CLAUDE.md.
  - A test fails if the `examples` enum differs across the skill §8, README convention section, and audit checklist.
  - `npm test` and `npm run typecheck` pass.
  - `.claude/` and `.smithy/smithy-manifest.json` remain unchanged.

**PR Outcome**: Voice documentation reflects the shipped audit lint, the `examples` enum is aligned by adopting `optional` everywhere, and regression coverage guards both the status wording and enum agreement.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Unresolved choice for the arbitrary-text voice-cleanup trigger: (a) description-tuning only — sharpen the skill's frontmatter `description` so review/cleanup mode auto-activates on standalone phrasings and document that review mode accepts an arbitrary file path or pasted text (no new surface); versus (b) add a dedicated `/smithy.voice` (or similar) slash command as an explicit invocation point. The user explicitly asked for "proper triggers," and the reconciled plan recommends (a), but the emphasis on "proper triggers" makes the choice a genuine steering decision the codebase cannot settle. | Interaction & UX / Edge Cases | High | Medium | inherited | — |
| SD-002 | inherited from spec: The `examples` enum reconciliation needs the skill §8, README, and shipped audit lint (`audit-checklist-voice.md`) to share one accepted domain. The audit lint already accepts a 5th value, `optional` ("imposes no example constraint"), while the skill §8 and README omit it. | Integration / Terminology | Medium | Medium | resolved | Resolved by Slice 1 planning: adopt `optional` in the skill and README to match the shipped audit lint rather than narrowing the live lint domain. |
| SD-003 | inherited from spec: The draft-time hook point for `smithy.strike` and `smithy.engrave` is named as a target (FR-002, US1 Acceptance Scenario 3) but not pinned: `strike` is one-shot and may lack a discrete narrative Explanation section comparable to ignite's Summary/Motivation, and `engrave`'s decision/invariant prose has no specified load point in its flow. Confirm whether each command has a narrative section warranting a draft-mode skill load (and where), or whether one or both belong in a follow-on alongside the other deferred surfaces. | plan-review:Logical gap | Important | Low | inherited | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Align Voice Documentation with Shipped Audit Lint | — | — |

### Cross-Story Dependencies

None — this story is self-contained. US5 overlaps the `smithy.helper-voice` skill file with US1 and US4 in different regions, so coordinate merge conflicts mechanically if those branches land nearby.

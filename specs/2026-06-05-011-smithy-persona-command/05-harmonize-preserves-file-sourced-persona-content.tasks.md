# Tasks: Harmonize Preserves File-Sourced Persona Content

**Source**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.spec.md` — User Story 5
**Data Model**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.data-model.md`
**Contracts**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.contracts.md`
**Story Number**: 05

---

## Slice 1: Re-Discover File-Sourced Personas During Harmonize

**Goal**: Amend ignite Sub-phase 3g so Personas verification/repair can identify persona content that should be sourced from durable `.persona.md` files even when the run resumes from the on-disk RFC.

**Justification**: This slice resolves the provenance decision point without introducing inline markers, sidecar state, or an interactive prompt. It is independently valuable because Sub-phase 3g can classify file-backed personas before choosing whether any cold repair is allowed.

**Addresses**: FR-014; AS 5.1

### Tasks

- [ ] **Re-run durable persona discovery for repair provenance**

  Update `src/templates/agent-skills/commands/smithy.ignite.prompt` so Sub-phase 3g, before any Personas repair dispatch, reuses the canonical persona convention to list durable persona files under the active `{{artifactsRoot}}` and derive the same slug-based coverage record used by Sub-phase 3b.

  _Acceptance criteria:_
  - Sub-phase 3g discovers `.persona.md` files before deciding whether to repair Personas cold.
  - Discovery is scoped to the active artifacts root and the canonical persona convention.
  - Coverage uses the same deterministic filename-slug identity established for Sub-phase 3b.
  - The prompt does not add inline provenance markers, sidecar state, or interactive selection.

- [ ] **Classify file-sourced Personas in the on-disk RFC**

  Add Sub-phase 3g instructions that compare the current `## Personas` section and Phase 2 persona names or roles against the re-discovered coverage record, treating matching durable files as the source of truth for those personas.

  _Acceptance criteria:_
  - A persona with a matching durable file is classified as file-sourced during harmonize.
  - A persona without a matching durable file remains eligible for the existing cold repair path.
  - Classification survives a resume from the on-disk RFC with no in-memory Sub-phase 3b state.
  - A well-formed file-sourced Personas section is not treated as a repair failure solely because it was projected from files.

**PR Outcome**: Ignite harmonize can recover file-sourced persona provenance from disk before repair, preventing Sub-phase 3g from misclassifying reused personas as cold-draft gaps.

---

## Slice 2: Re-Project File-Sourced Personas Instead of Re-Drafting

**Goal**: Change the Sub-phase 3g Personas repair branch so file-sourced personas are re-projected from durable files and only non-file-sourced gaps use the existing cold repair behavior.

**Justification**: This slice delivers the user-visible non-clobber guarantee: harmonize may normalize the section position or formatting, but durable persona content remains grounded in the source files instead of being overwritten by clarification-only prose.

**Addresses**: FR-014; AS 5.1, AS 5.2

### Tasks

- [ ] **Repair file-sourced personas from durable files**

  Update the Personas repair branch so any persona classified as file-sourced is rebuilt from its matching `.persona.md` file, preserving the durable persona's role, context, and friction while re-projecting the RFC-specific benefit language.

  _Acceptance criteria:_
  - File-sourced personas are not regenerated from clarify output during Sub-phase 3g repair.
  - Repair reads the matching durable persona files as the source context.
  - Repaired content remains an RFC-specific projection rather than copying the durable file verbatim.
  - Position or formatting normalization may occur without changing the source basis of the persona content.

- [ ] **Keep cold repair limited to uncovered gaps**

  Amend the Sub-phase 3g smithy-prose dispatch so it is used only for personas not covered by durable files, then combine any file re-projections with cold repaired gaps into one valid `## Personas` section.

  _Acceptance criteria:_
  - Covered personas are excluded from any cold Personas repair dispatch.
  - Uncovered personas still use the existing Personas repair behavior.
  - The repaired RFC contains exactly one `## Personas` section.
  - If every persona is file-sourced and well-formed, harmonize does not perform an unnecessary cold Personas repair dispatch.

- [ ] **Protect harmonize non-clobber behavior with template tests**

  Update template coverage around `smithy.ignite.prompt` so the Sub-phase 3g behavior is protected without regenerating deployed snapshots. Focus the checks on repair-time re-discovery, slug-based file-sourced classification, re-projection from files, and gap-only cold repair.

  _Acceptance criteria:_
  - Tests or template checks cover repair-time durable persona discovery before cold repair.
  - Tests or template checks cover file-sourced classification by slug identity.
  - Tests or template checks cover re-projecting file-sourced personas instead of regenerating them from clarify output.
  - No `.claude/`, `.gemini/`, `.agents/`, `.codex/`, or manifest snapshot files are regenerated.

**PR Outcome**: Ignite Sub-phase 3g preserves durable persona reuse through harmonize and repairs only the personas that lack matching files.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Unresolved choice for the rule by which ignite Sub-phase 3b decides a pre-existing `.persona.md` "covers" a needed RFC persona: exact role/name-string match, fuzzy/semantic similarity, or user-confirmed selection. Each path changes what US4 specifies (deterministic testable comparison vs. LLM judgment vs. an interactive prompt that breaks ignite's one-shot flow). No codebase precedent for cross-artifact persona discovery. | Integration / Edge Cases | High | Low | inherited | Bound by User Story 4's matching task: reuse uses deterministic filename slug comparison derived from Phase 2 persona names or roles. |
| SD-002 | inherited from spec: Unresolved choice for whether `.persona.md` should carry a stable machine-readable identity field (e.g. a `slug:` or `**Role**:` key) to make ignite discovery deterministic, vs. relying purely on filename-slug comparison, vs. narrative content matching. Trades off against the settled "no registry/index" decision (a per-file identity key is not a registry but moves toward one). Changes both the US1 schema and the US4 matching mechanic. | Domain & Data Model | High | Low | inherited | Resolved by User Story 1's canonical README convention: persona files rely on filename slug identity and do not carry a separate machine-readable identity key. |
| SD-003 | inherited from spec: Unresolved choice for how ignite Sub-phase 3b (and the command's projection path) feed an existing `.persona.md`'s content to smithy-prose, given that smithy-prose's documented input contract has no parameter for existing-persona-file context (only `section_assignment`, `idea_description`, `clarify_output`, `rfc_file_path`, `tone_directives`). Options: smuggle via `clarify_output`, fold into `rfc_file_path` reading, or add a new optional `source_persona_paths` parameter (amending smithy-prose). | Integration | High | Medium | inherited | Bound by User Story 4's projection task: ignite reads covered `.persona.md` files inline and supplies their content as source context for RFC-specific projection rather than requiring a new smithy-prose parameter. |
| SD-004 | inherited from spec: Unresolved choice for how ignite Sub-phase 3g detects that the current on-disk `## Personas` content is **file-sourced** (provenance), especially when a harmonize/repair runs on resume from the on-disk RFC with no in-memory record of 3b's reuse. Options: an inline marker/comment in the RFC, sidecar state, or deterministic re-discovery (re-run the 3b match against the persona directory). Without a chosen mechanism, 3g can misclassify file-sourced content and regenerate from `clarify_output` — the exact clobber US5 is meant to prevent. Distinct from SD-001 (3b coverage matching) and SD-003 (prose handoff). | Integration / Edge Cases | High | Low | inherited | Bound by Slice 1's provenance task: Sub-phase 3g re-runs deterministic durable persona discovery and slug coverage against the active artifacts root instead of relying on markers, sidecars, or in-memory state. |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Re-Discover File-Sourced Personas During Harmonize | — | — |
| S2 | Re-Project File-Sourced Personas Instead of Re-Drafting | S1 | — |

### Cross-Story Dependencies

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Establish the `.persona.md` schema and storage convention | depends on | US5 depends on the canonical persona convention and filename-slug identity established by US1. |
| User Story 4: Ignite reuses existing persona files before generating new ones | depends on | US5 builds on Sub-phase 3b discovery, matching, and projection behavior so Sub-phase 3g can preserve the same source files during harmonize. |

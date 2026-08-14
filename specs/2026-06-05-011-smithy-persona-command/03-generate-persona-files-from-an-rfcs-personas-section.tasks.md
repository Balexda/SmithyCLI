# Tasks: Generate Persona Files from an RFC's `## Personas` Section

**Source**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.spec.md` — User Story 3
**Data Model**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.data-model.md`
**Contracts**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.contracts.md`
**Story Number**: 03

---

## Slice 1: Route RFC Inputs and Extract Named Personas

**Goal**: Extend `smithy.persona` so an input path ending in `.rfc.md` selects RFC mode and extracts the named personas from that RFC's `## Personas` section.

**Justification**: This slice creates the RFC-mode entry point and extraction boundary without changing the existing free-text writer semantics. It is independently valuable because the command can identify exactly which durable persona artifacts it intends to seed from an RFC before write behavior is added.

**Addresses**: FR-008, FR-010; AS 3.1, AS 3.3

### Tasks

- [x] **Add RFC-mode routing**

  Update `src/templates/agent-skills/commands/smithy.persona.prompt` so a resolved input path ending in `.rfc.md` routes to RFC mode instead of free-text mode. Preserve the existing ask-fallback and free-text behavior from US2 for non-RFC inputs.

  _Acceptance criteria:_
  - Inputs ending in `.rfc.md` select RFC mode.
  - Non-RFC clear input still selects free-text mode.
  - Empty or unclear input still engages the existing ask-fallback.
  - RFC-mode routing does not draft or overwrite persona files before extraction succeeds.

- [x] **Extract RFC persona candidates**

  Add RFC-mode instructions that read the target RFC and extract one persona candidate per named persona in the `## Personas` section. Keep this v1 extraction focused on clearly named personas, with US6 still owning narrative-prose robustness and empty-section placeholder handling.

  _Acceptance criteria:_
  - RFC mode reads the input `.rfc.md` file before writing any persona artifacts.
  - Each clearly named persona in `## Personas` becomes one persona candidate.
  - The extracted candidate set is used as the source for subsequent persona-file creation.
  - Narrative-only robustness and empty/placeholder diagnostics remain reserved for US6 unless already present.

- [x] **Cover RFC-mode routing and extraction**

  Update template coverage around `smithy.persona.prompt` so the RFC-mode branch is protected without regenerating deployed snapshots. Focus the checks on `.rfc.md` routing, preservation of free-text routing, and extraction from the RFC `## Personas` section.

  _Acceptance criteria:_
  - Tests or template checks cover `.rfc.md` inputs selecting RFC mode.
  - Tests or template checks cover non-RFC inputs remaining on the free-text path.
  - Tests or template checks cover extraction from an RFC `## Personas` section.
  - No `.claude/`, `.gemini/`, `.agents/`, `.codex/`, or manifest snapshot files are regenerated.

**PR Outcome**: `smithy.persona <path-to-.rfc.md>` enters RFC mode, reads the RFC, and identifies the persona candidates that should become durable `.persona.md` files.

---

## Slice 2: Write One Persona File per RFC Candidate

**Goal**: Complete RFC mode by drafting and writing one durable `.persona.md` per extracted RFC persona while skipping any target slug that already exists.

**Justification**: This slice delivers the user-visible US3 behavior: existing RFCs can seed the durable persona store, collision handling is non-destructive, and remaining personas still get written.

**Addresses**: FR-006, FR-008, FR-009; AS 3.1, AS 3.2

### Tasks

- [x] **Draft and write extracted personas**

  Extend RFC mode so each extracted persona candidate is drafted through `smithy-prose` and written as a separate `.persona.md` file that follows the README-defined persona convention. Reuse the slug and file-format rules established by the free-text path.

  _Acceptance criteria:_
  - RFC mode writes one `.persona.md` file per extracted persona candidate.
  - Each file follows the canonical persona convention from the README.
  - Each filename slug is kebab-case and derived from the persona name or role.
  - The free-text writer remains available and unchanged for non-RFC inputs.

- [x] **Skip and report slug collisions**

  Add RFC-mode collision handling so an extracted persona whose target slug already exists is skipped without mutating the existing file, while the command continues writing the remaining non-colliding personas.

  _Acceptance criteria:_
  - A pre-existing target slug is not overwritten.
  - Each skipped collision is reported in the command summary.
  - Non-colliding personas from the same RFC are still written.
  - The final summary distinguishes written persona files from skipped collisions.

- [x] **Protect RFC-mode write behavior**

  Update template coverage around `smithy.persona.prompt` for multi-persona writes and collision reporting. Keep the checks focused on deployable template behavior and avoid snapshot regeneration.

  _Acceptance criteria:_
  - Tests or template checks cover one file per extracted persona.
  - Tests or template checks cover collision skip-and-report behavior.
  - Tests or template checks cover continuing after a collision to write remaining personas.
  - No `.claude/`, `.gemini/`, `.agents/`, `.codex/`, or manifest snapshot files are regenerated.

**PR Outcome**: RFC mode seeds the durable persona store from an RFC's named personas, safely skips existing slugs, and reports the written and skipped artifacts.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Unresolved choice for the rule by which ignite Sub-phase 3b decides a pre-existing `.persona.md` "covers" a needed RFC persona: exact role/name-string match, fuzzy/semantic similarity, or user-confirmed selection. Each path changes what US4 specifies (deterministic testable comparison vs. LLM judgment vs. an interactive prompt that breaks ignite's one-shot flow). No codebase precedent for cross-artifact persona discovery. | Integration / Edge Cases | High | Low | inherited | — |
| SD-002 | inherited from spec: Unresolved choice for whether `.persona.md` should carry a stable machine-readable identity field (e.g. a `slug:` or `**Role**:` key) to make ignite discovery deterministic, vs. relying purely on filename-slug comparison, vs. narrative content matching. Trades off against the settled "no registry/index" decision (a per-file identity key is not a registry but moves toward one). Changes both the US1 schema and the US4 matching mechanic. | Domain & Data Model | High | Low | inherited | Resolved by User Story 1's canonical README convention: persona files rely on filename slug identity and do not carry a separate machine-readable identity key. |
| SD-003 | inherited from spec: Unresolved choice for how ignite Sub-phase 3b (and the command's projection path) feed an existing `.persona.md`'s content to smithy-prose, given that smithy-prose's documented input contract has no parameter for existing-persona-file context (only `section_assignment`, `idea_description`, `clarify_output`, `rfc_file_path`, `tone_directives`). Options: smuggle via `clarify_output`, fold into `rfc_file_path` reading, or add a new optional `source_persona_paths` parameter (amending smithy-prose). | Integration | High | Medium | inherited | — |
| SD-004 | inherited from spec: Unresolved choice for how ignite Sub-phase 3g detects that the current on-disk `## Personas` content is **file-sourced** (provenance), especially when a harmonize/repair runs on resume from the on-disk RFC with no in-memory record of 3b's reuse. Options: an inline marker/comment in the RFC, sidecar state, or deterministic re-discovery (re-run the 3b match against the persona directory). Without a chosen mechanism, 3g can misclassify file-sourced content and regenerate from `clarify_output` — the exact clobber US5 is meant to prevent. Distinct from SD-001 (3b coverage matching) and SD-003 (prose handoff). | Integration / Edge Cases | High | Low | inherited | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Route RFC Inputs and Extract Named Personas | — | — |
| S2 | Write One Persona File per RFC Candidate | S1 | — |

### Cross-Story Dependencies

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Establish the `.persona.md` schema and storage convention | depends on | US3 depends on the canonical persona convention and filename-slug identity established by US1. |
| User Story 2: Generate a persona from a free-text description | depends on | US3 builds on the writer, slug derivation, and collision handling introduced by the free-text command path. |
| User Story 6: Robust RFC `## Personas` parsing and empty-section handling | depended upon by | US6 extends the RFC-mode parser for narrative-prose and empty-section cases that are intentionally not folded into this core RFC-mode slice. |

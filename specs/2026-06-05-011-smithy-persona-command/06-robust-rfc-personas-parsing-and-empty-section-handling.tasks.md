# Tasks: Robust RFC `## Personas` Parsing and Empty-Section Handling

**Source**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.spec.md` — User Story 6
**Data Model**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.data-model.md`
**Contracts**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.contracts.md`
**Story Number**: 06

---

## Slice 1: Parse Narrative and Bulleted RFC Personas

**Goal**: Extend RFC mode so `smithy.persona` extracts persona candidates from both narrative-prose and bulleted `## Personas` sections.

**Justification**: This slice delivers the core parsing robustness required by real RFCs while preserving the existing RFC-mode writer, slug, and collision behavior from US3. It is independently valuable because a narrative RFC section can seed durable persona files without waiting for additional empty-state diagnostics.

**Addresses**: FR-015; AS 6.1, AS 6.2

### Tasks

- [ ] **Broaden RFC persona extraction**

  Update `src/templates/agent-skills/commands/smithy.persona.prompt` so RFC mode recognizes both bulleted persona entries and narrative-prose character sketches in the `## Personas` section. Keep extraction anchored to named personas and continue feeding the existing RFC persona candidates list consumed by the writer.

  _Acceptance criteria:_
  - Narrative-prose `## Personas` sections produce one candidate per named persona (AS 6.1).
  - Bulleted `## Personas` sections continue to produce one candidate per persona (AS 6.2).
  - Each candidate preserves the persona name or role and enough source context for drafting.
  - Existing RFC-mode slug derivation, collision handling, and write behavior remain unchanged.
  - Template coverage protects both narrative and bulleted extraction behavior.

**PR Outcome**: RFC mode can seed durable persona files from either common Personas-section style without regressing the existing bulleted path.

---

## Slice 2: Suppress Placeholder Personas with Diagnostics

**Goal**: Teach RFC mode to detect empty or placeholder-only `## Personas` content and exit with a diagnostic instead of writing any `.persona.md` files.

**Justification**: This slice completes US6's safety boundary: the command may create durable files only from substantive persona content. It stands alone because it changes the zero-candidate branch and summary behavior without expanding the parser further.

**Addresses**: FR-016; AS 6.3

### Tasks

- [ ] **Reject empty or placeholder-only Personas sections**

  Update `src/templates/agent-skills/commands/smithy.persona.prompt` so RFC mode treats missing substantive persona content, including template placeholder literals, as a zero-write outcome. The command should emit a diagnostic summary for this branch and must not dispatch `smithy-prose` or create target files when there are no real candidates.

  _Acceptance criteria:_
  - Empty `## Personas` sections write zero persona files (AS 6.3).
  - Placeholder-only `## Personas` sections write zero persona files (AS 6.3).
  - The RFC-mode summary includes a diagnostic explaining that no substantive personas were found.
  - No target persona directory or file is created solely for an empty or placeholder-only section.
  - Template coverage protects the zero-write diagnostic branch.

**PR Outcome**: RFC mode refuses to persist placeholder personas and reports the zero-write result explicitly.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Unresolved choice for the rule by which ignite Sub-phase 3b decides a pre-existing `.persona.md` "covers" a needed RFC persona: exact role/name-string match, fuzzy/semantic similarity, or user-confirmed selection. Each path changes what US4 specifies (deterministic testable comparison vs. LLM judgment vs. an interactive prompt that breaks ignite's one-shot flow). No codebase precedent for cross-artifact persona discovery. | Integration / Edge Cases | High | Low | inherited | Bound by User Story 4's matching task: reuse uses deterministic filename slug comparison derived from Phase 2 persona names or roles. |
| SD-002 | inherited from spec: Unresolved choice for whether `.persona.md` should carry a stable machine-readable identity field (e.g. a `slug:` or `**Role**:` key) to make ignite discovery deterministic, vs. relying purely on filename-slug comparison, vs. narrative content matching. Trades off against the settled "no registry/index" decision (a per-file identity key is not a registry but moves toward one). Changes both the US1 schema and the US4 matching mechanic. | Domain & Data Model | High | Low | inherited | Resolved by User Story 1's canonical README convention: persona files rely on filename slug identity and do not carry a separate machine-readable identity key. |
| SD-003 | inherited from spec: Unresolved choice for how ignite Sub-phase 3b (and the command's projection path) feed an existing `.persona.md`'s content to smithy-prose, given that smithy-prose's documented input contract has no parameter for existing-persona-file context (only `section_assignment`, `idea_description`, `clarify_output`, `rfc_file_path`, `tone_directives`). Options: smuggle via `clarify_output`, fold into `rfc_file_path` reading, or add a new optional `source_persona_paths` parameter (amending smithy-prose). | Integration | High | Medium | inherited | Bound by User Story 4's projection task: ignite reads covered `.persona.md` files inline and supplies their content as source context for RFC-specific projection rather than requiring a new smithy-prose parameter. |
| SD-004 | inherited from spec: Unresolved choice for how ignite Sub-phase 3g detects that the current on-disk `## Personas` content is **file-sourced** (provenance), especially when a harmonize/repair runs on resume from the on-disk RFC with no in-memory record of 3b's reuse. Options: an inline marker/comment in the RFC, sidecar state, or deterministic re-discovery (re-run the 3b match against the persona directory). Without a chosen mechanism, 3g can misclassify file-sourced content and regenerate from `clarify_output` — the exact clobber US5 is meant to prevent. Distinct from SD-001 (3b coverage matching) and SD-003 (prose handoff). | Integration / Edge Cases | High | Low | inherited | Bound by User Story 5's provenance task: Sub-phase 3g re-runs deterministic durable persona discovery and slug coverage against the active artifacts root instead of relying on markers, sidecars, or in-memory state. |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Parse Narrative and Bulleted RFC Personas | — | — |
| S2 | Suppress Placeholder Personas with Diagnostics | S1 | — |

### Cross-Story Dependencies

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Establish the `.persona.md` schema and storage convention | depends on | US6 depends on the canonical persona convention and filename-slug identity established by US1. |
| User Story 3: Generate persona files from an RFC's `## Personas` section | depends on | US6 extends the RFC-mode routing, candidate list, writer, and collision handling introduced by US3. |


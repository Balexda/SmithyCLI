# Tasks: Establish the `.persona.md` Schema and Storage Convention

**Source**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.spec.md` — User Story 1
**Data Model**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.data-model.md`
**Contracts**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.contracts.md`
**Story Number**: 01

---

## Slice 1: Document Persona Artifact Convention

**Goal**: Define the durable `.persona.md` schema and storage convention in the agent-skills README as the shared contract for producers and consumers.

**Justification**: This slice is a standalone documentation increment: contributors can inspect the README and understand how persona files are shaped, stored, and excluded from the planning lineage before any command behavior is added.

**Addresses**: FR-001, FR-002, FR-004; AS 1.1, AS 1.2

### Tasks

- [ ] **Add the persona convention to the README**

  Update `src/templates/agent-skills/README.md` with a single source-of-truth section for `.persona.md` artifacts. Keep it separate from the planning lineage rules while aligning the schema with the source spec, data model, and contract for AS 1.1 and AS 1.2.

  _Acceptance criteria:_
  - README contains exactly one dedicated `.persona.md` convention section.
  - The section defines the storage path and flat slug naming convention.
  - The section defines the required heading, created date, and narrative body shape.
  - The section states persona files are outside the `## Dependency Order` lineage.
  - The section forbids M/F/US/S IDs and inline specification debt tables in persona files.

- [ ] **Align shared artifact-location guidance**

  Update `src/templates/agent-skills/snippets/artifact-location-policy.md` only as needed so persona files follow the same `{{artifactsRoot}}` policy as other authored artifacts. Preserve the snippet's distinction between planning artifacts and implementation files while satisfying AS 1.1.

  _Acceptance criteria:_
  - The location policy includes `.persona.md` wherever authored artifact extensions are enumerated.
  - The policy keeps external-artifacts behavior rooted under the same resolved artifacts root.
  - Existing guidance for source files, manifests, and issue templates remains unchanged.

**PR Outcome**: The repository has one canonical README convention for durable persona files and shared location guidance recognizes `.persona.md` as an authored Smithy artifact.

---

## Slice 2: Reference the Canonical Persona Convention

**Goal**: Make command templates point to the README convention instead of restating the persona path or schema inline.

**Justification**: This slice completes US1's drift-prevention contract across producer and consumer surfaces without implementing persona generation or ignite reuse behavior reserved for later stories.

**Addresses**: FR-003; AS 1.1

### Tasks

- [ ] **Add producer-side convention references**

  Create or update `src/templates/agent-skills/commands/smithy.persona.prompt` only far enough to establish the command surface's dependency on the README-defined `.persona.md` convention. Do not implement free-text generation, RFC extraction, collision handling, or parsing behavior beyond what US1 requires.

  _Acceptance criteria:_
  - The producer command surface references the README convention for persona path and schema.
  - The producer command surface does not restate the literal persona storage path.
  - The producer command surface does not duplicate the full file-format schema.
  - US2 and US3 behavior remains unimplemented unless already present.

- [ ] **Add consumer-side convention references**

  Update `src/templates/agent-skills/commands/smithy.ignite.prompt` so the persona consumer surface refers to the README-defined convention when discussing durable persona discovery. Keep ignite's existing cold-draft behavior intact until US4 and US5 implement reuse and non-clobber semantics.

  _Acceptance criteria:_
  - Ignite references the README convention for persona discovery.
  - Ignite does not restate the literal persona storage path.
  - Existing Sub-phase 3b cold-draft behavior remains available.
  - Existing Sub-phase 3g repair behavior remains functionally unchanged.

**PR Outcome**: The producer and consumer templates are tied to the README convention, while behavior-heavy persona generation and ignite reuse remain isolated to later user stories.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Unresolved choice for the rule by which ignite Sub-phase 3b decides a pre-existing `.persona.md` "covers" a needed RFC persona: exact role/name-string match, fuzzy/semantic similarity, or user-confirmed selection. Each path changes what US4 specifies (deterministic testable comparison vs. LLM judgment vs. an interactive prompt that breaks ignite's one-shot flow). No codebase precedent for cross-artifact persona discovery. | Integration / Edge Cases | High | Low | inherited | — |
| SD-002 | inherited from spec: Unresolved choice for whether `.persona.md` should carry a stable machine-readable identity field (e.g. a `slug:` or `**Role**:` key) to make ignite discovery deterministic, vs. relying purely on filename-slug comparison, vs. narrative content matching. Trades off against the settled "no registry/index" decision (a per-file identity key is not a registry but moves toward one). Changes both the US1 schema and the US4 matching mechanic. | Domain & Data Model | High | Low | inherited | — |
| SD-003 | inherited from spec: Unresolved choice for how ignite Sub-phase 3b (and the command's projection path) feed an existing `.persona.md`'s content to smithy-prose, given that smithy-prose's documented input contract has no parameter for existing-persona-file context (only `section_assignment`, `idea_description`, `clarify_output`, `rfc_file_path`, `tone_directives`). Options: smuggle via `clarify_output`, fold into `rfc_file_path` reading, or add a new optional `source_persona_paths` parameter (amending smithy-prose). | Integration | High | Medium | inherited | — |
| SD-004 | inherited from spec: Unresolved choice for how ignite Sub-phase 3g detects that the current on-disk `## Personas` content is **file-sourced** (provenance), especially when a harmonize/repair runs on resume from the on-disk RFC with no in-memory record of 3b's reuse. Options: an inline marker/comment in the RFC, sidecar state, or deterministic re-discovery (re-run the 3b match against the persona directory). Without a chosen mechanism, 3g can misclassify file-sourced content and regenerate from `clarify_output` — the exact clobber US5 is meant to prevent. Distinct from SD-001 (3b coverage matching) and SD-003 (prose handoff). | Integration / Edge Cases | High | Low | inherited | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Document Persona Artifact Convention | — | — |
| S2 | Reference the Canonical Persona Convention | S1 | — |

### Cross-Story Dependencies

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Generate a persona from a free-text description | depended upon by | US2 needs the README-defined persona schema and producer command surface reference before implementing free-text generation. |
| User Story 3: Generate persona files from an RFC's `## Personas` section | depended upon by | US3 needs the same schema and storage convention before implementing RFC extraction. |
| User Story 4: Ignite reuses existing persona files before generating new ones | depended upon by | US4 needs the README-defined storage/discovery convention before adding reuse logic. |
| User Story 5: Harmonize preserves file-sourced persona content | depended upon by | US5 builds on the consumer-side convention reference and later reuse provenance decisions. |

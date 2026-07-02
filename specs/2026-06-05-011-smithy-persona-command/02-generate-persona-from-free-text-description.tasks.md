# Tasks: Generate a Persona from a Free-Text Description

**Source**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.spec.md` — User Story 2
**Data Model**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.data-model.md`
**Contracts**: `specs/2026-06-05-011-smithy-persona-command/smithy-persona-command.contracts.md`
**Story Number**: 02

---

## Slice 1: Draft and Write Free-Text Personas

**Goal**: Extend `smithy.persona` so a clear free-text description produces one durable, well-formed `.persona.md` file.

**Justification**: This slice delivers the core command value from US2 as a standalone increment: a developer can invoke the command with a role description and receive a reusable persona artifact without requiring RFC parsing or ignite reuse.

**Addresses**: FR-005, FR-006, FR-009; AS 2.1

### Tasks

- [x] **Implement free-text persona creation**

  Update `src/templates/agent-skills/commands/smithy.persona.prompt` to route non-RFC description input through a one-shot free-text creation path. The prompt should use `smithy-prose` for drafting and write exactly one file that follows the README-defined persona convention for AS 2.1.

  _Acceptance criteria:_
  - Non-RFC free-text input selects free-text mode.
  - The command dispatches `smithy-prose` with the persona drafting assignment from the contracts.
  - The generated artifact follows the canonical persona convention from the README.
  - The filename slug is kebab-case and derived from the persona name or role.
  - A pre-existing target slug is skipped and reported without overwriting.
  - RFC-mode behavior remains out of scope for this slice.

- [x] **Preserve command deployment coverage**

  Keep the implementation within the deployable command template surface so Claude, Gemini, and Codex receive the same `smithy.persona` behavior through normal `smithy init` rendering. Update template coverage where the existing tests validate command discovery, rendering, or snippet inclusion so AS 2.1 remains protected across agents.

  _Acceptance criteria:_
  - The command remains discoverable as a deployable Smithy command template.
  - Persona convention snippet usage still renders correctly in deployed command output.
  - Tests or template checks cover the free-text behavior without regenerating committed deployed snapshots.
  - No `.claude/`, `.gemini/`, `.agents/`, `.codex/`, or manifest snapshot files are regenerated.

**PR Outcome**: `smithy.persona "<description>"` can create one durable persona file from free text, skip slug collisions, and preserve the cross-agent deployment surface.

---

## Slice 2: Add Ask-Fallback and One-Shot Reporting

**Goal**: Complete the US2 command contract for unclear input and terminal behavior without adding RFC extraction.

**Justification**: This slice makes the free-text command ergonomic and consistent with `smithy.spark`: it asks only when no usable input exists, otherwise runs through to a summary without intermediate approval gates.

**Addresses**: FR-007; AS 2.2, AS 2.3

### Tasks

- [x] **Add unclear-input fallback**

  Update `src/templates/agent-skills/commands/smithy.persona.prompt` so empty, literal, or otherwise unclear `$ARGUMENTS` asks the user what persona to generate. Keep the fallback focused on free-text persona creation and do not introduce RFC-mode parsing behavior reserved for US3 and US6.

  _Acceptance criteria:_
  - Empty input asks for the persona description instead of failing.
  - Literal or unclear `$ARGUMENTS` passthrough engages the same fallback.
  - Clear free-text input still runs without an extra prompt.
  - The fallback does not add an intermediate approval STOP after input is clarified.

- [x] **Render a one-shot command summary**

  Add spark-style completion reporting to `src/templates/agent-skills/commands/smithy.persona.prompt` for the free-text path. The summary should communicate the written artifact, any skip due to collision, and the absence of intermediate approval gates for AS 2.3.

  _Acceptance criteria:_
  - Successful free-text runs report the written `.persona.md` artifact.
  - Collision skips are reported clearly while leaving the existing file untouched.
  - The command has no approval STOP between intake, drafting, write, and summary.
  - Reporting remains compatible with future RFC-mode output.

**PR Outcome**: The free-text persona command handles unclear input and completes with one-shot reporting that matches the spark-style command contract.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Unresolved choice for the rule by which ignite Sub-phase 3b decides a pre-existing `.persona.md` "covers" a needed RFC persona: exact role/name-string match, fuzzy/semantic similarity, or user-confirmed selection. Each path changes what US4 specifies (deterministic testable comparison vs. LLM judgment vs. an interactive prompt that breaks ignite's one-shot flow). No codebase precedent for cross-artifact persona discovery. | Integration / Edge Cases | High | Low | inherited | — |
| SD-002 | inherited from spec: Unresolved choice for whether `.persona.md` should carry a stable machine-readable identity field (e.g. a `slug:` or `**Role**:` key) to make ignite discovery deterministic, vs. relying purely on filename-slug comparison, vs. narrative content matching. Trades off against the settled "no registry/index" decision (a per-file identity key is not a registry but moves toward one). Changes both the US1 schema and the US4 matching mechanic. | Domain & Data Model | High | Low | inherited | Bound by User Story 1's canonical README convention: persona files rely on filename slug identity and do not carry a separate machine-readable identity key. |
| SD-003 | inherited from spec: Unresolved choice for how ignite Sub-phase 3b (and the command's projection path) feed an existing `.persona.md`'s content to smithy-prose, given that smithy-prose's documented input contract has no parameter for existing-persona-file context (only `section_assignment`, `idea_description`, `clarify_output`, `rfc_file_path`, `tone_directives`). Options: smuggle via `clarify_output`, fold into `rfc_file_path` reading, or add a new optional `source_persona_paths` parameter (amending smithy-prose). | Integration | High | Medium | inherited | — |
| SD-004 | inherited from spec: Unresolved choice for how ignite Sub-phase 3g detects that the current on-disk `## Personas` content is **file-sourced** (provenance), especially when a harmonize/repair runs on resume from the on-disk RFC with no in-memory record of 3b's reuse. Options: an inline marker/comment in the RFC, sidecar state, or deterministic re-discovery (re-run the 3b match against the persona directory). Without a chosen mechanism, 3g can misclassify file-sourced content and regenerate from `clarify_output` — the exact clobber US5 is meant to prevent. Distinct from SD-001 (3b coverage matching) and SD-003 (prose handoff). | Integration / Edge Cases | High | Low | inherited | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Draft and Write Free-Text Personas | — | — |
| S2 | Add Ask-Fallback and One-Shot Reporting | S1 | — |

### Cross-Story Dependencies

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Establish the `.persona.md` schema and storage convention | depends on | US2 depends on the canonical persona convention and command surface reference established by US1. |
| User Story 3: Generate persona files from an RFC's `## Personas` section | depended upon by | US3 builds on the free-text writer and slug collision behavior before adding RFC extraction. |
| User Story 6: Robust RFC `## Personas` parsing and empty-section handling | depended upon by | US6 extends the later RFC-mode parser and should not be folded into the free-text implementation. |

# Tasks: Engrave Projects an Engraved-Knowledge Pointer into Agent-Context Files

**Source**: `specs/2026-06-06-012-engraved-knowledge-recall-and-reference/engraved-knowledge-recall-and-reference.spec.md` — User Story 2
**Data Model**: `specs/2026-06-06-012-engraved-knowledge-recall-and-reference/engraved-knowledge-recall-and-reference.data-model.md`
**Contracts**: `specs/2026-06-06-012-engraved-knowledge-recall-and-reference/engraved-knowledge-recall-and-reference.contracts.md`
**Story Number**: 02

---

## Slice 1: Engrave Projection Pointer

**Goal**: Extend `smithy.engrave` so every successful engrave or supersede operation refreshes a managed pointer block in existing agent-context files without copying engraved record bodies.

**Justification**: The projection behavior is prompt-layer work with one coherent user-visible outcome: after engrave changes durable knowledge, arbitrary agents can discover where that knowledge lives. Splitting marker handling, directory discovery, and coverage into separate PRs would leave intermediate states that either modify context files unsafely or ship behavior without regression protection.

**Addresses**: FR-007, FR-008, FR-009, FR-010; Acceptance Scenarios 2.1, 2.2, 2.3, 2.4, 2.5

### Tasks

- [ ] **Add the projection phase to engrave**

  Update `src/templates/agent-skills/commands/smithy.engrave.prompt` so create, update, and supersede flows run a final projection step after the engraved record edit succeeds and before the terminal summary. The step must target only existing agent-context files, use the managed marker pair from AS 2.1, and treat projection warnings as non-fatal to the underlying engrave operation.

  _Acceptance criteria:_
  - `smithy.engrave` describes a projection step after engraving or superseding a record
  - Projection uses `<!-- smithy:engraved:begin -->` and `<!-- smithy:engraved:end -->`
  - Missing target files are skipped rather than created
  - Projection failure for one target does not roll back or fail the record edit

- [ ] **Generate a pointer-only managed block**

  Teach the projection step to discover engraved-knowledge directories present in the repo and render a deterministic pointer block listing those locations plus an applicability note for future agents. The block must list system and design-domain directories when present, and must not inline record bodies or enumerate individual records.

  _Acceptance criteria:_
  - Pointer content lists present engraved-knowledge directories
  - `docs/decisions/`, `docs/invariants/`, and `docs/constitution/` are included when present
  - Design-domain variants are included when present
  - The block contains no record body text and no per-record index
  - Location ordering is deterministic

- [ ] **Preserve context files safely**

  Define marker handling in `smithy.engrave.prompt` so files with no markers receive a fresh block at a defined anchor, files with exactly one marker pair replace only content between markers, and malformed or duplicated markers produce a warning with no edit to that file. The behavior must be idempotent: unchanged directory inputs produce byte-identical context files on a second run.

  _Acceptance criteria:_
  - Files with no markers receive one managed block without altering existing prose
  - Files with one marker pair replace only the marked region
  - Malformed or duplicated markers cause a warning and leave that file unchanged
  - A no-change projection re-run is byte-identical

- [ ] **Assert projection behavior in template tests**

  Extend `src/templates.test.ts` coverage for the composed `smithy.engrave` command so projection requirements fail early if the prompt loses the marker pair, pointer-only constraint, existing-files-only rule, malformed-marker warning, or idempotence rule. Keep the assertions structural and tied to the composed template rather than to deployed `.claude/` snapshots.

  _Acceptance criteria:_
  - Tests assert the composed engrave prompt contains both managed markers
  - Tests assert the prompt lists canonical engraved-knowledge directory roots
  - Tests assert the prompt says missing target files are skipped
  - Tests assert malformed or duplicated markers warn without guessing
  - Tests assert projection is pointer-only and idempotent

**PR Outcome**: Running `smithy.engrave` after a record create, update, or supersession keeps existing agent-context files pointed at the repo's engraved-knowledge directories through a safe, deterministic managed block.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Which agent-context files projection manages by default (CLAUDE.md only, also AGENTS.md, also `.github/copilot-instructions.md`) and whether the target set is configurable. | Integration | Medium | Medium | inherited | — |
| SD-002 | inherited from spec: Whether the optional `design`-domain locations (`docs/design/{decisions,invariants,constitution}`) are in scope for recall and the projection pointer now, or deferred. | Functional Scope | Low | Medium | inherited | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Engrave Projection Pointer | — | — |

### Cross-Story Dependencies

None — this story is self-contained.

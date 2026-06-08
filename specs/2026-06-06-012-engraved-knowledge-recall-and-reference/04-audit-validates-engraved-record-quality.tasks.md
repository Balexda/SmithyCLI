# Tasks: Audit Validates Engraved Record Quality

**Source**: `specs/2026-06-06-012-engraved-knowledge-recall-and-reference/engraved-knowledge-recall-and-reference.spec.md` — User Story 4
**Data Model**: `specs/2026-06-06-012-engraved-knowledge-recall-and-reference/engraved-knowledge-recall-and-reference.data-model.md`
**Contracts**: `specs/2026-06-06-012-engraved-knowledge-recall-and-reference/engraved-knowledge-recall-and-reference.contracts.md`
**Story Number**: 04

---

## Slice 1: Engraved Audit Checklist

**Goal**: Extend `smithy.audit` so engraved records are recognized as a dedicated artifact type and audited with checks for decision/invariant quality, stale citations, ledger structure, and pivot-level inclusion.

**Justification**: The audit behavior has one coherent review surface: selecting the engraved checklist and applying the full quality gate to decisions, invariants, and principles. Splitting checklist authoring from type-selection wiring would leave either unreachable checklist content or recognized artifacts without the required engraved-specific criteria.

**Addresses**: FR-014; Acceptance Scenarios 4.1, 4.2, 4.3, 4.4

### Tasks

- [ ] **Create the engraved audit checklist snippet**

  Add `audit-checklist-engraved.md` beside the existing audit checklist snippets and register it in the snippets README. The checklist must cover engraved records as durable knowledge roots, distinguish decisions, invariants, and principles, and apply the pivot-level inclusion test to every record.

  _Acceptance criteria:_
  - `audit-checklist-engraved.md` exists under the agent-skills snippets directory
  - Snippets README includes an `audit-checklist-engraved.md` row for `smithy.audit`
  - Checklist describes decisions, invariants, and principles as engraved record kinds
  - Checklist applies the pivot-level inclusion test to every engraved record

- [ ] **Wire engraved records into audit type selection**

  Extend `smithy.audit` artifact selection and context-gathering guidance so engraved record paths select the new checklist. Recognition must cover decision, invariant, and principle records without treating them as Smithy planning artifacts or `smithy.orders` types.

  _Acceptance criteria:_
  - Audit type-selection guidance recognizes engraved record paths
  - Decision records select the engraved checklist
  - Invariant records select the engraved checklist
  - Principle records select the engraved checklist
  - Unknown non-engraved paths keep the existing fallback behavior

- [ ] **Add engraved quality checks to the checklist**

  Define the concrete audit checks for the engraved schema: decisions state desired invariants where applicable, decision/invariant `establishes` and `established_by` references are reciprocal, citations do not point at superseded decisions, invariants cite establishing decisions, and the Known-Exceptions ledger keeps the frozen load-bearing column order with no silent divergence.

  _Acceptance criteria:_
  - Decision checks include desired invariant guidance
  - Reciprocity checks cover `establishes` and `established_by`
  - Stale-citation checks flag references to superseded or deprecated decisions
  - Invariant checks require establishing-decision citations
  - Known-Exceptions ledger checks require the frozen column order and visible exception handling

- [ ] **Assert engraved audit composition**

  Extend template coverage so the composed `smithy.audit` command includes the engraved checklist, type-selection rules route engraved records to it, and the checklist text preserves the decision, invariant, stale-citation, ledger, and pivot-level checks.

  _Acceptance criteria:_
  - Tests assert the engraved checklist snippet is loaded and composed
  - Tests assert `smithy.audit` no longer contains an unresolved engraved checklist partial
  - Tests assert type-selection text recognizes engraved record paths
  - Tests assert composed audit content includes desired invariant, reciprocity, stale-citation, Known-Exceptions ledger, and pivot-level checks

**PR Outcome**: Running `smithy.audit` on a decision, invariant, or principle uses an engraved-record checklist that validates durable-knowledge quality and flags missing citations, stale references, malformed exception ledgers, and non-pivot records.

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
| S1 | Engraved Audit Checklist | — | — |

### Cross-Story Dependencies

None — this story is self-contained.

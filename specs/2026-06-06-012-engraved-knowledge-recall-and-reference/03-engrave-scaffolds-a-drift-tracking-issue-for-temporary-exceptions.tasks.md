# Tasks: Engrave Scaffolds a Drift-Tracking Issue for Temporary Exceptions

**Source**: `specs/2026-06-06-012-engraved-knowledge-recall-and-reference/engraved-knowledge-recall-and-reference.spec.md` — User Story 3
**Data Model**: `specs/2026-06-06-012-engraved-knowledge-recall-and-reference/engraved-knowledge-recall-and-reference.data-model.md`
**Contracts**: `specs/2026-06-06-012-engraved-knowledge-recall-and-reference/engraved-knowledge-recall-and-reference.contracts.md`
**Story Number**: 03

---

## Slice 1: Temporary Exception Drift Issue

**Goal**: Extend `smithy.engrave` so adding a `Temporary:` invariant exception scaffolds a drift-tracking GitHub issue, records the returned `#NNN` in the ledger, and leaves all non-creation paths non-mutating toward GitHub.

**Justification**: The behavior has one user-visible outcome at the engrave exception step: temporary drift becomes tracked work while accepted or resolved exceptions do not create GitHub side effects. Splitting issue creation from ledger writeback or failure handling would leave intermediate states that either lose the tracking number or make exception edits brittle when GitHub is unavailable.

**Addresses**: FR-011, FR-012, FR-013; Acceptance Scenarios 3.1, 3.2, 3.3, 3.4

### Tasks

- [ ] **Add drift issue creation to engrave**

  Update `src/templates/agent-skills/commands/smithy.engrave.prompt` so Phase 6 creates a drift-tracking issue only when adding a `Temporary:` row to an invariant's Known-Exceptions ledger. The prompt must load `smithy.gh-issue`, write an issue body to a temporary file, invoke that skill's `create-issue.sh` path for the current agent, capture its JSON `number`, and write `#NNN` into the new row's `Tracking Issue` column for AS 3.1.

  _Acceptance criteria:_
  - Phase 6 directs agents to create an issue only for newly added `Temporary:` rows
  - The issue is created through the `smithy.gh-issue` create-issue script
  - The returned issue number is written as `#NNN` in the ledger row
  - The invariant frontmatter status is still recomputed from remaining `Temporary:` rows
  - Template coverage proves the temporary-only create path is retained

- [ ] **Render the drift issue body**

  Add the prompt instructions and body template needed for the drift-tracking issue in `smithy.engrave.prompt`. The body must identify the invariant id and title, state the divergence, cite the establishing decision or decisions from `established_by`, and keep engraved records out of `smithy.orders` template type handling for AS 3.1 and AS 3.2.

  _Acceptance criteria:_
  - The issue title is derived from the divergence being tracked
  - The issue body includes invariant id, invariant title, divergence, and establishing decision ids
  - Accepted exceptions keep `Tracking Issue` as `—` and create no issue
  - No engraved record type is added to orders template registries or defaults
  - Template coverage proves accepted exceptions and orders registries stay out of the drift path

- [ ] **Preserve exceptions when issue creation fails**

  Define Phase 6 failure handling so an auth, network, or script failure leaves the newly added `Temporary:` ledger row in place with `Tracking Issue` set to `—`, surfaces the failure in the terminal summary, and does not roll back the invariant edit. Also state that resolving or converting a `Temporary:` exception leaves any linked issue open and performs no comment or close action for AS 3.3 and AS 3.4.

  _Acceptance criteria:_
  - Issue creation failure does not prevent the ledger row from being written
  - Failed issue creation leaves `Tracking Issue` as `—`
  - The failure is surfaced to the user after the engrave operation
  - Resolve and convert operations do not close, comment on, or otherwise mutate linked issues
  - Template coverage proves failure fallback and non-mutating resolve behavior are retained

**PR Outcome**: Adding a `Temporary:` invariant exception through `smithy.engrave` creates a drift-tracking GitHub issue when possible, records its number in the Known-Exceptions ledger, preserves the exception on GitHub failure, and avoids GitHub mutations for accepted or resolved exceptions.

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
| S1 | Temporary Exception Drift Issue | — | — |

### Cross-Story Dependencies

None — this story is self-contained.

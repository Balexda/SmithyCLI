# Tasks: Strike: Fast Track Idea to Implementation

**Source**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.spec.md` — User Story 6
**Data Model**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.data-model.md`
**Contracts**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.contracts.md`
**Story Number**: 06

---

## Slice 1: Rewrite strike document structure and fix file extension

**Goal**: The `smithy.strike.md` template produces a self-contained `.strike.md` file with the full FR-010 structure (requirements, data model, contracts, single slice, validation plan) and uses the correct file extension.

**Justification**: Single self-contained change — the phase flow is preserved, only the document format in Phase 4 and the output filename are updated.

**Addresses**: FR-003, FR-005, FR-010; Acceptance Scenarios 6.1, 6.2, 6.3, 6.4

### Tasks

- [X] Update Phase 4 strike document output path from `specs/strikes/YYYY-MM-DD-<slug>.md` to `specs/strikes/YYYY-MM-DD-<slug>.strike.md` (FR-005, AS 6.4)
- [X] Rewrite the Phase 4 strike document template to include all FR-010 required sections:
  - Summary (what and why)
  - Goal (single meaningful outcome)
  - Out of Scope (explicitly excluded items)
  - Requirements (numbered functional requirements)
  - Success Criteria (numbered testable outcomes)
  - User Flow (behavior from user's point of view)
  - Data Model (inline, minimal — "N/A" if not needed)
  - Contracts (inline, minimal — "N/A" if not needed)
  - Decisions (important decisions and tradeoffs from the interactive phase)
  - Single Slice (exactly one `## Single Slice` with Goal/Justification/Tasks/PR Outcome)
  - Validation Plan (checklist for verifying the strike worked)
- [X] Update Phase 5 (Implement) to reference the new slice structure — execute tasks from the Single Slice section, not a flat Tasks list
- [X] Verify the template still enforces interactive planning before implementation (FR-003, AS 6.3)
- [X] Verify the scope-growth guardrail remains (redirect to full pipeline if too large)

**PR Outcome**: Running `/smithy.strike "description"` produces a `.strike.md` file with the full self-contained structure required by FR-010, saved with the correct extension for artifact discovery.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

Recommended implementation sequence:

- [x] **Slice 1** — Single slice; self-contained template rewrite.

# Tasks: Updated Phase 0 Audit Categories

**Source**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.spec.md` — User Story 9
**Data Model**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.data-model.md`
**Contracts**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.contracts.md`
**Story Number**: 09

---

## Slice 1: Align Audit Categories with New RFC Sections

**Goal**: Update the ignite Phase 0 audit categories table and the shared `audit-checklist-rfc.md` snippet so both include explicit checks for the new Personas and Out of Scope RFC sections. After this slice merges, reviewing an RFC through `smithy.ignite` Phase 0 or through `smithy.audit` surfaces gaps in persona coverage and out-of-scope completeness alongside the existing categories.

**Justification**: Both audit surfaces (ignite Phase 0 review loop and the `smithy.audit` command) share the goal of catching the same gaps that the new RFC template sections from US1 are designed to prevent. Shipping the two updates together — plus the template-composition test that guards them — delivers one coherent reviewer-facing behavior change. Splitting them would leave one audit surface inconsistent with the other and the tests orphaned from the changes they cover.

**Addresses**: FR-011, FR-012; Acceptance Scenarios US9-1, US9-2, US9-3

### Tasks

- [ ] **Add Persona Coverage and Out of Scope Completeness to Phase 0 audit table**

  In `src/templates/agent-skills/commands/smithy.ignite.prompt`, extend the Phase 0a–0b audit categories table so it matches the category set defined in the `Updated Phase 0 Audit Categories` contract. Existing categories remain; the two new rows are inserted in the order and positions specified by the contract table. Satisfies AS US9-1.

  _Acceptance criteria:_
  - Table includes `Persona Coverage` and `Out of Scope Completeness` rows
  - Existing categories (Problem Statement, Goals, Milestones, Feasibility, Scope, Stakeholders) are preserved
  - Row ordering matches the contract's category table
  - Check descriptions convey substantive coverage, not mere presence (supports AS US9-3)

- [ ] **Rename snippet rows to match the new category names**

  In `src/templates/agent-skills/snippets/audit-checklist-rfc.md`, update the existing `Persona Clarity` and `Scope Boundaries` rows to the contract-aligned names `Persona Coverage` and `Out of Scope Completeness`, and strengthen their check descriptions so an RFC with only vague persona references or implicit scope boundaries is flagged. Other rows in the snippet are left unchanged. Satisfies FR-012 and AS US9-2, US9-3.

  _Acceptance criteria:_
  - Snippet contains a `Persona Coverage` row and an `Out of Scope Completeness` row
  - Neither `Persona Clarity` nor `Scope Boundaries` remains as a row label
  - Check descriptions prompt reviewers to assess substantive content, not just section presence
  - Unrelated rows (Ambiguity, Milestone Completeness, Feasibility, Decisions vs Open Questions) are unchanged

- [ ] **Assert new audit categories render in both surfaces**

  Extend `src/templates.test.ts` with assertions that the composed ignite command and composed audit command each expose the new category names. The ignite assertions target the Phase 0 audit table; the audit assertions target the rendered `audit-checklist-rfc` partial inside `smithy.audit.md`.

  _Acceptance criteria:_
  - Assertion that the composed `smithy.ignite.md` contains `Persona Coverage` and `Out of Scope Completeness`
  - Assertion that the composed `smithy.audit.md` (which embeds the snippet via `{{>audit-checklist-rfc}}`) contains both new names
  - Assertion that the composed `smithy.audit.md` no longer contains the retired `Persona Clarity` and `Scope Boundaries` labels
  - `npm test` passes with no regressions elsewhere in the suite

**PR Outcome**: Merging this PR gives reviewers a single, consistent audit vocabulary across the ignite Phase 0 review loop and the `smithy.audit` command. RFCs missing personas or out-of-scope content — or containing only vague versions of either — are flagged by both surfaces, and the template-composition test guards against regressions in either location.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

| ID | Title                                             | Depends On | Artifact |
|----|---------------------------------------------------|------------|----------|
| S1 | Align Audit Categories with New RFC Sections     | —          | —        |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Updated RFC Template Schema | depends on | This story's audit categories only make sense once the template actually contains the Personas and Out of Scope sections. Story 1 is complete. |
| User Story 5: Mandatory Personas Section | depended upon by | US5 verifies that sub-phase 3b always produces a populated Personas section; this story's audit check catches the same gap on existing RFCs during the Phase 0 review loop. Independent but complementary. |
| User Story 6: Mandatory Out of Scope Section | depended upon by | US6 verifies that sub-phase 3c always produces an Out of Scope section; this story's audit check catches the same gap on existing RFCs during the Phase 0 review loop. Independent but complementary. |

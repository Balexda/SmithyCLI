# Tasks: Document Parent-Only Fallback

**Source**: `specs/2026-05-20-008-per-sub-agent-token-attribution/per-sub-agent-token-attribution.spec.md` — User Story 4
**Data Model**: `specs/2026-05-20-008-per-sub-agent-token-attribution/per-sub-agent-token-attribution.data-model.md`
**Contracts**: `specs/2026-05-20-008-per-sub-agent-token-attribution/per-sub-agent-token-attribution.contracts.md`
**Story Number**: 04

---

## Slice 1: Close the Parent-Only Fallback Path

**Goal**: If the committed dispatch usage evidence is classified as `parent_only`, update the token-savings RFC to make per-case totals plus committed baselines the M1 measurement contract and resolve RFC SD-001 with the observed parent-only evidence.

**Justification**: This slice is documentation-only and stands alone because the fallback path intentionally avoids report-model changes that would imply unavailable precision. It closes the feature when US1 selects `parent_only`; when US1 selects `dispatch_attributable`, this slice should not be run as an implementation fallback.

**Addresses**: FR-011; AS 4.1, AS 4.2, AS 4.3; SC-004, SC-005

### Tasks

- [ ] **Apply the RFC fallback closure**

  When `dispatch-usage-evidence.md` records a `parent_only` classification, update `docs/rfcs/2026-001-token-savings/token-savings.rfc.md` so the M1 goal language states that the milestone relies on per-case token totals and committed baselines while per-sub-agent attribution is deferred beyond M1. Resolve RFC SD-001 with the committed capture path and the evidence note's parent-only rationale. Do not add `sub_agent_tokens` fields, nested report rows, or attribution aggregation behavior in this fallback slice.

  _Acceptance criteria:_
  - The RFC goal language states that M1 relies on per-case totals and committed baselines when dispatch-level usage is unavailable.
  - RFC SD-001 is marked resolved with the observed parent-only evidence from `dispatch-usage-evidence.md`.
  - The fallback update does not introduce per-sub-agent token totals, nested report rows, or report fields that imply dispatch-level precision.
  - Existing eval report formatting remains free of empty or misleading sub-agent token rows.
  - If the committed evidence is `dispatch_attributable`, implementation does not apply this fallback closure.

**PR Outcome**: The RFC explicitly closes the parent-only path when the evidence requires it, and downstream token-savings work consumes per-case totals plus committed baselines without treating per-sub-agent attribution as part of M1.

---

## Specification Debt

None — all ambiguities resolved.

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Close the Parent-Only Fallback Path | — | — |

### Cross-Story Dependencies

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Verify Dispatch-Level Usage Evidence | depends on | This fallback slice is valid only after US1 records a `parent_only` dispatch usage evidence classification. |
| User Story 2: Attribute Token Totals to Sub-Agent Dispatches | depended upon by | US2 proceeds only on the mutually exclusive `dispatch_attributable` path; this fallback slice should not land in the same path as US2 attribution work. |
| User Story 3: Render Nested Sub-Agent Token Rows | depended upon by | US3 proceeds only after US2 attribution exists; this fallback slice preserves the current report shape instead. |

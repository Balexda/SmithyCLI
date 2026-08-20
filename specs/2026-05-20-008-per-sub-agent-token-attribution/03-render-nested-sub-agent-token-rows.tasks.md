# Tasks: Render Nested Sub-Agent Token Rows

**Source**: `specs/2026-05-20-008-per-sub-agent-token-attribution/per-sub-agent-token-attribution.spec.md` — User Story 3
**Data Model**: `specs/2026-05-20-008-per-sub-agent-token-attribution/per-sub-agent-token-attribution.data-model.md`
**Contracts**: `specs/2026-05-20-008-per-sub-agent-token-attribution/per-sub-agent-token-attribution.contracts.md`
**Story Number**: 03

---

## Slice 1: Render Per-Case Sub-Agent Attribution Rows

**Goal**: Extend eval report formatting so scenario results with `sub_agent_tokens` render nested attribution rows below their owning case line, while reports without attribution keep the existing per-case shape.

**Justification**: US2 already carries attribution totals through each `EvalResult`, so the remaining user-facing increment is pure report rendering plus the attribution-path RFC evidence closure. This can land as one focused slice because it does not revisit stream extraction, result assembly, status semantics, or parent-only fallback behavior.

**Addresses**: FR-008, FR-009, FR-010, FR-012; AS 3.1, AS 3.2, AS 3.3; SC-003, SC-005; resolves RFC SD-001 on the dispatch-attributable path

### Tasks

- [x] **Render nested attribution rows in eval reports**

  Update the pure report formatter so each result with non-empty `sub_agent_tokens` emits one nested line per attributed sub-agent directly below that result's case line. Preserve existing case-line status, scenario name, duration, per-case input and output totals, baseline marker behavior, total elapsed line, and final result line for AS 3.1-3.3.

  _Acceptance criteria:_
  - A case with sub-agent token totals renders each attributed sub-agent as a nested row under the owning case.
  - Each nested row includes the sub-agent display name plus non-negative input and output token counts.
  - Cases without sub-agent token totals render no nested attribution rows.
  - Mixed reports render nested rows only for the cases that carry attribution data.
  - Existing per-case token totals, baseline markers, total elapsed, and final result rendering remain visible.
  - Scenario pass, fail, timeout, and error statuses are unchanged by attribution row rendering.

- [x] **Cover nested report formatting behavior**

  Update report formatter unit coverage for the US3 rendering path, replacing the pre-US3 expectation that `sub_agent_tokens` are ignored. Cover attributed, unattributed, and mixed reports in the same pure formatting layer so the behavior is deterministic without running the full eval CLI.

  _Acceptance criteria:_
  - Unit tests cover AS 3.1 by asserting nested rows appear under a case with attribution data.
  - Unit tests cover AS 3.2 by asserting mixed reports render rows only under attributed cases.
  - Unit tests cover AS 3.3 by asserting reports with per-case totals and no attribution keep the existing case-line shape.
  - Unit tests cover interaction with baseline markers so FR-010 remains explicit.
  - Existing result assembly and report aggregation attribution tests continue to pass unchanged.

- [x] **Resolve the attribution-path RFC evidence debt**

  After nested report rows ship on the committed `dispatch_attributable` evidence path, update the token-savings RFC SD-001 row to record that the capture evidence supports per-dispatch attribution and that `EvalReport` / `formatReport` now expose the resulting per-sub-agent token rows. Do not apply the parent-only fallback language from US4.

  _Acceptance criteria:_
  - RFC SD-001 is marked resolved with the committed capture path from `dispatch-usage-evidence.md`.
  - The resolution cites the observed dispatch identifier relationship rather than parent-only fallback rationale.
  - The RFC keeps F1.3b in M1 as implemented attribution instead of descoping it to a post-M1 follow-up.
  - The US4 parent-only fallback task remains a guarded no-op because the committed evidence is `dispatch_attributable`.
  - No unrelated RFC debt rows or milestone scope statements are changed.

**PR Outcome**: Eval reports expose per-sub-agent token usage beneath the relevant case rows when dispatch-attributable usage exists, preserve the existing report shape otherwise, and close the RFC's attribution evidence debt on the implemented path.

---

## Specification Debt

None — all ambiguities resolved.

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Render Per-Case Sub-Agent Attribution Rows | — | — |

### Cross-Story Dependencies

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Verify Dispatch-Level Usage Evidence | depends on | US3 runs only on the `dispatch_attributable` classification recorded by US1; the parent-only path stays owned by US4. |
| User Story 2: Attribute Token Totals to Sub-Agent Dispatches | depends on | US3 consumes the result-level `sub_agent_tokens` arrays carried through by US2. |
| User Story 4: Document Parent-Only Fallback | depended upon by | US4 remains the mutually exclusive fallback path when US1 records `parent_only`; this story closes the attribution path instead. |

# Tasks: Attribute Token Totals To Sub-Agent Dispatches

**Source**: `specs/2026-05-20-008-per-sub-agent-token-attribution/per-sub-agent-token-attribution.spec.md` — User Story 2
**Data Model**: `specs/2026-05-20-008-per-sub-agent-token-attribution/per-sub-agent-token-attribution.data-model.md`
**Contracts**: `specs/2026-05-20-008-per-sub-agent-token-attribution/per-sub-agent-token-attribution.contracts.md`
**Story Number**: 02

---

## Slice 1: Dispatch Usage Record Extraction
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Add the attribution extractor that converts dispatch-attributable stream usage into per-sub-agent token totals for one scenario.

**Justification**: This slice delivers the core US2 behavior without changing report rendering. Once merged, scenario streams can produce reliable attribution totals that later stories can render as nested rows.

**Addresses**: FR-002, FR-004, FR-005, FR-006, FR-012; Acceptance Scenarios 2.1, 2.2, 2.3

### Tasks

- [x] **Extract attributed dispatch usage records**

  Add an attribution path under `evals/lib/` that consumes parsed `StreamEvent` values and matches usage metadata to known sub-agent dispatches by stable dispatch identifier. Reuse the existing stream parsing helpers where possible, and keep parent-level, ambiguous, and malformed usage out of the returned records for AS 2.1 and AS 2.3.

  _Acceptance criteria:_
  - Usage tied to an Agent dispatch produces a normalized dispatch usage record.
  - Usage tied to `invoke_agent` dispatches follows the same matching contract.
  - Parent-only usage records do not create dispatch usage records.
  - Malformed token values are ignored rather than coerced or thrown.
  - Failed dispatches with parseable usage remain attributable.
  - Existing evidence classification behavior remains unchanged.

- [x] **Aggregate dispatch records by sub-agent**

  Extend the attribution path to return `SubAgentTokenTotals[]` for one scenario by grouping valid dispatch usage records by stable sub-agent display name. Preserve per-case token totals as the authoritative fallback by returning no attribution rows for unattributable usage, satisfying AS 2.1-2.3 without introducing report rendering from US3.

  _Acceptance criteria:_
  - Repeated dispatches of the same sub-agent aggregate into one total row.
  - Input and output totals are finite non-negative integers.
  - Dispatch counts reflect the number of matched dispatches represented by each row.
  - Unknown or malformed dispatch labels fall back to a deterministic non-empty display name.
  - Aggregated rows are emitted in stable agent-name order.
  - Unattributable usage leaves the extractor result empty while per-case totals remain available elsewhere.

**PR Outcome**: Parsed eval streams can produce deterministic per-sub-agent token totals from reliable dispatch relationships, while parent-only and ambiguous usage continue to rely on existing per-case totals.

---

## Slice 2: Scenario Result Attribution Carry-Through
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Carry optional sub-agent token totals into each scenario result without changing status semantics or formatted report output.

**Justification**: This slice makes the US2 attribution data available at the result boundary that US3 will render later. It is independently valuable because tests and downstream consumers can inspect attribution on `EvalResult` while existing reports stay compatible.

**Addresses**: FR-003, FR-006, FR-007, FR-012; Acceptance Scenarios 2.1, 2.2, 2.3

### Tasks

- [ ] **Expose attribution totals on eval results**

  Extend the shared eval result types and `scenarioRunToResult` assembly path to accept optional `SubAgentTokenTotals[]` from the attribution extractor. Omit the result field when attribution is absent or empty, and preserve it for pass, fail, timeout, and error outcomes to satisfy AS 2.1-2.3.

  _Acceptance criteria:_
  - `EvalResult` can carry optional per-sub-agent token totals.
  - Empty attribution input is omitted rather than serialized as an empty array.
  - Non-empty attribution input is preserved without changing scenario status.
  - Timeout and error results still carry supplied attribution rows.
  - Existing structural, sub-agent, baseline, and error result behavior remains unchanged.

- [ ] **Wire attribution into runner report assembly**

  Update the eval execution path that builds per-scenario results so it derives sub-agent token totals from each scenario's parsed stream events and passes them into result assembly. Keep the default formatted report shape unchanged until US3 adds nested row rendering.

  _Acceptance criteria:_
  - Scenario results include attribution rows when dispatch-attributable usage exists.
  - Scenario results omit attribution rows for parent-only or ambiguous usage.
  - Per-case token totals remain populated from the existing extraction path.
  - Report aggregation preserves result-level attribution arrays without computing cross-case totals.
  - Existing report formatting snapshots or expectations remain valid without nested attribution rows.

**PR Outcome**: Eval scenario results carry optional per-sub-agent token totals through the report model, ready for US3 rendering while preserving current status, per-case token, and report formatting behavior.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

None — all ambiguities resolved.

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Dispatch Usage Record Extraction | — | — |
| S2 | Scenario Result Attribution Carry-Through | S1 | — |

### Cross-Story Dependencies

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Verify Dispatch-Level Usage Evidence | depends on | US2 consumes the dispatch-attributable evidence classification from US1 before adding token aggregation behavior. |
| User Story 3: Render Nested Sub-Agent Token Rows | depended upon by | US3 consumes the result-level attribution rows introduced by this story for report rendering. |

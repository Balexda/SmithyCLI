# Tasks: Verify Dispatch-Level Usage Evidence

**Source**: `specs/2026-05-20-008-per-sub-agent-token-attribution/per-sub-agent-token-attribution.spec.md` — User Story 1
**Data Model**: `specs/2026-05-20-008-per-sub-agent-token-attribution/per-sub-agent-token-attribution.data-model.md`
**Contracts**: `specs/2026-05-20-008-per-sub-agent-token-attribution/per-sub-agent-token-attribution.contracts.md`
**Story Number**: 01

---

## Slice 1: Classify Committed Dispatch Usage Evidence

**Goal**: Add the evidence classification path that inspects committed eval stream events and records whether per-sub-agent token attribution is eligible or must fall back to parent-only reporting.

**Justification**: This slice stands alone because it selects the implementation path required before US2, US3, or US4 can proceed. After it lands, maintainers can point to code-backed evidence classification and a recorded feature decision without adding attribution totals or report rendering.

**Addresses**: FR-001, FR-004; supports FR-012 classification coverage; AS 1.1, AS 1.2, AS 1.3

### Tasks

- [x] **Add dispatch usage evidence classification**

  Extend the eval stream parsing layer under `evals/lib/` with a dispatch usage evidence classifier that consumes parsed `StreamEvent` values and returns the data-model classification shape. Keep the classifier limited to reliable dispatch-identifier relationships for AS 1.1-1.3; do not add sub-agent token aggregation or report rows from later stories.

  _Acceptance criteria:_
  - Dispatch-attributable streams classify as eligible only when usage metadata has a stable relationship to a known sub-agent dispatch.
  - Parent-only streams classify as parent-only with a rationale from the observed evidence.
  - Malformed or partial usage metadata is handled without inferring attribution from ambiguous data.
  - Classification output includes the source capture, observed relationship, and review timestamp fields from the data model.
  - Existing text extraction and sub-agent evidence behavior remains unchanged.
  - Unit coverage spans AS 1.1, AS 1.2, and AS 1.3.

- [x] **Record the committed evidence decision**

  Add `specs/2026-05-20-008-per-sub-agent-token-attribution/dispatch-usage-evidence.md` for the reviewed eval capture. The note should identify the capture reviewed, the classifier result, and the selected downstream path while keeping US2 attribution and US4 RFC fallback edits out of scope.

  _Acceptance criteria:_
  - The committed note records one dispatch usage evidence classification for a concrete capture path.
  - The note states whether the feature proceeds to attribution or selects the parent-only fallback path.
  - The recorded decision cites the observed relationship or parent-only rationale from the classifier output.
  - No per-sub-agent token totals, nested report rows, or RFC SD-001 resolution changes are introduced in this slice.
  - The evidence decision satisfies SC-001 without changing unrelated eval scenarios.

**PR Outcome**: The repository can classify committed stream evidence as dispatch-attributable or parent-only, and the feature has a recorded decision that tells the next Smithy step which path to implement.

---

## Specification Debt

None — all ambiguities resolved.

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Classify Committed Dispatch Usage Evidence | — | — |

### Cross-Story Dependencies

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Attribute Token Totals to Sub-Agent Dispatches | depended upon by | US2 depends on this story's dispatch-attributable classification before adding aggregation behavior. |
| User Story 3: Render Nested Sub-Agent Token Rows | depended upon by | US3 depends on the attribution path selected by this story and the totals produced by US2. |
| User Story 4: Document Parent-Only Fallback | depended upon by | US4 depends on this story's parent-only classification before applying RFC fallback documentation. |

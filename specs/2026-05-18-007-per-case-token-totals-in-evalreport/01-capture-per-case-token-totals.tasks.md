# Tasks: Capture Per-Case Token Totals

**Source**: `specs/2026-05-18-007-per-case-token-totals-in-evalreport/per-case-token-totals-in-evalreport.spec.md` — User Story 1
**Data Model**: `specs/2026-05-18-007-per-case-token-totals-in-evalreport/per-case-token-totals-in-evalreport.data-model.md`
**Contracts**: `specs/2026-05-18-007-per-case-token-totals-in-evalreport/per-case-token-totals-in-evalreport.contracts.md`
**Story Number**: 01

---

## Slice 1: Extract Token Totals from Stream Events
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Add normalized token totals to runner output by extracting valid usage metadata from parsed stream events. After this PR, every `RunOutput` carries input and output token totals for successful, failing, timeout, and malformed-output paths.

**Justification**: The runner already owns parsed stream events and the success/error/timeout fallback behavior, so token extraction can land there as a standalone measurement increment. This slice gives downstream report assembly a stable `RunOutput.tokens` contract without changing user-visible report formatting or baseline behavior.

**Addresses**: FR-001, FR-002, FR-003, FR-004; Acceptance Scenarios 1.1, 1.2, 1.3

### Tasks

- [ ] **Declare token totals on runner output**

  Extend `evals/lib/types.ts` with the token-count value object from the data model and add it to `RunOutput`. Keep the stream event type loose enough to preserve unknown event shapes while permitting optional usage payloads for AS 1.1-1.3.

  _Acceptance criteria:_
  - `TokenTotals` represents separate non-negative integer input and output counts.
  - `RunOutput` requires a `tokens` field.
  - `StreamEvent` remains tolerant of unknown fields and event types.
  - Existing type exports remain import-compatible for current eval modules.

- [ ] **Extract valid usage from stream events**

  Add a pure extraction helper in `evals/lib/parse-stream.ts` that implements the Stream Usage Extraction contract. It must normalize valid usage metadata, ignore invalid fields, and apply the terminal-event precedence rule so AS 1.1 and the edge-case deduplication requirement are satisfied.

  _Acceptance criteria:_
  - Terminal `result` usage takes precedence over non-terminal event usage.
  - Non-terminal usage is summed only when no terminal usage is available.
  - Absent, null, non-numeric, fractional, negative, and non-finite values are ignored.
  - Empty or usage-free event arrays return zero totals.
  - Unit coverage exercises valid usage, missing usage, malformed usage, and deduplication paths.

- [ ] **Populate runner tokens for every outcome**

  Update `evals/lib/runner.ts` so `runScenario` sets `RunOutput.tokens` from parseable events and falls back to zero totals when no usable usage metadata is available. Preserve the existing extracted-text and timeout/error behavior while satisfying AS 1.2 and AS 1.3.

  _Acceptance criteria:_
  - Successful runs include extracted token totals.
  - Timeout and non-zero-exit runs include totals from any parseable events.
  - Malformed or unparsable stream output yields zero token totals without adding token-specific failures.
  - Existing runner tests continue to cover stream event preservation and status fields.
  - New runner coverage verifies token totals are present on success, error, and timeout outputs.

**PR Outcome**: `runScenario` returns token totals for every scenario execution path, with extraction behavior locked by focused parse-stream and runner tests.

---

## Slice 2: Carry Token Totals Through Report Data
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Thread measured token totals from runner output into per-case `EvalResult` values and aggregate `EvalReport` totals. After this PR, report data exposes per-case and aggregate token counts, while formatted report output remains unchanged for User Story 2.

**Justification**: User Story 1 is complete only when the scenario result carries the measured cost signal. Keeping this slice data-only avoids mixing capture semantics with report rendering, which is separately specified by User Story 2.

**Addresses**: FR-001, FR-002, FR-005, FR-006, FR-015; Acceptance Scenarios 1.1, 1.2, 1.3

### Tasks

- [ ] **Copy runner tokens into eval results**

  Extend `EvalResult` in `evals/lib/types.ts` and update `scenarioRunToResult` in `evals/lib/report.ts` so each result carries the `RunOutput.tokens` value. The copy must be status-independent so AS 1.3 remains true for timeout and error scenarios.

  _Acceptance criteria:_
  - `EvalResult` requires token totals.
  - `scenarioRunToResult` copies token totals from `RunOutput`.
  - Structural, sub-agent, and baseline check arrays keep their existing behavior.
  - Pass, fail, timeout, and error results all preserve token totals.
  - Unit coverage verifies token preservation across status precedence paths.

- [ ] **Aggregate tokens in eval reports**

  Extend `EvalReport` and `buildReport` so aggregate input and output counts are summed from per-case `EvalResult.tokens`. Keep the current result ordering, status counts, timestamp behavior, and `formatReport` output stable because User Story 2 owns token rendering.

  _Acceptance criteria:_
  - `EvalReport` requires aggregate token totals.
  - `buildReport` sums every included result's input and output counts.
  - Empty reports expose zero input and output totals.
  - `buildReport` does not mutate the input results array.
  - Existing formatted-report status, duration, and baseline-marker rendering remains unchanged.
  - Unit coverage verifies aggregate totals for mixed-status and empty reports.

**PR Outcome**: `EvalResult` and `EvalReport` carry token totals through the report pipeline, enabling User Story 2 to render existing data without revisiting capture or aggregation logic.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: The exact stream-json event placement for usage metadata may vary by Claude CLI version. Implementers must verify whether usage appears on final `result` events, assistant events, or both, and apply the Stream Usage Extraction deduplication rule in the contracts document (terminal `result` event precedence, with delta-event sum as the fallback) when both are present for the same logical run. | Integration | High | Medium | inherited | — |
| SD-002 | inherited from spec: The token envelope tolerance is not calibrated until the first token-aware strike baseline is captured. Implementers should choose a conservative initial envelope and document the captured live totals in the implementation PR. | Non-Functional Quality | Medium | Medium | inherited | — |
| SD-003 | inherited from spec: The RFC touched-files matrix currently omits some token-threading surfaces needed by F1.3a. The implementation PR must amend the matrix to name all owned parsing, runner-output, report, and type surfaces touched by this feature. | Integration | Medium | High | inherited | — |

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Extract Token Totals from Stream Events | — | — |
| S2 | Carry Token Totals Through Report Data | S1 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Render Token Totals in Eval Reports | depended upon by | US2 renders the per-case token totals captured and carried by this story; it should not need to revisit stream extraction or result assembly. |
| User Story 3: Extend Baselines with Token Envelopes | depended upon by | US3 compares live token totals against committed envelopes after this story makes those live totals available on results. |

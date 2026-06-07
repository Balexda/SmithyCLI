# Tasks: Select the bounded context-delivery mechanism

**Source**: `specs/2026-05-15-006-smithy-implement-per-task-spec-re-read-reduction/smithy-implement-per-task-spec-re-read-reduction.spec.md` - User Story 1
**Data Model**: `specs/2026-05-15-006-smithy-implement-per-task-spec-re-read-reduction/smithy-implement-per-task-spec-re-read-reduction.data-model.md`
**Contracts**: `specs/2026-05-15-006-smithy-implement-per-task-spec-re-read-reduction/smithy-implement-per-task-spec-re-read-reduction.contracts.md`
**Story Number**: 01

---

## Slice 1: Candidate Strategy Measurement Harness

**Goal**: Add the smallest measurement path that can run the same forge slice shape against the two candidate bounded-context strategies and capture comparable token and quality evidence for both JS and JVM fixtures. This slice does not select or wire the production context mechanism; it only makes the evidence required by US1 observable and reviewable.

**Justification**: US1 is the decision gate for the rest of the feature. A reusable measurement harness must land before selection so maintainers can inspect both candidate strategies with the same token-total and structural-quality surfaces, without changing normal `smithy.forge` dispatch behavior or the implementation sub-agent model.

**Addresses**: FR-001, FR-002, FR-003, FR-013, FR-014, FR-015; Acceptance Scenarios 1.1, 1.2, 1.3

### Tasks

- [ ] **Add candidate strategy measurement mode**

  Extend the forge eval or measurement support code so a maintainer can run the same multi-task forge slice under the parent pre-pasted excerpts candidate and the generated per-task brief candidate. The mode must be isolated from normal forge behavior and preserve the existing build-output, test-command, TDD-protocol, and model-assignment boundaries.

  _Acceptance criteria:_
  - Both candidate strategies can be measured independently against the same slice shape
  - JS and JVM forge fixtures are both supported inputs (AS 1.1)
  - Normal `smithy.forge` dispatch behavior is unchanged outside the measurement path
  - Build-output and test-command handling remain untouched (FR-013)
  - Implementation sub-agent model assignment remains unchanged (FR-014)

- [ ] **Capture per-candidate token and quality results**

  Thread the existing eval token-total and structural-quality surfaces through the candidate measurement output. Each candidate/fixture result must map to the `MeasurementResult` entity from the data model so the decision step can compare like-for-like records without re-reading raw captures.

  _Acceptance criteria:_
  - Each candidate/fixture result records input, output, total, and delta-from-baseline tokens (AS 1.1)
  - Results distinguish JS and JVM fixture measurements
  - Structural-eval outcome is present for every candidate/fixture result
  - Sampled-review outcome (`pass`, `fail`, or `not_reviewed`) is recorded for every candidate/fixture result, since `MeasurementResult` requires `sampled_review_result` and the Slice 2 decision contract rejects records that omit it
  - Missing baseline or incomplete candidate data blocks the measurement result instead of producing a misleading comparison
  - Unit or eval coverage proves token deltas are computed from the matching fixture baseline

**PR Outcome**: Maintainers can produce a complete candidate-results set for both bounded-context strategies on the JS and JVM forge fixtures. The output is structured enough for Slice 2 to make a deterministic selection, but no production forge context path changes yet.

---

## Slice 2: Context Delivery Decision Record

**Goal**: Record the side-by-side measurement results, apply the quality gate, choose the lower-token qualifying candidate, and leave a maintainer-readable decision record that resolves the US1 selection debt. This slice consumes the Slice 1 measurement output and does not implement the selected context packet dispatch path, which belongs to US2.

**Justification**: The selected mechanism must be based on measured token and quality behavior rather than intuition. Keeping the decision record separate from the harness makes the selection reviewable on its own and prevents the implementation slices from proceeding while SD-001 remains unresolved.

**Addresses**: FR-001, FR-002, FR-003; Acceptance Scenarios 1.1, 1.2, 1.3

### Tasks

- [ ] **Record the context delivery decision**

  Add a decision record or implementation note that consumes the complete candidate-results set and conforms to the `Context Delivery Decision Record` contract. The record must name the selected strategy, show every candidate/fixture measurement, summarize quality results, and explain any rejection of the lowest-token strategy.

  _Acceptance criteria:_
  - Record includes both strategies across JS and JVM fixtures (AS 1.1)
  - Record names the selected strategy and quality summary
  - Lowest-token candidate is rejected or deferred when acceptance detail regresses (AS 1.2)
  - Lower-token candidate is selected when quality is equivalent unless a concrete reliability or maintainability reason is recorded (AS 1.3)
  - Merge gate is blocked when any required measurement or candidate is missing

- [ ] **Resolve Story 1 specification debt**

  Update the Story 1 planning artifacts to reflect the selected strategy and close the debt that prevented selection during specification. SD-001 must be resolved with a note pointing at the measured candidate evidence; SD-002 remains inherited unless this story also defines a packet-size bound as part of the recorded decision.

  _Acceptance criteria:_
  - SD-001 is marked resolved only after complete JS and JVM measurements exist
  - Resolution text identifies the selected strategy and evidence location
  - SD-002 remains inherited or is resolved with an explicit measured packet-size bound
  - No US2 production dispatch tasks are pulled into this slice
  - The decision record is ready for the later implementation PR to cite

**PR Outcome**: The bounded context-delivery mechanism is selected with recorded token and quality evidence for both required forge fixtures. US2 can implement the chosen path without re-litigating the strategy choice.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: The exact selected strategy cannot be finalized in this spec without the M1 JS and JVM forge baselines and side-by-side candidate measurements. | Dependency Relationships | High | High | inherited | Owned by Slice 2. Resolve after the candidate-results set exists and the decision record selects the strategy. |
| SD-002 | inherited from spec: The maximum acceptable size for a task context packet depends on observed task and artifact sizes from the M1 forge fixtures. Implementation must set and document a bound before merge. | Non-Functional Quality | Medium | Medium | inherited | Primarily owned by US2. Slice 2 may resolve only if the Story 1 decision record also sets a measured bound. |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Candidate Strategy Measurement Harness | — | — |
| S2 | Context Delivery Decision Record | S1 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| M1 forge baselines for JS and JVM fixtures | depends on | Both slices require the committed M1 baseline token and quality data named in the spec clarifications. If either fixture baseline is absent, the decision must block rather than select a strategy from partial evidence. |
| US2: Supply task-specific acceptance context without full artifact re-reads | depended upon by | US2 consumes the selected strategy from Slice 2 and implements production dispatch packets. It must not be pulled into this Story 1 task file. |

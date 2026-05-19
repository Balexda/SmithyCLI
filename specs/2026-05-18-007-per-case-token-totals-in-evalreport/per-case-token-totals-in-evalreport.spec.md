# Feature Specification: Per-Case Token Totals in EvalReport

**Spec Folder**: `2026-05-18-007-per-case-token-totals-in-evalreport`
**Branch**: `2026-05-18-007-per-case-token-totals-in-evalreport`
**Created**: 2026-05-18
**Status**: Draft
**Input**: `docs/rfcs/2026-001-token-savings/token-savings.rfc.md` — Milestone 1 measurement foundation feature for per-case eval token reporting, baseline token envelopes, and token-aware report rendering.
**Source Feature Map**: `docs/rfcs/2026-001-token-savings/01-measurement-foundation.features.md` — Feature 1.3a: Per-Case Token Totals in EvalReport

## Clarifications

### Session 2026-05-18

- F1.1 and F1.2 are reference-only feature-map rows with no child spec; this specification targets the first implementable unspecced feature, F1.3a. `[Critical Assumption]`
- Per-case token reporting is additive: existing structural pass/fail behavior, scenario loading, sub-agent evidence checks, and no-baseline scenario behavior remain compatible.
- Token totals are recorded as input and output token counts; missing or unparseable usage data is represented as zero totals rather than failing an otherwise valid scenario run.
- Token baseline checks compare committed per-case token envelopes with live per-case totals and emit a baseline check result without replacing existing structural baseline checks.
- Per-sub-agent token attribution is excluded from this specification and remains owned by F1.3b.
- The RFC touched-files matrix does not yet name the stream parsing, runner output, and shared type surfaces needed for token totals; the matrix amendment is deferred to the implementation PR and tracked as SD-003 so the governance update lands alongside the code rather than as a separate planning revision.

## Artifact Hierarchy

RFC -> Milestone -> Feature -> User Story -> Slice -> Tasks

## User Scenarios & Testing *(mandatory)*

### User Story 1: Capture Per-Case Token Totals (Priority: P1)

As a Smithy maintainer, I want each eval scenario result to include input and output token totals so that every eval run has a measured cost signal alongside structural pass/fail.

**Why this priority**: This is the foundation for the entire token-savings program. Baselines, rendered deltas, and downstream M2/M3 savings claims cannot be credible until each scenario produces token totals.

**Independent Test**: Run a fixture scenario with stream events containing usage fields and verify the resulting scenario output carries the summed input and output totals.

**Acceptance Scenarios**:

1. **Given** a scenario run emits one or more stream events with usage metadata, **When** the run is converted into a scenario result, **Then** the result includes the summed input token count and summed output token count for that case.
2. **Given** a scenario run emits no usage metadata, **When** the run is converted into a scenario result, **Then** the result includes input and output token totals of zero and no token-specific error is raised.
3. **Given** a scenario run times out or exits with an error after emitting parseable stream events, **When** the run is converted into a scenario result, **Then** any available usage metadata is still reflected in the result's token totals.

---

### User Story 2: Render Token Totals in Eval Reports (Priority: P1)

As a Smithy contributor, I want the eval report to show input and output tokens for each case so that I can see the cost impact of a change without inspecting raw stream captures.

**Why this priority**: The user-facing value of F1.3a is a report surface. Hidden totals in internal data structures do not help contributors make cost-aware template changes.

**Independent Test**: Build a report with multiple scenario results and verify each case line renders `input: <N>, output: <N>` without changing the aggregate pass/fail summary.

**Acceptance Scenarios**:

1. **Given** an eval report contains one passing scenario with non-zero token totals, **When** the report is formatted, **Then** the scenario line displays its input and output token counts.
2. **Given** an eval report contains passing, failing, timeout, and error scenarios, **When** the report is formatted, **Then** every scenario line displays token totals and the status tokens remain unchanged.
3. **Given** an eval report includes scenarios with and without committed baselines, **When** the report is formatted, **Then** token totals and the existing baseline marker are both visible on the relevant case lines.

---

### User Story 3: Extend Baselines with Token Envelopes (Priority: P1)

As a Smithy maintainer, I want committed baseline files to carry token envelopes so that eval runs can flag material token drift against known-good scenario outputs.

**Why this priority**: The token-savings program needs committed baselines before downstream M2/M3 PRs can compute token deltas without rerunning historical comparisons.

**Independent Test**: Load a baseline containing a token envelope, compare it with a live scenario result, and verify the baseline checks include a token-delta result in addition to structural checks.

**Acceptance Scenarios**:

1. **Given** a baseline file includes a token envelope and a live scenario result stays within that envelope, **When** baseline comparison runs, **Then** the token baseline check passes.
2. **Given** a baseline file includes a token envelope and a live scenario result exceeds the envelope, **When** baseline comparison runs, **Then** the token baseline check fails with the expected and actual token totals visible.
3. **Given** a baseline file uses the previous structural-only shape, **When** baseline loading runs, **Then** the baseline remains valid and token comparison is skipped for that file.

---

### User Story 4: Refresh the Strike Baseline in the Token-Aware Schema (Priority: P2)

As a Smithy maintainer, I want the existing strike scenario baseline committed in the token-aware schema so that the first measured case establishes the envelope format for later M1 scenarios.

**Why this priority**: The strike scenario is the committed baseline already present in the eval suite. Refreshing it proves the new schema is usable before fix and forge baselines arrive in later M1 features.

**Independent Test**: Run the strike scenario, refresh its baseline in the token-aware schema, and verify a subsequent eval run reports both structural and token baseline checks.

**Acceptance Scenarios**:

1. **Given** the existing strike scenario has a refreshed token-aware baseline, **When** the strike scenario runs successfully, **Then** its report line includes token totals and a passing baseline marker.
2. **Given** the refreshed strike baseline is loaded, **When** the baseline comparator runs, **Then** it still validates the structural headings and tables recorded in the baseline.
3. **Given** the token-aware strike baseline contains its token envelope, **When** the live token totals exceed that envelope, **Then** the report shows a failing baseline marker for the scenario.

### Edge Cases

- Stream events may carry usage metadata on final result events, assistant events, or both; totals must avoid double-counting the same logical usage record.
- Usage fields may be absent, null, or non-numeric; those fields are ignored rather than converted to invalid totals.
- A scenario can fail structurally while still producing useful token totals; token collection must not depend on pass status.
- Existing structural-only baselines remain loadable so partially migrated baseline sets do not block incremental M1 work.
- The report line must remain readable when duration, baseline marker, and token totals are all present.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Capture Per-Case Token Totals | — | — |
| US2 | Render Token Totals in Eval Reports | US1 | — |
| US3 | Extend Baselines with Token Envelopes | US1 | — |
| US4 | Refresh the Strike Baseline in the Token-Aware Schema | US2, US3 | — |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST represent token totals as separate non-negative integer input and output counts.
- **FR-002**: Each scenario run result MUST include token totals, even when no usage metadata is present.
- **FR-003**: Token extraction MUST read usage metadata from supported stream events without failing on unknown event shapes.
- **FR-004**: Token extraction MUST ignore absent, null, non-numeric, non-integer (fractional, e.g., `12.3`), negative, or non-finite usage values so the non-negative integer invariant in FR-001 is preserved by construction. Numbers whose value is integral but whose JSON encoding is a float (e.g., `12.0`) are accepted as the equivalent integer.
- **FR-005**: Scenario results MUST carry token totals through report aggregation without mutating existing structural, sub-agent, or baseline check arrays.
- **FR-006**: The aggregate eval report MUST expose total input and output token counts across all included scenario results.
- **FR-007**: The formatted eval report MUST render input and output token totals on every per-case line.
- **FR-008**: Existing pass/fail/timeout/error status tokens and aggregate result rendering MUST remain stable.
- **FR-009**: Existing baseline markers MUST remain visible when token totals are rendered.
- **FR-010**: Baseline files MUST support an optional token envelope while preserving compatibility with structural-only baselines.
- **FR-011**: Baseline comparison MUST emit a token check result when a baseline contains a token envelope.
- **FR-012**: Baseline comparison MUST skip token checks when a baseline has no token envelope.
- **FR-013**: The existing strike scenario baseline MUST be refreshed into the token-aware schema.
- **FR-014**: The token-aware strike baseline MUST preserve its existing structural baseline expectations.
- **FR-015**: Unit tests MUST cover token extraction, report rendering, baseline loading, baseline comparison, and structural-only baseline compatibility.

### Key Entities

- **TokenTotals**: The per-case and aggregate pair of input and output token counts.
- **TokenEnvelope**: The committed baseline bounds used to decide whether a live scenario's token totals remain within an accepted range.
- **Scenario Result**: The per-case eval result extended with token totals.
- **Eval Report**: The aggregate eval report extended with total token counts and per-case token rendering.
- **Baseline**: The committed known-good scenario snapshot extended with an optional token envelope.
- **Baseline Check Result**: The existing check-result shape reused for token envelope pass/fail output.

## Assumptions

- Claude stream-json usage metadata remains available as input and output token fields on events produced during headless eval runs.
- A zero-token total means "no usable usage metadata was observed," not "the scenario had no cost."
- Token baseline envelopes are intentionally broad enough to tolerate expected provider-side variance while still catching material drift.
- Structural-only baseline compatibility is required during M1 because later features will add additional baselines after F1.3a lands.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | The exact stream-json event placement for usage metadata may vary by Claude CLI version. Implementers must verify whether usage appears on final `result` events, assistant events, or both, and apply the Stream Usage Extraction deduplication rule in the contracts document (terminal `result` event precedence, with delta-event sum as the fallback) when both are present for the same logical run. | Integration | High | Medium | open | — |
| SD-002 | The token envelope tolerance is not calibrated until the first token-aware strike baseline is captured. Implementers should choose a conservative initial envelope and document the captured live totals in the implementation PR. | Non-Functional Quality | Medium | Medium | open | — |
| SD-003 | The RFC touched-files matrix currently omits some token-threading surfaces needed by F1.3a. The implementation PR must amend the matrix to name all owned parsing, runner-output, report, and type surfaces touched by this feature. | Integration | Medium | High | open | — |

## Out of Scope

- Per-sub-agent token attribution, per-agent rendering, and per-agent token baselines.
- New eval scenarios for smithy.fix, smithy.forge, or JVM forge coverage.
- Planning-command baseline creation owned by the expand-evals dependency.
- Token-delta PR-description protocol for template PRs.
- Any cost-reduction prompt or sub-agent model changes.
- Any public CLI surface changes outside the eval report output.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every eval scenario result produced by the report pipeline includes input and output token totals.
- **SC-002**: The formatted eval report displays `input: <N>, output: <N>` for every case line.
- **SC-003**: The aggregate eval report exposes total input and output token counts across all cases.
- **SC-004**: The existing strike baseline is committed in a token-aware schema and still validates its structural expectations.
- **SC-005**: Structural-only baselines continue to load and compare successfully.
- **SC-006**: Unit tests cover token totals for successful, failing, timeout, missing-usage, and baseline-comparison paths.

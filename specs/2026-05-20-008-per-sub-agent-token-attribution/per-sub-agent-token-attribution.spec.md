# Feature Specification: Per-Sub-Agent Token Attribution

**Spec Folder**: `2026-05-20-008-per-sub-agent-token-attribution`
**Branch**: `2026-05-20-008-per-sub-agent-token-attribution`
**Created**: 2026-05-20
**Status**: Draft
**Input**: `docs/rfcs/2026-001-token-savings/token-savings.rfc.md` - Milestone 1 measurement foundation feature for attributing eval token usage to dispatched sub-agents when the agent stream supports it.
**Source Feature Map**: `docs/rfcs/2026-001-token-savings/01-measurement-foundation.features.md` - Feature 1.3b: Per-Sub-Agent Token Attribution

## Clarifications

### Session 2026-05-20

- This specification targets the Dependency Order row `F2`, which corresponds to Feature 1.3b in the measurement-foundation feature map. `[Critical Assumption]`
- Feature 1.3a is the prerequisite measurement substrate; this feature consumes its per-case token totals and report rendering surface instead of redefining them.
- The feature has a dual-path outcome: ship per-sub-agent attribution when captured stream evidence contains dispatch-level usage records, or ship a documentation-only descope when the evidence proves parent-only attribution.
- The report rendering format is settled here: per-sub-agent token lines render as nested rows beneath the owning case row, and only when at least one sub-agent has usage data.
- Per-sub-agent token baselines are out of scope. F1.3a's per-case token envelope remains the committed baseline contract for M1 and downstream token deltas.
- Parent-only fallback must not block M1. If dispatch-level usage is unavailable, this feature closes by documenting the fallback, updating the RFC goal language, and resolving the RFC's SD-001.

## Artifact Hierarchy

RFC -> Milestone -> Feature -> User Story -> Slice -> Tasks

## User Scenarios & Testing *(mandatory)*

### User Story 1: Verify Dispatch-Level Usage Evidence (Priority: P1)

As a Smithy maintainer, I want the captured eval stream inspected for dispatch-level usage records so that the implementation path is based on observed agent output rather than an assumption.

**Why this priority**: Every other story depends on knowing whether usage can be tied to a sub-agent dispatch. The RFC explicitly makes this feature contingent on that evidence.

**Independent Test**: Analyze a committed eval capture and classify it as either dispatch-attributable or parent-only, with the classification recorded in the feature implementation notes.

**Acceptance Scenarios**:

1. **Given** a captured eval stream includes usage metadata tied to a dispatched sub-agent invocation, **When** evidence classification runs, **Then** the feature is marked eligible for per-sub-agent attribution.
2. **Given** a captured eval stream includes usage metadata only on parent-level events, **When** evidence classification runs, **Then** the feature is marked parent-only and the documentation fallback path is selected.
3. **Given** a captured eval stream contains malformed or partial usage metadata, **When** evidence classification runs, **Then** the classification identifies the usable records and does not infer attribution from ambiguous data.

---

### User Story 2: Attribute Token Totals to Sub-Agent Dispatches (Priority: P1)

As a Smithy contributor, I want token totals grouped by dispatched sub-agent so that I can see which helpers are responsible for a scenario's cost.

**Why this priority**: The user-facing value of this feature is not additional per-case totals; it is explaining which dispatched agent consumed those tokens when the stream carries enough evidence.

**Independent Test**: Run token attribution over a fixture event stream containing multiple sub-agent dispatches and verify the result groups input and output totals under the correct sub-agent names.

**Acceptance Scenarios**:

1. **Given** a stream contains an Agent dispatch and usage metadata tied to that dispatch, **When** attribution runs, **Then** the matching sub-agent receives the usage record's input and output token totals.
2. **Given** a stream contains multiple dispatches of the same sub-agent, **When** attribution runs, **Then** their token totals are summed under one sub-agent row for the scenario.
3. **Given** a stream contains usage metadata that cannot be tied to a dispatch, **When** attribution runs, **Then** the per-case total remains available and no synthetic sub-agent row is created.

---

### User Story 3: Render Nested Sub-Agent Token Rows (Priority: P1)

As a Smithy contributor, I want each eval report to show sub-agent token rows beneath a case so that expensive helper dispatches are visible without reading raw captures.

**Why this priority**: Attribution has to be visible in the standard eval report to support model-downgrade and orchestration decisions in later milestones.

**Independent Test**: Format an eval report containing per-sub-agent token totals and verify nested rows render below the relevant case while reports without attribution keep the existing per-case shape.

**Acceptance Scenarios**:

1. **Given** a scenario result contains sub-agent token totals, **When** the report is formatted, **Then** each sub-agent renders as a nested row with input and output token counts below that scenario.
2. **Given** a report contains scenarios with and without sub-agent token totals, **When** the report is formatted, **Then** nested rows render only under scenarios that have attribution data.
3. **Given** a scenario result has per-case token totals and no sub-agent token totals, **When** the report is formatted, **Then** the case line still displays per-case totals and no empty attribution section is rendered.

---

### User Story 4: Document Parent-Only Fallback (Priority: P1)

As a Smithy maintainer, I want a formal fallback when dispatch-level usage is unavailable so that M1 can close without pretending per-sub-agent attribution exists.

**Why this priority**: The RFC allows parent-only fallback, but it must be explicitly closed so downstream features consume the correct measurement contract.

**Independent Test**: Use a parent-only capture classification and verify the RFC goal language and specification debt record are updated to state that per-sub-agent attribution is deferred beyond M1.

**Acceptance Scenarios**:

1. **Given** dispatch-level usage is unavailable, **When** this feature lands, **Then** the RFC goal language states that M1 relies on per-case totals and committed baselines.
2. **Given** dispatch-level usage is unavailable, **When** this feature lands, **Then** the RFC SD-001 row is resolved with the observed parent-only evidence.
3. **Given** dispatch-level usage is unavailable, **When** eval reports are formatted, **Then** no empty or misleading sub-agent token rows are rendered.

### Edge Cases

- A single sub-agent type may be dispatched more than once in one scenario; totals should aggregate by sub-agent display name for report readability.
- A usage record may appear before its matching tool result is observed; attribution must not depend on event order beyond the dispatch identifier relationship.
- A sub-agent dispatch may fail or return an error while still producing usage metadata; available tokens remain attributable.
- Some events may carry parent usage and dispatch usage in the same stream; attribution must avoid double-counting parent totals as sub-agent totals.
- Unknown agent names, missing descriptions, or non-string dispatch labels should fall back to a stable display name rather than failing report generation.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Verify Dispatch-Level Usage Evidence | — | — |
| US2 | Attribute Token Totals to Sub-Agent Dispatches | US1 | — |
| US3 | Render Nested Sub-Agent Token Rows | US2 | — |
| US4 | Document Parent-Only Fallback | US1 | — |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST classify the committed stream evidence as dispatch-attributable or parent-only before selecting the implementation path.
- **FR-002**: When dispatch-level usage exists, the system MUST represent per-sub-agent token totals as separate non-negative integer input and output counts.
- **FR-003**: When dispatch-level usage exists, each scenario result MUST carry zero or more per-sub-agent token totals.
- **FR-004**: Usage metadata MUST be attributed only when a reliable dispatch identifier relationship exists between the usage record and the sub-agent invocation.
- **FR-005**: Multiple dispatches for the same sub-agent within one scenario MUST aggregate into a single rendered sub-agent total.
- **FR-006**: Unattributable usage metadata MUST remain covered by the per-case token total and MUST NOT create a misleading sub-agent row.
- **FR-007**: Per-sub-agent attribution MUST NOT affect scenario pass, fail, timeout, or error status.
- **FR-008**: The formatted eval report MUST render nested per-sub-agent rows beneath each case that has attribution data.
- **FR-009**: The formatted eval report MUST omit nested attribution rows for cases with no attribution data.
- **FR-010**: Existing per-case token totals, baseline markers, and aggregate report status rendering MUST remain visible when nested rows render.
- **FR-011**: When evidence proves parent-only attribution, the implementation MUST update the RFC goal language and resolve RFC SD-001 instead of adding report fields that imply unavailable precision.
- **FR-012**: Unit tests MUST cover dispatch-attributable streams, parent-only streams, repeated sub-agent dispatches, malformed usage records, failed dispatches with usage, and rendering with mixed attributed and unattributed cases.

### Key Entities

- **SubAgentTokenTotals**: The per-scenario aggregate input and output token counts for one dispatched sub-agent display name.
- **DispatchUsageEvidence**: The classification record that determines whether a captured stream supports dispatch-level attribution or only parent-level totals.
- **Agent Dispatch**: The existing sub-agent invocation record used to map usage metadata back to a named helper.
- **Eval Result**: The per-case eval result extended with optional per-sub-agent token totals when evidence supports attribution.
- **Eval Report**: The aggregate eval report whose case rendering may include nested attribution rows.
- **Fallback Resolution**: The documentation-only closure path used when parent-only attribution is the observed stream contract.

## Assumptions

- Feature 1.3a has already introduced per-case token totals and the report rendering surface this feature extends.
- Dispatch-level attribution is only trustworthy when stream events carry a stable relationship to a specific Agent dispatch.
- Per-case totals are the authoritative cost signal in all paths; per-sub-agent totals are explanatory detail when available.
- Nested rows are sufficient for M2 and M3 reviewers because they preserve case-local context and do not require a new report mode.
- Resolving the parent-only fallback in documentation is an acceptable completed outcome for this feature under the RFC.

## Specification Debt

None - all ambiguities resolved.

## Out of Scope

- Per-sub-agent token baseline envelopes or committed per-agent baseline files.
- Changing F1.3a's per-case token extraction, per-case baseline comparison, or aggregate token totals contract.
- New eval scenarios for smithy.fix, smithy.forge, or JVM forge coverage.
- Sub-agent model downgrades, prompt cost reductions, or any M2/M3 optimization work.
- Public CLI flags or opt-in report modes for token detail.
- Inferring attribution from prompt text, result text, or event order when no stable dispatch identifier exists.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The committed capture evidence is classified as dispatch-attributable or parent-only.
- **SC-002**: If dispatch-attributable, scenario results include per-sub-agent input and output token totals.
- **SC-003**: If dispatch-attributable, formatted reports render nested sub-agent rows only for cases with attribution data.
- **SC-004**: If parent-only, the RFC goal language and SD-001 row are updated to document the post-M1 descope.
- **SC-005**: Per-case token totals and baseline markers continue to render in all attribution and fallback paths.
- **SC-006**: Unit tests cover attribution, fallback classification, aggregation, and mixed report rendering paths.

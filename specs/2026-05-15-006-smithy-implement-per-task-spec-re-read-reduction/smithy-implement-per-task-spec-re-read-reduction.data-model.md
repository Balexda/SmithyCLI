# Data Model: smithy.implement Per-Task Spec Re-Read Reduction

## Overview

This feature introduces no persistent storage changes. It defines transient planning and dispatch artifacts used during a forge run to replace repeated full planning-artifact reads with bounded task-specific context.

## Entities

### 1) Context Delivery Decision (`context_delivery_decision`)

Purpose: Records the measured comparison between candidate context-delivery strategies and the selected strategy for implementation.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `selected_strategy` | enum (`pre_pasted_excerpts`, `per_task_brief`) | Yes | The strategy selected after measurement. |
| `candidate_results` | list of MeasurementResult | Yes | One result per strategy and fixture combination. |
| `quality_summary` | string | Yes | Summary of structural-eval and sampled-review outcomes. |
| `rejection_reason` | string | No | Required when the lowest-token candidate is not selected. |
| `recorded_at` | date/time | Yes | When the decision was recorded for the implementation PR. |

Validation rules:

- The decision is invalid unless both candidate strategies have JS and JVM fixture measurements.
- The selected strategy must have no structural-eval regression.
- If a strategy has a sampled quality regression, it cannot be selected until the regression is resolved.

### 2) MeasurementResult (`measurement_result`)

Purpose: Captures token and quality evidence for one candidate strategy on one forge fixture.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `strategy` | enum (`pre_pasted_excerpts`, `per_task_brief`) | Yes | Candidate being measured. |
| `fixture` | enum (`js`, `jvm`) | Yes | Forge fixture measured against the M1 baseline. |
| `baseline_total_tokens` | integer | Yes | Total tokens from the matching M1 baseline. |
| `candidate_total_tokens` | integer | Yes | Total tokens from the candidate run. |
| `input_tokens` | integer | Yes | Candidate input tokens. |
| `output_tokens` | integer | Yes | Candidate output tokens. |
| `delta_percent` | decimal | Yes | Percent change from baseline. Negative means fewer tokens. |
| `structural_eval_result` | enum (`pass`, `fail`) | Yes | Candidate structural-eval result. |
| `sampled_review_result` | enum (`pass`, `fail`, `not_reviewed`) | Yes | Human sample result for the candidate. |

Validation rules:

- Token counts must be non-negative integers.
- `delta_percent` must be computed from the matching fixture baseline, not from another candidate.
- `sampled_review_result` cannot remain `not_reviewed` for the selected strategy.

### 3) Task Context Packet (`task_context_packet`)

Purpose: Supplies a single implementation task with bounded source-derived context so the task agent does not need to re-read the full planning artifact set for acceptance details.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `task_id` | string | Yes | Identifier or ordinal for the task being dispatched. |
| `slice_goal` | string | Yes | High-level goal shared by the task slice. |
| `acceptance_context` | list of text excerpts | Yes | Acceptance scenarios relevant to this task. |
| `requirement_context` | list of requirement references/summaries | Yes | Functional requirements relevant to this task. |
| `data_context` | list of text summaries | Yes | Relevant data-model notes, or an explicit empty-context marker. |
| `contract_context` | list of text summaries | Yes | Relevant contract notes, or an explicit empty-context marker. |
| `spec_debt_context` | list of debt references/summaries | No | Open debt items that affect this task. |
| `source_trace` | list of artifact references | Yes | Trace back to the source sections used to assemble the packet. |
| `bounded_size` | integer | Yes | Size of the packet in the measurement unit chosen during implementation. |

Validation rules:

- Every packet must include at least one acceptance-context entry unless the task is explicitly non-functional and the packet explains why.
- Empty data or contract context must be explicit, not omitted.
- `source_trace` must identify the originating artifact sections well enough for review.
- `bounded_size` must not exceed the implementation-defined packet bound; overflow must block or fall back to a documented safe path.

## Relationships

- One Context Delivery Decision has many MeasurementResults.
- One forge run creates one Task Context Packet per implementation task.
- Each Task Context Packet derives from the source spec, data model, contracts, and task list but does not replace them as authoritative artifacts.
- A Quality Review Sample references the Task Context Packet and implementation output it evaluates.

## State Transitions

### Context Delivery Decision lifecycle

1. `unmeasured` -> `measured`
   - Trigger: Both candidate strategies have JS and JVM fixture runs.
   - Effects: Candidate token and quality data is available for comparison.
2. `measured` -> `selected`
   - Trigger: A candidate passes quality gates and is chosen.
   - Effects: Implementation proceeds using the selected strategy.
3. `selected` -> `blocked`
   - Trigger: Later validation finds a structural or sampled quality regression.
   - Effects: The implementation PR cannot merge until the regression is resolved or a different strategy is selected.

### Task Context Packet lifecycle

1. `assembled` -> `dispatched`
   - Trigger: Forge prepares an implementation task.
   - Effects: The implementation agent receives the bounded context packet.
2. `dispatched` -> `accepted`
   - Trigger: The task completes and validation passes.
   - Effects: The packet is considered sufficient for that task.
3. `dispatched` -> `insufficient`
   - Trigger: The agent reports missing or contradictory context.
   - Effects: The task blocks or uses a documented safe fallback; the packet assembly rules are corrected before merge.

## Identity & Uniqueness

- A Context Delivery Decision is unique per feature implementation PR.
- A MeasurementResult is uniquely identified by `(strategy, fixture)` within the decision.
- A Task Context Packet is uniquely identified by `(forge_run, task_id)`.

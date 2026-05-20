# Data Model: Per-Sub-Agent Token Attribution

## Overview

This feature extends the eval report model with optional per-sub-agent token totals when the agent stream can reliably tie usage metadata to a sub-agent dispatch. The additions are transient report data only; no new persistent database or external storage is introduced. If the stream evidence is parent-only, the data model remains unchanged and the feature closes through the documented fallback path.

## Entities

### 1) DispatchUsageEvidence (`dispatch_usage_evidence`)

Purpose: Records whether the committed stream evidence supports per-sub-agent token attribution.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `classification` | enum | Yes | Either `dispatch_attributable` or `parent_only`. |
| `source_capture` | string | Yes | The committed capture reviewed for evidence. |
| `observed_relationship` | string | Yes | The stable event relationship used for attribution, or the reason no such relationship exists. |
| `reviewed_at` | string | Yes | ISO 8601 timestamp for the evidence review. |

Validation rules:

- The classification must be based on committed capture evidence.
- `dispatch_attributable` requires a stable identifier relationship between a usage record and a dispatch.
- `parent_only` requires a documented reason that dispatch-level attribution is unavailable.

### 2) SubAgentTokenTotals (`sub_agent_token_totals`)

Purpose: Represents measured token usage for one sub-agent within one eval scenario.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `agent` | string | Yes | Stable display name for the sub-agent. |
| `input` | integer | Yes | Non-negative input token count attributed to the sub-agent. |
| `output` | integer | Yes | Non-negative output token count attributed to the sub-agent. |
| `dispatch_count` | integer | Yes | Number of dispatches aggregated into this row. |

Validation rules:

- `agent` must be non-empty after fallback display-name resolution.
- `input`, `output`, and `dispatch_count` must be finite non-negative integers.
- Repeated dispatches for the same agent aggregate by `agent`.
- Unknown, malformed, or unattributable usage records are excluded from this entity.

### 3) DispatchUsageRecord (`dispatch_usage_record`)

Purpose: Transient normalized usage record tied to a specific sub-agent dispatch before aggregation.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `dispatch_id` | string | Yes | Stable identifier for the associated sub-agent dispatch. |
| `agent` | string | Yes | Display name derived from the dispatch metadata. |
| `input` | integer | Yes | Non-negative input token count for this record. |
| `output` | integer | Yes | Non-negative output token count for this record. |

Validation rules:

- A record is created only when `dispatch_id` can be matched to a known dispatch.
- Invalid token values are ignored rather than coerced.
- Records for failed dispatches remain valid when usage metadata is otherwise parseable.

### 4) EvalResult (`eval_result`)

Purpose: Existing per-case report result extended with optional sub-agent token totals.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `sub_agent_tokens` | SubAgentTokenTotals[] | No | Present only when at least one sub-agent has attributed usage totals. |

Validation rules:

- Absence means no attribution data is available for the case.
- An empty array should be omitted to avoid implying an explicit zero-cost attribution set.
- Scenario status is independent of this field.

### 5) EvalReport (`eval_report`)

Purpose: Existing aggregate report that renders optional nested attribution rows for each result.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `results[].sub_agent_tokens` | SubAgentTokenTotals[] | No | Per-case attribution data consumed by report formatting. |

Validation rules:

- Report aggregation preserves per-result attribution arrays without computing a cross-case per-agent total.
- Rendering order follows the scenario result order, then stable agent-name order within each result.
- Cases with no attribution data render no nested attribution rows.

## Relationships

- `DispatchUsageEvidence` 1:1 implementation path selection for the feature.
- `Agent Dispatch` 1:N `DispatchUsageRecord` via dispatch identifier matching.
- `DispatchUsageRecord` N:1 `SubAgentTokenTotals` via per-scenario aggregation by agent display name.
- `SubAgentTokenTotals` N:1 `EvalResult` as optional per-case attribution detail.
- `EvalResult` N:1 `EvalReport` through the existing report aggregation flow.

## State Transitions

### Evidence lifecycle

1. `unreviewed` -> `classified`
   - Trigger: committed capture evidence is inspected.
   - Effects: the feature selects either the attribution implementation path or the parent-only fallback path.

2. `classified` -> `resolved`
   - Trigger: implementation or documentation fallback lands.
   - Effects: RFC SD-001 is either proven supported by implementation or resolved as parent-only fallback.

### Attribution lifecycle

1. `raw_usage` -> `matched`
   - Trigger: a usage record is tied to a known dispatch identifier.
   - Effects: a dispatch usage record is created.

2. `matched` -> `aggregated`
   - Trigger: all records for one scenario are grouped by sub-agent display name.
   - Effects: per-agent input, output, and dispatch counts are summed.

3. `aggregated` -> `rendered`
   - Trigger: the eval report is formatted.
   - Effects: nested attribution rows appear beneath the owning scenario case line.

## Identity & Uniqueness

- A dispatch usage record is uniquely identified by scenario name, dispatch identifier, and the source usage event.
- A sub-agent token total is uniquely identified by scenario name and sub-agent display name.
- Evidence classification is unique per feature implementation because only one path can close the feature.

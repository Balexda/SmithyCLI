# Data Model: Per-Case Token Totals in EvalReport

## Overview

This feature extends the existing eval report data model with additive token usage fields. It introduces a reusable token-count value object, carries those totals through per-scenario and aggregate report entities, and adds an optional token envelope to committed baselines. No persistent database or external storage is introduced.

## Entities

### 1) TokenTotals (`token_totals`)

Purpose: Represents measured token usage for a single scenario run or aggregate report.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `input` | integer | Yes | Non-negative input token count. Defaults to `0` when no usable usage metadata is observed. |
| `output` | integer | Yes | Non-negative output token count. Defaults to `0` when no usable usage metadata is observed. |

Validation rules:

- Values must be finite non-negative integers.
- Missing, null, non-numeric, negative, or non-finite source usage values are ignored during extraction.
- Aggregate totals are computed by summing per-case totals.

### 2) TokenEnvelope (`token_envelope`)

Purpose: Defines the accepted token range for a committed baseline.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `input` | object | No | Optional accepted range for input tokens. |
| `input.min` | integer | Conditional | Non-negative lower bound when `input` is present. |
| `input.max` | integer | Conditional | Non-negative upper bound when `input` is present. Must be greater than or equal to `input.min`. |
| `output` | object | No | Optional accepted range for output tokens. |
| `output.min` | integer | Conditional | Non-negative lower bound when `output` is present. |
| `output.max` | integer | Conditional | Non-negative upper bound when `output` is present. Must be greater than or equal to `output.min`. |

Validation rules:

- A token envelope may define input, output, or both ranges.
- When a range is present, both `min` and `max` are required.
- Bounds must be finite non-negative integers.
- Structural-only baselines remain valid when the token envelope is absent.

### 3) StreamEvent (`stream_event`)

Purpose: Existing loose-typed representation of a single agent stream event. This feature permits optional usage metadata on stream events without making the stream parser depend on a fixed event union.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `usage` | object | No | Optional raw usage payload from the agent stream. Unknown extra fields remain allowed. |
| `usage.input_tokens` | number | No | Source input token count when present and valid. |
| `usage.output_tokens` | number | No | Source output token count when present and valid. |

Validation rules:

- Stream parsing preserves unknown event fields.
- Usage extraction reads only supported numeric usage fields.
- Invalid usage values do not invalidate the stream event.

### 4) RunOutput (`run_output`)

Purpose: Existing per-scenario runner output extended with measured token totals derived from stream events.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `tokens` | TokenTotals | Yes | Summed token totals for the scenario run. |

Validation rules:

- `tokens` is present for successful, failing, timeout, and error runs.
- The value is derived from parseable stream events; when events cannot be parsed, it defaults to zero totals.

### 5) EvalResult (`eval_result`)

Purpose: Existing per-case report result extended with token totals.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `tokens` | TokenTotals | Yes | Token totals copied from the scenario run output. |

Validation rules:

- Token totals do not determine scenario status.
- Token totals are preserved whether structural, sub-agent, or baseline checks pass or fail.

### 6) EvalReport (`eval_report`)

Purpose: Existing aggregate report extended with total token counts across all case results.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `tokens` | TokenTotals | Yes | Sum of every included result's token totals. |

Validation rules:

- Empty reports have zero input and output totals.
- Aggregate token totals are deterministic for a given ordered result set.

### 7) Baseline (`baseline`)

Purpose: Existing committed scenario baseline extended with an optional token envelope.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `token_envelope` | TokenEnvelope | No | Optional accepted token range for the scenario. Absence means token comparison is skipped. |

Validation rules:

- Existing baseline fields remain required.
- Unknown extra fields remain ignored unless they are part of the token envelope contract.
- A malformed token envelope makes the baseline invalid because it would produce misleading drift checks.

## Relationships

- `StreamEvent` N:1 `RunOutput` via token extraction and summation.
- `RunOutput` 1:1 `EvalResult` via result assembly.
- `EvalResult` N:1 `EvalReport` via report aggregation.
- `Baseline` 0..1:1 `TokenEnvelope` via optional baseline token bounds.
- `TokenEnvelope` 1:1 `Baseline Check Result` when token comparison runs.

## State Transitions

### Token measurement lifecycle

1. `unobserved` -> `extracted`
   - Trigger: stream events are parsed after a scenario run.
   - Effects: valid usage values are summed into `TokenTotals`.

2. `extracted` -> `reported`
   - Trigger: the scenario run is converted to an eval result and then an aggregate report.
   - Effects: per-case and aggregate token totals are available to report formatting.

3. `reported` -> `compared`
   - Trigger: a matching baseline with a token envelope is loaded.
   - Effects: token envelope pass/fail is emitted as a baseline check result.

### Baseline schema lifecycle

1. `structural_only` -> `token_aware`
   - Trigger: a baseline is refreshed after F1.3a lands.
   - Effects: the baseline keeps its structural expectations and adds a token envelope.

2. `token_aware` -> `recalibrated`
   - Trigger: repeated clean runs show the initial envelope is too narrow or too broad.
   - Effects: token envelope bounds are adjusted in a follow-up baseline update.

## Identity & Uniqueness

- A scenario's live token totals are identified by the scenario name within a single eval run.
- A baseline token envelope is identified by the baseline's scenario name.
- Aggregate report token totals are identified by the report timestamp and result set.

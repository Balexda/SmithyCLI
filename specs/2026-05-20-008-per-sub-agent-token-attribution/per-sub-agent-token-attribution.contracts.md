# Contracts: Per-Sub-Agent Token Attribution

## Overview

This feature extends eval-framework contracts at the stream evidence, attribution, result assembly, and report rendering boundaries. The contracts are conditional: if committed evidence supports dispatch-level attribution, optional attribution data flows through the report. If evidence proves parent-only attribution, report contracts remain on the F1.3a per-case token surface and the feature closes through RFC documentation updates.

## Interfaces

### 1) Dispatch Usage Evidence Classification

**Purpose**: Determines whether the agent stream supports per-sub-agent attribution.
**Consumers**: Feature implementation and RFC debt closure.
**Providers**: Committed eval stream captures.

#### Signature

```ts
classifyDispatchUsageEvidence(events: StreamEvent[]): DispatchUsageEvidence
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `events` | StreamEvent[] | Yes | Parsed committed capture events from a representative eval scenario. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `classification` | enum | `dispatch_attributable` when stable dispatch-level usage exists; otherwise `parent_only`. |
| `source_capture` | string | The committed capture path reviewed for evidence. |
| `observed_relationship` | string | The relationship used for attribution, or the reason attribution is unavailable. |
| `reviewed_at` | string | ISO 8601 timestamp recorded when the classification was made. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Capture has no usage metadata | Return `parent_only` with missing-usage rationale. | The implementation must not invent attribution. |
| Capture has ambiguous identifiers | Return `parent_only` with ambiguity rationale. | Ambiguous data is not sufficient for per-agent reporting. |
| Capture has stable dispatch identifiers | Return `dispatch_attributable`. | The attribution path may proceed. |

### 2) Sub-Agent Token Attribution

**Purpose**: Converts dispatch-attributable usage records into per-sub-agent token totals for one scenario.
**Consumers**: Scenario result assembly and report rendering.
**Providers**: Parsed stream events and extracted sub-agent dispatches.

#### Signature

```ts
extractSubAgentTokenTotals(events: StreamEvent[]): SubAgentTokenTotals[]
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `events` | StreamEvent[] | Yes | Parsed stream events for one scenario run. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `agent` | string | Stable sub-agent display name. |
| `input` | integer | Summed attributed input token count. |
| `output` | integer | Summed attributed output token count. |
| `dispatch_count` | integer | Count of dispatches represented by the aggregate row. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| No dispatch-level usage exists | Return an empty list. | Per-case totals remain authoritative. |
| Usage value is malformed | Ignore that value and continue. | Invalid usage must not fail the scenario. |
| Dispatch name is missing | Use a stable fallback display name. | Rendering remains deterministic. |
| Dispatch failed with usage present | Include the usage. | Cost reporting does not depend on pass status. |

#### Attribution Rule

The extractor MUST create sub-agent totals only from usage records that can be matched to a known sub-agent dispatch through a stable dispatch identifier relationship. Parent-level usage records, terminal per-case totals, and usage records without a reliable dispatch relationship MUST NOT be included in `sub_agent_tokens`.

### 3) Scenario Result Assembly

**Purpose**: Carries optional per-sub-agent token totals into the per-case eval result.
**Consumers**: Report aggregation and report formatting.
**Providers**: Scenario runner output and attribution extraction.

#### Signature

```ts
scenarioRunToResult(
  scenario: EvalScenario,
  output: RunOutput,
  structuralChecks: CheckResult[],
  subAgentChecks?: CheckResult[],
  baselineChecks?: CheckResult[],
  subAgentTokens?: SubAgentTokenTotals[],
): EvalResult
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subAgentTokens` | SubAgentTokenTotals[] | No | Optional attribution totals for the scenario. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `sub_agent_tokens` | SubAgentTokenTotals[] | Present only when the input contains one or more attribution rows. |
| `status` | enum | Existing status behavior is preserved. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Attribution input is absent | Omit `sub_agent_tokens`. | Existing reports remain compatible. |
| Attribution input is empty | Omit `sub_agent_tokens`. | Empty sections are not rendered. |
| Scenario fails, errors, or times out | Preserve any supplied attribution rows. | Available usage remains useful for cost analysis. |

### 4) Report Rendering

**Purpose**: Renders nested per-sub-agent token rows under case lines when attribution data exists.
**Consumers**: CLI users running evals and downstream reviewers reading token deltas.
**Providers**: Eval reports containing per-case results.

#### Signature

```ts
formatReport(report: EvalReport): string
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `results[].sub_agent_tokens` | SubAgentTokenTotals[] | No | Optional per-case attribution rows. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| formatted nested row | string | A sub-agent display name plus `input: <N>, output: <N>` rendered beneath the owning case. |

#### Rendering Contract

Each nested attribution row uses this semantic shape:

```text
    <agent>: input: <non-negative integer>, output: <non-negative integer>
```

Rows render directly below their owning scenario case line. They render only for cases with one or more attribution rows. Existing case-line status tokens, per-case token totals, durations, baseline markers, total elapsed line, and final result line remain present.

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| No case has attribution data | Render no nested attribution rows. | F1.3a report shape remains stable. |
| Some cases have attribution data | Render rows only for those cases. | Mixed reports stay compact. |
| Attribution row has zero totals | Render it only if it came from a matched dispatch. | Zero can mean observed usage of zero, not missing evidence. |

### 5) Parent-Only Fallback Closure

**Purpose**: Defines the documentation contract when dispatch-level attribution is unavailable.
**Consumers**: RFC readers and downstream feature authors.
**Providers**: Evidence classification.

#### Signature

```text
resolveParentOnlyFallback(evidence: DispatchUsageEvidence) -> DocumentationUpdate
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `evidence.classification` | enum | Yes | Must be `parent_only` for this path. |
| `evidence.observed_relationship` | string | Yes | Explanation of why dispatch-level attribution is unavailable. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| RFC goal update | markdown change | States that M1 relies on per-case totals and baselines while per-sub-agent attribution is deferred. |
| RFC SD-001 resolution | markdown change | Records the observed parent-only stream contract. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Evidence is dispatch-attributable | Do not use fallback. | The implementation path should ship attribution. |
| Evidence is parent-only | Apply documentation closure. | The feature closes without misleading report fields. |

## Events / Hooks

No new external events or hooks are introduced. Attribution is derived from existing stream events and carried through the existing eval report pipeline.

## Integration Boundaries

- **Agent stream output**: usage metadata is consumed only when it can be reliably tied to a dispatch identifier.
- **Eval result assembly**: attribution data is optional and additive; scenario status semantics remain unchanged.
- **Eval report stdout**: nested attribution rows extend the report only for cases with attribution data.
- **RFC governance**: the parent-only fallback path updates the RFC goal and SD-001 resolution instead of changing report output.

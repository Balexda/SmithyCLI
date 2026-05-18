# Contracts: Per-Case Token Totals in EvalReport

## Overview

This feature extends existing eval-framework contracts in three places: stream usage extraction, report result aggregation/rendering, and baseline comparison. The contracts are additive and preserve compatibility with existing structural-only baselines and report status semantics.

## Interfaces

### 1) Stream Usage Extraction

**Purpose**: Converts raw stream usage metadata into normalized token totals.
**Consumers**: Scenario runner output assembly and report result assembly.
**Providers**: Parsed stream events emitted by the configured agent CLI.

#### Signature

```ts
extractTokenTotals(events: StreamEvent[]): TokenTotals
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `events` | StreamEvent[] | Yes | Parsed stream events from one scenario run. Events may or may not include usage metadata. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `input` | integer | Summed non-negative input token count. |
| `output` | integer | Summed non-negative output token count. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| No usage metadata exists | Return zero totals. | Missing usage is not a scenario failure. |
| Usage metadata is malformed | Ignore malformed fields and continue. | Unknown stream shapes remain tolerated. |
| Events are empty | Return zero totals. | Empty or unparsable output can still produce a valid error result. |

### 2) Scenario Result Assembly

**Purpose**: Carries token totals from a scenario run into the per-case eval result.
**Consumers**: Report aggregation, report formatting, and baseline comparison.
**Providers**: Scenario runner output and validation checks.

#### Signature

```ts
scenarioRunToResult(
  scenario: EvalScenario,
  output: RunOutput,
  structuralChecks: CheckResult[],
  subAgentChecks?: CheckResult[],
  baselineChecks?: CheckResult[],
): EvalResult
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `output.tokens` | TokenTotals | Yes | Token totals for the scenario run. |
| `structuralChecks` | CheckResult[] | Yes | Existing structural validation results. |
| `subAgentChecks` | CheckResult[] | No | Existing sub-agent evidence validation results. |
| `baselineChecks` | CheckResult[] | No | Existing baseline validation results, including token checks when applicable. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `tokens` | TokenTotals | Token totals copied into the per-case result. |
| `status` | enum | Existing status behavior is preserved. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Scenario timed out | Preserve token totals and return timeout status. | Available usage remains useful for cost analysis. |
| Scenario exited non-zero | Preserve token totals and return error status. | Cost reporting does not depend on pass status. |
| Validation checks fail | Preserve token totals and return fail status. | Token totals are orthogonal to structural correctness. |

### 3) Report Aggregation and Rendering

**Purpose**: Aggregates per-case token totals and renders them in the eval summary.
**Consumers**: CLI users running evals and downstream token-delta tooling.
**Providers**: Per-case eval results.

#### Signature

```ts
buildReport(results: EvalResult[], totalDurationMs: number): EvalReport
formatReport(report: EvalReport): string
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `results[].tokens` | TokenTotals | Yes | Per-case token totals to sum and render. |
| `totalDurationMs` | integer | Yes | Existing aggregate run duration. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `report.tokens` | TokenTotals | Aggregate input and output token totals. |
| formatted case line | string | Includes status, scenario name, duration, token totals, and baseline marker when applicable. |

#### Rendering Contract

Each per-case line includes token totals in this semantic shape:

```text
input: <non-negative integer>, output: <non-negative integer>
```

The exact placement may follow the existing duration and baseline marker conventions, but the status token, scenario name, duration, baseline marker, total elapsed line, and final result line remain present.

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Empty result set | Aggregate token totals are zero. | Existing empty-report behavior remains well formed. |
| Some cases lack baselines | Render token totals for every case and baseline markers according to existing baseline rules. | No-baseline scenarios stay readable. |

### 4) Token-Aware Baseline Loading

**Purpose**: Loads committed baselines with an optional token envelope while preserving structural-only compatibility.
**Consumers**: Baseline comparison and report result assembly.
**Providers**: JSON files under the baseline directory.

#### Signature

```ts
loadBaseline(scenarioName: string, baselinesDir?: string): Baseline | null
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scenarioName` | string | Yes | Scenario name used to locate the baseline file. |
| `token_envelope` | TokenEnvelope | No | Optional token bounds in the loaded JSON object. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `Baseline` | object | Existing structural baseline fields plus optional token envelope. |
| `null` | null | Returned when no baseline file exists. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Baseline has no token envelope | Load successfully. | Token comparison is optional. |
| Token envelope has invalid bounds | Throw a descriptive baseline validation error. | Invalid cost bounds would make drift checks misleading. |
| Baseline has unknown extra fields | Ignore unknown fields. | Forward compatibility is preserved. |

### 5) Token Baseline Comparison

**Purpose**: Emits token drift checks when a baseline defines a token envelope.
**Consumers**: Scenario result assembly and formatted baseline marker.
**Providers**: Live token totals and loaded baseline.

#### Signature

```ts
compareToBaseline(output: string, baseline: Baseline, tokens?: TokenTotals): CheckResult[]
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `output` | string | Yes | Existing live extracted text used for structural comparison. |
| `baseline` | Baseline | Yes | Loaded baseline with structural expectations and optional token envelope. |
| `tokens` | TokenTotals | Conditional | Required for token comparison when the baseline includes a token envelope. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `CheckResult[]` | array | Existing structural checks plus one token envelope check when applicable. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Baseline has no token envelope | Emit only structural checks. | Backward compatibility path. |
| Baseline has token envelope but no live tokens are supplied | Emit a failing token check. | A token-aware baseline requires live measured totals. |
| Live tokens exceed envelope | Emit a failing token check with expected bounds and actual totals. | The formatted report's baseline marker becomes failing through existing rules. |
| Live tokens are inside envelope | Emit a passing token check. | Structural checks still determine their own pass/fail independently. |

## Events / Hooks

No new events or hooks are introduced. Token totals are derived from the existing stream-event flow and are carried through the existing eval report pipeline.

## Integration Boundaries

- **Agent stream output**: usage metadata is consumed from the existing stream-json boundary. Unknown event fields remain tolerated.
- **Filesystem baseline files**: baseline JSON remains the committed storage mechanism; token envelopes are optional additions to the existing shape.
- **Eval report stdout**: report formatting adds token totals to per-case lines while preserving existing status and summary semantics.
- **Downstream token-delta work**: later M2/M3 features consume the token totals and token-aware baselines produced here, but no downstream protocol is implemented by F1.3a.

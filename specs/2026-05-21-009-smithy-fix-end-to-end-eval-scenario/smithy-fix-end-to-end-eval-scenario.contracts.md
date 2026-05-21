# Contracts: smithy.fix End-to-End Eval Scenario

## Overview

This feature touches the eval scenario, fixture-validation, runner invocation, sub-agent evidence, and baseline comparison boundaries. The contracts keep the scenario offline: all issue and CI-log context comes from committed fixtures, and token reporting reuses the F1.3a baseline and report contracts.

## Interfaces

### 1) Fix Scenario Definition

**Purpose**: Defines the declarative scenario consumed by the eval loader.
**Consumers**: Scenario loader, eval runner, report builder.
**Providers**: Committed scenario YAML.

#### Signature

```ts
type FixScenarioDefinition = EvalScenario & {
  name: string
  skill: '/smithy.fix'
  prompt: string
  structural_expectations: StructuralExpectations
  sub_agent_evidence: SubAgentEvidence[]
}
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Stable scenario name for reports and baseline lookup. |
| `skill` | string | Yes | Smithy command invoked by the scenario. |
| `prompt` | string | Yes | Offline issue and CI-log instructions passed to smithy.fix. |
| `structural_expectations` | StructuralExpectations | Yes | Output-shape checks for the fix workflow. |
| `sub_agent_evidence` | SubAgentEvidence[] | Yes | Helper evidence checks expected for the CI-log path. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `EvalScenario` | object | Loaded scenario passed to the runner. |
| `scenario_name` | string | Name used for result and baseline association. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Required fixture reference is missing from the prompt | Reject or fail validation before execution. | The eval must not run with ambiguous live-data fallback. |
| `sub_agent_evidence` is empty | Reject or fail validation. | F1.4 requires helper evidence for fix coverage. |
| Scenario name collides with another scenario | Skip or reject according to existing loader behavior. | Baseline lookup must remain unambiguous. |

### 2) Offline Fixture Availability

**Purpose**: Verifies that the scenario's committed issue and CI-log inputs exist before smithy.fix is invoked.
**Consumers**: Eval runner and scenario validation tests.
**Providers**: Committed fixture files.

#### Signature

```ts
validateFixFixtures(issuePath: string, ciLogPath: string): FixtureValidationResult
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issuePath` | string | Yes | Repo-relative path to the offline issue fixture. |
| `ciLogPath` | string | Yes | Repo-relative path to the offline CI-log fixture. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Whether both fixtures are present and readable. |
| `issue` | OfflineIssueFixture | Parsed or loaded issue context when valid. |
| `ci_log` | OfflineCiLogFixture | Loaded CI-log context when valid. |
| `errors` | string[] | Human-readable validation failures. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Issue fixture is missing | Return `ok: false` with missing issue error. | The scenario cannot run deterministically. |
| CI-log fixture is missing | Return `ok: false` with missing log error. | The high-cost path cannot be exercised. |
| Fixture exists but is empty | Return `ok: false` with empty fixture error. | Empty inputs would produce misleading pass/fail results. |

### 3) smithy.fix Offline Invocation

**Purpose**: Defines how the scenario invokes smithy.fix without live GitHub lookup.
**Consumers**: Eval runner.
**Providers**: Scenario prompt and committed fixtures.

#### Signature

```text
/smithy.fix <offline issue and CI-log instructions>
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Offline issue context | markdown/text | Yes | Issue title, body, and relevant metadata from the fixture. |
| Offline CI-log context | text | Yes | Failing check log content from the fixture. |
| Network policy | enum | Yes | Scenario instruction that live GitHub calls are not part of the eval. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| Canonical output | string | smithy.fix response extracted from the agent stream. |
| Stream events | StreamEvent[] | Raw parsed events used for helper evidence and token totals. |
| Exit status | integer | Process result used to classify pass, fail, timeout, or error. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| smithy.fix requests live GitHub data | Scenario fails structural or forbidden-pattern validation. | The eval must remain offline. |
| smithy.fix cannot act on the fixture | Scenario reports fail or diagnostic output according to structural expectations. | This is a legitimate regression signal. |
| Agent exits non-zero | Scenario status is `error`. | Existing runner status rules apply. |

### 4) Helper Evidence Validation

**Purpose**: Confirms that expected helper behavior appears in the fix run.
**Consumers**: Eval report builder and sub-agent check logic.
**Providers**: Parsed stream events and configured evidence patterns.

#### Signature

```ts
validateSubAgentEvidence(events: StreamEvent[], evidence: SubAgentEvidence[]): CheckResult[]
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `events` | StreamEvent[] | Yes | Parsed stream events from the fix scenario run. |
| `evidence` | SubAgentEvidence[] | Yes | Expected helper markers configured in the scenario. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `check_name` | string | Helper evidence check identifier. |
| `passed` | boolean | Whether the marker was observed. |
| `expected` | string | Expected helper/pattern pair. |
| `actual` | string | Observed evidence or missing marker description. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Expected helper marker is absent | Return a failing check. | Missing fix orchestration is visible in the report. |
| Stream contains no helper events | Return failing checks for all expected helpers. | The scenario should not silently pass without helper evidence. |
| Pattern is invalid | Fail scenario validation before execution. | Runtime regex failures should not make report output nondeterministic. |

### 5) Fix Baseline Comparison

**Purpose**: Compares the fix scenario result against the committed token-aware baseline.
**Consumers**: Eval report builder and contributors reading eval output.
**Providers**: Fix baseline file and live scenario result.

#### Signature

```ts
compareFixToBaseline(result: EvalResult, baseline: FixBaseline): CheckResult[]
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `result` | EvalResult | Yes | Live fix scenario result with structural checks and token totals. |
| `baseline` | FixBaseline | Yes | Committed known-good baseline for the fix scenario. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| Structural check results | CheckResult[] | Existing heading/table baseline checks. |
| Token check result | CheckResult | F1.3a token-envelope comparison. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Baseline is missing | Render baseline as unavailable according to existing report behavior. | Scenario can still run, but F1.4 is not complete. |
| Baseline scenario name differs | Fail baseline comparison. | Prevents accidental comparison to another scenario. |
| Token totals exceed envelope | Return failing token check with expected and actual values. | Material token drift is visible. |

## Events / Hooks

No new external events or hooks are introduced. The scenario consumes committed fixture files and existing agent stream events only.

## Integration Boundaries

- **Scenario loader**: loads the new fix scenario and rejects malformed structural or helper evidence fields through the existing scenario-validation contract.
- **Fixture files**: provide issue and CI-log context that replaces live GitHub lookups for this eval.
- **smithy.fix invocation**: receives fixture context through the scenario prompt and must not depend on live GitHub APIs to complete.
- **Sub-agent evidence checks**: validate helper behavior from parsed stream events.
- **Baseline comparison**: uses the F1.3a token-aware baseline schema so structural and token drift both appear in eval reports.

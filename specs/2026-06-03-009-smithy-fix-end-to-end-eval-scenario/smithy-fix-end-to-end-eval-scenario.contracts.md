# Contracts: smithy.fix End-to-End Eval Scenario

## Overview

This feature introduces a local-fixture contract for eval scenarios that need committed evidence files, then uses it to run smithy.fix against offline issue and CI-log inputs. The contracts are additive to the existing scenario loader, runner invocation, validation, and baseline flows.

## Interfaces

### 1) Scenario Local Fixture Declaration

**Purpose**: Allows a scenario YAML file to declare local evidence files required for invocation.
**Consumers**: Scenario loader, eval runner, scenario tests.
**Providers**: Scenario YAML files under the eval cases directory.

#### Signature

```yaml
local_fixtures:
  issue: evals/fixture/issues/issue-001.md
  ci_log: evals/fixture/ci-logs/run-001.log
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `local_fixtures.issue` | string | Yes | Repository-relative path to the issue fixture. |
| `local_fixtures.ci_log` | string | Yes | Repository-relative path to the CI-log fixture. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `EvalScenario.local_fixtures` | object | Validated fixture declaration attached to the loaded scenario. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Field is absent on scenarios that do not need local evidence | Load without fixture injection. | Existing scenarios remain compatible. |
| Field is malformed | Skip or reject the scenario with a validation error naming the field. | A malformed declaration cannot produce a deterministic invocation. |
| Path escapes the allowed fixture area | Reject the scenario with a validation error. | Prevents arbitrary file reads through scenario metadata. |
| Declared file does not exist or is unreadable | Fail scenario loading or invocation setup with a clear path-specific error. | Missing fixture evidence is a scenario authoring bug. |

### 2) Local Fixture Prompt Injection

**Purpose**: Renders resolved local fixture paths into the smithy.fix invocation.
**Consumers**: Eval runner invocation builder and smithy.fix scenario prompt.
**Providers**: Loaded scenario metadata and repository fixture files.

#### Signature

```ts
buildInvocation(
  scenario: EvalScenario,
  agent: EvalAgent,
  fixtureBindings?: LocalFixtureBindings,
): string
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scenario.prompt` | string | Yes | Prompt template or prompt text for the scenario. |
| `fixtureBindings.issue_path` | string | Conditional | Resolved path to the local issue fixture when declared. |
| `fixtureBindings.ci_log_path` | string | Conditional | Resolved path to the local CI-log fixture when declared. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| invocation | string | Agent-specific command input that tells smithy.fix to use the local issue and CI-log fixture evidence. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Scenario declares fixtures but bindings are unavailable | Fail before spawning the agent. | The command should not start with unresolved local evidence. |
| Binding path cannot be read in the execution context | Fail before spawning the agent. | smithy.fix must not fall back to live GitHub data by accident. |
| Agent-specific invocation format differs | Preserve existing slash-command or skill-name wrapping and inject fixture references inside the prompt body. | Fixture injection must work for supported eval agents. |

### 3) Offline smithy.fix Scenario Definition

**Purpose**: Defines the committed smithy.fix case and its validation expectations.
**Consumers**: Scenario loader, eval runner, report builder, baseline comparator.
**Providers**: `fix-from-issue` scenario YAML and committed fixture files.

#### Signature

```yaml
name: fix-from-issue
skill: /smithy.fix
prompt: |
  Diagnose and fix the issue described in the local fixture evidence.
  Issue fixture: {{issue_path}}
  CI log fixture: {{ci_log_path}}
local_fixtures:
  issue: evals/fixture/issues/issue-001.md
  ci_log: evals/fixture/ci-logs/run-001.log
structural_expectations:
  required_headings: [...]
sub_agent_evidence:
  - agent: <observed-helper>
    pattern: <stable-evidence-pattern>
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Stable scenario name used for reporting and baseline lookup. |
| `skill` | string | Yes | Smithy command under test. |
| `prompt` | string | Yes | Prompt that names local fixture evidence. |
| `local_fixtures` | object | Yes | Local issue and CI-log fixture declaration. |
| `structural_expectations` | object | Yes | Existing structural validation rules. |
| `sub_agent_evidence` | array | Conditional | Helper evidence checks for the observed smithy.fix path. Required only when the captured run actually dispatches helper agents; for the offline error-description path, which may dispatch none, this is empty or omitted. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `EvalResult` | object | Standard per-case result with status, structural checks, helper checks, duration, and token totals once F1.3a is present. |
| `EvalReport` case line | string | Standard report row for `fix-from-issue`, including baseline marker and token totals after baseline creation. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| smithy.fix attempts to require live GitHub access | Scenario fails because the offline contract was not honored. | The eval must remain runnable without credentials. |
| Structural marker is missing | Structural check fails. | The report should expose workflow regressions. |
| A declared helper evidence check is missing from the run | That helper evidence check fails. | The report should expose dispatch-path regressions. A run that legitimately dispatches no helpers declares no checks and does not fail on this condition. |
| Scenario times out or exits non-zero | Standard eval timeout/error status applies while preserving captured output and tokens. | Existing runner behavior remains authoritative. |

### 4) Fix Baseline Contract

**Purpose**: Stores and compares the known-good smithy.fix scenario output and token envelope.
**Consumers**: Baseline loader, baseline comparator, report formatter, downstream token-delta work.
**Providers**: Committed baseline JSON for `fix-from-issue`.

#### Signature

```json
{
  "scenario_name": "fix-from-issue",
  "captured_at": "2026-06-03T00:00:00.000Z",
  "headings": ["..."],
  "tables": [],
  "token_envelope": {
    "input": { "min": 0, "max": 0 },
    "output": { "min": 0, "max": 0 }
  }
}
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scenario_name` | string | Yes | Must match the scenario name `fix-from-issue`. |
| `headings` | string[] | Yes | Structural headings expected from the known-good run. |
| `tables` | array | No | Structural table expectations when present. |
| `token_envelope` | object | Yes | Token bounds using the F1.3a schema. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `Baseline` | object | Loaded structural and token baseline for the smithy.fix scenario. |
| `CheckResult[]` | array | Structural checks plus token envelope check when compared with a live run. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Baseline is absent before the capture slice lands | Scenario can run without a baseline marker. | Baseline creation is the final story for this feature. |
| Baseline scenario name mismatches | Reject the baseline. | Prevents comparing a run against the wrong committed envelope. |
| Token envelope is malformed | Reject the baseline using F1.3a validation rules. | Invalid token bounds would make downstream deltas misleading. |
| Live output drifts from structural baseline | Emit failing structural baseline checks. | Existing baseline semantics apply. |
| Live token totals exceed envelope | Emit a failing token check. | Downstream token regressions become visible in the eval report. |

## Events / Hooks

No new runtime events or hooks are introduced. The feature uses the existing eval scenario load, runner invocation, validation, report, and baseline comparison flow.

## Integration Boundaries

- **Scenario YAML boundary**: adds optional `local_fixtures` metadata while preserving compatibility for scenarios that omit it.
- **Filesystem fixture boundary**: reads committed issue and CI-log evidence from the eval fixture area only.
- **Runner invocation boundary**: injects resolved local fixture references into the prompt before spawning the selected agent.
- **smithy.fix command boundary**: exercises smithy.fix through its normal user-facing invocation path with local evidence text, without live GitHub calls.
- **Baseline boundary**: consumes the token-aware baseline schema from F1.3a and commits a `fix-from-issue` baseline for downstream token-delta work.

# Contracts: smithy.forge End-to-End Eval Scenario + Runner git-init

## Overview

This feature introduces an explicit git requirement contract for eval scenarios that need repository operations, then uses it to run smithy.forge against the existing JavaScript fixture. The contracts are additive to the existing scenario loader, runner invocation, validation, and baseline flows.

## Interfaces

### 1) Scenario Git Requirement Declaration

**Purpose**: Allows a scenario YAML file to declare that its temp execution copy must be a git repository.
**Consumers**: Scenario loader, eval runner, scenario tests.
**Providers**: Scenario YAML files under the eval cases directory.

#### Signature

```yaml
requires_git: true
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `requires_git` | boolean | No | True when the scenario command performs git operations inside the temp copy. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `EvalScenario.requires_git` | boolean | Loaded scenario flag. Defaults to false when omitted. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Field is absent | Load the scenario with no explicit git requirement and do not request runner git setup. | Existing scenarios remain compatible. |
| Field is non-boolean | Skip or reject the scenario with a validation error naming `requires_git`. | The runner must not infer git behavior from malformed metadata. |
| Field is true but git initialization fails | Fail before spawning the agent with a clear runner error. | A forge scenario cannot produce deterministic output without git. |

### 2) Temp-Copy Git Initialization

**Purpose**: Prepares the copied fixture as a clean git repository before spawning scenarios that require git.
**Consumers**: Eval runner and forge scenario.
**Providers**: Runner filesystem and git subprocess orchestration.

#### Signature

```ts
runScenario(
  scenario: EvalScenario,
  fixtureDir: string,
  agent?: EvalAgent,
): Promise<RunOutput>
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scenario.requires_git` | boolean | No | Signals that the temp copy must support `git status`, `git checkout -b`, and `git commit`. |
| `fixtureDir` | string | Yes | Source fixture directory copied into a temp execution directory. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| temp git repository | filesystem state | A git repository with local identity, disabled hooks, a deterministic non-default branch, and a HEAD commit before agent spawn. |
| `RunOutput` | object | Standard runner output after the agent exits or times out. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| `git` CLI is unavailable | Fail before spawning the agent. | Forge cannot run without git operations. |
| Git identity is missing globally | Continue with repo-local eval identity. | Eval behavior must not depend on developer config. |
| Git hooks are configured globally | Continue with hooks neutralized in the temp repository. | Eval runs must be deterministic and non-interactive. |
| Scenario omits `requires_git` | Skip git setup for that scenario. | Git setup is opt-in through scenario metadata. |
| Source fixture checksum changes | Fail with the existing checksum error. | Forge writes must stay isolated to the temp copy. |
| Temp cleanup runs after failure | Remove the temp directory. | Existing cleanup behavior remains authoritative. |

### 3) Offline smithy.forge Scenario Definition

**Purpose**: Defines the committed forge case and its validation expectations.
**Consumers**: Scenario loader, eval runner, report builder, baseline comparator.
**Providers**: `forge-tdd-slice` scenario YAML and committed fixture task input.

#### Signature

```yaml
name: forge-tdd-slice
skill: /smithy.forge
prompt: specs/forge-eval/01-forge-tdd-slice.tasks.md 1
requires_git: true
timeout: 900
structural_expectations:
  required_headings: [...]
  required_patterns: [...]
sub_agent_evidence:
  - agent: smithy-implement
    pattern: <stable-implementation-evidence>
  - agent: smithy-implementation-review
    pattern: <stable-review-evidence>
```

The concrete task path may differ at implementation time, but it must resolve inside the copied JavaScript fixture and represent a deterministic single-slice forge workflow.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Stable scenario name used for reporting and baseline lookup. |
| `skill` | string | Yes | Smithy command under test. |
| `prompt` | string | Yes | Forge task file path and slice number. |
| `requires_git` | boolean | Yes | Must be true for this scenario. |
| `structural_expectations` | object | Yes | Existing structural validation rules. |
| `sub_agent_evidence` | array | Yes | Helper evidence checks for the observed forge path. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `EvalResult` | object | Standard per-case result with status, structural checks, helper checks, duration, and token totals once F1.3a is present. |
| `EvalReport` case line | string | Standard report row for `forge-tdd-slice`, including baseline marker and token totals after baseline creation. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| The task file path does not resolve | Scenario fails before useful forge output. | The committed scenario input is invalid. |
| smithy.forge cannot create a branch or commit | Scenario fails. | The runner git contract was not satisfied. |
| PR creation fails because credentials are absent | Accept the documented PR-failure terminal path when artifacts remain on disk. | Offline eval runs must remain useful. |
| Structural marker is missing | Structural check fails. | The report should expose workflow regressions. |
| A declared helper evidence check is missing from the run | That helper evidence check fails. | The report should expose dispatch-path regressions. |
| Scenario times out or exits non-zero | Standard eval timeout/error status applies while preserving captured output and tokens. | Existing runner behavior remains authoritative. |

### 4) Forge Baseline Contract

**Purpose**: Stores and compares the known-good forge scenario output and token envelope.
**Consumers**: Baseline loader, baseline comparator, report formatter, downstream token-delta work.
**Providers**: Committed baseline JSON for `forge-tdd-slice`.

#### Signature

```json
{
  "scenario_name": "forge-tdd-slice",
  "captured_at": "2026-06-05T00:00:00.000Z",
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
| `scenario_name` | string | Yes | Must match the scenario name `forge-tdd-slice`. |
| `headings` | string[] | Yes | Structural headings expected from the known-good run. |
| `tables` | array | No | Structural table expectations when present. |
| `token_envelope` | object | Yes | Token bounds using the F1.3a schema. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `Baseline` | object | Loaded structural and token baseline for the forge scenario. |
| `CheckResult[]` | array | Structural checks plus token envelope check when compared with a live run. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Baseline is absent before the capture story lands | Scenario can run without a baseline marker. | Baseline creation is the final story for this feature. |
| Baseline scenario name mismatches | Reject the baseline. | Prevents comparing a run against the wrong committed envelope. |
| Token envelope is malformed | Reject the baseline using F1.3a validation rules. | Invalid token bounds would make downstream deltas misleading. |
| Live output drifts from structural baseline | Emit failing structural baseline checks. | Existing baseline semantics apply. |
| Live token totals exceed envelope | Emit a failing token check. | Downstream token regressions become visible in the eval report. |

## Events / Hooks

No new runtime event stream is introduced. The feature uses the existing eval scenario load, runner invocation, validation, report, and baseline comparison flow.

Git hooks inside the temp repository must be disabled or bypassed for runner-created commits. Developer machine hooks must not run during eval execution.

## Integration Boundaries

- **Scenario YAML boundary**: adds optional `requires_git` metadata while preserving compatibility for scenarios that omit it.
- **Runner filesystem boundary**: copies the fixture to a temp directory, initializes git only in that temp copy, and keeps checksum validation against the source fixture.
- **Git CLI boundary**: uses local temp-repository config or per-command config for identity and hook neutralization; never writes global git config.
- **smithy.forge command boundary**: exercises forge through its normal user-facing invocation path with a `.tasks.md` path and slice number.
- **Baseline boundary**: consumes the token-aware baseline schema from F1.3a and commits a `forge-tdd-slice` baseline for downstream token-delta work.

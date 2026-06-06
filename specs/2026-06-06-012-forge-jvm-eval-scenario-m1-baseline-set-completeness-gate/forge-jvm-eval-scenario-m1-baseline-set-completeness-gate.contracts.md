# Contracts: Forge-JVM Eval Scenario + M1 Baseline-Set Completeness Gate

## Overview

This feature defines the contracts for the JVM forge eval scenario, its committed token-aware baseline, and the M1 baseline-set audit. It consumes the token baseline schema from F1.3a, the forge scenario and git setup contracts from F1.5, and the JVM fixture selector from F1.6.

## Interfaces

### 1) Forge-JVM Scenario Declaration

**Purpose**: Declares the JVM forge eval case as a normal scenario in the eval suite.
**Consumers**: Scenario loader, eval runner, baseline comparison, baseline-set audit.
**Providers**: Scenario YAML under `evals/cases/`.

#### Signature

```yaml
name: forge-tdd-slice-jvm
skill: smithy.forge
fixture: jvm
requires_git: true
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Stable JVM scenario identity. |
| `skill` | string | Yes | Forge skill invocation target. |
| `fixture` | string | Yes | JVM fixture selector from F1.6. |
| `requires_git` | boolean | Yes | Git-initialization opt-in from F1.5. |
| `structural_expectations` | object | Yes | Forge completion expectations for this scenario. |
| `sub_agent_evidence` | array | Yes | Expected forge helper evidence. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| loaded scenario | EvalScenario | Scenario model with JVM fixture and git requirements. |
| eval result | EvalResult | Structural, sub-agent, and token result for the JVM forge run. |
| report row | EvalReport row | User-visible JVM forge status and token totals. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| JVM fixture selector is missing or invalid | Scenario loading or preparation fails clearly. | Prevents accidental JavaScript-fixture fallback. |
| Git initialization is not enabled | Scenario fails before or during forge repository operations. | Forge requires a working repository. |
| Structural expectations fail | Eval result fails and reports the missing evidence. | The JVM forge behavior did not meet the scenario contract. |

### 2) Forge-JVM Baseline Contract

**Purpose**: Stores the committed baseline used for JVM forge token deltas.
**Consumers**: Baseline loader, baseline comparison, eval reports, future PR-description token-delta protocol.
**Providers**: Baseline JSON under `evals/baselines/`.

#### Signature

```text
evals/baselines/forge-tdd-slice-jvm.json
```

The JSON shape follows the token-aware baseline schema established by F1.3a.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| scenario result | EvalResult | Yes | Successful JVM forge result used to generate the baseline. |
| token totals | object | Yes | Input and output token envelope. |
| structural envelope | object | Yes | Expected structural result envelope. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| baseline file | JSON | Stable committed baseline for `forge-tdd-slice-jvm`. |
| baseline comparison | CheckResult[] | Structural and token-envelope comparison results. |
| report marker | string | Existing report baseline marker for the JVM case. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Baseline file missing | M1 baseline audit fails. | Required M1 baseline is absent. |
| Baseline schema malformed | Baseline loading or audit fails with the path and field. | Required M1 baseline cannot support token deltas. |
| Token envelope absent | Audit fails for the JVM baseline. | F1.7 must close on token-aware baselines, not structural-only baselines. |
| Runtime exceeds token envelope | Baseline comparison reports token status through the normal report path. | Future cost changes remain visible. |

### 3) M1 Baseline-Set Audit

**Purpose**: Determines whether the Measurement Foundation milestone has the required committed baseline floor.
**Consumers**: F1.7 tests, maintainers closing M1, downstream M2/M3 contributors.
**Providers**: Baseline files and optional audit helper/test code.

#### Signature

```text
required:
  - strike-health-check
  - fix-from-issue
  - forge-tdd-slice
  - forge-tdd-slice-jvm
informational:
  - planning-command baselines from expand-evals, when visible
```

The implementation may expose this as a unit test, a helper function, or an eval/baseline validation path. The behavior, not the helper name, is contractual.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| required baseline paths | string[] | Yes | Four required M1 baseline paths. |
| baseline schema validator | function | Yes | Existing token-aware baseline validation/comparison surface. |
| planning baseline discovery | function | No | Optional discovery for informational expand-evals baselines. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| audit pass/fail | boolean | Passes only when every required baseline exists and validates. |
| required statuses | array | Status for each required baseline. |
| informational statuses | array | Non-gating planning-command baseline statuses. |
| failure messages | string[] | Missing or malformed required baseline messages. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Required baseline missing | Audit fails and names the missing path. | M1 cannot close. |
| Required baseline malformed | Audit fails and names the path and validation reason. | M1 cannot close on unusable data. |
| Informational planning baseline missing | Audit still passes when required baselines are valid. | Planning-command baselines do not gate M1. |
| Some planning baselines are present | Audit may report them without changing pass/fail. | Keeps cross-RFC status visible. |

### 4) Milestone Ownership Boundary

**Purpose**: Keeps the M1 closer scoped to measurement artifacts and avoids derived snapshot churn.
**Consumers**: Reviewers, implementation agents, Hatchery manager session.
**Providers**: F1.7 implementation patch.

#### Signature

```text
allowed:
  evals/cases/forge-tdd-slice-jvm.yaml
  evals/baselines/forge-tdd-slice-jvm.json
  eval baseline audit/reporting support and tests

disallowed:
  .claude/
  .smithy/smithy-manifest.json
  F1.5 forge-JS scenario redesign
  F1.6 JVM fixture redesign
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| implementation diff | file set | Yes | Files changed by the F1.7 implementation. |
| ownership matrix | artifact context | Yes | RFC and feature-map boundaries. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| reviewable scope | file set | Changes tied to JVM scenario, JVM baseline, and M1 audit. |
| excluded artifacts | file set | Snapshot or upstream-owned files left untouched. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Snapshot files change | Remove from F1.7 and defer to M1-close chore. | Derived artifacts are not feature-owned. |
| Forge-JS contract is redesigned | Move redesign to F1.5 follow-up unless strictly additive compatibility is needed. | Preserves feature ownership. |
| JVM fixture is redesigned | Move fixture changes to F1.6 follow-up unless strictly necessary to consume the existing contract. | Preserves feature ownership. |

## Events / Hooks

No new runtime event stream is introduced. The JVM scenario participates in the existing eval run, stream parsing, report formatting, and baseline comparison paths.

## Integration Boundaries

- **F1.3a baseline boundary**: F1.7 consumes the token-aware baseline schema and comparison behavior.
- **F1.5 forge boundary**: F1.7 consumes the forge scenario pattern and `requires_git` behavior without redesigning the JavaScript forge scenario.
- **F1.6 fixture boundary**: F1.7 consumes `fixture: jvm` and the committed JVM fixture without changing fixture resolution semantics.
- **Expand-evals boundary**: Planning-command baselines are informational and do not gate M1 closure.
- **Snapshot boundary**: `.claude/` and `.smithy/` refreshes remain dedicated milestone-close chores, not F1.7 work.

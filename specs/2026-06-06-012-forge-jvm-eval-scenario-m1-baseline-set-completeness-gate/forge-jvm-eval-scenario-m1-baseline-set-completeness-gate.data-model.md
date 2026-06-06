# Data Model: Forge-JVM Eval Scenario + M1 Baseline-Set Completeness Gate

## Overview

This feature adds one JVM forge eval scenario, its committed token-aware baseline, and an audit view of the M1 baseline set. The model is file-backed: scenario YAML, baseline JSON, and audit results derived from committed eval artifacts. No database or external service storage is introduced.

## Entities

### 1) Forge-JVM Scenario (`forge_jvm_scenario`)

Purpose: Represents the JVM variant of the forge end-to-end eval case.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Canonical value: `forge-tdd-slice-jvm`. |
| `skill` | string | Yes | Existing forge skill under test, in slash-command form (`/smithy.forge`). |
| `prompt` | string | Yes | Non-empty forge task-file invocation; the scenario loader rejects a missing/empty prompt. |
| `fixture` | string | Yes | Uses the F1.6 selector for the JVM fixture. |
| `requires_git` | boolean | Yes | Uses the F1.5 git-initialization contract. |
| `structural_expectations` | StructuralExpectations | Yes | Validates forge completion and expected output shape. |
| `sub_agent_evidence` | SubAgentEvidence[] | Yes | Verifies expected forge helper evidence. |
| `timeout` | number | No | Scenario-specific timeout if the JVM build path needs more time than default. |

Validation rules:

- The scenario name must be stable because it determines the baseline stem and report identity.
- `fixture` must resolve to the committed JVM fixture and must not fall back to the default JavaScript fixture.
- `requires_git` must be enabled for forge repository operations.
- Structural expectations should remain aligned with the JavaScript forge scenario without copying ownership of F1.5's scenario design.

### 2) Forge-JVM Baseline (`forge_jvm_baseline`)

Purpose: Stores the committed baseline envelope for the JVM forge scenario.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Matches `forge-tdd-slice-jvm`. |
| `structural` | object | Yes | Existing structural baseline envelope. |
| `tokens` | object | Yes | Token-aware envelope established by F1.3a. |
| `metadata` | object | No | Stable baseline metadata if supported by the schema. |

Validation rules:

- The baseline filename must be `evals/baselines/forge-tdd-slice-jvm.json`.
- The baseline must compare against the JVM scenario only.
- The token envelope must be sufficient for future token-delta reporting.
- Volatile run-local fields must not be committed.

### 3) M1 Required Baseline (`m1_required_baseline`)

Purpose: Defines one baseline that must exist and validate before M1 can close.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | Yes | Stable audit identifier. |
| `scenario_name` | string | Yes | Scenario that owns the baseline. |
| `baseline_path` | string | Yes | Repo-relative baseline JSON path. |
| `owner_feature` | string | Yes | F1.3a, F1.4, F1.5, or F1.7. |
| `required_for_m1` | boolean | Yes | Always `true` for this entity set. |
| `status` | enum | Yes | `present`, `missing`, or `malformed`. |

Required baseline set:

| ID | Scenario | Owner Feature | Required |
|----|----------|---------------|----------|
| `strike` | `strike-health-check` | F1.3a | Yes |
| `fix` | `fix-from-issue` | F1.4 | Yes |
| `forge-js` | `forge-tdd-slice` | F1.5 | Yes |
| `forge-jvm` | `forge-tdd-slice-jvm` | F1.7 | Yes |

Validation rules:

- Every required baseline must exist.
- Every required baseline must conform to the token-aware baseline schema.
- Missing or malformed required baselines fail the M1 gate.

### 4) Planning-Command Baseline Status (`planning_command_baseline_status`)

Purpose: Records optional visibility into expand-evals planning-command baselines without gating M1 closure.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `scenario_name` | string | Yes | Planning-command scenario name when known. |
| `baseline_path` | string | No | Baseline path when present. |
| `status` | enum | Yes | `present`, `missing`, `not-yet-merged`, or `unknown`. |
| `required_for_m1` | boolean | Yes | Always `false`. |
| `source` | string | Yes | Expand-evals dependency context. |

Validation rules:

- Planning-command statuses must never change the M1 gate result.
- Present planning-command baselines may be listed for downstream context.
- Missing planning-command baselines must be reported as informational, not failures.

### 5) Baseline-Set Audit Result (`baseline_set_audit_result`)

Purpose: Summarizes the M1 baseline gate.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `required` | M1RequiredBaseline[] | Yes | Required baseline checks. |
| `informational` | PlanningCommandBaselineStatus[] | No | Non-gating planning-command checks. |
| `passed` | boolean | Yes | True only when every required baseline is present and valid. |
| `failures` | string[] | Yes | Human-readable missing or malformed required baseline messages. |

Validation rules:

- `passed` must be `false` if any required baseline is missing or malformed.
- `failures` must name the baseline path and reason.
- Informational rows must not populate `failures`.

## Relationships

- `Forge-JVM Scenario` 1:1 `Forge-JVM Baseline` via scenario name `forge-tdd-slice-jvm`.
- `Forge-JVM Baseline` is one member of the `M1 Required Baseline` set.
- `Baseline-Set Audit Result` contains four required `M1 Required Baseline` records.
- `Baseline-Set Audit Result` may contain zero or more `Planning-Command Baseline Status` records.
- `Planning-Command Baseline Status` records reference the expand-evals dependency but do not create an M1 dependency.

## State Transitions

### Forge-JVM baseline lifecycle

1. `scenario_declared` -> `scenario_run`
   - Trigger: the JVM forge scenario is loaded and executed.
   - Effects: a reportable JVM forge result is produced.

2. `scenario_run` -> `baseline_generated`
   - Trigger: baseline generation captures the stable result envelope.
   - Effects: the forge-JVM baseline JSON is created locally.

3. `baseline_generated` -> `baseline_committed`
   - Trigger: the baseline file is reviewed and committed.
   - Effects: future eval reports can compare JVM forge runs against the baseline.

4. `baseline_committed` -> `baseline_audited`
   - Trigger: the M1 baseline-set audit runs.
   - Effects: the forge-JVM baseline contributes to M1 closure.

### M1 baseline gate lifecycle

1. `unchecked` -> `checked`
   - Trigger: baseline audit inspects required baseline paths.
   - Effects: required statuses and informational statuses are computed.

2. `checked` -> `passed`
   - Trigger: every required baseline exists and validates.
   - Effects: M1 measurement substrate is complete.

3. `checked` -> `failed`
   - Trigger: at least one required baseline is missing or malformed.
   - Effects: M1 closure is blocked until the named baseline issue is fixed.

## Identity & Uniqueness

- The JVM scenario identity is the scenario name `forge-tdd-slice-jvm`.
- The JVM baseline identity is the path `evals/baselines/forge-tdd-slice-jvm.json`.
- Required baseline IDs are unique within the M1 audit: `strike`, `fix`, `forge-js`, and `forge-jvm`.
- Planning-command baseline statuses are unique by scenario name when known.

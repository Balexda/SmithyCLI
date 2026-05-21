# Data Model: smithy.fix End-to-End Eval Scenario

## Overview

This feature adds committed, file-backed eval inputs and a token-aware baseline for a deterministic smithy.fix scenario. The model extends the existing eval scenario and baseline concepts with offline fix-specific fixture records; it does not introduce a database or external storage system.

## Entities

### 1) FixEvalScenario (`fix_eval_scenario`)

Purpose: Declarative scenario that invokes smithy.fix against committed offline issue and CI-log context.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Stable scenario identifier, unique within the eval suite. |
| `skill` | string | Yes | The invoked Smithy command, fixed to smithy.fix for this feature. |
| `prompt` | string | Yes | Scenario prompt that points the command at offline issue and log context. |
| `structural_expectations` | StructuralExpectations | Yes | Required headings, patterns, or tables that define successful fix output. |
| `sub_agent_evidence` | SubAgentEvidence[] | Yes | Expected helper evidence for the CI-log path. |
| `offline_issue` | OfflineIssueFixture | Yes | Issue fixture consumed by the prompt. |
| `offline_ci_log` | OfflineCiLogFixture | Yes | CI-log fixture consumed by the prompt. |
| `baseline` | FixBaseline | Yes | Token-aware baseline associated with the scenario. |

Validation rules:

- `name` must be non-empty and unique.
- `offline_issue` and `offline_ci_log` must resolve to committed fixture files before the scenario runs.
- The scenario must not require live GitHub data to satisfy any required field.
- Structural expectations and sub-agent evidence must use stable markers rather than incidental model prose.

### 2) OfflineIssueFixture (`offline_issue_fixture`)

Purpose: Committed issue context that replaces live issue lookup during the eval.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `path` | string | Yes | Repo-relative path to the committed issue fixture. |
| `title` | string | Yes | Human-readable issue title used by the scenario context. |
| `body` | string | Yes | Issue body supplied to smithy.fix. |
| `labels` | string[] | No | Optional labels included when useful for fix routing. |
| `linked_log` | string | Yes | Reference to the paired offline CI-log fixture. |

Validation rules:

- `path`, `title`, `body`, and `linked_log` must be non-empty.
- The body must include enough failure context for smithy.fix to choose the CI-log path.
- `linked_log` must match the paired CI-log fixture identifier.

### 3) OfflineCiLogFixture (`offline_ci_log_fixture`)

Purpose: Committed failing-check log that exercises smithy.fix's expensive log-reading behavior.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `path` | string | Yes | Repo-relative path to the committed CI-log fixture. |
| `check_name` | string | Yes | Name of the failing check represented by the log. |
| `exit_status` | integer | Yes | Non-zero failing status for the represented command. |
| `content` | string | Yes | Log payload supplied to smithy.fix. |
| `captured_at` | string | No | Optional ISO 8601 timestamp for fixture provenance. |

Validation rules:

- `path`, `check_name`, and `content` must be non-empty.
- `exit_status` must be a non-zero integer.
- The log must include an identifiable failure marker and enough surrounding context for fix reasoning.

### 4) FixBaseline (`fix_baseline`)

Purpose: Token-aware known-good baseline for the fix scenario.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `scenario_name` | string | Yes | Must match the fix scenario name. |
| `captured_at` | string | Yes | ISO 8601 timestamp for baseline capture. |
| `headings` | string[] | Yes | Structural headings expected in canonical output. |
| `tables` | TableExpectation[] | Yes | Structural table expectations, empty when not applicable. |
| `token_envelope` | TokenEnvelope | Yes | Accepted input and output token bounds from F1.3a. |

Validation rules:

- `scenario_name` must match exactly one loaded scenario.
- Structural expectations and token envelope are both authoritative; either can fail the baseline check.
- Token bounds must be finite non-negative integers and should be broad enough for expected provider variance.

### 5) SubAgentEvidence (`sub_agent_evidence`)

Purpose: Stable helper-output marker used to verify smithy.fix orchestration during the scenario.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `agent` | string | Yes | Expected helper identifier. |
| `pattern` | string | Yes | Regex or literal marker matched against dispatch evidence. |

Validation rules:

- `agent` and `pattern` must be non-empty.
- Patterns should target template-stable output or dispatch descriptions.
- Missing expected evidence fails the scenario.

## Relationships

- `FixEvalScenario` 1:1 `OfflineIssueFixture` via prompt-specified issue context.
- `FixEvalScenario` 1:1 `OfflineCiLogFixture` via the issue fixture's linked log.
- `FixEvalScenario` 1:1 `FixBaseline` via matching `scenario_name`.
- `FixEvalScenario` 1:N `SubAgentEvidence` through the scenario's helper expectations.
- `FixBaseline` 1:1 F1.3a token envelope through the shared baseline schema.

## State Transitions

### Scenario lifecycle

1. `drafted` -> `fixture_validated`
   - Trigger: scenario loading confirms issue and CI-log fixture availability.
   - Effects: the scenario is eligible to invoke smithy.fix.

2. `fixture_validated` -> `executed`
   - Trigger: the eval runner invokes smithy.fix in a temp copy.
   - Effects: canonical output, stream events, token totals, and helper evidence are captured for validation.

3. `executed` -> `baselined`
   - Trigger: a known-good run is captured in the token-aware baseline schema.
   - Effects: future runs can compare structure and token totals against the committed baseline.

### Fixture lifecycle

1. `missing` -> `committed`
   - Trigger: issue and CI-log fixture files are added to the repository.
   - Effects: the scenario can run offline.

2. `committed` -> `refreshed`
   - Trigger: fixture content is intentionally updated to reflect a new known-good failure case.
   - Effects: the associated baseline must be refreshed in the same feature or follow-up baseline update.

## Identity & Uniqueness

- The fix scenario is uniquely identified by its `name`.
- The issue fixture is uniquely identified by its repo-relative `path`.
- The CI-log fixture is uniquely identified by its repo-relative `path` and `check_name`.
- The fix baseline is uniquely identified by its `scenario_name`.

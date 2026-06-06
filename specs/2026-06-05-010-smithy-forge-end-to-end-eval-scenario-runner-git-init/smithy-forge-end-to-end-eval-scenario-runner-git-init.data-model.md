# Data Model: smithy.forge End-to-End Eval Scenario + Runner git-init

## Overview

This feature adds data definitions for a deterministic smithy.forge eval scenario and the git-backed runner execution context it requires. The model extends scenario metadata with an optional `requires_git` flag, defines the temp git repository lifecycle, and consumes the token-aware baseline shape established by Feature 1.3a. No persistent database or external storage is introduced.

## Entities

### 1) Forge Eval Scenario (`forge_eval_scenario`)

Purpose: Represents the YAML scenario that invokes smithy.forge against the existing JavaScript fixture.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Stable scenario name. Expected value is `forge-tdd-slice`. |
| `skill` | string | Yes | Smithy command under test. Expected value is `/smithy.forge`. |
| `prompt` | string | Yes | Scenario prompt or argument string pointing at the deterministic forge task input. |
| `requires_git` | boolean | Yes for this scenario | Optional at the schema level; this scenario sets it to `true`. |
| `structural_expectations` | StructuralExpectations | Yes | Existing eval validation contract for required headings, patterns, tables, and forbidden patterns. |
| `sub_agent_evidence` | ForgeHelperEvidenceCheck[] | Yes | Expected helper evidence for `smithy-implement` and `smithy-implementation-review`. |
| `timeout` | integer | No | Existing per-scenario timeout override in seconds. Forge may need a longer budget than simple read-only scenarios. |

Validation rules:

- `name`, `skill`, and `prompt` must be non-empty strings.
- `skill` must resolve to the deployed smithy.forge command.
- `requires_git`, when present, must be boolean.
- The forge scenario must set `requires_git: true`.
- Structural expectations must include stable markers for forge completion, validation, and PR-delivery output.
- Sub-agent evidence must include `smithy-implement` and `smithy-implementation-review` checks for the observed forge path.

### 2) Git Requirement Flag (`git_requirement_flag`)

Purpose: Declares that a scenario needs git operations in its execution temp copy.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `requires_git` | boolean | No | Defaults to false when absent; an omitted flag MUST NOT receive git setup (see FR-008/SC-004). |

Validation rules:

- The value must be boolean when present.
- The flag must not change scenario sorting, duplicate-name detection, structural expectations, or sub-agent evidence loading.
- Scenarios that omit the flag remain compatible.

### 3) Temp Git Repository (`temp_git_repository`)

Purpose: Represents the per-scenario copied fixture after runner git initialization.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `path` | string | Yes | Temp directory created for a single scenario run. |
| `initialized` | boolean | Yes | True after `git init` succeeds. |
| `baseline_commit` | string | Yes | Commit created after copying the fixture. |
| `working_branch` | string | Yes | Deterministic non-default branch used as the starting branch for forge. |
| `post_init_commit` | string | Conditional | Commit created after `smithy init` deploys skills, when deployment writes files. |
| `user_email` | string | Yes | Repo-local eval identity, not global config. |
| `user_name` | string | Yes | Repo-local eval identity, not global config. |
| `hooks_disabled` | boolean | Yes | True when hooks are neutralized for temp-copy commits. |

Validation rules:

- The temp repository must have a valid HEAD before the agent is spawned for a git-requiring scenario.
- The temp repository must start forge from a deterministic non-default branch.
- The worktree must be clean after skill deployment baseline commits.
- Git identity and hook configuration must be local to the temp repository or supplied via per-command config.
- Git initialization must not mutate the source fixture.

### 4) Forge Task Input (`forge_task_input`)

Purpose: Provides the deterministic `.tasks.md` input that drives smithy.forge.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `path` | string | Yes | Fixture-relative or temp-copy-visible path to the forge task file. |
| `slice_number` | integer | Yes | Single slice number passed to forge. |
| `fixture_scope` | string | Yes | Existing JavaScript fixture for F1.5. |
| `expected_workflow` | string[] | Yes | High-level markers such as implement, validate, review, and final summary. |

Validation rules:

- The path must resolve inside the scenario execution context.
- The input must drive a single deterministic slice.
- The task must be suitable for the JavaScript fixture and must not depend on JVM or future fixture-selection work.

### 5) Forge Helper Evidence Check (`forge_helper_evidence_check`)

Purpose: Verifies helper dispatch behavior for the forge scenario.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `agent` | string | Yes | Expected helper agent name. |
| `pattern` | string | Yes | Stable regex pattern matched against dispatch description or result text. |

Validation rules:

- Required helper agents are `smithy-implement` and `smithy-implementation-review`.
- Patterns should target stable dispatch descriptions or template markers, not full-output snapshots.
- Missing helper evidence produces a failed eval check, not a loader error.

### 6) Forge Baseline (`forge_baseline`)

Purpose: Stores the known-good forge scenario output and token envelope once F1.3a's baseline schema is available.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `scenario_name` | string | Yes | Must match `forge-tdd-slice`. |
| `captured_at` | string | Yes | ISO 8601 capture timestamp. |
| `headings` | string[] | Yes | Structural heading expectations inherited from the baseline contract. |
| `tables` | object[] | No | Structural table expectations inherited from the baseline contract. |
| `token_envelope` | TokenEnvelope | Yes | Accepted token bounds using the F1.3a token-aware schema. |

Validation rules:

- The baseline must satisfy the F1.3a token-aware baseline validation rules.
- Structural expectations must remain present alongside the token envelope.
- Baseline scenario name must match the scenario definition.

## Relationships

- `Forge Eval Scenario` 1:1 `Git Requirement Flag` through the scenario YAML.
- `Forge Eval Scenario` 1:1 `Forge Task Input` through the scenario prompt.
- `Forge Eval Scenario` 1:1 `Temp Git Repository` during runner execution when git is required.
- `Forge Eval Scenario` 1..N `Forge Helper Evidence Check` through existing sub-agent evidence validation.
- `Forge Eval Scenario` 1:1 `Forge Baseline` after the first clean token-aware capture.

## State Transitions

### Scenario lifecycle

1. `declared` -> `loaded`
   - Trigger: the scenario loader validates the YAML.
   - Effects: `requires_git`, structural expectations, timeout, and sub-agent evidence are attached to the scenario.

2. `loaded` -> `temp_repo_ready`
   - Trigger: the runner prepares the copied fixture for a git-requiring scenario.
   - Effects: the temp copy has a git repository, local identity, disabled hooks, and a HEAD commit.

3. `temp_repo_ready` -> `invocation_built`
   - Trigger: the runner renders the smithy.forge invocation.
   - Effects: the forge task path and slice number are visible to the agent.

4. `invocation_built` -> `validated`
   - Trigger: smithy.forge completes and report validation runs.
   - Effects: structural and helper evidence checks are attached to the eval result.

5. `validated` -> `baselined`
   - Trigger: a clean scenario run is captured after the token-aware baseline schema exists.
   - Effects: the forge baseline is committed with structural expectations and a token envelope.

### Temp repository lifecycle

1. `created` -> `copied`
   - Trigger: the runner copies the source fixture into a temp directory.
   - Effects: scenario writes are isolated from the source fixture.

2. `copied` -> `git_initialized`
   - Trigger: git initialization runs.
   - Effects: `.git/` exists only in the temp copy, a deterministic non-default branch is selected, and a baseline commit is created.

3. `git_initialized` -> `post_init_clean`
   - Trigger: `smithy init` writes deployed artifacts and the runner commits them.
   - Effects: forge starts from a clean worktree.

4. `post_init_clean` -> `removed`
   - Trigger: runner cleanup after completion or failure.
   - Effects: temp files and git metadata are deleted.

## Identity & Uniqueness

- The scenario is uniquely identified by `name: forge-tdd-slice`.
- The baseline is uniquely identified by `scenario_name: forge-tdd-slice`.
- The temp git repository is unique per scenario run by temp path.
- Helper evidence checks are identified by expected helper agent name plus evidence pattern.

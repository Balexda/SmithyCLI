# Data Model: JVM Multi-Language Fixture

## Overview

This feature extends eval scenario metadata with an optional fixture selector and adds a second fixture rooted at `evals/fixture/jvm/`. The data model is filesystem-backed only: no database or external storage is introduced. The existing JavaScript fixture remains the default when a scenario does not select a fixture.

## Entities

### 1) Fixture Selector (`fixture_selector`)

Purpose: Declares which fixture a scenario should run against.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `fixture` | string | No | Relative path under `evals/fixture/`. Omitted means use the default fixture path chosen by the runner invocation. |

Validation rules:

- Must be a non-empty string when present.
- Must be relative, not absolute.
- Must not contain `..` path segments.
- Must resolve under `evals/fixture/`.
- `fixture: jvm` resolves to `evals/fixture/jvm/`.

### 2) Eval Scenario (`eval_scenario`)

Purpose: Existing YAML-loaded scenario shape with additive fixture metadata.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Existing scenario identifier. |
| `skill` | string | Yes | Existing Smithy command under test. |
| `prompt` | string | Yes | Existing prompt or argument string. |
| `fixture` | string | No | Optional fixture selector. |
| `model` | string | No | Existing optional model field. |
| `timeout` | number | No | Existing optional timeout in seconds. |
| `structural_expectations` | StructuralExpectations | Yes | Existing validation contract. |
| `sub_agent_evidence` | SubAgentEvidence[] | No | Existing helper evidence contract. |

Validation rules:

- Existing field validation remains unchanged.
- Fixture validation failure skips only the offending file in `loadScenarios` (single stderr line), and throws in `loadScenarioFromFile`; other scenarios are unaffected.
- Omitted fixture metadata must not change the loaded shape of current scenarios except for the absence of the new optional field.

### 3) Effective Fixture Directory (`effective_fixture_directory`)

Purpose: Concrete source directory copied into a temp run for one scenario.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `scenario_name` | string | Yes | Scenario being prepared. |
| `source` | enum | Yes | `scenario`, `global`, or `default`. |
| `path` | string | Yes | Absolute path to the source fixture directory. |
| `selector` | string | Conditional | Scenario fixture selector when `source` is `scenario`. |

Resolution precedence:

1. Scenario `fixture` value, resolved under repository `evals/fixture/`.
2. Global `--fixture` directory passed to `npm run eval`.
3. Default `evals/fixture/` directory.

Validation rules:

- The effective path must exist.
- The effective path must be a directory.
- Scenario-level selectors must not escape the repository fixture root.
- Failure happens before skill deployment or agent spawn.

### 4) JVM Fixture (`jvm_fixture`)

Purpose: Minimal non-JavaScript project used by future forge and build-output scenarios.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `root` | string | Yes | `evals/fixture/jvm/`. |
| `settings` | file | Yes | `settings.gradle` or `settings.gradle.kts`. |
| `build_config` | file | Yes | `build.gradle` or `build.gradle.kts`. |
| `source_tree` | directory | Yes | Java source under `src/main/java/...`. |
| `test_tree` | directory | Yes | Test source under `src/test/java/...`. |
| `readme` | file | Yes | Fixture usage and maintenance notes. |
| `wrapper` | files | Optional | Gradle wrapper files if implementation chooses wrapper-based reproducibility. |

Validation rules:

- The project must be small enough for eval agents to inspect quickly.
- The fixture must contain at least one deterministic failing test for a future forge slice.
- Generated build outputs must not be committed.
- README instructions must match the actual build tooling committed.

### 5) Fixture Resolver (`fixture_resolver`)

Purpose: Runner logic that computes the effective fixture directory.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `scenario_fixture` | string | No | Scenario metadata value. |
| `global_fixture` | string | Yes | Existing CLI `--fixture` value. Always set: `run-evals.ts` defaults the `--fixture` option to `evals/fixture`, so the resolver always receives a string. Matches the required `globalFixtureDir` parameter in `contracts.md`. |
| `repo_fixture_root` | string | Yes | Repository `evals/fixture/` root used for scenario selectors. |
| `effective_fixture` | string | Yes | Directory copied into the temp run. |

Validation rules:

- Scenario selector wins over global fixture.
- Global fixture wins over repository default only when the scenario omits `fixture`.
- The resolver must be testable without spawning an agent.

## Relationships

- `Eval Scenario` 0..1 `Fixture Selector`.
- `Fixture Selector` 1:1 `Effective Fixture Directory` when present.
- `Effective Fixture Directory` 1:1 copied temp run per scenario execution.
- `JVM Fixture` is selected by `fixture: jvm`.
- `Fixture Resolver` consumes scenario metadata plus the global fixture argument to produce the effective directory.

## State Transitions

### Scenario fixture lifecycle

1. `declared` -> `loaded`
   - Trigger: `loadScenarios` validates YAML.
   - Effects: optional `fixture` metadata is attached to the scenario.

2. `loaded` -> `resolved`
   - Trigger: runner prepares a scenario.
   - Effects: precedence rules select an effective fixture directory.

3. `resolved` -> `copied`
   - Trigger: runner copies the effective fixture into a temp directory.
   - Effects: scenario execution is isolated from the source fixture.

4. `copied` -> `checked`
   - Trigger: checksum is computed before and after scenario execution.
   - Effects: source fixture mutation is detected for the selected fixture.

### JVM fixture lifecycle

1. `authored` -> `documented`
   - Trigger: README and build instructions are committed alongside source.
   - Effects: maintainers can run and inspect the fixture.

2. `documented` -> `consumed`
   - Trigger: F1.7 adds a JVM forge scenario using `fixture: jvm`.
   - Effects: the fixture becomes part of the measured eval suite.

## Identity & Uniqueness

- Fixture selectors are unique within a scenario by the single optional `fixture` field.
- The JVM fixture is identified by `fixture: jvm` and path `evals/fixture/jvm/`.
- Effective fixture directories are unique per scenario run by their temp-copy path, not by the source path.

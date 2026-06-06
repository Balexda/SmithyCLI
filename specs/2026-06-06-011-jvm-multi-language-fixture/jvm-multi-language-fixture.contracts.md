# Contracts: JVM Multi-Language Fixture

## Overview

This feature defines the additive contracts needed for multiple eval fixtures: a scenario YAML field, loader validation, runner fixture resolution, and the committed JVM fixture layout. Existing scenarios that omit the new field keep their current behavior.

## Interfaces

### 1) Scenario Fixture Declaration

**Purpose**: Allows a scenario YAML file to select a fixture under `evals/fixture/`.
**Consumers**: Scenario loader, eval runner, scenario tests.
**Providers**: Scenario YAML files under `evals/cases/`.

#### Signature

```yaml
fixture: jvm
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fixture` | string | No | Relative path under `evals/fixture/`. Omitted keeps default fixture behavior. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `EvalScenario.fixture` | string | Loaded fixture selector when supplied. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Field is absent | Load scenario normally and use the global or default fixture path. | Existing scenarios remain compatible. |
| Field is empty | Skipped by `loadScenarios` (single stderr line naming `fixture`); thrown by `loadScenarioFromFile`. No new failure mode. | Empty selectors have no stable meaning. |
| Field is non-string | Skipped by `loadScenarios` (single stderr line naming `fixture`); thrown by `loadScenarioFromFile`. No new failure mode. | Keeps scenario metadata typed. |
| Field is absolute | Skipped by `loadScenarios` (single stderr line naming `fixture`); thrown by `loadScenarioFromFile`. No new failure mode. | Scenario YAML cannot select arbitrary machine paths. |
| Field contains `..` | Skipped by `loadScenarios` (single stderr line naming `fixture`); thrown by `loadScenarioFromFile`. No new failure mode. | Prevents escaping `evals/fixture/`. |

### 2) Fixture Resolution

**Purpose**: Computes the source fixture directory copied for a single scenario run.
**Consumers**: Eval runner and runner tests.
**Providers**: Scenario metadata, CLI `--fixture` option, repository fixture root.

#### Signature

```ts
resolveFixtureDir(
  scenario: EvalScenario,
  globalFixtureDir: string,
  repoFixtureRoot: string,
): string
```

The implementation may choose a different helper name, but the behavior must be separately unit-testable from agent spawning.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scenario.fixture` | string | No | Scenario selector relative to `evals/fixture/`. |
| `globalFixtureDir` | string | Yes | Existing runner fixture argument, defaulting to repository `evals/fixture/`. |
| `repoFixtureRoot` | string | Yes | Repository fixture root for scenario selectors. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| effective fixture path | string | Absolute directory path to copy into the temp execution directory. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Scenario selector exists and target directory is missing | Fail before agent spawn with scenario name and resolved path. | The scenario is misconfigured. |
| Scenario selector exists and target is not a directory | Fail before agent spawn with scenario name and resolved path. | The runner cannot copy a fixture file as a project root. |
| Scenario selector escapes fixture root after normalization | Fail before agent spawn. | Defense in depth beyond loader validation. |
| Global fixture is missing and scenario omits `fixture` | Preserve existing global-fixture failure behavior, but include the path in the error. | Compatibility with `--fixture` remains explicit. |

### 3) Runner Copy Contract

**Purpose**: Ensures the selected fixture, not always the default fixture, is copied and checksummed.
**Consumers**: `runScenario`, fixture checksum code, tests.
**Providers**: Fixture resolver.

#### Signature

```ts
runScenario(
  scenario: EvalScenario,
  fixtureDir: string,
  agent?: EvalAgent,
): Promise<RunOutput>
```

`fixtureDir` remains the effective fixture directory passed to the runner. Orchestrator-level code is responsible for resolving per-scenario fixture overrides before calling `runScenario`, unless implementation extracts resolution into `runScenario` itself with equivalent tests.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| effective fixture directory | string | Yes | Directory copied to a temp execution directory. |
| `scenario.name` | string | Yes | Used in fixture resolution errors and test diagnostics. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| temp copy | filesystem state | Copy of the effective fixture directory. |
| source checksum | string | Hash computed against the same effective fixture directory before and after execution. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Source fixture changes during execution | Fail with checksum mismatch for the selected fixture. | Existing mutation guard applies to every fixture. |
| Selected fixture contains generated build output | Unit tests or repository status should expose unwanted committed files. | Keeps fixtures stable and small. |
| F1.5 git initialization is present | Preserve it after fixture copy resolution. | Fixture selection and git setup are separate runner responsibilities. |

### 4) JVM Fixture Layout

**Purpose**: Defines the committed file shape future JVM scenarios can rely on.
**Consumers**: F1.7 JVM forge scenario, M3 build-output protocol work, maintainers.
**Providers**: Files under `evals/fixture/jvm/`.

#### Signature

```text
evals/fixture/jvm/
├── README.md
├── settings.gradle(.kts)
├── build.gradle(.kts)
└── src/
    ├── main/java/...
    └── test/java/...
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| JDK | tool | Yes | Java toolchain needed to compile and test the fixture. |
| Gradle or wrapper | tool/files | Yes | Build tool path documented by the fixture README. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| JVM project | files | Minimal Gradle project committed under `evals/fixture/jvm/`. |
| failing test | test result | Deterministic failure that a future forge task can repair. |
| README | documentation | Commands, intentional failure, and maintenance boundaries. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| JDK unavailable | README documents the prerequisite; local validation can skip with a clear tooling note. | The fixture is not executed by default unit tests unless tooling exists. |
| Gradle unavailable and no wrapper committed | README documents the prerequisite. | Avoids hidden assumptions. |
| Generated `build/` directory appears | Remove it or ignore it before commit. | Generated output is not fixture source. |
| Test unexpectedly passes before F1.7 | Treat as fixture drift. | The failing test is the future forge repair target. |

## Events / Hooks

No runtime event stream is introduced. Fixture selection happens before existing temp-copy setup, skill deployment, agent spawning, parsing, structural validation, and report generation.

## Integration Boundaries

- **Scenario YAML boundary**: adds optional `fixture` metadata without changing existing required fields.
- **Loader boundary**: validates the new field and leaves omitted values compatible.
- **Runner boundary**: resolves and copies the effective fixture directory before existing git initialization and skill deployment.
- **Fixture filesystem boundary**: adds `evals/fixture/jvm/` without moving or changing the existing JavaScript fixture root.
- **Future scenario boundary**: F1.7 consumes `fixture: jvm` when it authors the JVM forge scenario and baseline.

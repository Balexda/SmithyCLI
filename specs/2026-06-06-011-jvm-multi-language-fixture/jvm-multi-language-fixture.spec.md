# Feature Specification: JVM Multi-Language Fixture

**Spec Folder**: `2026-06-06-011-jvm-multi-language-fixture`
**Branch**: `2026-06-06-011-jvm-multi-language-fixture`
**Created**: 2026-06-06
**Status**: Draft
**Input**: `docs/rfcs/2026-001-token-savings/token-savings.rfc.md` - Milestone 1 measurement-foundation feature for a JVM fixture and per-scenario fixture selection.
**Source Feature Map**: `docs/rfcs/2026-001-token-savings/01-measurement-foundation.features.md` - Feature 1.6: JVM Multi-Language Fixture

## Clarifications

### Session 2026-06-06

- This specification targets the Dependency Order row `F5`, which corresponds to Feature 1.6 in the measurement-foundation feature map. `[Critical Assumption]`
- The existing eval fixture at `evals/fixture/` remains the default JavaScript fixture. This feature adds an additional JVM fixture and a scenario-level selection mechanism rather than replacing the current fixture.
- The scenario YAML field is specified as `fixture:`. Values are relative paths under `evals/fixture/`; an omitted value preserves the existing defaulting behavior — the global `--fixture` argument when set, otherwise the `evals/fixture/` JavaScript fixture root.
- A scenario-level `fixture:` value overrides the global `--fixture` CLI argument for that scenario. The global flag remains the default when a scenario omits `fixture:`.
- F1.5 owns git initialization around fixture copy and process spawn. This feature owns fixture path resolution and the JVM fixture contents; second-to-land changes in `evals/lib/runner.ts` must rebase without rewriting F1.5 git behavior.
- This feature creates substrate only. The JVM forge eval scenario and JVM baseline are owned by F1.7.

## Artifact Hierarchy

RFC -> Milestone -> Feature -> User Story -> Slice -> Tasks

## User Scenarios & Testing *(mandatory)*

### User Story 1: Declare Per-Scenario Fixture Selection (Priority: P1)

As a Smithy maintainer, I want eval scenarios to declare which fixture they run against so that the runner can exercise non-JavaScript toolchains without a separate orchestrator path per scenario.

**Why this priority**: The JVM fixture is unusable by future scenarios until scenario metadata can select it deterministically.

**Independent Test**: Load scenarios with omitted, valid, and malformed `fixture` values and verify the loaded scenario model preserves valid fixture selection while `loadScenarios` skips files with invalid metadata.

**Acceptance Scenarios**:

1. **Given** a scenario YAML omits `fixture`, **When** `loadScenarios` parses it, **Then** the loaded scenario remains valid and uses the existing default fixture behavior.
2. **Given** a scenario YAML includes `fixture: jvm`, **When** `loadScenarios` parses it, **Then** the loaded scenario exposes the fixture selector to the runner.
3. **Given** a scenario YAML includes an empty, absolute, parent-traversing, or non-string `fixture` value, **When** `loadScenarios` parses it, **Then** the offending file is skipped (not the whole run) with a single stderr line naming the `fixture` field — matching the existing loader policy where `loadScenarios` skips invalid files and `loadScenarioFromFile` throws. This feature adds no new failure-handling mode.

---

### User Story 2: Resolve Fixture Paths in the Runner (Priority: P1)

As a Smithy contributor, I want the eval runner to resolve a scenario's fixture path consistently so that JS and JVM scenarios can coexist in one eval suite and still honor the existing `--fixture` override.

**Why this priority**: F1.7 must run a forge scenario against the JVM fixture without changing the global runner invocation for every other case.

**Independent Test**: Run mocked scenarios through the runner path resolver and verify default, global-override, and scenario-level fixture cases resolve to the expected directories.

**Acceptance Scenarios**:

1. **Given** a scenario omits `fixture` and the user does not pass `--fixture`, **When** the runner prepares the scenario, **Then** it copies the existing `evals/fixture/` directory.
2. **Given** a scenario omits `fixture` and the user passes `--fixture /tmp/custom-fixture`, **When** the runner prepares the scenario, **Then** it copies `/tmp/custom-fixture`.
3. **Given** a scenario declares `fixture: jvm`, **When** the runner prepares the scenario, **Then** it resolves and copies `evals/fixture/jvm/` regardless of the global `--fixture` value.
4. **Given** a scenario declares a fixture path that does not exist or is not a directory, **When** the runner prepares the scenario, **Then** it fails before spawning the agent with an error naming the scenario and fixture path.

---

### User Story 3: Provide a Minimal JVM Gradle Fixture (Priority: P1)

As a Smithy maintainer, I want a minimal realistic Gradle-based JVM fixture so that forge and build-output protocol work can be evaluated against a non-JavaScript toolchain.

**Why this priority**: M3's build-output protocol makes Gradle-specific claims, and M2 forge reductions need validation beyond the JavaScript fixture.

**Independent Test**: Inspect and build the JVM fixture locally, then run its intentionally failing test to confirm it presents a deterministic forge-ready failure.

**Acceptance Scenarios**:

1. **Given** `evals/fixture/jvm/` exists, **When** a maintainer lists its contents, **Then** it contains a minimal Gradle project with settings, build configuration, source, and test files.
2. **Given** the JVM fixture is built, **When** Gradle runs with the documented command, **Then** the project compiles without requiring network access beyond any documented first-time dependency resolution.
3. **Given** the fixture test suite runs, **When** the planted failing test executes, **Then** the failure is deterministic and suitable for a smithy.forge slice to repair.
4. **Given** the fixture is read by eval agents, **When** they inspect its README, **Then** the intended failing behavior and maintenance boundaries are documented.

---

### User Story 4: Preserve Existing Fixture Behavior (Priority: P1)

As a Smithy contributor, I want the existing JavaScript fixture and planning-command scenarios to keep working so that adding JVM support does not destabilize the current eval suite.

**Why this priority**: The JVM fixture is additive measurement substrate. Regressing existing scenarios would weaken the quality net that downstream cost work depends on.

**Independent Test**: Run the eval unit tests for scenario loading, runner fixture copy behavior, fixture checksum behavior, and existing fixture deployment after adding JVM fixture support.

**Acceptance Scenarios**:

1. **Given** existing scenario YAML files do not declare `fixture`, **When** the full scenario list is loaded, **Then** their loaded shapes and default fixture selection remain unchanged.
2. **Given** the runner executes a default-fixture scenario, **When** checksum validation runs, **Then** it still hashes the source fixture selected for that scenario and fails on source mutation.
3. **Given** `evals/fixture/README.md` documents existing planted JS fixture artifacts, **When** this feature lands, **Then** those plants are not moved, renamed, or cleaned up.
4. **Given** the new JVM fixture contains Gradle output or build directories after manual testing, **When** fixture checksum and repository status are inspected, **Then** generated directories are ignored or absent from the committed fixture.

### Edge Cases

- `fixture:` must not accept absolute paths, `..` segments, symlink escapes, or empty strings.
- Scenario-level fixture selection must not alter scenario sorting, duplicate-name detection, structural expectations, sub-agent evidence, `timeout`, or `model` loading.
- The default fixture path must remain compatible with the current `npm run eval -- --fixture <path>` behavior.
- JVM fixture dependency resolution may need network on a developer's first run; the committed fixture must document whether a Gradle wrapper is included or whether system Gradle/JDK are required.
- F1.7 may add the first scenario that consumes `fixture: jvm`; this feature still must unit test the loader and resolver before that scenario exists.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Declare Per-Scenario Fixture Selection | — | specs/2026-06-06-011-jvm-multi-language-fixture/01-declare-per-scenario-fixture-selection.tasks.md |
| US2 | Resolve Fixture Paths in the Runner | US1 | — |
| US3 | Provide a Minimal JVM Gradle Fixture | — | — |
| US4 | Preserve Existing Fixture Behavior | US1, US2, US3 | — |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `EvalScenario` type MUST support an optional `fixture` string.
- **FR-002**: `loadScenarios` MUST preserve omitted `fixture` values as the existing default fixture behavior.
- **FR-003**: `loadScenarios` MUST skip files with malformed `fixture` values, emitting a single stderr line that names the `fixture` field (consistent with its existing skip-and-continue policy); `loadScenarioFromFile` MUST throw on the same input.
- **FR-004**: Valid `fixture` values MUST be relative paths under `evals/fixture/`.
- **FR-005**: Valid `fixture` values MUST reject absolute paths, empty strings, parent traversal, and path forms that escape `evals/fixture/`.
- **FR-006**: The runner MUST resolve the effective fixture directory per scenario using this precedence: scenario `fixture` value, then global `--fixture`, then default `evals/fixture/`.
- **FR-007**: A scenario-level `fixture` value MUST override the global `--fixture` argument for that scenario.
- **FR-008**: Missing or non-directory effective fixtures MUST fail before agent spawn with a clear scenario-specific error.
- **FR-009**: The JVM fixture MUST live under `evals/fixture/jvm/`.
- **FR-010**: The JVM fixture MUST contain a minimal Gradle project with settings, build configuration, Java source, and at least one test.
- **FR-011**: The JVM fixture MUST include a deterministic failing test suitable for a future smithy.forge slice.
- **FR-012**: The JVM fixture README MUST document how to run the fixture, which failure is intentional, and which files are fixture-owned.
- **FR-013**: Existing JavaScript fixture files and existing scenario YAML files MUST NOT be moved, renamed, or semantically changed by this feature.
- **FR-014**: Unit tests MUST cover loader validation, fixture precedence, missing fixture failure, default fixture preservation, and JVM fixture presence.

### Key Entities

- **Fixture Selector**: Optional scenario metadata naming a fixture subdirectory under `evals/fixture/`.
- **Eval Scenario**: The existing YAML-loaded scenario shape, extended with the additive optional `fixture` selector.
- **Effective Fixture Directory**: The concrete directory copied into the temp run for a scenario after applying precedence rules.
- **JVM Fixture**: The committed Gradle project under `evals/fixture/jvm/`, including its README maintenance notes that document intentional failures and generated-file boundaries.
- **Fixture Resolver**: Runner logic that turns scenario metadata and CLI defaults into the effective fixture directory.

## Assumptions

- The existing `evals/fixture/` root remains the JavaScript default fixture for all current scenarios.
- `fixture: jvm` is the canonical selector for the new JVM fixture.
- Gradle is the JVM build tool for this program because M3 F3.1's build-output protocol specifically needs Gradle clauses.
- A small Java project is sufficient; Kotlin, Spring, Android, and multi-module Gradle are out of scope.
- F1.7 owns the first JVM forge scenario and baseline, so this feature does not need to author scenario YAML that consumes the new fixture.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | The fixture selector is specified as `fixture:` with relative paths under `evals/fixture/`, resolving feature-map SD-002 for F1.6. If implementation discovers a current CLI flag path assumption that makes this precedence hard to preserve, update this debt row with the exact compatibility tradeoff before changing the contract. | Integration Points | Medium | High | open | — |
| SD-002 | The Gradle wrapper choice is left to implementation. Including a wrapper improves reproducibility but adds binary/script files; requiring system Gradle keeps the fixture smaller but depends on developer tooling. The fixture README must document whichever option is chosen. | Non-Functional Quality | Medium | Medium | open | — |
| SD-003 | F1.5 and F1.6 both touch `evals/lib/runner.ts`. F1.5 owns git setup around temp-copy initialization; F1.6 owns fixture path resolution before the copy. Second-to-land implementation must rebase and keep both contracts intact. | Integration | Medium | High | open | — |

## Out of Scope

- Authoring `evals/cases/forge-tdd-slice-jvm.yaml` or any other JVM scenario.
- Committing `evals/baselines/forge-tdd-slice-jvm.json`.
- Changing F1.5's forge-JS scenario or git initialization contract.
- Implementing the M3 build-output protocol.
- Adding Cargo, Go, Python, Kotlin, Android, Spring, or multi-module fixtures.
- Regenerating `.claude/` or `.smithy/` snapshots.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Scenario loading supports optional `fixture` metadata with validation coverage.
- **SC-002**: Runner fixture resolution supports default fixture, global `--fixture`, and scenario-level override behavior.
- **SC-003**: `evals/fixture/jvm/` contains a documented minimal Gradle project with deterministic source and test files.
- **SC-004**: Existing eval scenarios that omit `fixture` continue to load and run against the JavaScript fixture by default.
- **SC-005**: Missing or invalid fixture selections fail before agent spawn with clear errors.
- **SC-006**: Unit tests cover the loader, resolver, default compatibility, and JVM fixture shape.

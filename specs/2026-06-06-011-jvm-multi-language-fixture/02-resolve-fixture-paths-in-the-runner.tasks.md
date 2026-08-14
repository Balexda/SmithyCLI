# Tasks: Resolve Fixture Paths in the Runner

**Source**: `specs/2026-06-06-011-jvm-multi-language-fixture/jvm-multi-language-fixture.spec.md` — User Story 2
**Data Model**: `specs/2026-06-06-011-jvm-multi-language-fixture/jvm-multi-language-fixture.data-model.md`
**Contracts**: `specs/2026-06-06-011-jvm-multi-language-fixture/jvm-multi-language-fixture.contracts.md`
**Story Number**: 02

---

## Slice 1: Resolve and Copy Per-Scenario Fixtures
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: The eval runner computes the effective fixture directory for each scenario, applies scenario/global/default precedence, and copies the selected directory before any agent spawn.

**Justification**: User Story 2 is centered on runner fixture resolution after US1 exposes `EvalScenario.fixture`. A single PR can add the separately testable resolver, wire it into the eval orchestrator, and cover the missing-fixture failure path without authoring the JVM fixture or changing existing JavaScript fixture files.

**Addresses**: FR-006, FR-007, FR-008, FR-014; AS 2.1, AS 2.2, AS 2.3, AS 2.4

### Tasks

- [x] **Add effective fixture resolution**

  Add a separately testable fixture resolver in the runner path, using `evals/lib/runner.ts` or a runner-adjacent module consistent with the existing eval library layout. It should consume scenario metadata, the global fixture directory, and the repository fixture root to satisfy AS 2.1-2.4.

  _Acceptance criteria:_
  - Scenario fixture selection takes precedence over the global fixture argument.
  - Omitted scenario fixture selection preserves global-fixture and default-fixture behavior.
  - Scenario selectors resolve under the repository `evals/fixture/` root.
  - Missing or non-directory effective fixtures fail before agent spawn.
  - Resolver coverage exercises default, global override, scenario override, and invalid effective fixture cases.

- [x] **Wire resolution into eval execution**

  Update `evals/run-evals.ts` and the runner call path so each selected scenario is executed against its resolved effective fixture directory. Keep the existing preflight, scenario loading, timeout override, structural validation, sub-agent validation, baseline comparison, and dump behavior unchanged except for using the selected fixture path.

  _Acceptance criteria:_
  - `runScenario` receives the effective fixture directory for each scenario.
  - Console output identifies the effective fixture path used for the scenario.
  - Scenario-level fixture selection overrides `--fixture` for AS 2.3.
  - Scenarios without fixture metadata keep the current `--fixture` behavior for AS 2.1 and AS 2.2.
  - Runner integration coverage proves resolution happens before agent spawning.

- [x] **Preserve selected-fixture checksum behavior**

  Ensure `runScenario` hashes and verifies the same source fixture directory it copies into the temp run. This task keeps fixture mutation detection aligned with the effective fixture selected for AS 2.1-2.3 and prepares US4's default-behavior regression checks.

  _Acceptance criteria:_
  - Checksum validation targets the selected source fixture directory.
  - Source mutation detection still fails when the selected fixture changes during execution.
  - Existing temp-copy cleanup and git initialization behavior remain intact.
  - Existing JavaScript fixture files and current scenario YAML files are not moved or semantically changed.

**PR Outcome**: Eval execution resolves fixture directories per scenario, preserves the global `--fixture` default path for existing scenarios, allows `fixture: jvm` to select `evals/fixture/jvm/`, and fails before agent spawn when the effective fixture is missing or not a directory.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: The fixture selector is specified as `fixture:` with relative paths under `evals/fixture/`, resolving feature-map SD-002 for F1.6. If implementation discovers a current CLI flag path assumption that makes this precedence hard to preserve, update this debt row with the exact compatibility tradeoff before changing the contract. | Integration Points | Medium | High | inherited | — |
| SD-002 | inherited from spec: The Gradle wrapper choice is left to implementation. Including a wrapper improves reproducibility but adds binary/script files; requiring system Gradle keeps the fixture smaller but depends on developer tooling. The fixture README must document whichever option is chosen. | Non-Functional Quality | Medium | Medium | inherited | — |
| SD-003 | inherited from spec: F1.5 and F1.6 both touch `evals/lib/runner.ts`. F1.5 owns git setup around temp-copy initialization; F1.6 owns fixture path resolution before the copy. Second-to-land implementation must rebase and keep both contracts intact. | Integration | Medium | High | inherited | — |

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Resolve and Copy Per-Scenario Fixtures | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Declare Per-Scenario Fixture Selection | depends on | US2 consumes the optional `EvalScenario.fixture` selector and loader validation introduced by US1. |
| User Story 4: Preserve Existing Fixture Behavior | depended upon by | US4 verifies existing default-fixture scenarios, checksum behavior, and generated-output boundaries after runner resolution and JVM fixture support both land. |

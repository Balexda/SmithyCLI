# Tasks: Run smithy.fix Against Local Failure Evidence

**Source**: `specs/2026-06-03-009-smithy-fix-end-to-end-eval-scenario/smithy-fix-end-to-end-eval-scenario.spec.md` — User Story 2
**Data Model**: `specs/2026-06-03-009-smithy-fix-end-to-end-eval-scenario/smithy-fix-end-to-end-eval-scenario.data-model.md`
**Contracts**: `specs/2026-06-03-009-smithy-fix-end-to-end-eval-scenario/smithy-fix-end-to-end-eval-scenario.contracts.md`
**Story Number**: 02

---

## Slice 1: Local Fixture Declaration Contract
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Extend eval scenario loading so a scenario can declare repository-local issue and CI-log fixture files, with validation before any agent invocation starts.

**Justification**: The runner cannot inject local evidence until scenario metadata carries validated fixture paths. This slice delivers the declaration contract independently while keeping existing scenarios that omit local fixtures compatible.

**Addresses**: FR-004, FR-009, FR-013; Acceptance Scenario 2.1

### Tasks

- [x] **Add local fixture metadata to scenarios**

  Extend `evals/lib/types.ts` with optional local fixture metadata matching the data model and contracts. Keep omitted metadata compatible with all existing TypeScript and YAML scenarios, and limit this task to the scenario shape plus local validation types needed by the loader.

  _Acceptance criteria:_
  - `EvalScenario` can represent optional issue and CI-log fixture declarations for AS 2.1.
  - Existing scenario literals and YAML cases remain valid without local fixtures.
  - The new metadata does not change report, baseline, structural, or sub-agent result shapes.
  - Type comments identify local fixtures as scenario metadata consumed before invocation.

- [x] **Validate local fixture declarations in YAML**

  Update `evals/lib/scenario-loader.ts` so scenario loading preserves valid `local_fixtures` declarations and rejects malformed declarations through the existing skip or thrown-validation paths. Validation should enforce the allowed fixture areas and readable repository-local files described by the LocalFixtureSet model and Scenario Local Fixture Declaration contract.

  _Acceptance criteria:_
  - YAML with valid issue and CI-log fixture declarations exposes them to callers for AS 2.1.
  - YAML that omits `local_fixtures` continues to load unchanged.
  - Malformed, escaping, missing, or unreadable fixture paths fail with field-specific diagnostics for FR-009.
  - Both directory loading and single-file loading enforce the same declaration contract.
  - Existing structural expectations, timeout, model, duplicate-name, and sub-agent evidence behavior is unchanged.

**PR Outcome**: Eval scenarios can declare validated local issue and CI-log fixtures, and invalid fixture declarations fail before a runner can accidentally fall back to live GitHub data.

---

## Slice 2: Deterministic Fixture Prompt Injection
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Resolve declared local fixtures inside the temp fixture copy and inject stable references into the scenario invocation for each supported eval agent.

**Justification**: This slice turns validated scenario metadata into the actual prompt evidence smithy.fix receives. It stands alone because scenarios that declare fixtures can now build deterministic invocations, while the committed smithy.fix case can be added afterward.

**Addresses**: FR-003, FR-005, FR-009, FR-010; Acceptance Scenarios 2.1, 2.3

### Tasks

- [ ] **Resolve fixtures in the temp copy**

  Update `evals/lib/runner.ts` so `runScenario` resolves declared local fixtures after copying `evals/fixture/` into the temp execution directory and before spawning the agent. Preserve the source fixture checksum invariant and fail before invocation when a declared file is unavailable in the execution context.

  _Acceptance criteria:_
  - Declared issue and CI-log paths resolve to readable files in the temp copy for AS 2.1.
  - Missing or unreadable bindings fail before agent spawn for FR-009.
  - Source fixture checksumming remains scoped to the original fixture directory for FR-010.
  - Scenarios without local fixtures retain current runner behavior.
  - Fixture resolution never exposes paths outside the allowed fixture area.

- [ ] **Inject fixture paths into invocations**

  Extend the runner invocation path so local fixture bindings are rendered into the scenario prompt in a deterministic form for Claude, Gemini, and Codex. Keep the existing agent-specific command wrapping intact while satisfying the Local Fixture Prompt Injection contract.

  _Acceptance criteria:_
  - Invocation text includes stable issue and CI-log fixture references for AS 2.1.
  - Agent-specific slash-command or skill-name wrapping remains compatible with existing scenarios.
  - Declared fixtures cannot be ignored silently when prompt injection is unavailable.
  - The rendered prompt directs execution toward repository-local evidence without introducing live GitHub requirements.
  - Unit coverage exercises fixture injection and no-fixture compatibility through the public runner-facing path.

**PR Outcome**: The eval runner can build smithy.fix invocations from local fixture evidence in a temp copy, without network credentials and without mutating source fixtures.

---

## Slice 3: Offline smithy.fix Scenario Invocation
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Add the `fix-from-issue` eval scenario that invokes smithy.fix with the committed issue and CI-log fixtures and can complete without GitHub credentials.

**Justification**: With fixture declaration and injection available, this slice delivers the user-visible US2 behavior: the runner can execute the smithy.fix workflow from local failure evidence. Structural helper checks and token baselines remain in later user stories.

**Addresses**: FR-003, FR-004, FR-006, FR-013; Acceptance Scenarios 2.1, 2.2, 2.3

### Tasks

- [ ] **Declare and exercise the smithy.fix fixture scenario**

  Add the `fix-from-issue` YAML case under `evals/cases/` using the issue and CI-log fixtures provided by US1. The prompt should reference the injected local fixture bindings and direct smithy.fix to diagnose from committed evidence, with focused coverage for loading, case selection, and invocation rendering while leaving structural marker refinement to US3.

  _Acceptance criteria:_
  - The scenario declares `name: fix-from-issue` and invokes `/smithy.fix`.
  - The scenario identifies both US1 fixture files through `local_fixtures` for AS 2.1.
  - The prompt uses local fixture bindings and does not ask smithy.fix to fetch live issue, PR, or Actions data for AS 2.2.
  - Scenario metadata remains compatible with the existing eval case loader and report flow.
  - Scenario selection by case name can target `fix-from-issue` for the independent test.
  - The scenario path does not require `GH_TOKEN`, `GITHUB_TOKEN`, or live GitHub CLI access for AS 2.3.
  - The scenario does not introduce token-baseline data or helper evidence owned by later user stories.

**PR Outcome**: A selectable `fix-from-issue` eval scenario runs smithy.fix against repository-local failure evidence and remains usable on machines without GitHub credentials.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: The exact helper-agent evidence set for the offline smithy.fix path is not known until the fixture is run against current smithy.fix behavior. The error-description path may dispatch no helpers at all. The implementation must record the observed helper path and choose stable evidence patterns from that output, or — if the run dispatches none — leave `sub_agent_evidence` empty rather than fabricating patterns. | Integration Points | Medium | Medium | inherited | — |
| SD-002 | inherited from spec: The initial token envelope for the smithy.fix baseline cannot be calibrated until F1.3a's token-aware baseline schema is available and the scenario has a clean captured run. Implementers should choose a conservative initial envelope and document the captured totals in the implementation PR. | Non-Functional Quality | Medium | Medium | inherited | — |

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Local Fixture Declaration Contract | — | — |
| S2 | Deterministic Fixture Prompt Injection | S1 | — |
| S3 | Offline smithy.fix Scenario Invocation | S2 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Provide Offline smithy.fix Fixtures | depends on | US2 consumes the committed issue and CI-log fixture files authored by US1. |
| User Story 3: Validate smithy.fix Output Structure and Helper Evidence | depended upon by | US3 adds stable structural and helper evidence checks to the scenario output produced by this story. |
| User Story 4: Commit the smithy.fix Token-Aware Baseline | depended upon by | US4 captures the token-aware baseline only after this scenario can run successfully offline. |

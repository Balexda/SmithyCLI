# Tasks: Declare Forge Scenarios That Require Git

**Source**: `specs/2026-06-05-010-smithy-forge-end-to-end-eval-scenario-runner-git-init/smithy-forge-end-to-end-eval-scenario-runner-git-init.spec.md` — User Story 1
**Data Model**: `specs/2026-06-05-010-smithy-forge-end-to-end-eval-scenario-runner-git-init/smithy-forge-end-to-end-eval-scenario-runner-git-init.data-model.md`
**Contracts**: `specs/2026-06-05-010-smithy-forge-end-to-end-eval-scenario-runner-git-init/smithy-forge-end-to-end-eval-scenario-runner-git-init.contracts.md`
**Story Number**: 01

---

## Slice 1: Scenario Git Requirement Loader Contract
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Extend the eval scenario type and YAML loader so scenarios can opt into git-backed temp-copy setup through an optional `requires_git` boolean.

**Justification**: This slice delivers the complete declaration contract for US1 without runner git initialization or forge scenario wiring. Once merged, the runner can make decisions from explicit scenario metadata while existing scenarios continue loading unchanged.

**Addresses**: FR-001, FR-002, FR-003, FR-016; Acceptance Scenarios 1.1, 1.2, 1.3

### Tasks

- [x] **Add the scenario git requirement field**

  Extend the shared eval scenario type in `evals/lib/types.ts` with the optional git requirement metadata from the data model. Keep the field absent by default for existing in-memory scenarios and YAML cases, and avoid changing unrelated scenario fields or report shapes.

  _Acceptance criteria:_
  - `EvalScenario` exposes an optional `requires_git` boolean for AS 1.1.
  - Existing TypeScript scenario literals remain valid without setting the field for AS 1.2.
  - No runner behavior is introduced by this type-only change.
  - Public type comments identify the field as scenario metadata, not a runner default.

- [x] **Validate `requires_git` in the YAML loader**

  Update `evals/lib/scenario-loader.ts` so `loadScenarios` and `loadScenarioFromFile` preserve a boolean `requires_git` value when present and reject malformed values through the existing scenario-validation path. The loader should keep omitted values unset or false-equivalent for AS 1.2 while emitting a field-specific validation reason for AS 1.3.

  _Acceptance criteria:_
  - YAML with `requires_git: true` loads with the flag visible to callers.
  - YAML that omits `requires_git` continues to load with current non-git behavior.
  - Non-boolean `requires_git` values fail scenario validation with output naming the field and are excluded from the loaded scenarios — never silently accepted.
  - `loadScenarioFromFile` applies the same `requires_git` validation contract as `loadScenarios`.
  - Duplicate-name handling, deterministic ordering, structural expectations, timeout, and sub-agent evidence loading are unchanged.

**PR Outcome**: Eval scenario YAML can declare `requires_git: true`, existing scenarios that omit it remain compatible, and malformed values fail scenario validation before any runner behavior can infer git requirements.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: The current runner initializes every temp copy as a git repository to support planning-command evals. This feature introduces an explicit `requires_git` scenario contract. Implementers must move forge and any other git-dependent scenarios onto the flag without regressing existing planning-command evals, and must document which existing scenarios require the flag. | Integration Points | Medium | High | inherited | — |
| SD-002 | inherited from spec: The exact single-slice forge task input path is finalized at implementation time. It should reuse the existing JavaScript fixture and avoid planting unrelated language fixtures or multi-slice stories. | Scope Within Milestone | Medium | Medium | inherited | — |
| SD-003 | inherited from spec: The initial token envelope for the forge baseline cannot be calibrated until F1.3a's token-aware baseline schema is available and the scenario has a clean captured run. Implementers should choose a conservative initial envelope and document the captured totals in the implementation PR. | Non-Functional Quality | Medium | Medium | inherited | — |

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Scenario Git Requirement Loader Contract | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Initialize the Temp Fixture Copy for Forge | depended upon by | US2 consumes the explicit `requires_git` metadata introduced here to gate temp-copy git initialization. |

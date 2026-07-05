# Tasks: Initialize the Temp Fixture Copy for Forge

**Source**: `specs/2026-06-05-010-smithy-forge-end-to-end-eval-scenario-runner-git-init/smithy-forge-end-to-end-eval-scenario-runner-git-init.spec.md` — User Story 2
**Data Model**: `specs/2026-06-05-010-smithy-forge-end-to-end-eval-scenario-runner-git-init/smithy-forge-end-to-end-eval-scenario-runner-git-init.data-model.md`
**Contracts**: `specs/2026-06-05-010-smithy-forge-end-to-end-eval-scenario-runner-git-init/smithy-forge-end-to-end-eval-scenario-runner-git-init.contracts.md`
**Story Number**: 02

---

## Slice 1: Gate Runner Git Setup by Scenario Metadata
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Make runner git initialization opt-in through `EvalScenario.requires_git` while preserving fixture copy, skill deployment, checksum, and cleanup behavior for every scenario.

**Justification**: This slice delivers the core behavior change from implicit runner-wide git setup to explicit scenario metadata. It stands alone because non-git scenarios can run without temp repository creation, while git-requiring scenarios still receive the existing repository preparation path.

**Addresses**: FR-005, FR-007, FR-008, FR-016; Acceptance Scenarios 2.1, 2.5

### Tasks

- [ ] **Gate temp repository initialization**

  Update `evals/lib/runner.ts` so git setup runs only when `scenario.requires_git` is true. Preserve the existing temp-copy lifecycle and source-fixture checksum behavior for AS 2.1 and AS 2.5.

  _Acceptance criteria:_
  - A scenario with `requires_git: true` receives git initialization before agent spawn for AS 2.1.
  - A scenario that omits `requires_git` does not invoke runner git setup for AS 2.5.
  - Skill deployment still runs before the agent for git and non-git scenarios.
  - Source fixture checksum validation remains unchanged for both paths.
  - Temp directory cleanup still runs after success and failure.

- [ ] **Cover gated runner behavior**

  Extend `evals/lib/runner.test.ts` around the runner's existing temp-copy and git tests so both opt-in and omitted-flag paths are covered. Keep the tests focused on observable runner behavior from AS 2.1 and AS 2.5.

  _Acceptance criteria:_
  - Tests fail if a non-git scenario performs git initialization.
  - Tests fail if a git-requiring scenario reaches agent spawn without a repository.
  - Existing runner tests for source fixture immutability and cleanup continue to pass.
  - Test coverage does not depend on a developer's global git identity.

- [ ] **Flag existing git-dependent scenarios**

  Update the current YAML scenarios in `evals/cases/` whose commands depend on a git-backed temp copy so they opt into runner git setup through `requires_git`. Keep scenarios that do not need repository operations unflagged for AS 2.5.

  _Acceptance criteria:_
  - Git-dependent planning-command scenarios declare `requires_git: true`.
  - Scenarios without repository-operation requirements continue to omit the flag.
  - Scenario loading remains valid for every updated YAML case.
  - The runner no longer relies on command-name inference to preserve existing git-dependent scenarios.

**PR Outcome**: Runner git setup is controlled by `requires_git`, preserving current git-backed execution for opted-in scenarios and avoiding repository setup for scenarios that do not request it.

---

## Slice 2: Prepare a Deterministic Clean Forge Worktree
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Complete the git-requiring runner path so forge starts from a clean temp repository with repo-local identity, disabled hooks, a HEAD commit, and a deterministic non-default working branch.

**Justification**: This slice finishes the forge-specific repository contract after setup is gated by metadata. It is separate from gating because it tightens the initialized repository's invariants without changing which scenarios receive git setup.

**Addresses**: FR-005, FR-006, FR-007, FR-009, FR-016; Acceptance Scenarios 2.2, 2.3, 2.4

### Tasks

- [ ] **Set the deterministic working branch**

  Update `evals/lib/runner.ts` so a git-requiring temp copy starts agent execution from the non-default branch required by the Temp Git Repository model. Keep the baseline commit and repo-local identity behavior aligned with AS 2.2 and AS 2.4.

  _Acceptance criteria:_
  - The temp repository has a valid HEAD before agent spawn for AS 2.2.
  - Agent execution starts on a deterministic non-default branch for AS 2.4.
  - Branch preparation remains local to the temp copy.
  - Git setup failure prevents agent spawn for the git-requiring scenario.

- [ ] **Keep post-init forge worktrees clean**

  Update the runner's post-`smithy init` baseline handling so git-requiring scenarios spawn with a clean worktree after deployed skills are written. Preserve hook-neutralized, repo-local commit behavior for AS 2.2 and AS 2.3.

  _Acceptance criteria:_
  - Runner-created commits do not depend on global git identity for AS 2.2.
  - Runner-created commits do not run developer or template hooks.
  - The temp repository is clean after skill deployment for AS 2.3.
  - Non-git scenarios do not perform post-init git commits.
  - Source fixture content remains unchanged after git-requiring execution.

- [ ] **Document the opt-in git lifecycle**

  Update `evals/README.md` so the scenario execution description and authoring guidance match the `requires_git` runner contract. Keep the documentation scoped to the eval runner lifecycle and AS 2.1–2.5.

  _Acceptance criteria:_
  - The runner lifecycle describes git setup as `requires_git`-gated.
  - Scenario authoring guidance documents when to set `requires_git: true`.
  - Documentation names the clean temp repository guarantees from AS 2.2–2.4.
  - Existing fixture checksum and cleanup guarantees remain documented.

**PR Outcome**: Git-requiring scenarios start forge from a deterministic clean temp repository, and the runner documentation explains the opt-in lifecycle without implying all scenarios receive git setup.

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
| S1 | Gate Runner Git Setup by Scenario Metadata | — | — |
| S2 | Prepare a Deterministic Clean Forge Worktree | S1 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Declare Forge Scenarios That Require Git | depends on | US2 consumes the `requires_git` scenario metadata introduced by US1. |
| User Story 3: Run smithy.forge Against the JavaScript Fixture | depended upon by | US3 depends on US2's git-backed temp copy before adding the forge scenario. |

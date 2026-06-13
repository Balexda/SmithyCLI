# Tasks: Provide Offline smithy.fix Fixtures

**Source**: `specs/2026-06-03-009-smithy-fix-end-to-end-eval-scenario/smithy-fix-end-to-end-eval-scenario.spec.md` — User Story 1
**Data Model**: `specs/2026-06-03-009-smithy-fix-end-to-end-eval-scenario/smithy-fix-end-to-end-eval-scenario.data-model.md`
**Contracts**: `specs/2026-06-03-009-smithy-fix-end-to-end-eval-scenario/smithy-fix-end-to-end-eval-scenario.contracts.md`
**Story Number**: 01

---

## Slice 1: Offline smithy.fix Failure Evidence

**Goal**: Commit the local issue and CI-log evidence that lets a future `fix-from-issue` eval drive smithy.fix without fetching GitHub issue or Actions data.

**Justification**: The smithy.fix scenario cannot be deterministic until its problem statement and CI failure evidence live in the repository. This slice provides only the offline fixture inputs; scenario metadata, runner path injection, structural checks, and baselines are handled by dependent user stories.

**Addresses**: FR-001, FR-002, FR-003; Acceptance Scenarios 1.1, 1.2, 1.3

### Tasks

- [x] **Add the issue fixture** — create a Markdown issue fixture under `evals/fixture/issues/` that describes a concrete, fixable health-check failure, names local file paths that smithy.fix can inspect, and explicitly states that live GitHub issue or pull-request data is not required.

- [x] **Add the CI-log fixture** — create a text CI-log fixture under `evals/fixture/ci-logs/` with deterministic build and smoke-test output, including the failing HTTP evidence and local file references needed for diagnosis without `gh run view`.

- [x] **Keep the evidence bounded and local** — ensure both fixtures are UTF-8 text, repository-local, and small enough to serve as stable prompt evidence for the offline eval path.

- [x] **Document the fixture directories** — update the eval fixture README so future scenario authors can identify the issue and CI-log fixture locations without relying on source-template documentation.

**PR Outcome**: The repository contains offline smithy.fix issue and CI-log evidence that can seed the later `fix-from-issue` scenario while requiring no live GitHub issue, pull-request, or Actions API access.

---

## Specification Debt

_None — all User Story 1 fixture-authorship ambiguity is resolved._

---

## Dependency Order

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Offline smithy.fix Failure Evidence | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Run smithy.fix Against Local Failure Evidence | depended upon by | US2 consumes these committed fixture files when adding local fixture declarations and deterministic prompt injection. |
| User Story 3: Validate smithy.fix Output Structure and Helper Evidence | depended upon by | US3 chooses stable validation markers from the scenario output produced with these fixtures. |
| User Story 4: Commit the smithy.fix Token-Aware Baseline | depended upon by | US4 captures a token-aware baseline after the full scenario runs successfully against this fixture evidence. |

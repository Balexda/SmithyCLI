# Feature Specification: Implementation From an Untracked Working Plan

**Spec Folder**: `2026-11-23-016-implementation-from-an-untracked-working-plan`
**Branch**: `feature/smithy/mark/strike-redesign-m1-f2`
**Created**: 2026-11-23
**Status**: Draft
**Input**: [Strike Redesign RFC](../../docs/rfcs/2026-003-strike-redesign/strike-redesign.rfc.md#milestone-1-shared-implementation-procedure)
**Source Feature Map**: `docs/rfcs/2026-003-strike-redesign/01-shared-implementation-procedure.features.md` — Feature 2: Implementation From an Untracked Working Plan

## Clarifications
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

### Session 2026-11-23

- The feature map defines the three agent roles and the forge compatibility baseline. The caller supplies the working plan and owns progress updates.

## Artifact Hierarchy
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

RFC → Milestone → Feature → User Story → Slice → Tasks

## User Scenarios & Testing
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: optional -->

### User Story 1: Complete a Task From a Working Plan (Priority: P1)

As a caller implementing a change from a working plan, I want success tied to the task's code-and-test commit so I can record progress locally and deliver a patch containing only the change.

**Why this priority**: Strike cannot reuse the implementer unless task success can be proven without a committed checkbox.

**Independent Test**: Dispatch the implementation agent against an ignored working plan in a fixture repository and inspect its result, the index, and the commits.

**Acceptance Scenarios**:

1. **Given** an explicit untracked-plan dispatch, **When** the task's code and tests pass validation and land in a commit without a checkbox flip, **Then** the implementer reports success with that commit's SHA and the caller can record completion in the working plan.
2. **Given** an attempted forced add of the plan, **When** the task executes, **Then** staging is prevented and the plan is absent from the index and every resulting commit.
3. **Given** a failed test, failed commit, or progress recorded without a task commit, **When** the result is evaluated, **Then** the task cannot be reported as successful or advanced as complete.

### User Story 2: Review Against the Supplied Sources (Priority: P1)

As a caller using the working plan, I want code review grounded in the task brief and documentation review grounded in the request and plan so the agents evaluate the intended change without requiring a tracked spec.

**Why this priority**: Review grounded in an unrelated or absent tracked spec would judge the wrong change.

**Independent Test**: Supply a working plan and request that differ from an unrelated tracked spec. Exercise both review agents against a change that violates the supplied brief and leaves documentation stale.

**Acceptance Scenarios**:

1. **Given** an explicit untracked-plan review dispatch, **When** `smithy-implementation-review` evaluates the diff, **Then** it uses the working plan's selected task brief as authoritative and returns read-only findings.
2. **Given** an explicit untracked-plan documentation dispatch, **When** `smithy-maid` checks the changed files and their documentation, **Then** it uses the request and working plan as authoritative and returns the existing documentation-check result.
3. **Given** a missing or unreadable authoritative input on an explicit untracked-plan dispatch, **When** the agent checks its inputs, **Then** it surfaces the missing input and does not fall back to tracked-plan instructions.

### User Story 3: Keep Forge on Tracked Plans (Priority: P1)

As a team forging existing plans, I want forge to keep using committed checkboxes so the completion signals my workflow relies on remain valid.

**Why this priority**: Existing forge workflows depend on committed checkboxes as their completion signal.

**Independent Test**: Automatically check deployed forge on Claude, Gemini, and Codex across both supported plan modes.

**Acceptance Scenarios**:

1. **Given** a `.tasks.md` slice or legacy `.strike.md` plan, **When** forge selects its procedure on each supported runtime, **Then** its dispatch or inline path uses the tracked-plan form and retains the committed-checkbox requirement.
2. **Given** a forge dispatch without a plan form, **When** an agent receives it, **Then** it applies the existing tracked-plan contract.

### Edge Cases

- The supplied working plan is already tracked by Git, or staging protection cannot be established: the untracked-plan dispatch is blocked rather than run unprotected.
- An intermediate sub-agent commit includes the plan even though the final tree is clean: the violation is surfaced and task completion is not accepted.

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Complete a Task From a Working Plan | — | — |
| US2 | Review Against the Supplied Sources | — | — |
| US3 | Keep Forge on Tracked Plans | US1, US2 | — |

## Requirements
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: recommended -->

- **FR-001 (US1–US3)**: The caller MUST explicitly select the untracked-plan form for each of the three agent roles. The existing tracked form MUST remain the default. Shared rules MUST have one canonical definition under INV-1, and deployable instructions MUST remain portable under INV-2.
- **FR-002 (US1)**: The implementer MUST use the validated code-and-test commit as success evidence and return its SHA. The caller MUST record progress in the working plan without committing that update.
- **FR-003 (US1–US2)**: The execution boundary MUST keep the working plan out of the index and every sub-agent commit, including under forced staging. Protection MUST be enforced and verified under INV-7. A clean final tree alone does not demonstrate compliance.
- **FR-004 (US2)**: The implementation reviewer MUST judge the diff against the selected task brief from the working plan. Maid MUST use the request and working plan as the authority for documentation drift. Reviewers MUST retain their existing read-only findings and documentation result contracts.
- **FR-005 (US3)**: Forge MUST stay on its tracked-checklist form for every supported mode and runtime, including inline execution. The completion gate MUST continue to use the tracked checklist at HEAD.

## Assumptions
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- The caller supplies a readable working plan that is outside Git tracking and identifies the task brief for each task dispatch.
- The caller maintains the working plan's task progress. Its file format and lifecycle belong to the caller.

## Specification Debt
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

_None._

## Out of Scope
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- Strike integration with the shared implementation procedure and changes to forge behavior.
- Working-plan creation, ignore configuration, resume handling, and cleanup.
- Context-limited result judges.

## Success Criteria
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- **SC-001 (US1)**: A fixture run returns success with the SHA of a passing code-and-test commit containing no checkbox flip. A failed task returns a non-success result.
- **SC-002 (US1–US2)**: Tests show ordinary staging excludes the working plan and an attempted forced add cannot stage it. Inspect the index and all commits produced through each agent role, including intermediate commits, for the plan's absence.
- **SC-003 (US2)**: Review fixtures show the working plan brief governs implementation review and the request and working plan govern maid's documentation checks, with existing result shapes.
- **SC-004 (US3)**: Automated coverage checks both forge plan modes across Claude, Gemini, and Codex and verifies that none selects the untracked-plan form, including the rendered inline path. Tracked completion still requires the checkbox at HEAD.

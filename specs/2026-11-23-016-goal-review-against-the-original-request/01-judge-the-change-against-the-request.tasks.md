# Tasks: Judge the Change Against the Request

**Source**: `specs/2026-11-23-016-goal-review-against-the-original-request/goal-review-against-the-original-request.spec.md` — User Story 1
**Data Model**: `specs/2026-11-23-016-goal-review-against-the-original-request/goal-review-against-the-original-request.data-model.md`
**Contracts**: `specs/2026-11-23-016-goal-review-against-the-original-request/goal-review-against-the-original-request.contracts.md`
**Story Number**: 01

---

## Slice 1: Deliver the Read-Only Goal Reviewer
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Deliver a reviewer that checks the change against the original request and returns evidence for each criterion.

**Justification**: A standalone dispatch can exercise the complete review contract before integration into a calling workflow.

**Addresses**: FR-001–FR-004, FR-007, AS 1.1–1.3, SC-001–SC-003.

### Tasks

- [ ] **Deploy the read-only goal reviewer**

  Add the reviewer under `src/templates/agent-skills/agents/` using the Goal Review Dispatch and Integration Boundaries contracts. Exercise AS 1.1 with the evidence cases in SC-001 through a standalone dispatch.

  _Acceptance criteria:_
  - The reviewer declares a provider-neutral tier, passes description lint, and renders portable instructions free of specific orchestrator, PRD and issue references.
  - The dispatch completes without explicit effort. Its payload carries the verbatim request, criteria, change and required routing context while withholding the plan, tasks and other reviewers' findings.
  - The read-only reviewer returns one verdict per criterion reference, with evidence or a specific gap, and completes without asking for the plan or tasks. The fixtures cover met, unmet and unverified verdicts.
  - Existing Forge reviews continue without a goal-review dispatch.

- [ ] **Report request omissions through the shared review protocol**

  Compose the canonical review protocol, including its kind gate, in the goal-review agent template. Exercise AS 1.2 and AS 1.3 in the standalone review fixture.

  _Acceptance criteria:_
  - A requirement missing from both the supplied criteria and the change yields a finding alongside the complete criterion verdicts.
  - Each finding uses the shared shape, including its kind and routed destination, with routing context supplied by the caller.
  - Confidence follows the evidence and stays unchanged when another reviewer agrees. A failing test outweighs a reviewer verdict.

**PR Outcome**: A standalone goal review returns criterion verdicts, routed findings and a summary for the supplied change.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

_None — no specification debt was recorded._

## Open Implementation Questions
<!-- audience: builder; mode: reference; length: one table row per question; diagram: optional; examples: discouraged -->

_None — no open implementation questions._

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Deliver the Read-Only Goal Reviewer | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Verify Dispatch Context on Each Runtime | depended upon by | Requires the deployed reviewer for the Claude and Codex context probes. |

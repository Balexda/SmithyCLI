# Feature Specification: Goal Review Against the Original Request

**Spec Folder**: `2026-11-23-016-goal-review-against-the-original-request`
**Branch**: `master`
**Created**: 2026-11-23
**Status**: Draft
**Input**: Strike Redesign RFC, Milestone 2 result-judge and dispatch-context requirements
**Source Feature Map**: `docs/rfcs/2026-003-strike-redesign/02-context-limited-result-judges.features.md` — Feature 1: Goal Review Against the Original Request

## Clarifications
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| Topic | Resolution |
|-------|------------|
| Missing evidence | A criterion that cannot be verified receives an explicit verdict with the evidence gap. The reviewer still covers the rest of the criteria. |
| Probe interpretation | Inheritance is evaluated per runtime. An inconclusive attempt leaves independence unverified and requires a valid run before handoff. |

## Artifact Hierarchy
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

RFC 2026-003 → M2 Context-Limited Result Judges → F1 Goal Review Against the Original Request → US1–US2.

## User Scenarios & Testing
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: recommended -->

### User Story 1: Judge the Change Against the Request (Priority: P1)

As a Strike operator, I want the result checked against my original request so I can spot requirements the implementation plan overlooked.

**Why this priority** — A completed plan gives the operator no evidence about requirements the plan omitted.

**Independent Test** — Dispatch the reviewer without an explicit effort setting using a request, criteria and a change that satisfies one criterion and omits another.

1. **Given** the verbatim request, its criteria and an implemented change, **when** the reviewer evaluates the change, **then** it returns exactly one evidence-based verdict per criterion and completes without asking for the plan or tasks.
2. **Given** the request contains a requirement omitted by the criteria, **when** the change also omits it, **then** the reviewer reports the discrepancy as a finding while still returning verdicts for the supplied criteria.
3. **Given** a discrepancy merits a finding, **when** the reviewer returns it, **then** the result uses the shared finding shape with a kind and routed destination. Agreement with another review leaves confidence unchanged.

### User Story 2: Verify Dispatch Context on Each Runtime (Priority: P1)

As a Strike operator, I want verified runtime evidence about inherited context so that review independence is reported accurately.

**Why this priority** — Inherited context can expose withheld material even when the dispatch payload is correct.

**Independent Test** — Run a controlled context probe on Claude and Codex and compare each result to the dispatched control and withheld parent-only material.

1. **Given** a parent session with unique parent-only material about the plan, tasks and another review, **when** the reviewer is dispatched with the allowed inputs and a distinct positive control, **then** the probe records for each runtime whether the reviewer starts with material beyond the dispatch. The withheld material exists only in the parent conversation during this probe.
2. **Given** a valid probe shows extra context on either runtime, **when** the result is recorded, **then** that runtime is classified as degraded like Gemini and the handoff requires Milestone 3 to say that no independent review ran in both terminal output and the pull request.

### Edge Cases

- Insufficient evidence for one criterion yields an unverified verdict with a reason. A demonstrated omission yields an unmet verdict.
- A failed dispatch or a missing positive control leaves the probe inconclusive. Record the failure and obtain a valid result before declaring the feature complete.

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Judge the Change Against the Request | — | specs/2026-11-23-016-goal-review-against-the-original-request/01-judge-the-change-against-the-request.tasks.md |
| US2 | Verify Dispatch Context on Each Runtime | US1 | — |

## Requirements
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: recommended -->

- **FR-001** — The read-only goal reviewer MUST evaluate the change using the verbatim request and the supplied criteria. Its dispatch withholds the plan, tasks and other reviewers' findings.
- **FR-002** — The reviewer MUST return a verdict and supporting evidence or an evidence gap for every supplied criterion, and MUST complete without asking for the plan or tasks.
- **FR-003** — The reviewer MUST compose the existing review protocol and kind gate (INV-1), including their finding and destination rules. Evidence determines confidence independently of other reviewers' agreement. A failing test outweighs a reviewer verdict.
- **FR-004** — The reviewer MUST declare a provider-neutral tier and operate without an explicit effort setting. The description MUST pass the template lint budget. Deployed text MUST be portable and free of specific orchestrator, PRD and issue references (INV-2).
- **FR-005** — The dispatch-context probe MUST be run and recorded separately on Claude and Codex. Each record MUST identify the runtime and version, dispatch mode, control result, observed inheritance result and supporting evidence.
- **FR-006** — A runtime that inherits context beyond its dispatch MUST be recorded as degraded. The record MUST carry forward the terminal and pull request reporting requirement to Milestone 3.
- **FR-007** — Forge MUST continue its existing reviews without dispatching the goal reviewer.

## Assumptions
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- The dispatching workflow owns verdict reporting, verification of reviewer findings and decisions about fixes or escalation. The reviewer returns evidence and does so read-only.

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

_None — no specification debt was recorded._

## Out of Scope
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- The diff-only profile, git-ignored plan access probe and plan-file handling belong to F2.
- Strike's production dispatch, fix round and runtime-specific reporting belong to Milestone 3.

## Success Criteria
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- **SC-001** — A review fixture with a met and an unmet criterion returns both verdicts with evidence, and a fixture with insufficient evidence returns an explicit unverified verdict. The dispatch evidence shows the withheld inputs were omitted and the reviewer asked for neither the plan nor the tasks.
- **SC-002** — Template inspection confirms a provider-neutral tier, shared protocol composition, portable deployed text and no goal-review dispatch from Forge. Template lint passes and a reviewer run completes without explicit effort.
- **SC-003** — Findings carry the shared kind and destination fields. Their confidence is unchanged when another reviewer agrees.
- **SC-004** — Two valid probe records, one for Claude and one for Codex, document the observed context boundary. Every runtime with observed inheritance is marked degraded and carries the two-surface reporting requirement for Milestone 3.

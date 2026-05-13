<!--
PLANTED EVAL FIXTURE — DO NOT "FIX" THIS FILE.

This `.spec.md` is a deliberately flawed planted artifact. The flaw is the
intentional absence of a `## Dependency Order` section.

Violated checklist invariant:
  - Audit Checklist for `.spec.md` artifacts, row "Dependency Order".
  - Requirement: a spec contains a `## Dependency Order` section structured
    as a 4-column Markdown table with headers
    `ID | Title | Depends On | Artifact`, with `US<N>` IDs unique within
    the table, `Depends On` listing only same-table IDs (or `—`), and
    every `Artifact` cell either `—` or a repo-relative path to an
    existing `.tasks.md` file.

Why this plant exists:
The audit-flawed-spec eval scenario runs `/smithy.audit` against this file
and asserts the audit's output contains the literal string `Dependency
Order` plus at least one `Critical` finding. Repairing the flaw — that is,
adding a `## Dependency Order` section back — would cause the eval to
report PASS-against-nothing or FAIL, which is the desired regression
signal but only when deliberately triggered. Routine cleanup must NOT
"fix" the missing section.

Maintainer instructions:
  - DO NOT add a `## Dependency Order` section to this file.
  - DO NOT introduce a placeholder, comment, or table stub purporting to
    be the `## Dependency Order` section — even an empty section breaks
    the plant.
  - If the audit checklist's wording around `Dependency Order` changes
    (for example, renaming the section to `Implementation Order`),
    coordinate the change with the consuming eval scenario's
    `required_patterns` so the two stay in sync.
-->

# Feature Specification: Add a health-check endpoint to the demo API

**Spec Folder**: `audit-eval`
**Branch**: `audit-eval/example`
**Created**: 2026-05-12
**Status**: Draft
**Input**: User description — Expose a `/health` endpoint on the demo API so external monitors can verify the service is up without invoking domain routes that have authentication or side effects.

## Clarifications

### Session 2026-05-12

- The endpoint returns plain JSON `{"status":"ok"}` with HTTP 200 when the process is responsive. `[Critical Assumption]`
- No authentication is required — the endpoint is intentionally public so external health monitors and load balancers can hit it without credentials. `[Critical Assumption]`
- The endpoint reports only process liveness; it does not probe downstream dependencies (database, queue, third-party APIs). Dependency-aware readiness is deferred.

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

This spec sits at the user-story level: a single small endpoint addition with no parent RFC. The spec exists in isolation purely to give the audit eval a complete-but-flawed artifact to audit.

## User Scenarios & Testing *(mandatory)*

### User Story 1: Operators receive a 200 response from `/health` while the API is up (Priority: P1)

As an operator monitoring the demo API, I want a dedicated health endpoint so that I can confirm the service is up without invoking domain routes that may have authentication, side effects, or cost.

**Why this priority**: External monitoring is a precondition for any production deploy; the endpoint is the smallest, lowest-risk addition that unblocks that monitoring path.

**Independent Test**: Start the API process locally and issue `GET /health`; the response is HTTP 200 with body `{"status":"ok"}`.

**Acceptance Scenarios**:

1. **Given** the API process is running, **When** a client sends `GET /health`, **Then** the response status is `200` and the body is JSON `{"status":"ok"}`.
2. **Given** the API process is running, **When** a client sends `GET /health` with no `Authorization` header, **Then** the response is `200` — the endpoint is intentionally unauthenticated.

---

### User Story 2: Monitors receive a non-`200` response when the API is unhealthy (Priority: P2)

As an operator, I want the health endpoint to surface a non-`200` status when the process cannot serve traffic, so that monitors can page on real outages instead of silent failures.

**Why this priority**: User Story 1 covers the happy path; this story exists to capture the failure-mode contract so monitors have an actionable signal during incidents.

**Independent Test**: Force the process into a known-unhealthy state (e.g., simulated uncaught startup error) and confirm `GET /health` returns `503`.

**Acceptance Scenarios**:

1. **Given** the API process is in a known-unhealthy state, **When** a client sends `GET /health`, **Then** the response status is `503`.

---

### Edge Cases

- Concurrent traffic: the endpoint must not block on a shared mutex or other contended resource, otherwise a saturated process is reported healthy when it cannot answer requests.
- Process startup window: the endpoint should be registered before any domain routes so it answers as soon as the HTTP listener is bound.
- Long-lived connections: streaming responses from elsewhere in the API must not delay `/health` responses past the configured monitor timeout.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The demo API MUST expose `GET /health`.
- **FR-002**: When the process is healthy, the endpoint MUST respond `200 OK` with the JSON body `{"status":"ok"}`.
- **FR-003**: When the process is unhealthy, the endpoint MUST respond `503 Service Unavailable`.
- **FR-004**: The endpoint MUST NOT require authentication.
- **FR-005**: The endpoint MUST respond within 50ms p95 under nominal load.

### Key Entities *(include if feature involves data)*

- **HealthStatus**: A value object with a single field `status` whose value is the literal string `"ok"` when the process is healthy. Surfaced only through the HTTP response body — never persisted.

## Assumptions

- The demo API uses Express; route registration follows the existing router pattern.
- No external monitoring configuration (CloudWatch, Prometheus, Pingdom) needs to change as part of this story — operators wire endpoints into their own tooling separately.
- Operators have a sidecar or external probe responsible for declaring the process unhealthy; this story does not specify how an in-process component flips the health bit.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Readiness vs. liveness semantics: this story implements only liveness. Dependency-aware readiness (database ping, queue probe) is deferred but may be requested before production launch. | Functional Scope | Medium | High | open | — |
| SD-002 | The mechanism by which the process is declared "unhealthy" is unspecified — FR-003 names the contract but not how the bit is set. A follow-up story selects between a static in-memory flag, a watchdog probe, or a sidecar signal. | Domain & Data Model | Medium | Medium | open | — |

## Out of Scope

- Dependency-aware readiness checks (database, queue, third-party dependencies).
- Authenticated diagnostics endpoints (`/debug`, `/metrics`).
- Multi-region health aggregation.
- Alerting and paging integrations — operators wire monitors to the endpoint separately.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `GET /health` returns HTTP `200` with body `{"status":"ok"}` within 50ms p95.
- **SC-002**: An induced unhealthy state causes `GET /health` to return HTTP `503` within one second of the state change.
- **SC-003**: Adding the endpoint does not affect the response time of any existing domain route by more than 5ms p95.

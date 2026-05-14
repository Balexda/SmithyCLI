<!--
SCENARIO: cut-from-spec (evals/cases/cut-from-spec.yaml)
TYPE: representative (non-flawed) parent-artifact plant
PURPOSE: Provides input to the cut-from-spec eval scenario, which exercises
  /smithy.cut against this spec and asserts the resulting tasks file
  inherits SD-001 with the `inherited from spec:` literal.
DO NOT "fix" or "clean up": this file is a deliberate eval fixture. Removing
  US1 or flipping SD-001 to `resolved` will silently break the
  cut-from-spec scenario.
-->

# Feature Specification: Add a Health Check Endpoint to the Fixture Express Application

**Spec Folder**: `cut-eval`
**Branch**: `cut-eval/health-check-endpoint`
**Created**: 2026-05-12
**Status**: Draft
**Input**: User description — add an HTTP health check endpoint to the Express application this fixture represents so external orchestrators can verify the service is alive and responding before routing traffic to it.

## Clarifications

### Session 2026-05-12

- The health check endpoint returns HTTP 200 with a small JSON body indicating liveness; no upstream dependency probing is required for the first cut. `[Critical Assumption]`
- The endpoint is unauthenticated (orchestrators may not have credentials when probing) and is exempt from any rate limiting that would otherwise apply to API routes. `[Critical Assumption]`
- The exact path of the endpoint (`/health`, `/healthz`, `/status`, or other) is intentionally left ambiguous in this spec and resolved during task decomposition; see SD-001.
- The endpoint is mounted on the same Express application instance as the rest of the API (no separate process or port). `[Critical Assumption]`

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

This feature lives at the user-story level. There is no parent RFC for this fixture spec; the originating description is the user input above.

## User Scenarios & Testing *(mandatory)*

### User Story 1: Add a health check endpoint exposing service liveness (Priority: P1)

As an external orchestrator (load balancer, container platform, or uptime monitor), I want a stable HTTP endpoint that returns a 200 response when the Express application this fixture represents is alive and serving requests, so that I can route traffic to healthy instances and pull unhealthy instances out of rotation without false positives.

**Why this priority**: The Express application this fixture represents currently exposes no health check surface at all (the fixture README explicitly notes this as an Intentional Gap). Until a liveness endpoint exists, orchestrators must fall back on TCP-level probes or full API requests, both of which produce false-positive healthy signals when the application is partially degraded.

**Independent Test**: With the endpoint implemented and the application running, a single HTTP GET to the chosen health path returns 200 with a JSON body. The check is independent of any other API route — no auth, no database, no upstream calls.

**Acceptance Scenarios**:

1. **Given** the Express application is running and listening, **When** an unauthenticated HTTP GET is issued to the chosen health path, **Then** the response is HTTP 200 with a JSON body indicating liveness.
2. **Given** the application has not finished booting, **When** the same GET is issued, **Then** the response is either a connection error or a non-200 status — never a 200 from a partially-initialized application.
3. **Given** the health endpoint exists, **When** an existing API route is exercised, **Then** the existing route's behavior is unchanged (the new endpoint does not regress existing routes).

---

### Edge Cases

- The health path collides with an existing API route. Mitigation: pick a path under a reserved prefix and verify no collision exists during task implementation.
- An orchestrator probes the endpoint at a rate that would otherwise trigger rate limiting. Mitigation: exempt the health path from rate-limit middleware.
- The endpoint accidentally exposes internal state (build hashes, environment variables). Mitigation: keep the response body minimal (a single liveness flag).

## Dependency Order

Recommended implementation sequence (priority, then independence):

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Add a health check endpoint exposing service liveness | — | — |

US1 is the only story in this spec — cut's "user story 1" routing must resolve deterministically against this single row.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Express application MUST expose a single health check endpoint that returns HTTP 200 when the application is alive and listening.
- **FR-002**: The health endpoint MUST be unauthenticated and reachable without API keys, session cookies, or any other credential.
- **FR-003**: The health endpoint MUST be exempt from any rate-limiting middleware applied to the rest of the API.
- **FR-004**: The health endpoint's response body MUST be a small JSON document indicating liveness; it MUST NOT expose secrets, build hashes, or environment variables.
- **FR-005**: Existing API routes MUST continue to behave identically after the health endpoint is added; the new endpoint is strictly additive.

### Key Entities

- **HealthResponse** *(new)*: The JSON body returned by the health endpoint. A minimal object with a single liveness indicator (e.g., `{ "status": "ok" }`). No timestamps, build identifiers, or environment details.

## Assumptions

- The Express application this fixture represents has a single mount point; the health endpoint is added at that same mount point and not on a separate process or port.
- Orchestrators that probe the endpoint expect a 200 within a few hundred milliseconds; the endpoint MUST NOT perform any I/O that could block beyond that window.
- The Express middleware stack ordering supports inserting the health route before any auth or rate-limit middleware so the exemption requirements are satisfied by mount ordering, not by per-middleware allowlists.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Health check endpoint contract is not pinned to a specific path (`/health`, `/healthz`, `/status`) — downstream task slices must choose and the choice is currently ambiguous. The chosen path becomes part of the public contract orchestrators integrate against, so the choice is non-trivial to revisit once external consumers have hard-coded it. | Functional Scope | Medium | Medium | open | — |

## Out of Scope

- **Readiness checks** (distinguishing "alive" from "ready to serve traffic"). The first cut covers liveness only; readiness — which would probe upstream dependencies — is deferred.
- **Health metrics export** (Prometheus, OpenTelemetry, etc.). The endpoint returns a binary alive/not-alive signal; metrics integrations are a follow-up.
- **Authenticated diagnostic endpoints** (returning detailed status to authenticated callers). Out of scope; the public health endpoint stays unauthenticated and minimal.
- **Multi-region health aggregation**. Out of scope; the endpoint reports the local instance's health only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A single HTTP GET against the chosen health path returns HTTP 200 with a JSON body in fewer than 500ms under no load.
- **SC-002**: All existing API route tests continue to pass after the health endpoint is added; no regressions.
- **SC-003**: An orchestrator probing the endpoint at 1 request per second for 60 seconds receives 60 successful 200 responses with no rate-limit rejections.

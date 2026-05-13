# Strike: Add Health Check Endpoint

**Date:** 2026-05-13  |  **Branch:** strike/health-check-v2  |  **Status:** Ready

## Summary

This strike adds a dedicated health check endpoint to the service to facilitate automated monitoring and operational visibility. It introduces a new modular route that provides critical telemetry data, including process uptime and application versioning, aligned with production-grade microservice standards.

## Goal

Provide a reliable, machine-readable `/health` endpoint that returns the operational status and basic telemetry of the application.

## Out of Scope

- Deep health checks for downstream services (databases, external APIs).
- Authentication or rate-limiting for the health endpoint.
- Advanced monitoring integration (e.g., Prometheus metrics).

## Requirements

- **FR-001**: The application MUST expose a `GET /health` endpoint.
- **FR-002**: The endpoint MUST return a `200 OK` status when the service is responsive.
- **FR-003**: The response payload MUST be a JSON object containing `status`, `uptime`, `version`, and `timestamp`.
- **FR-004**: The health check logic MUST be isolated in a dedicated router module (`src/routes/health.ts`).
- **FR-005**: The health router MUST be mounted in `src/index.ts` before business logic routers.

## Success Criteria

- **SC-001**: `curl -X GET http://localhost:${PORT}/health` returns `{ "status": "UP", ... }`.
- **SC-002**: The `uptime` field accurately reflects the process uptime in seconds.
- **SC-003**: The `version` field matches the version specified in `package.json`.
- **SC-004**: The code follows the project's TypeScript and Express routing conventions.

## User Flow

The health check is primarily consumed by automated systems (load balancers, Kubernetes liveness probes).
1. An orchestrator sends a `GET` request to `/health`.
2. The application responds with a JSON payload and HTTP 200.
3. The orchestrator confirms the service is healthy based on the response code and status field.

## Data Model

Define a `HealthResponse` interface in `src/types.ts` to ensure type safety for the health check payload.

## Contracts

### `GET /health`
**Response Body**:
```json
{
  "status": "UP",
  "uptime": 123.456,
  "version": "1.0.0",
  "timestamp": "2026-05-13T12:00:00.000Z"
}
```

## Decisions

- **Architecture Choice**: Use a dedicated router module instead of direct registration in `index.ts`. This maintains consistency with the existing modular structure and allows for easier extension of diagnostic checks in the future.
- **Mount Point**: Mount at root `/health` rather than `/api/health` to simplify load balancer configuration and follow common industry patterns for health probes.
- **Payload Depth**: Included `uptime` and `version` to provide "medium-depth" telemetry beyond a simple "ok" response, aiding in rollout verification and basic performance monitoring.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | No testing framework configured in `package.json`. | Quality | High | High | open | — |
| SD-002 | Hardcoded versioning or manual sync required if dynamic reading fails. | Maintenance | Medium | High | open | — |

## Single Slice

**Goal**: Implement the `/health` endpoint with full telemetry.

**Justification**: This is a standalone infrastructure improvement that delivers immediate value for monitoring without affecting business logic.

### Tasks

- [ ] Task 1: Enable `resolveJsonModule` in `tsconfig.json` to allow idiomatic import of `package.json`.
- [ ] Task 2: Define `HealthResponse` interface in `src/types.ts`.
- [ ] Task 3: Create `src/routes/health.ts` with the health check logic and telemetry payload.
- [ ] Task 4: Update `src/index.ts` to import and mount the health router at the root `/health` path.
- [ ] Task 5: Verify the endpoint manually using `curl` after starting the server.

**PR Outcome**: A fully functional health check endpoint with isolated routing and structured telemetry output.

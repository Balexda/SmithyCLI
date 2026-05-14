<!--
SCENARIO: cut-from-spec (evals/cases/cut-from-spec.yaml)
TYPE: representative (non-flawed) parent-artifact plant
PURPOSE: Companion contracts file for cut-eval.spec.md. Cut's Phase 1 reads
  this file as part of its spec input set; this plant exists so that read
  succeeds.
DO NOT "fix" or "clean up": this file is a deliberate eval fixture committed
  for the cut-from-spec scenario.
-->

# Contracts: Add a Health Check Endpoint to the Fixture Express Application

## Overview

This feature introduces one new HTTP interface (the health check endpoint) and no new programmatic interfaces internal to the application. External orchestrators consume the HTTP interface; no internal modules depend on it.

## Interfaces

### 1) Health Check HTTP Endpoint

**Purpose**: A single unauthenticated HTTP endpoint that returns 200 when the application is alive and listening.

**Consumers**:
- External orchestrators (load balancers, container platforms, uptime monitors) that probe the endpoint to decide whether to route traffic to this instance.

**Providers**:
- The Express application this fixture represents, which mounts the route during application bootstrap.

#### Signature

```
GET <health-path>
  → 200 OK
    Content-Type: application/json
    Body: { "status": "ok" }
```

The exact value of `<health-path>` is intentionally not pinned by this contract; see the spec's `SD-001`. Downstream task slices must select a concrete path.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| (HTTP method) | string | Yes | MUST be `GET`. Other methods MAY return 405 Method Not Allowed; non-GET behavior is not pinned by this contract. |
| (request body) | n/a | No | No request body is read. |
| (auth credentials) | n/a | No | No credentials are read. The endpoint is unauthenticated per FR-002. |

#### Outputs

| Field | Description |
|-------|-------------|
| HTTP status | `200` when the application is alive and listening. |
| `Content-Type` header | `application/json`. |
| Response body | A JSON object conforming to the `HealthResponse` entity in the data model (a single `status` field set to `"ok"`). |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Application not yet bootstrapped | Connection refused or non-200 status | The endpoint MUST NOT return 200 from a partially initialized application (AS 1.2). |
| Health path collides with an existing API route | Implementer rejects the path choice during task implementation | Mitigation lives in task decomposition, not in this contract. |
| Orchestrator probes at high rate | 200 responses, no rate-limit rejections | The endpoint is exempt from rate-limit middleware (FR-003). |

## Events / Hooks

This feature publishes no events. It consumes no events. The endpoint is a pure read-only synchronous HTTP handler.

## Integration Boundaries

- **External HTTP** (new boundary surface): orchestrators reach the endpoint over HTTP. No outbound calls are made from the handler; the endpoint synthesizes its response from in-process state only.
- **Express middleware stack** (existing): the health route is mounted such that auth and rate-limit middleware do not apply (FR-002, FR-003). Mount ordering is the implementation strategy.

No new external system integrations are introduced.

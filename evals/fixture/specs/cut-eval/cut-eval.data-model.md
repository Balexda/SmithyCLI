<!--
SCENARIO: cut-from-spec (evals/cases/cut-from-spec.yaml)
TYPE: representative (non-flawed) parent-artifact plant
PURPOSE: Companion data-model file for cut-eval.spec.md. Cut's Phase 1 reads
  this file as part of its spec input set; this plant exists so that read
  succeeds.
DO NOT "fix" or "clean up": this file is a deliberate eval fixture committed
  for the cut-from-spec scenario.
-->

# Data Model: Add a Health Check Endpoint to the Fixture Express Application

## Overview

This feature adds one small response entity (`HealthResponse`) consumed by external orchestrators probing the application's liveness. No persistent storage is introduced; the health endpoint is read-only and synthesizes its response from in-process state.

## Entities

### 1) HealthResponse (new)

Purpose: The JSON body returned by the health check endpoint. Indicates the application is alive and listening.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `status` | string | Yes | A short liveness indicator. Convention: `"ok"` when the application is alive. No additional values are emitted by the first cut. |

Validation:

- The response body MUST be a valid JSON object with exactly the `status` field; additional fields are forbidden by FR-004 (no secrets, no build hashes, no environment details).
- The `status` value MUST be a non-empty string. The first cut emits only `"ok"`; future cuts may add `"degraded"` once readiness probing lands (out of scope).

## Relationships

`HealthResponse` is a standalone response entity with no relationships to other domain entities. It is synthesized in the request handler and not persisted.

## State Transitions

`HealthResponse` is a transient value created per request; it has no lifecycle. The Express application itself has implicit liveness states (booting / alive / shutting down) but those are tracked by the runtime, not by a domain entity introduced here.

## Identity & Uniqueness

`HealthResponse` instances have no identity — they are ephemeral values returned per request. There is no uniqueness constraint to enforce.

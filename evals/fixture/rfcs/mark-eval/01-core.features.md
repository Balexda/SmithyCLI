<!--
  Planted feature-map fixture for the `mark-from-features` eval scenario.
  Realism: representative (per data-model PlantedArtifact.realism enum).
  Owner: mark-from-features (single consumer).
  Purpose: gives /smithy.mark a structurally valid, self-contained feature map
  to expand into a feature specification. Content is fictional and references
  only the co-located RFC plant.
-->

# Feature Map: Subscription Reminder Core

**Source RFC**: `mark-eval.rfc.md`
**Milestone**: 1 — Subscription Reminder Core
**Created**: 2026-05-15

## Features

### Feature 1: Upcoming Renewal Summary

**Description**: Deliver a read-only summary that shows each customer which
subscriptions renew in the next billing window, including renewal date,
service name, and expected charge. The first implementation focuses on a
single customer account at a time and returns deterministic sample data for
the eval fixture.

**User-Facing Value**: Customers can see upcoming charges before they happen
and decide whether they need to update, cancel, or review a subscription.

**Scope Boundaries**:
- Includes: a renewal-summary contract, a small in-memory subscription model,
  date-window filtering, and stable empty-state behavior.
- Excludes: payment processing, cancellation workflows, notification delivery,
  multi-account aggregation, and third-party provider synchronization.

## Specification Debt

None — all ambiguities resolved.

## Dependency Order

Recommended specification sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| F1 | Upcoming Renewal Summary | — | — |

## Cross-Milestone Dependencies

None — this milestone is self-contained.

<!--
  Planted RFC fixture for the `mark-from-features` eval scenario.
  Realism: representative (per data-model PlantedArtifact.realism enum).
  Owner: mark-from-features (single consumer).
  Purpose: provides the co-located source RFC referenced by the feature-map
  plant. Content is fictional and references no external files.
-->

# RFC: Subscription Reminder Service

**Created**: 2026-05-15  |  **Status**: Draft

## Summary

Build a small service that helps customers understand which subscriptions are
about to renew. The service exposes a read path for upcoming renewal summaries
and gives support teams a predictable shape for explaining upcoming charges.

## Motivation / Problem Statement

Customers often discover subscription renewals only after a charge appears on
their statement. Support teams can answer individual questions, but they do
not have a simple, consistent summary view to share before the renewal date.
The result is avoidable support volume and customer frustration around charges
that were expected but not visible.

## Goals

- Show upcoming renewals for a customer in a predictable billing window.
- Include enough detail for a customer to recognize the subscription and
  expected charge.
- Keep the first release read-only so it can be implemented without payment
  or cancellation side effects.

## Out of Scope

- Cancelling subscriptions or changing payment methods.
- Sending email, SMS, push, or in-app notifications.
- Syncing with external subscription providers.

## Personas

- **Customer** - reviews upcoming subscription charges before renewal.
- **Support Specialist** - uses the same summary shape to answer renewal
  questions consistently.

## Proposal

Implement a read-only renewal summary backed by a compact subscription record.
The summary filters active subscriptions by a configurable upcoming-renewal
window and returns service name, renewal date, expected amount, and currency.
The first milestone uses fixture-local sample data so the planning command can
produce a realistic feature specification without depending on external
systems.

## Design Considerations

The renewal window should be explicit and deterministic so tests and support
screens do not drift by time zone. Empty states need to distinguish "no active
subscriptions" from "active subscriptions exist but none renew soon" because
those cases lead to different support conversations.

## Decisions

- The first release is read-only to avoid coupling the summary view to billing
  mutations.
- Renewal dates are treated as calendar dates rather than timestamps to keep
  customer-facing wording stable across time zones.
- Fixture data is intentionally small and deterministic so downstream planning
  evals can assert against stable output.

## Open Questions

None — all ambiguities resolved.

## Specification Debt

None — all ambiguities resolved.

## Milestones

### Milestone 1: Subscription Reminder Core

**Description**: Deliver the read-only upcoming renewal summary for a single
customer account, including the domain model and response contract needed for a
feature specification.

**Success Criteria**:
- The summary returns active subscriptions renewing inside the configured
  upcoming-renewal window.
- The response includes service name, renewal date, expected amount, and
  currency for each matching subscription.
- The empty response is deterministic and distinguishable from lookup failure.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| M1 | Subscription Reminder Core | — | — |

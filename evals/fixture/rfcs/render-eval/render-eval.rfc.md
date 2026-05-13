<!--
  Planted RFC fixture for the `render-from-rfc` eval scenario.
  Realism: representative (per data-model PlantedArtifact.realism enum).
  Owner: render-from-rfc (single consumer).
  Purpose: gives /smithy.render a structurally valid, self-contained RFC to
  decompose into a features map. Content is fictional and references no
  paths outside this directory.
-->

# RFC: Daily Quote Service

**Created**: 2026-05-12  |  **Status**: Draft

## Summary

Stand up a small standalone service that serves a curated "quote of the day"
to internal demo clients. The service exposes a single read endpoint and a
lightweight content-management surface for editors to add, retire, and
schedule quotes ahead of time.

## Motivation / Problem Statement

Internal demos and onboarding walkthroughs keep reaching for ad-hoc public
quote APIs that occasionally rate-limit, change shape, or return content we
have not vetted. A tiny owned service removes that external dependency,
gives us a predictable response shape, and lets product editors curate the
quote pool without engineering involvement.

## Goals

- Serve a deterministic quote-of-the-day response keyed on the current date.
- Let editors author, retire, and schedule quotes through a constrained CMS
  surface that does not require engineering deploys.
- Keep the service self-contained so it can be embedded in onboarding demos
  without external network dependencies.

## Out of Scope

- Public-internet exposure, authentication for end users, or rate limiting.
- Localization of quote content into languages other than the authoring
  locale.

## Personas

- **Demo Engineer** — wires the quote endpoint into onboarding walkthroughs
  and needs a stable response shape they can rely on across sessions.
- **Content Editor** — curates the quote pool, retires stale entries, and
  schedules timely quotes for upcoming demo days.

## Proposal

Build a single-process service that owns a small quote catalog and a
date-keyed selection rule. A read endpoint returns the quote selected for
the current date, and a small set of editor-facing operations (create,
retire, schedule) mutate the catalog. The service ships with seed content
so demos work out of the box with no editor action required.

## Design Considerations

The selection rule must be deterministic for a given date so demos are
reproducible across runs. The catalog will be small enough to keep entirely
in process memory, so persistence concerns are bounded to a single
durable store with no caching tier. The editor surface should reject
malformed input early to keep the read path's response shape stable.

## Decisions

- Selection is date-deterministic (same date yields the same quote) so demo
  recordings stay reproducible across replays.
- The editor surface is strictly additive and reversible (create, retire,
  schedule) — there is no destructive in-place edit, which keeps an audit
  trail without requiring a separate history table.

## Open Questions

- None — all ambiguities resolved.

## Specification Debt

None — all ambiguities resolved.

## Milestones

### Milestone 1: Read endpoint and seed catalog

**Description**: Deliver the deterministic quote-of-the-day read endpoint
backed by a small seeded catalog, with no editor surface yet. Demos can
embed the endpoint immediately.

**Success Criteria**:
- The read endpoint returns the same quote for a given calendar date across
  repeated calls within that date.
- The service ships with at least one week of seed quotes so demos work
  immediately with no editor action.

### Milestone 2: Editor curation surface

**Description**: Add the editor-facing create, retire, and schedule
operations on top of the read endpoint from Milestone 1, including
input-validation rejection of malformed entries.

**Success Criteria**:
- Editors can add a new quote and see it eligible for selection on its
  scheduled date without engineering involvement.
- Malformed editor input is rejected before it can affect the read
  endpoint's response shape.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| M1 | Read endpoint and seed catalog | — | — |
| M2 | Editor curation surface | M1 | — |

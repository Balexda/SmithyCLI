# Data Model: Screens and Flows as UI Feature Kinds

## Overview

This feature has no runtime database. Its "data model" is the **artifact graph** smithy
manipulates: the typed feature, the durable screen and flow records, their flat
identifiers, and the edges that join them. The entities below define the shapes the
commands read and write and the invariants `flow-lint` enforces. Schemas for the
screen and flow records are owned by the landed helper skills
(`smithy.helper-screen-design`, `smithy.helper-flow-definition`) and
`feature-kinds.md`; this model records how they relate and what this feature adds —
not a re-definition.

## Entities

### 1) Typed Feature (`### Feature N` in a `.features.md`)

Purpose: the fan-out unit. One feature yields either a backend spec or UI
screen/flow artifacts, selected by `kind`. Authored by `render`, consumed by `mark`.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `kind` | `backend` \| `ui` | Yes | Selects the `mark`/`forge` profile. |
| `phase` | `build` \| `wire` | UI only | Feature-level, not per-story. |
| `design_system` | string (skill ref) | UI only | Committed design skill; source of truth even with a bundle. |
| `bundle` | path | No | Optional design export; omit the key when absent (never `null`). |
| `flag` | string | UI, flag-gated | Shared contract joining a build feature to its wire feature. |
| `screens` | list of `ScreenId` | UI | Screens this feature owns/touches. |
| `flows` | list of `FlowId` | UI: No (build) / Yes (wire) | Flows the screen participates in. |

Validation rules:
- A `backend` feature carries only `kind`.
- A flag-gated build feature and its wire feature share exactly one `flag`.
- `screens`/`flows` entries are flat IDs that must resolve elsewhere in the repo.

### 2) Screen Annotation (`design/screens/<ScreenId>.design.md`)

Purpose: thin durable record of a screen's *intent*, colocated with the UI component
(the component is the body; this is metadata about it). Authored by `mark` (US1).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `ScreenId` (flat) | Yes | Matches the feature's `screens:` list; never reused. |
| `component-path` | repo-relative path | Yes | Path to the owning UI component file — **framework-neutral** (`LibraryScreen.kt`, `Library.tsx`, `Library.svelte`, …). Generalized from the landed `composable:` field per FR-008. |
| `design_system` | string (skill ref) | Yes | Source of truth; bundle without skill is invalid. |
| `bundle` | path | No | Originating design export; omit when absent. |

Body: rationale only — `## Why this screen exists`, `## Deliberate choices`,
`## Deferred`. No `## Layout`/`## States`/`## Flow`/`## Steps` sections.

### 3) Flow Record (`design/flows/<FlowId>.flow.md`)

Purpose: thin durable record of a flow's *intent*. Authored by `mark` at
`phase: wire` (US1). Paired 1:1 with an executable test body.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `FlowId` (flat) | Yes | Matches the feature's `flows:` list and the test-body filename stem; never reused. |
| `screens` | list of `ScreenId` | Yes | Screens traversed, in entry order; each must resolve to a screen annotation. |
| `test-body` | repo-relative path | Yes | Path to the paired executable test (e.g. `maestro/flows/<FlowId>.yaml`, or a Playwright/Cypress spec). Generalized from the landed `maestro:` field per FR-006/SD-003. |

Body: rationale only — `## Intent`, `## Guards`, `## Entry / Exit`,
`## Coverage Caveat`. No step enumeration (FR-010).

### 4) Flow Executable Test Body (`<test-body>`)

Purpose: the durable *behavioral* half of a flow — the ordered actions/assertions a
UI driver replays. This is where the user's "series of user actions and UI responses"
lives. Stubbed by `mark` at `phase: wire` (US1); emitted/updated to executable form
by `forge` at `phase: wire` (US3); referenced by the Flow Record.

| Property | Rule |
|----------|------|
| Cardinality | 1:1 with `FlowId`; never fold multiple paths into one body. |
| Selectors | test IDs / accessibility IDs / semantic tags only — never visible text or layout position (FR-009). |
| Assertions | traversal **and** every guard named in `.flow.md` (each guard → ≥1 assert). |
| Driver | the project's own (Maestro, Playwright, Cypress, Detox, XCUITest, …) — detected, not fixed (FR-006). |

### 5) Routing Rule (documentation entity, in the agent-skills README)

Purpose: the single documented mapping from a `kind: ui` feature to its build path.
Default = Model B (direct); escape hatch = thin Model-A spec for multi-screen/ledger
features (FR-016, SD-001).

### 6) (Optional) UI Spec — escape hatch only (`<slug>.spec.md`)

Purpose: when the escape hatch applies, a thin spec whose user stories only *sequence
and reference* durable artifacts. Reuses the existing spec schema; `data-model.md`/
`contracts.md` resolve to `N/A` unless the screen has genuine view-state/test-ID
contracts. MUST NOT re-describe layout (FR-018).

## Relationships

- Typed Feature `1:N` Screen Annotation via `screens:` (each `ScreenId` resolves to one `<ScreenId>.design.md`).
- Typed Feature `1:N` Flow Record via `flows:` (wire phase).
- Flow Record `1:1` Flow Executable Test Body via `test-body`.
- Flow Record `N:M` Screen Annotation via `screens:` (a flow traverses several screens; a screen joins several flows). Resolved by `flow-lint`.
- Build Feature `1:1` Wire Feature via the shared `flag` (the seam).
- Screen/Flow records are **citation roots**, analogous to engraved-knowledge records: they participate via reference edges (feature `screens:`/`flows:`, flow `screens:`), **not** via `## Dependency Order` rows. (See SD-005 for the status/graph consequence.)

## State Transitions

### A `kind: ui` feature's lifecycle (default Model B)

1. `untyped` → `typed` — `render` writes the `feature-kinds` yaml and the `## Dependency Order` row (`Artifact = —`).
2. `typed` → `screen-authored` — `mark` (build) writes `<ScreenId>.design.md`; feature `Artifact` cell → the design artifact path.
3. `screen-authored` → `built` — `forge` (build) generates the flagged component on mock data; component tests pass.
4. `built` → `flow-authored` — `mark` (wire) writes `<FlowId>.flow.md` (+ stub test body).
5. `flow-authored` → `wired` — `forge` (wire) connects real data, flips the `flag`, emits/updates the executable test body, flow test passes.

### Build/wire ordering invariant

- The wire feature's `Depends On` lists the build feature (and any backend feature).
- The build feature does **not** depend on the backend feature — the `flag` lets build land ahead of backend (the seam).

## Identity & Uniqueness

- `ScreenId` and `FlowId` are **flat, repo-namespaced, stable, and never reused** — the repo is the namespace; no scoping prefix or path hierarchy.
- `flow-lint` enforces uniqueness across the whole repo and 1:1 `FlowId`↔test-body pairing (FR-023).
- The `component-path` and `test-body` *paths* are the contracts (not derived conventions); renaming the target file without updating the field is a `flow-lint` failure.
- Renaming a `ScreenId`/`FlowId` or a test ID is a breaking change to every referencing artifact — treated like an API rename.

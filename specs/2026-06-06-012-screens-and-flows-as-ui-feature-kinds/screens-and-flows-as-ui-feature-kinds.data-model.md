# Data Model: Screens and Flows as UI Feature Kinds

## Overview

This feature has no runtime database. Its "data model" is the **artifact graph** smithy
manipulates: the typed feature, the typed ordering ledger inside its spec, the screen/
flow/story nodes, their durable files, the per-node tasks `cut` produces, and the design
bundle that crosses the terminal↔visual boundary. Schemas for the screen and flow records
are owned by the landed helper skills (`smithy.helper-screen-design`,
`smithy.helper-flow-definition`) and `feature-kinds.md`; this model records how they relate
and what this feature adds — not a re-definition.

## Entities

### 1) Typed Feature (`### Feature N` in a `.features.md`)

Purpose: the fan-out unit. Authored by `render`, consumed by `mark`.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `kind` | `backend` \| `ui` | Yes | Selects the `mark`/`cut`/`forge` profile. |
| `phase` | `build` \| `wire` | UI only | Feature-level (the build/wire seam). |
| `design_system` | string (skill ref) | UI only | Committed design skill; source of truth even with a bundle. |
| `bundle` | path | No | Optional prototype export (the boundary object); omit when absent. |
| `flag` | string | UI, flag-gated | Shared contract joining a build feature to its wire feature. |

Note: the individual **screens and flows are no longer a `screens:`/`flows:` list on the
feature** — they are first-class nodes in the spec ledger (Entity 2). The feature still
declares `design_system`/`bundle`/`flag` that its nodes inherit.

### 2) UI Spec Ledger (the `.spec.md` `## Dependency Order` typed node graph)

Purpose: the single ordering/parallelism surface for one UI feature. Authored by `mark`.
Rows are pointers + ordering only — never layout prose.

| Column | Meaning |
|--------|---------|
| `ID` | `SC<N>` (screen), `FL<N>` (flow), or `US<N>` (backend story). Unique in-table, no leading zeros. |
| `Kind` | `screen` \| `flow` \| `story`. Routes `cut`/`forge`. |
| `Title` | Human title; for SC/FL, names the durable file (`→ screens/<Id>.design.md` etc.). |
| `Depends On` | `—` or comma-separated same-table IDs. Encodes ordering + parallelism. |
| `Design` | For `screen` rows: `none` \| `import` \| `brief`. `—` for flow/story rows. |
| `Artifact` | The `cut`-produced `tasks.md` (`—` until `cut` runs) — uniform with backend specs. |

A flow node's `Depends On` is how "mock-satisfiable vs real-data" is expressed: a flow that
depends only on its screen is buildable against the mock; a flow that also lists a backend
`US` waits for real data. No per-flow phase field is needed.

### 3) Screen-Build Node (`SC<N>`) → Screen Annotation (`design/screens/<ScreenId>.design.md`)

Purpose: a ledger row that builds one screen; carries a `Design` mode; points (via Title)
at its durable annotation. The annotation is the thin durable intent record colocated with
the UI component (the component is the body) and doubles as the `brief`-mode design brief.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `ScreenId` (flat) | Yes | Matches the node ID's screen; never reused. |
| `component-path` | repo-relative path | Yes | Path to the owning UI component file — **framework-neutral** (`LibraryScreen.kt`, `Library.tsx`, …). Generalized from the landed `composable:` field (FR-010). |
| `design_system` | string (skill ref) | Yes | Source of truth; bundle without skill is invalid. |
| `bundle` | path | No | Originating prototype export; omit when absent. |

Body: rationale only — `## Why this screen exists`, `## Deliberate choices`, `## Deferred`.
No `## Layout`/`## States`/`## Flow`/`## Steps`.

### 4) Flow-Wire Node (`FL<N>`) → Flow Pair (`design/flows/<FlowId>.flow.md` + executable test body)

Purpose: a first-class ledger row that wires one flow. The `.flow.md` is authored by `mark`
(intent); the executable test body is emitted/updated by `forge` (behavior). 1:1 by `FlowId`.

`.flow.md` front-matter:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `FlowId` (flat) | Yes | Matches the node and the test-body filename stem; never reused. |
| `screens` | list of `ScreenId` | Yes | Screens traversed, in entry order; each must resolve to a screen annotation. |
| `test-body` | repo-relative path | Yes | Path to the paired executable test (Maestro yaml, Playwright/Cypress spec, …). Generalized from the landed `maestro:` field (FR-008/SD-003). |

`.flow.md` body: rationale only — `## Intent`, `## Guards`, `## Entry / Exit`,
`## Coverage Caveat`. No step enumeration (FR-012).

### 5) Flow Executable Test Body (`<test-body>`)

Purpose: the durable *behavioral* half — the ordered actions/assertions a UI driver replays
(this is where the user's "series of user actions and UI responses" lives). Stubbed by
`mark`; emitted/updated to executable form by `forge` when the flow-wire node is built.

| Property | Rule |
|----------|------|
| Cardinality | 1:1 with `FlowId`; never fold multiple paths into one body. |
| Selectors | test IDs / accessibility IDs / semantic tags only — never visible text or layout position (FR-011). |
| Assertions | traversal **and** every guard named in `.flow.md`. |
| Driver | the project's own (detected, not fixed — FR-008). |

### 6) Backend Story Node (`US<N>`)

Purpose: a ledger row built through `cut` → `tasks.md` → `forge` exactly as a backend spec's
user story is today. Identical mechanics; only its presence inside a UI feature's ledger is new.

### 7) Per-Node Tasks (`tasks.md`, produced by `cut`)

Purpose: keeps `render → mark → cut → forge` uniform. `cut` slices **every** node kind into a
`tasks.md` (branching by kind for the slice shape) and populates the node's `Artifact` cell.
SC/FL nodes are often a single slice; backend stories several.

### 8) Design Mode + Bundle (the terminal↔visual boundary object)

Purpose: model the break to visual prototyping without inline pixel iteration.

| Value | Meaning |
|-------|---------|
| `Design: none` | No visual loop; build from the committed design skill. |
| `Design: import` | Prototype-first; a `bundle` enters at `render` (which may derive structure) and rides to `forge`. |
| `Design: brief` | Mark-first; the `.design.md`/`.flow.md` intent is the brief. Developer-declared **or** mark-initiated (when `mark` judges a screen complex and no bundle exists, it authors the brief and recommends gating for one). |

The `bundle` is honored by `forge` if present at build time (conflict rule: bundle wins
layout/visual, skill wins dialect), and ignored-without-stalling if absent. The gate is
**non-blocking** in all modes.

## Relationships

- Typed Feature `1:1` UI Spec Ledger (the feature's `.spec.md`).
- UI Spec Ledger `1:N` { Screen-Build, Flow-Wire, Backend-Story } nodes.
- Screen-Build Node `1:1` Screen Annotation; Flow-Wire Node `1:1` Flow Pair.
- Flow Record `1:1` Flow Executable Test Body via `test-body`.
- Flow Record `N:M` Screen Annotation via `screens:` (resolved by `flow-lint`).
- Every node `1:1` a `cut`-produced `tasks.md` (the `Artifact` cell).
- Build Feature `1:1` Wire Feature via the shared `flag` (the seam).
- Screen/Flow durable files are **citation roots** (referenced by node Title, flow `screens:`, feature inheritance) — they participate via reference edges, while the ledger's `Depends On` is the dependency-ordered graph the scanner reads.

## State Transitions

### A `kind: ui` feature's lifecycle (uniform pipeline)

1. `untyped` → `typed` — `render` writes `feature-kinds` metadata; in `import` mode it may derive candidate screens/flows from a supplied bundle.
2. `typed` → `laddered` — `mark` writes the `.spec.md` typed ledger (SC/FL/US rows) **and** the durable `.design.md`/`.flow.md` files. If a screen is complex and bundle-less, `mark` may author a brief and recommend gating (non-blocking).
3. `laddered` → `sliced` — `cut` slices each node into a `tasks.md` and populates `Artifact` cells.
4. `sliced` → `built` — `forge` builds each node's tasks into PR(s): screens render flagged on mock data (honoring a bundle if present); flows wire real data, honor/flip the flag, and emit the executable test body; backend stories build as today.

### Build/wire ordering invariant

- The wire feature's `Depends On` lists the build feature (and any backend feature).
- The build feature does **not** depend on the backend feature — the `flag` lets build land ahead of backend (the seam).
- Within a feature, a flow node depending only on its screen wires against the mock; a flow node also depending on a backend `US` waits for real data.

## Identity & Uniqueness

- `ScreenId` / `FlowId` are **flat, repo-namespaced, stable, never reused**; the repo is the namespace.
- `flow-lint` enforces repo-wide uniqueness and 1:1 `FlowId`↔test-body pairing (FR-025).
- `component-path` and `test-body` *paths* are the contracts; renaming the target file without updating the field is a `flow-lint` failure.
- Renaming a `ScreenId`/`FlowId` or a test ID is a breaking change to every referencing artifact — treated like an API rename.

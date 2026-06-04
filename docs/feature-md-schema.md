# `feature.md` Front-Matter Schema

> **Status: proposed** — anchor artifact for Epic [#404](https://github.com/Balexda/SmithyCLI/issues/404)
> ("Screens & flows as first-class Smithy feature kinds"), issue
> [#405](https://github.com/Balexda/SmithyCLI/issues/405). Field names defined
> here are consumed by [#407](https://github.com/Balexda/SmithyCLI/issues/407)
> (screen annotation), [#408](https://github.com/Balexda/SmithyCLI/issues/408)
> (forge parameterization), and [#409](https://github.com/Balexda/SmithyCLI/issues/409)
> (`flow-lint`). **Keep field names final here** — downstream issues key off them.

## Overview

A `feature.md` is a **work order**: the single file `forge` reads to implement one
unit of work. One schema describes two kinds of work:

- **`kind: backend`** — server/library functionality. The body is a behavioral
  spec (a prose delta); `forge` builds code, tests behavior, and reviews structure.
- **`kind: ui`** — screen/flow work for the app. The body is screen/flow prose;
  `forge` renders a Compose screen from the committed design skill (optionally a
  Claude Design bundle), and — in the `wire` phase — emits or updates the durable
  Maestro flow for any flow the screen participates in.

Both kinds are **nodes in the same dependency DAG**. The DAG is assembled by
scanning every `features/*.feature.md` in the repo and reading each file's
`depends_on:` edges — there is no separate parent map. This is a deliberate
divergence from Smithy's planning-artifact convention, where dependency order
lives in a parent `## Dependency Order` table (see
[`src/templates/agent-skills/README.md`](../src/templates/agent-skills/README.md)).
Feature work orders are **repo-resident and standalone** — the repo is the
namespace — so each node declares its own edges in front-matter instead.

### Repo layout (in the app repo)

```
features/<FeatureId>.feature.md       # work order (forge input), this schema
design/screens/<ScreenId>.design.md   # durable screen INTENT annotation  (#407)
design/flows/<FlowId>.flow.md         # durable flow INTENT annotation     (#406)
maestro/flows/<FlowId>.yaml           # durable flow BEHAVIORAL body        (#406)
```

`feature.md` files are **transient build instructions** — discharged into code +
git history once forged. The durable artifacts they produce (the composable, its
`design.md`, the Maestro flow) outlive them.

## Identity

| Concept | Rule |
|---------|------|
| **`FeatureId`** | A flat, lowercase slug matching `^[a-z0-9]+(-[a-z0-9]+)*$` (e.g. `add-title`, `wire-add-title`). Flat (no namespacing), **stable, and never reused** — the repo is the namespace. |
| **Filename** | `features/<FeatureId>.feature.md`. The filename stem is the canonical `FeatureId`; the `id:` front-matter field must match it. |

A flag-gated UI feature is **two** features with two FeatureIds — a `build` node
and a `wire` node — joined by a shared `flag:` (see
[The build/wire seam](#the-buildwire-seam)). Convention: name the wire node
`wire-<build-id>` (e.g. `add-title` → `wire-add-title`), but the link of record
is the shared `flag:`, not the name.

## Common front-matter (both kinds)

```yaml
---
id: add-title            # required — must equal the filename stem
kind: ui                 # required — backend | ui
title: Add a title       # required — human-readable
depends_on: []           # required — list of FeatureIds, [] if none
---
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string (`FeatureId`) | Yes | Flat slug; must equal the filename stem. |
| `kind` | enum | Yes | `backend` or `ui`. Selects which kind-specific fields are valid and which `forge` profile runs. |
| `title` | string | Yes | Human-readable label; used in DAG views and PR titles. |
| `depends_on` | list of `FeatureId` | Yes | DAG edges to other features in this repo. Use `[]` for an anchor. Every entry must resolve to an existing `features/<id>.feature.md`. See [Dependency edges](#dependency-edges--dag-ordering). |

The **Markdown body** (everything after the closing `---`) is the work
description and is interpreted per `kind`.

## `kind: backend`

No backend-specific front-matter fields. The body **is** the spec — a prose
description of the behavioral delta (what changes, observable behavior, edge
cases). What `kind: backend` tells `forge`:

- **Tests = behavioral** — assert observable behavior, not internal shape.
- **Review = structural** — the reviewer checks code structure/conventions
  (unchanged from today's pipeline).

```yaml
---
id: title-store
kind: backend
title: Persist titles to the library store
depends_on: []
---
```
```markdown
Add a `LibraryStore.add(title)` that persists a `Title { id, name, url }` to the
local store and exposes it through `LibraryStore.all()`, ordered by insertion.

Behavior:
- Adding a title with a duplicate URL is a no-op (idempotent by URL).
- `all()` returns an empty list before any add, never null.
```

## `kind: ui`

UI features carry the design and phase fields below in addition to the common set.

```yaml
---
id: add-title
kind: ui
title: Add a title
depends_on: []
phase: build                  # required — build | wire
design_system: story-spider-design
bundle: design/bundles/add-title.zip   # optional
flag: add_title_v1            # required — the build/wire seam contract
screens: [AddTitle]
flows: [AddTitle]
---
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `phase` | enum | Yes | `build` or `wire`. See [phase semantics](#phase-semantics). |
| `design_system` | string | Yes | Reference to the committed design skill (e.g. `story-spider-design`). `forge` preloads this skill as implementer context. **The committed skill is the source of truth**, even when a `bundle` is present. |
| `bundle` | path | No | Repo-relative path to a round-tripped Claude Design export zip. A web (HTML/React/Tailwind) **reference**, not a drop-in — `forge` translates it into Compose. **Conflict rule:** bundle wins on layout & visual intent; the `design_system` skill wins on implementation dialect (Compose tokens, palette, corner radii). |
| `flag` | string | Yes¹ | Feature-flag name gating this screen. The **shared contract** between a build node and its wire node. See [The build/wire seam](#the-buildwire-seam). |
| `screens` | list of `ScreenId` | Yes | Screens this feature builds or touches. Each should resolve to a `design/screens/<ScreenId>.design.md` once built (`flow-lint`, #409). |
| `flows` | list of `FlowId` | No² | Flows the screen participates in. In the `wire` phase this list drives the **definition-of-done**: every listed flow's Maestro yaml + `flow.md` must be emitted/updated. |

¹ `flag` is required for any flag-gated screen, which is the default for this
pipeline ("prototype behind a flag, wire to real data later"). Omit only for a UI
feature that genuinely ships unflagged in one shot.

² `flows` may be empty in a pure `build` phase that introduces no navigable path
yet, but must be populated by the `wire` phase for any flow the screen is part of.

### Phase semantics

| `phase` | Means | Definition of done |
|---------|-------|--------------------|
| `build` | Implement the screen **against a mock**, behind `flag`. No real data, no real actions. | Compose screen renders all states from the brief using only design-system tokens/components, gated by `flag`. |
| `wire` | Connect the screen to **real data/actions**, flipping the seam. | Real data wired **and** the Maestro flow + `flow.md` (#406) emitted/updated for every flow in `flows:`. The flow test is a build output of this phase, not an afterthought. |

> **Naming note (deviation from #405 prose).** Issue #405 lists the references as
> `screens:` / `flow:`. This schema uses **`flows:` (a list)** rather than
> singular `flow:`, because a screen can participate in more than one flow and the
> `wire` definition-of-done is "every flow the screen participates in." `screens:`
> stays plural for the same reason. Flagged here so the choice is explicit before
> #406/#409 lock onto it.

## The build/wire seam

> "Prototype behind a flag, wire to real data later" is **not a note — it is a
> seam.** It decomposes into two DAG nodes joined by the flag.

```
add-title (kind: ui, phase: build, flag: add_title_v1)
    │   builds the screen against a mock, behind add_title_v1
    ▼
wire-add-title (kind: ui, phase: wire, flag: add_title_v1, depends_on: [add-title, title-store])
        wires real data, flips add_title_v1, emits maestro/flows/AddTitle.yaml
```

- The **`flag:` value is the interface contract** between the two nodes. The build
  node renders behind it; the wire node flips it once real data is connected. Both
  nodes carry the **same** `flag:`.
- The build node may be ordered **ahead of an unbuilt backend dependency**: it runs
  against a mock, so it does not list the backend in `depends_on`. The wire node
  lists both the build node and the backend data feature — that is what forces real
  data to exist before the seam flips.

## Dependency edges & DAG ordering

- `depends_on` is the **only** place feature-to-feature edges are written. No
  checkboxes, no parent table, no prose edges elsewhere.
- Every `depends_on` entry must resolve to an existing
  `features/<FeatureId>.feature.md`. A dangling edge is an error (enforced by
  `flow-lint`, #409).
- The DAG must be acyclic. `build` precedes its `wire` partner because the wire
  node lists the build node in `depends_on`.
- **Build-ahead-of-backend is legal and intended:** a UI `build` node depending
  only on already-built UI (or nothing) can be forged before the backend it will
  eventually consume exists, because the `flag` seam keeps it on mock data until a
  `wire` node — which *does* depend on the backend — closes the loop.

## Worked examples

### Example A — `kind: backend`

`features/title-store.feature.md`

```markdown
---
id: title-store
kind: backend
title: Persist titles to the library store
depends_on: []
---

Add a `LibraryStore.add(title)` that persists a `Title { id, name, url }` to the
local store and exposes it through `LibraryStore.all()`, ordered by insertion.

Behavior:
- Adding a title with a duplicate URL is a no-op (idempotent by URL).
- `all()` returns an empty list before any add, never null.
- A title with a blank `name` or malformed `url` is rejected with a validation error.
```

### Example B — `kind: ui`, the build + wire pair

**Build node** — `features/add-title.feature.md`

```markdown
---
id: add-title
kind: ui
title: Add a title
depends_on: []
phase: build
design_system: story-spider-design
bundle: design/bundles/add-title.zip
flag: add_title_v1
screens: [AddTitle]
flows: [AddTitle]
---

The Add-Title screen: a title field, a URL field, and a confirm action reachable
from the Library FAB. Build it behind `add_title_v1` against an in-memory mock —
no real persistence yet.

States to render (all from the brief):
- empty (both fields blank, confirm disabled)
- valid (both fields filled, confirm enabled)
- invalid URL (URL field shows the error role, confirm disabled)
- submitting (confirm shows progress)

Use only `story-spider-design` tokens and components. The bundle is the layout/
visual reference; translate it to Compose — do not hardcode hex or import web CSS.
```

**Wire node** — `features/wire-add-title.feature.md`

```markdown
---
id: wire-add-title
kind: ui
title: Wire Add-Title to the library store
depends_on: [add-title, title-store]
phase: wire
design_system: story-spider-design
flag: add_title_v1
screens: [AddTitle]
flows: [AddTitle]
---

Connect the Add-Title screen to `LibraryStore` (from `title-store`) and flip
`add_title_v1` on. Confirm now persists a real `Title` and returns to the Library,
where the new entry appears.

Definition of done also includes emitting the durable flow for `AddTitle`:
- `maestro/flows/AddTitle.yaml` — testID-keyed traversal Library FAB → fill title
  + URL → confirm → entry visible in Library; asserts confirm is unreachable
  without a valid URL.
- `design/flows/AddTitle.flow.md` — intent annotation (why the URL guard exists).

(See #406 for the flow entity pair + testID convention.)
```

## Field reference (quick lookup)

| Field | Kind | Required | Type |
|-------|------|----------|------|
| `id` | both | Yes | `FeatureId` (filename stem) |
| `kind` | both | Yes | `backend` \| `ui` |
| `title` | both | Yes | string |
| `depends_on` | both | Yes | list of `FeatureId` (`[]` if none) |
| `phase` | ui | Yes | `build` \| `wire` |
| `design_system` | ui | Yes | skill ref |
| `bundle` | ui | No | path to export zip |
| `flag` | ui | Yes (flag-gated) | string |
| `screens` | ui | Yes | list of `ScreenId` |
| `flows` | ui | No (build) / Yes (wire, if any) | list of `FlowId` |

Body content: for `backend`, the behavioral spec (prose delta); for `ui`, the
screen/flow prose brief (states, intent, deferred bits).

## Open decisions flagged for review

These choices were made to keep field names final; raise on the PR if any should change:

1. **`depends_on:` in front-matter** instead of a parent `## Dependency Order`
   table — chosen because feature work orders are repo-resident and standalone
   (no single parent map). Diverges from the planning-artifact convention.
2. **`flag:` is a first-class required field** for flag-gated UI features. #405's
   prose treats the flag as "the interface contract" but does not name a field;
   this schema names it `flag:`.
3. **`flows:` / `screens:` are plural lists**, not the singular `flow:` written in
   #405's prose. Rationale in the [phase-semantics note](#phase-semantics).
4. **Worked examples are embedded in this doc** rather than shipped as standalone
   `features/*.feature.md` files at the repo root, since Smithy is not the app
   repo. Real fixtures will land with forge's UI paths (#408).

## Related issues

- Epic #404 — Screens & flows as first-class Smithy feature kinds
- #406 — Flow entity pair (`flow.md` + Maestro + testID convention)
- #407 — Screen design-context annotation (`design/screens/<ScreenId>.design.md`)
- #408 — Parameterize `forge` for `kind`/`phase` (consumes this schema)
- #409 — `flow-lint` (validates `depends_on`, `screens`, `flows` resolve)

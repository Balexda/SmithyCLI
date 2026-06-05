## Feature Kinds

Every feature in a `.features.md` map declares a **kind**. The kind selects which
fields the feature carries and, downstream, which `forge` profile builds it.

- **`backend`** — server/library functionality. The feature's prose is a behavioral
  delta; implementation is tested behaviorally and reviewed structurally.
- **`ui`** — screen/flow work for the app. The feature renders a screen from a
  committed design skill (optionally a Claude Design bundle) and, in the `wire` phase,
  emits or updates the durable flow for any flow the screen participates in.

Fields are authored in the `### Feature N:` body as bold-label lines, alongside
`**Description**:` (the feature map has no front-matter).

| Field | Kind | Required | Notes |
|-------|------|----------|-------|
| `**Kind**` | both | Yes | `backend` or `ui`. |
| `**Phase**` | ui | Yes | `build` or `wire` (feature-level — see below). |
| `**Design System**` | ui | Yes | Reference to the committed design skill (e.g. `story-spider-design`). The committed skill is the source of truth even when a bundle is present. |
| `**Bundle**` | ui | No | Repo-relative path to a Claude Design export. A visual/structural **reference**, not a drop-in: bundle wins on layout & visual intent, the design skill wins on implementation dialect. |
| `**Flag**` | ui | Yes¹ | Feature-flag name gating the screen — the shared contract joining a `build` feature to its `wire` feature. |
| `**Screens**` | ui | Yes | Plural list of `ScreenId`, e.g. `[AddTitle]`. |
| `**Flows**` | ui | No² | Plural list of `FlowId` the screen participates in. |

¹ Required for any flag-gated UI feature (the default for this pipeline). ² May be
empty in a pure `build` phase; populated by `wire` for every flow the screen joins.

### Phase semantics

| `**Phase**` | Means | Done when |
|-------------|-------|-----------|
| `build` | Implement the screen **against a mock**, behind `**Flag**`. No real data. | Screen renders every brief state using only design-system tokens/components, gated by the flag. |
| `wire` | Connect the screen to **real data/actions** and flip the flag. | Real data wired **and** the Maestro flow + `flow.md` emitted/updated for every flow in `**Flows**`. The flow test is a build output of this phase. |

### The build/wire seam

"Prototype behind a flag, wire to real data later" is a **seam**, not a note: it
decomposes into **two features** joined by a shared `**Flag**` value —

- a `build` feature renders the screen behind the flag against a mock, and
- a `wire` feature flips the flag once real data is connected, listing the build
  feature in its `Depends On` cell (`## Dependency Order`).

Build-ahead-of-backend is legal and intended: a UI `build` feature may be ordered
before an unbuilt backend feature, because the flag keeps it on mock data; only the
`wire` feature depends on the backend feature. The shared `**Flag**` — not a naming
convention — is the contract of record between the pair. See the
"Feature Kinds and the Build/Wire Seam" section of the agent-skills README for a
worked backend example and a ui build/wire pair.

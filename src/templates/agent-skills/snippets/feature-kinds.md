## Feature Kinds

Every feature in a `.features.md` map is **typed**. Each `### Feature N:` carries a
fenced `yaml` metadata block — placed right after the heading, before the prose —
declaring its kind and, for UI work, its design mode and phase fields. The kind
selects the `smithy.mark` authoring path: `backend` keeps the existing
spec-triad flow, while `ui` enters the UI authoring path for the typed ledger and
durable design truth.

- **`backend`** — server/library functionality; the prose body is a behavioral delta.
- **`ui`** — screen/flow work; `mark` authors the UI spec ledger and durable
  screen/flow design artifacts plus placeholder flow test bodies, then
  downstream build steps render a framework-appropriate screen component from a
  committed design skill and, in the `wire` phase, fill/update the executable
  flow body for any flow the screen joins.

| Key | Kind | Required | Notes |
|-----|------|----------|-------|
| `kind` | both | Yes (new) | `backend` or `ui`. Missing on legacy maps → `backend`. |
| `phase` | ui | Yes | `build` or `wire` (feature-level). |
| `design_system` | ui | Yes | Committed design-skill ref (for example `story-spider-design`); source of truth even when a bundle is present. A screen with a `bundle` still requires `design_system`. |
| `design` | ui | Yes | Screen-node design mode: `none`, `import`, or `brief`, shared by every `ScreenId` the feature lists. Render must set this explicitly; downstream `mark` copies it into the `Design` cell of each of the feature's `SC<N>` ledger rows instead of inferring from the title. Screens needing distinct modes go in separate features. |
| `bundle` | ui | No | Path to a visual prototype boundary object (for example a Figma export, Claude Design export, or equivalent visual-tool bundle) — a visual/structural reference, not a drop-in. Bundle wins on layout/visual intent; the skill wins on implementation dialect. |
| `flag` | ui | Yes (flag-gated) | Feature-flag name; the shared contract joining a `build` feature to its `wire` feature. |
| `screens` | ui | Yes | List of `ScreenId`, e.g. `[AddTitle]`. |
| `flows` | ui | No (build) / Yes (wire) | List of `FlowId` the screen participates in. Build features may list mock-satisfiable candidate flows; wire features must list the flows they connect to real data. |

```yaml
# backend feature
kind: backend
```

```yaml
# ui feature (build phase)
kind: ui
phase: build
design_system: story-spider-design
design: import
bundle: design/bundles/add-title.zip   # optional
flag: add_title_v1
screens: [AddTitle]
flows: [AddTitle]
```

**Design mode semantics.** The mode is carried in metadata so readers and
downstream commands do not infer it from feature titles. It is
**feature-level**: every `ScreenId` in the feature's `screens` list shares the
one `design` value, so a feature that would need two different modes for two
screens must be split into separate features (one per mode) — which the
one-screen-per-build model already favors. `mark` copies the value into the
`Design` cell of each `SC<N>` ledger row; flow and story rows use `—`.

| Mode | Meaning | Bundle behavior |
|------|---------|-----------------|
| `none` | No visual loop. Build from the committed design skill with no bundle ceremony. | Omit `bundle`. |
| `import` | Prototype-first: a visual prototype already exists. `render` may carry the supplied bundle forward for downstream honoring. | Bundle enters at `render` and rides to `forge` as visual source context; downstream prompts do not derive detailed prototype-to-screen/flow structure. |
| `brief` | Mark-authored intent for a visual tool: the `.design.md`/`.flow.md` artifacts are the brief. | Bundle may be attached later; if present, downstream build honors it under the conflict rule. |

**Phase semantics.** `build` implements the screen component against a mock
behind `flag` (rendering every brief state with design-system tokens only);
`wire` connects real data, flips the flag, and fills/updates the mark-created
executable test-body stub for every flow in `flows` using the project's UI
driver; the `.flow.md` design truth is authored by `mark`. Compose, Maestro,
and `story-spider-design` are examples, not required stacks.

**The build/wire seam.** Flag-gated UI is two features sharing one `flag`: a `build`
feature and a `wire` feature that lists the build feature in its `Depends On` cell.
Build-ahead-of-backend is legal — only the `wire` feature depends on the backend
feature. The shared `flag`, the `phase` metadata, and the dependency row are the
contract of record; naming conventions are only descriptive.

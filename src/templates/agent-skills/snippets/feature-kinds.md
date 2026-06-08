## Feature Kinds

Every feature in a `.features.md` map is **typed**. Each `### Feature N:` carries a
fenced `yaml` metadata block — placed right after the heading, before the prose —
declaring its kind and, for UI work, its design and phase fields. The kind selects
the downstream `forge` profile.

- **`backend`** — server/library functionality; the prose body is a behavioral delta.
- **`ui`** — screen/flow work; renders a framework-appropriate screen
  component from a committed design skill and, in the `wire` phase,
  emits/updates the durable flow artifacts for any flow the screen joins.

| Key | Kind | Required | Notes |
|-----|------|----------|-------|
| `kind` | both | Yes | `backend` or `ui`. |
| `phase` | ui | Yes | `build` or `wire` (feature-level). |
| `design_system` | ui | Yes | Committed design-skill ref (for example `story-spider-design`); source of truth even when a bundle is present. |
| `bundle` | ui | No | Path to a Claude Design export — a visual/structural reference, not a drop-in. Bundle wins on layout/visual intent; the skill wins on implementation dialect. |
| `flag` | ui | Yes (flag-gated) | Feature-flag name; the shared contract joining a `build` feature to its `wire` feature. |
| `screens` | ui | Yes | List of `ScreenId`, e.g. `[AddTitle]`. |
| `flows` | ui | No (build) / Yes (wire) | List of `FlowId` the screen participates in. |

```yaml
# backend feature
kind: backend
```

```yaml
# ui feature (build phase)
kind: ui
phase: build
design_system: story-spider-design
bundle: design/bundles/add-title.zip   # optional
flag: add_title_v1
screens: [AddTitle]
flows: [AddTitle]
```

**Phase semantics.** `build` implements the screen component against a mock behind
`flag` (rendering every brief state with design-system tokens only); `wire`
connects real data, flips the flag, and emits/updates the executable test body +
`flow.md` for every flow in `flows` using the project's UI driver. Compose,
Maestro, and `story-spider-design` are examples, not required stacks.

**The build/wire seam.** Flag-gated UI is two features sharing one `flag`: a `build`
feature and a `wire` feature that lists the build feature in its `Depends On` cell.
Build-ahead-of-backend is legal — only the `wire` feature depends on the backend
feature. The shared `flag`, not a naming convention, is the contract of record. See
the "Feature Kinds and the Build/Wire Seam" section of the agent-skills README for a
worked example.

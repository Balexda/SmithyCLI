# flow-lint fixtures

Two self-contained app-repo trees used by `linter.test.ts` and `flow-lint.test.ts`,
and doubling as worked examples for `docs/flow-lint.md`. Each tree mirrors the
EPIC #404 layout:

```
design/flows/<FlowId>.flow.md       design/screens/<ScreenId>.design.md
maestro/flows/<FlowId>.yaml         app/.../<Screen>.kt   (composable stubs)
```

## `passing/` — the graph resolves

Every cross-reference resolves, so `flow-lint` exits `0` with no findings:

- Flows `AddTitle`, `ReadTitle` — each `screens:` entry resolves to a screen,
  each `maestro:` path resolves to a yaml at the conventional location.
- Screens `Library`, `AddTitle`, `Player` — each `composable:` path resolves to
  a (non-compiled) Kotlin stub under `app/`.
- Maestro flows `AddTitle.yaml`, `ReadTitle.yaml` — each claimed by a flow.

## `dangling/` — planted severed references

Each break is a distinct dangling-reference category. `flow-lint` exits `1`
(3 errors + 1 warning):

| Code | Where | Severed path |
|------|-------|--------------|
| `flow-screen-missing` (error) | `design/flows/AddTitle.flow.md` | `design/screens/AddTitle.design.md` — screen absent |
| `flow-maestro-missing` (error) | `design/flows/ReadTitle.flow.md` | `maestro/flows/ReadTitle.yaml` — yaml absent |
| `maestro-orphan` (error) | `maestro/flows/Orphan.yaml` | referenced by no flow |
| `screen-composable-missing` (warning) | `design/screens/Library.design.md` | `app/.../LibraryScreen.kt` — stub absent |

The warning does not fail CI on its own; `--strict` promotes it so the run
exits `1` on warnings too.

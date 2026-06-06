# `flow-lint` — keep the UI flow/screen graph honest in CI

`smithy flow-lint` is a deterministic, **Smithy-state-free** check that
guarantees the UI flow/screen graph committed to your **app repo** resolves. It
makes **no agent calls**, reads **no Smithy manifest**, and is fast enough to
run on every push — independent of any `forge` invocation.

It is the CI half of EPIC #404: a screen's body is its composable, a flow's
body is an executable Maestro test, and the thin annotations that tie them
together (`design/screens/<ScreenId>.design.md`, `design/flows/<FlowId>.flow.md`)
are only worth keeping if their cross-references actually resolve. A dangling
reference means a product path was *severed* — `flow-lint` surfaces it as a
failure that names the specific broken path, so it reads as signal, not noise.

The authoring contract these checks enforce lives in the
`smithy.helper-flow-definition` and `smithy.helper-screen-design` skills.

## Repo layout it expects

```
design/flows/<FlowId>.flow.md        # flow INTENT annotation (id, screens, maestro)
design/screens/<ScreenId>.design.md  # screen INTENT annotation (id, composable)
maestro/flows/<FlowId>.yaml          # flow BEHAVIORAL body (the Maestro test)
app/.../<Screen>.kt                  # the composable a screen annotation points at
```

`--design-dir` and `--maestro-dir` override the `design` / `maestro/flows`
defaults when your repo uses different roots.

## What it checks

| Code | Severity | Caught when… |
|------|----------|--------------|
| `flow-frontmatter-missing` / `-invalid` | error | a `.flow.md` lacks `id`/`screens`/`maestro` or its front-matter won't parse |
| `flow-id-mismatch` | error | a flow's `id` ≠ its `<FlowId>.flow.md` filename stem |
| `flow-id-duplicate` | error | the same `FlowId` is declared by more than one file (flat-namespace uniqueness) |
| `flow-screen-missing` | error | a `screens:` entry has no resolving `design/screens/<ScreenId>.design.md` |
| `flow-maestro-missing` | error | a flow's `maestro:` path does not resolve to a real file |
| `flow-maestro-nonconventional` | warning | the `maestro:` path resolves but is not `maestro/flows/<FlowId>.yaml` |
| `screen-frontmatter-missing` / `-invalid` | error | a `.design.md` lacks `id`/`composable` or won't parse |
| `screen-id-mismatch` | error | a screen's `id` ≠ its `<ScreenId>.design.md` filename stem |
| `screen-id-duplicate` | error | the same `ScreenId` is declared by more than one file |
| `screen-composable-missing` | warning | a screen's `composable:` path does not exist on disk |
| `maestro-orphan` | error | a `maestro/flows/*.yaml` is referenced by no `.flow.md` (an orphan test) |

`screen-composable-missing` and `flow-maestro-nonconventional` are **warnings**:
product code may legitimately lag the annotation, and an explicit non-standard
test path is allowed. Pass `--strict` to promote every warning to a failure.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | the graph resolves (no errors; no warnings either under `--strict`) |
| `1` | one or more dangling references / lint errors |
| `2` | a usage error (e.g. `--root` does not exist, bad `--format`) |

## Output

Default output is a human report with a one-line verdict; `--format json`
emits the stable `FlowLintResult` shape (`findings[]`, `errorCount`,
`warningCount`, `ok`, `strict`, and the scan counts) for machine consumers.

```
$ smithy flow-lint
✖ error [flow-screen-missing] design/flows/AddTitle.flow.md: `screens` entry `AddTitle` does not resolve → design/screens/AddTitle.design.md not found
✖ error [maestro-orphan] maestro/flows/Orphan.yaml: orphan Maestro flow — no `.flow.md` references it via `maestro:`
✖ flow-lint failed — 2 errors — scanned 2 flows, 2 screens, 2 Maestro flows
```

## CI wiring example (GitHub Actions)

`flow-lint` ships in the `@balexda/smithy` CLI, so the app repo's CI installs
it with `npx` and runs it from the repo root. No emulator, no build — it reads
files only.

```yaml
# .github/workflows/flow-lint.yml
name: flow-lint
on:
  pull_request:
    paths:
      - 'design/flows/**'
      - 'design/screens/**'
      - 'maestro/flows/**'
  push:
    branches: [main]

jobs:
  flow-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      # Pin the version you adopted; flow-lint reads files only — no emulator.
      - name: Resolve the UI flow/screen graph
        run: npx --yes @balexda/smithy@latest flow-lint --no-color
```

Drop `--strict` in if you want a missing composable or a non-conventional
Maestro path to block the merge too.

## Fixtures

Two worked trees live at `src/flow-lint/__fixtures__/` — a `passing/` tree
where every reference resolves and a `dangling/` tree with one of each severed
reference category (see its `README.md`). They back the unit tests and double
as copy-paste examples of the layout.

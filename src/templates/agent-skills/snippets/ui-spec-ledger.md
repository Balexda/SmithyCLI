**Typed UI ledger** (`kind: ui` specs): the `## Dependency Order` table interleaves screen, flow, and backend-story rows under this exact column set:

```markdown
| ID | Kind | Title | Depends On | Design | Artifact |
|----|------|-------|------------|--------|----------|
| SC1 | screen | <Screen title> → `design/screens/<ScreenId>.design.md` | — | <none/import/brief> | — |
| FL1 | flow | <Flow title> → `design/flows/<FlowId>.flow.md` | SC1 | — | — |
| US1 | story | <Backend story title> | — | — | — |
```

- `ID` values are typed and unique in the table: `SC<N>` for screen-build rows,
  `FL<N>` for flow-wire rows, and `US<N>` for backend story rows. Use no leading
  zeros. Any mix of kinds is valid; none is required.
- `Kind` is exactly `screen`, `flow`, or `story`, matching the row's ID prefix.
- `Depends On` is exactly `—` or a comma-separated list of same-table IDs. This
  is the only place intra-feature ordering and parallelism are expressed.
- `Design` is required for `screen` rows and is one of `none`, `import`, or
  `brief`; use `—` for `flow` and `story` rows.
- `Artifact` is `—` or the repo-relative `.tasks.md` path `smithy.cut` wrote
  for that node.
- Screen and flow row titles must name their durable files with pointer text
  — `→ design/screens/<ScreenId>.design.md` for screen rows and
  `→ design/flows/<FlowId>.flow.md` for flow rows — so the title is the stable
  reference edge downstream tooling and later artifact creation resolve to the
  durable file. Titles and cells must not carry layout,
  state, interaction-step, visual-positioning, or implementation prose.
- Flow rows are first-class `FL<N>` rows, not entries in a `flows: [...]` list
  and not nested under a screen row.

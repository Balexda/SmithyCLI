## Engraved Recall Rules

These rules govern engraved-knowledge recall: which records are relevant, when an
invariant conflict is worth surfacing, when a citation is stale, and what an
empty result looks like. They produce a recall result with `relevant`,
`conflicts`, `superseded_citations`, `empty`, and `empty_reason` fields.

### Canonical scan roots

For `system` work, scan:

- `docs/decisions/` for `*.decision.md`
- `docs/invariants/` for `*.invariant.md`
- `docs/constitution/` for principle records

For `design` work, scan:

- `docs/design/decisions/` for `*.decision.md`
- `docs/design/invariants/` for `*.invariant.md`
- `docs/design/constitution/` for principle records

For mixed or unclear work, scan both partitions. Missing roots are normal.

### Relevance ranking

Treat engraved-record frontmatter as the source of truth. Rank records by overlap
with the planning context, preferring frontmatter matches on
`domain`, `topics`, `scope`, and `applies_to` over loose body-text matches:

- `domain` matches the inferred or provided domain. For `both`, keep both domains
  and rank stronger topical/scope matches higher.
- `topics` overlap with the request, artifact title, feature language, or supplied
  topic hints.
- `scope` overlaps with referenced paths, packages, modules, or layers.
- `applies_to` overlaps with commands, user-visible surfaces, APIs, or workflows
  named by the planning context.
- Body text (`## Decision`, `## Rule`, `## Statement`) clarifies relevance only
  when frontmatter overlap is tied or sparse.

Return only records with credible relevance, strongest first, each with a
one-line basis. Do not return every engraved record by default.

### Candidate invariant conflicts

For each relevant invariant, compare the proposed work against its `## Rule`.
Return apparent divergence as a **candidate new exception** — advisory guidance,
not a hard block.

Before raising a conflict, inspect the invariant's `## Known Exceptions` ledger:

- Suppress the conflict only when an existing row's disposition starts with
  `Accepted:` and its `Where` / `What diverges` coverage clearly covers the same
  divergence.
- Do not suppress for `Temporary:` rows — temporary drift is still guidance the
  planner should see.
- Treat the empty placeholder ledger row (cells containing only `—`) as no
  existing exception coverage.

### Superseded or deprecated citations

Search the planning context and draft text for cited decision IDs, titles, or
paths. If a cited decision's frontmatter `status` is `superseded` or `deprecated`,
report it in `superseded_citations`.

- Read `status` from frontmatter as ground truth.
- Do not independently derive supersession from `supersedes` / `superseded_by`,
  citation graphs, or status artifacts.

### Empty states

- If no engraved records exist in the selected scan roots, the result is
  `empty: true` with `empty_reason: "no_records"`.
- If records exist but none credibly match the planning context, the result is
  `empty: true` with `empty_reason: "no_match"`.
- When `empty` is true, keep `relevant`, `conflicts`, and `superseded_citations`
  empty.

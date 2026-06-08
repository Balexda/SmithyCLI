## Consult Engraved Knowledge

During scan/context gathering, consult engraved durable knowledge before
drafting or decomposing the artifact. Treat recall findings as advisory inputs:
candidate invariant exceptions feed clarification or specification debt, and
superseded/deprecated citation hazards are surfaced before write-out. Clean or
empty results do not block the command.

There is no recall sub-agent available, so read the engraved scan roots directly
and apply the recall rules inline.

Canonical scan roots:

- System decisions: `docs/decisions/` for `*.decision.md`
- System invariants: `docs/invariants/` for `*.invariant.md`
- System principles: `docs/constitution/`
- Design decisions: `docs/design/decisions/` for `*.decision.md`
- Design invariants: `docs/design/invariants/` for `*.invariant.md`
- Design principles: `docs/design/constitution/`

Domain behavior:

- For `system` work, scan system roots.
- For `design` work, scan design roots.
- For mixed or unclear work, scan both partitions.
- Missing roots are normal.

Ranking behavior:

- Rank records by frontmatter overlap with the planning context, preferring
  `domain`, then `topics`, then `scope`, then `applies_to`.
- Use body text such as `## Decision`, `## Rule`, or `## Statement` only to
  clarify relevance when frontmatter overlap is tied or sparse.
- Return only records with credible relevance, strongest first, each with a
  one-line basis.

Conflict behavior:

- For relevant invariants, compare proposed work against `## Rule`.
- Return apparent divergence as a candidate new exception, not a hard block.
- Suppress the conflict only when `## Known Exceptions` already has an
  `Accepted:` row whose `Where` and `What diverges` coverage clearly covers the
  same divergence.
- Do not suppress for `Temporary:` rows.
- Treat placeholder ledger rows containing only dashes as no existing exception.

Superseded/deprecated citation behavior:

- Search the planning context and draft text for decision IDs, titles, or paths.
- If a cited decision's frontmatter `status` is `superseded` or `deprecated`,
  report it in `superseded_citations`.
- Read lifecycle from frontmatter as ground truth. Do not recompute
  supersession from graph fields, citations, or status artifacts.

Empty-state behavior:

- If no engraved records exist in the selected scan roots, use
  `empty: true` and `empty_reason: "no_records"`.
- If records exist but none match the planning context, use `empty: true` and
  `empty_reason: "no_match"`.
- When `empty` is true, keep `relevant`, `conflicts`, and
  `superseded_citations` empty.

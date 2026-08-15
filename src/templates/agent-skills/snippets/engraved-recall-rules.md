## Engraved Recall Rules

These rules govern engraved-knowledge recall: which records are relevant, at
which level, when an invariant conflict is worth surfacing, when a citation is
stale, and what an empty result looks like. They produce a recall result with
`relevant`, `conflicts`, `cross_level_conflicts`, `superseded_citations`,
`levels_scanned`, `empty`, and `empty_reason` fields.

{{>engraved-levels}}

### Scanning the levels

Scan every level that resolves — `user`, `repo`, and `project` — using the
scan-root table above, or the scan roots the caller supplied in place of it.
Record which levels you actually scanned so the result can report them; a level
whose store does not exist counts as scanned-and-empty, not skipped.

Every returned record carries the `level` it was read from. Level is derived
from the scan root that produced the record, never guessed from the `id`. When
a record's `id` prefix disagrees with its store, keep the store's level, return
the record, and note the disagreement in its `basis`.

### Relevance ranking

Treat engraved-record frontmatter as the source of truth. Rank records by overlap
with the planning context, preferring frontmatter matches on
`domain`, `topics`, `scope`, and `applies_to` over loose body-text matches:

- `domain` matches the inferred or provided domain. For `both`, keep both domains
  and rank stronger topical/scope matches higher.
- `topics` overlap with the request, artifact title, feature language, or supplied
  topic hints.
- `scope` overlaps with referenced paths, packages, modules, or layers. An absent
  `scope` means the record governs its whole level — do not rank it lower for
  the absence, and do not treat a missing `scope` as a missing match.
- `applies_to` overlaps with commands, user-visible surfaces, APIs, or workflows
  named by the planning context.
- Body text (`## Decision`, `## Rule`, `## Statement`) clarifies relevance only
  when frontmatter overlap is tied or sparse.

Level breaks ties, and only ties: among records with comparable frontmatter
overlap, rank the more specific level first (`project`, then `repo`, then
`user`). Level never promotes a weak match over a strong one — a user-level
record whose topics match squarely outranks a project-level record that barely
matches at all.

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

Report each conflict's `severity` from the covering or nearest ledger row's
`Severity` cell (`low` / `medium` / `high`). When no ledger row bears on the
divergence, report `severity: null` — do not invent a severity. Severity is
reported, never acted on here: escalation belongs to the parent command.

### Cross-level conflicts

Two relevant records at different levels conflict when the narrower one cannot
be followed without breaking the broader one. Apply the precedence rules above:

- The narrower record declares the broader one in `excepts` — the conflict is
  **declared**. Return it in `cross_level_conflicts` with `declared: true`, and
  report the narrower rule as the governing one. This is not a finding against
  the plan; it is provenance the planner should carry.
- No `excepts` declaration — the conflict is **undeclared**. Return it with
  `declared: false`. Name both records, both levels, and what the narrower one
  would have to change to comply. Undeclared conflicts are guidance for the
  planner, not a block, and not something to resolve by picking a winner.

Tightening is not a conflict. A narrower record that forbids a subset of what a
broader record permits is consistent with it — return both as `relevant` and
say nothing about conflict.

### Superseded or deprecated citations

Search the planning context and draft text for cited decision IDs, titles, or
paths. If a cited decision's frontmatter `status` is `superseded` or `deprecated`,
report it in `superseded_citations`.

- Read `status` from frontmatter as ground truth.
- Do not independently derive supersession from `supersedes` / `superseded_by`,
  citation graphs, or status artifacts.
- Ids carry their level, so resolve a cited id against the level its prefix
  names. An id that resolves in no scanned level is a dangling citation: report
  it with `status: "unresolved"` and the levels you searched.

### Empty states

- If no engraved records exist in any scanned level, the result is
  `empty: true` with `empty_reason: "no_records"`.
- If records exist but none credibly match the planning context, the result is
  `empty: true` with `empty_reason: "no_match"`.
- When `empty` is true, keep `relevant`, `conflicts`, `cross_level_conflicts`,
  and `superseded_citations` empty. Still report `levels_scanned`.

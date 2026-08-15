The agent is read-only and returns a `ReviewResult` containing `findings`
and a `summary`. Process each finding with the kind × severity ×
confidence table below, reading its `kind` first. Only a `steering`
finding — where a human must pick between named alternatives and the pick
changes what gets built — can reach the debt table.

**The target artifact** is the planning file findings are recorded against
and **the review note surface** is where a finding this command did not
apply gets reported; both are named just above, and they differ per command.

| Kind | Severity | Confidence | Action |
|------|----------|------------|--------|
| `implementation` or `hygiene` | Critical or Important | High | Apply the `proposed_fix` on disk, following whatever apply protocol this command defines. Note Critical fixes on the review note surface. |
| `steering` | Critical or Important | Any | Do not apply — a steering finding is never auto-applied. Append it to the target artifact's `## Specification Debt` section, and flag Critical ones on the review note surface for the reviewer. |
| `implementation` | Critical or Important | Low | Do not apply and do not record as debt. When the target artifact is a `.tasks.md`, append an `IQ-NNN` row to its `## Open Implementation Questions` section; otherwise note it on the review note surface, since only a tasks file carries that section and the unknown is settled while building either way. |
| `hygiene` | Critical or Important | Low | Do not apply and do not record as debt. Note it on the review note surface so the reader can settle the correction. |
| Any | Minor | Any | Do not apply. Note it on the review note surface. |

**A `steering` finding is never auto-applied, at any confidence.** The
kind means a human has to pick; applying a fix would make that pick for
them and bury a product decision inside a planning commit. Confidence
does not license it — a High-confidence `steering` finding is a
contradiction and means the classification is wrong. Re-examine it: if
the `proposed_fix` can be applied verbatim without anyone choosing, the
finding is `hygiene`; if a human must choose, confidence is Low by
construction. This is the one cell where confidence loses to kind.

For each `steering` finding routed to debt — confidence does not matter,
since steering is never auto-applied — append a row to the target
artifact's `## Specification Debt` index table with the next available
`SD-NNN` identifier, continuing from whatever the artifact already
carries (including any debt inherited from a parent) rather than
resetting. Use the finding's `description` as the body of a new
`### SD-NNN — <Title>` detail section, never as a table cell.

{{>debt-row-shape}}


For each Low-confidence `implementation` finding routed to
`## Open Implementation Questions`, append a row instead: the next
available `IQ-NNN`, the finding's `description` compressed into a single
question of 120 characters or fewer, the `S<N>` slice it lands in (`—`
when it spans slices), a `Settled By` value of `building`, `testing`, or
`reading code`, and `Origin` `local`.

Drift findings (the assumption-output drift category) are surfaced
prominently on the review note surface so the reader can confirm the
underlying assumption rather than silently accepting an applied fix.
Severity escalation never overrides the kind gate: a drift finding whose
`kind` is `implementation` or `hygiene` still routes by its own row above
and never becomes a debt item.

The review agent never modifies files itself — every on-disk change from
a finding is made here, by this command.

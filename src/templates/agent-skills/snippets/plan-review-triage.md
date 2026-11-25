The agent is read-only and returns a `ReviewResult` containing `findings`
and a `summary`. Every finding carries a `destination` the agent already
computed from its `kind`, `severity`, and `confidence` — act on that field
rather than re-deriving it. The three grading fields ride along so this
command can explain in its own output why each finding went where it did.

**The target artifact** and **the review note surface** below are the two
terms bound just above and passed to the agent in the dispatch.

| `destination` | This command does |
|---------------|-------------------|
| `apply` | Edit the file named by the finding's `artifact_path`, using its `proposed_fix`, following whatever apply protocol this command defines. |
| `debt` | Append an `SD-NNN` row and detail section to the target artifact's `## Specification Debt` section. Never apply the fix as well. |
| `iq` | Append an `IQ-NNN` row to the target artifact's `## Open Implementation Questions` section. |
| `note` | Report it on the review note surface. Change nothing on disk. |

Report every Critical finding on the review note surface as well, whatever
its `destination`, so the reader sees it without opening the artifact. A
finding arriving with no `destination`, or one you do not recognize, is a
`note` — report it and change nothing. Findings in the assumption-output
drift category go to the note surface prominently, so the reader can
confirm the underlying assumption rather than silently accepting a fix.

For each `debt` finding, add an `SD-NNN` row to the target artifact's
`## Specification Debt` index table. Use the finding's `description` as the
body of a new `### SD-NNN — <Title>` detail section, never as a table cell,
and its `proposed_fix` as the section's `**Recommendation:**` line. A `debt`
finding with no recommended option has not passed the gate's
recommend-first rule: report it on the review note surface instead of
filing it.

{{>debt-row-shape}}

For each `iq` finding, add an `IQ-NNN` row instead: the finding's
`description` compressed into a single question of 120 characters or fewer,
the `S<N>` slice it lands in (`—` when it spans slices), a `Settled By`
value of `building`, `testing`, or `reading code`, and `Origin` `local`.

Both kinds of row follow the shared append rule:

{{>debt-row-append}}

The review agent never modifies files itself — every on-disk change from a
finding is made here, by this command.

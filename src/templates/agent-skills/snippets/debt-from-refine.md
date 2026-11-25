Record every entry refine returned in `debt_items`, whatever its confidence:
copy its title, source category, impact, confidence, and `Origin: local` into a
`## Specification Debt` row, and its description and recommendation into the
row's `### SD-NNN — <Title>` detail section (the recommendation as its
`**Recommendation:**` line). Never reword a description into a directive,
never drop an entry, and never add a row refine did not return. Refine has
already run the kind gate, so every entry is a steering choice; what it found
besides arrived as a refinement or in its summary.

Refine's `summary` also flags any non-steering finding it left unresolved
because the artifact has no home for it. List each one with its reason in
this run's terminal `## Summary`, and in the PR body when the run opens one.
Do this even on a run that changes nothing on disk, and never record one as a
debt row.

{{>debt-row-append}}

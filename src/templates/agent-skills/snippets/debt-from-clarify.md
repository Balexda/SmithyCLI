Carry the title, source_category, impact, confidence, and origin fields of
each clarify `debt_items` entry into the index table, and its description and
recommendation into the item's `### SD-NNN — <Title>` detail section (the
recommendation as its `**Recommendation:**` line), directly from clarify's
return — never reword a description into a directive, and
never add an item that did not come from `debt_items`. Everything clarify
returns is `Origin: local`, so every item clarify returned gets a detail
section. The kind gate is enforced by `smithy-clarify` Step 3; do not bypass
it here by manually appending requirement, acceptance-test,
dependency-coordination, deferral, or post-hoc resolution items. Omit
`### Resolved` on a first pass — nothing has been resolved yet.

{{>debt-row-append}}

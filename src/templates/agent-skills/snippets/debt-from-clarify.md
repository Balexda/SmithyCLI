Assign sequential `SD-NNN` identifiers, continuing from the highest number the
section already carries rather than resetting — `SD-001` only when the section
holds no rows at all. An identifier is never reused, including one whose row
has since moved under `### Resolved`. Carry the title, source_category,
impact, confidence, and origin fields into the index table and the
description into the item's `### SD-NNN — <Title>` detail section, directly
from clarify's return — never reword a description into a directive, and
never add an item that did not come from `debt_items`. Everything clarify
returns is `Origin: local`, so every item clarify returned gets a detail
section. The kind gate is enforced by `smithy-clarify` Step 3; do not bypass
it here by manually appending requirement, acceptance-test,
dependency-coordination, deferral, or post-hoc resolution items. If clarify
returned no debt items, write the section's empty-state line rather than
back-filling the table from coordination notes or future work. Omit
`### Resolved` on a first pass — nothing has been resolved yet.

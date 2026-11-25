**Appending a row.** One rule for adding an `SD-NNN` row to
`## Specification Debt` or an `IQ-NNN` row to `## Open Implementation Questions`:

- Number from the highest id the section already carries, counting rows under
  `### Resolved`; start at `-001` only when it carries none. Never reuse or
  renumber an id.
- Leave every existing row exactly as it is, whether a parent artifact carried
  it down or an earlier pass wrote it.
- When the section holds only its empty-state line
  (`_None — no specification debt was recorded._` or
  `_None — no open implementation questions._`), replace that line with the
  section template's table header before adding the first row. An empty-state
  line never sits beside a table.
- Write the empty-state line only when the section has no rows at all. Never
  back-fill a row no producer returned.

## Open Implementation Questions
<!-- audience: builder; mode: reference; length: one table row per question; diagram: optional; examples: discouraged -->

| ID | Question | Slice | Settled By | Origin |
|----|----------|-------|------------|--------|
| IQ-001 | <the unknown, phrased as a question, 120 characters or fewer> | S2 | building | local |
| IQ-002 | <an unknown carried down from the source spec> | — | testing | spec:SD-014 |

_Unknowns the implementer closes while building. There is a right answer and the
work reveals it, so nothing here blocks planning and nobody is being asked to
choose. `ID` is `IQ-` plus a zero-padded three-digit integer, unique within this
file and numbered from `IQ-001` independently of the `SD-NNN` sequence.
`Question` is a single sentence of 120 characters or fewer — a longer statement
belongs in the slice body, not in a table cell. `Slice` is an `S<N>` ID from
`## Dependency Order`, or `—` when the question spans slices. `Settled By` is one
of `building`, `testing`, or `reading code`, and names how the implementer closes
the question rather than who to ask. `Origin` is `local` for questions found while
authoring this file, or `<parent-kind>:SD-NNN` for one demoted out of a parent
artifact's debt table. No answer is written back here — the merged code is the
answer, and the row retires with the slice. A question that needs a **human** to
pick between named alternatives is not an implementation question; it is
specification debt and belongs in that table instead. If there are no open
implementation questions, replace this whole section body with this exact line,
italics included and no surrounding quotation marks:_

_None — no open implementation questions._

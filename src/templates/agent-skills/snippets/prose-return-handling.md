Every point in this command that writes a smithy-prose response runs these
steps first, and writes only the draft they leave:

1. **Error.** A response that begins with `## Error` is not content. Write
   nothing from it; the consumption point says whether to halt or skip.
2. **Split off the gaps.** Everything from the `## Gaps / Missing Context`
   heading to the end of the response is the gap report, not draft. Remove it
   before writing; it never reaches the artifact.
3. **Route each gap** by who resolves it. A `steering` gap — a person must pick
   between named alternatives, and the pick changes what gets built — becomes
   a specification-debt item where the artifact has a `## Specification Debt`
   section: `Origin: local`, `Confidence: Low`, its `Source Category` naming
   the drafted section, appended under the command's row-append rule if the
   section is already on disk, otherwise held for the step that writes it.
   Every other gap is recorded as an assumption, or listed in the PR body or
   the run summary.
4. **Account for every inline marker.** A bracketed placeholder left in the
   draft (`[X hours]`, `[N incidents]`) is replaced from the supplied context,
   or reported with the gaps from step 3. None is committed unreported.

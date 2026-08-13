## Audit Checklist (.strike.md)

| Category | What to check |
|----------|---------------|
| **Requirement Completeness** | Are all functional requirements numbered and testable? Do they cover the full scope of the feature? |
| **Slice Scoping** | Is the single slice PR-sized? Does it have a clear standalone goal and justification? |
| **Data Model Presence** | Is a Data Model section present? If data changes are needed, are entities and relationships defined? |
| **Contracts Presence** | Is a Contracts section present? If interface changes are needed, are they specified? |
| **Success Criteria** | Are success criteria numbered, testable, and aligned with the requirements? |
| **Specification Debt** | Does the strike document contain a `## Specification Debt` section? Is it an index table with columns `ID`, `Title`, `Source Category`, `Impact`, `Confidence`, `Origin`, with exactly one `### SD-NNN — <Title>` detail section per row whose `Origin` is `local` and none for rows carried down from a parent, and with resolved items under `### Resolved` rather than in the index? |

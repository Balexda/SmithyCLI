## Audit Checklist (.spec.md)

| Category | What to check |
|----------|---------------|
| **Story Completeness** | Does every user story have acceptance scenarios, priority justification, and an independent test? Are there obvious missing stories? |
| **Priority Ordering** | Are user stories ordered by priority (all P1 first, then P2, then P3)? If any story appears out of priority order, flag it as a finding. |
| **Requirement Traceability** | Does every FR trace to at least one user story? Are there user stories with no supporting requirements? |
| **Cross-Document Consistency** | Do entities in data-model.md match Key Entities in the spec? Do contracts.md interfaces align with integration-related requirements? |
| **Edge Case Coverage** | Are edge cases from the spec reflected in acceptance scenarios or requirements? Are there unaddressed failure modes? |
| **Data Model Integrity** | Are relationships, state transitions, and validation rules internally consistent? Are there entities referenced but not defined, or defined but never referenced? |
| **Contract Completeness** | Do all integration boundaries have defined inputs, outputs, and error conditions? Are there contracts implied by requirements but not documented? |
| **Ambiguity & Risk** | Are there vague terms, unstated assumptions, or scope boundaries that could be interpreted multiple ways? |
| **Staleness** | Does the spec still reflect the current codebase reality? Have upstream changes invalidated any assumptions? |
| **Specification Debt** | Does the spec contain a `## Specification Debt` section between `## Assumptions` and `## Out of Scope`? Are debt items structured with ID, Description, Source Category, Impact, Confidence, Status, and Resolution columns? Are any previously-open items now resolvable? |
| **Dependency Order** | If the spec contains a `## Dependency Order` section: is it a 4-column Markdown table with headers `ID | Title | Depends On | Artifact`? Does every row use a `US<N>` ID (no leading zeros) that is unique within the table? Does each `Depends On` cell list only IDs from the same table (or `—`)? Does every `Artifact` cell contain either `—` or a repo-relative path to an existing `.tasks.md` file in the spec folder (flag any path that does not resolve)? Is the recommended sequence logically justified? No `[ ]`/`[x]` checkbox syntax is valid here — flag any checkbox markup as a finding. If the spec instead contains only a legacy `## Story Dependency Order` section (checkbox-based, predating the table convention), treat as N/A — do not flag. |

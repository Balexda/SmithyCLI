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
| **Story Dependency Order** | If the spec contains a `## Story Dependency Order` section: does it list every user story with a single `[ ]`/`[x]` checkbox and a `**User Story N Tasks: <Title>**` row title? Is the recommended sequence logically justified? Do `[x]` entries match user stories that have `.tasks.md` files in the spec folder? If the section is absent (legacy specs predating this convention), treat as N/A — do not flag. |

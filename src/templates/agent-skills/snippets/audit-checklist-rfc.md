## Audit Checklist (.rfc.md)

| Category | What to check |
|----------|---------------|
| **Ambiguity** | Are problem statement, goals, and constraints clearly defined? Are there vague terms that need tightening? |
| **Milestone Completeness** | Does every milestone have a clear deliverable? Are milestones ordered logically with no gaps in coverage? |
| **Feasibility** | Are there known technical risks, dependencies, or unknowns that could block milestones? Are constraints realistic? |
| **Persona Clarity** | Are target personas identified? Is it clear who benefits and how? |
| **Scope Boundaries** | Is it clear what is explicitly out of scope? Are there adjacent concerns that could cause scope creep? |
| **Decisions vs Open Questions** | Are resolved items listed under Decisions (not Open Questions)? Do Open Questions contain only genuinely unresolved unknowns? |
| **Dependency Order** | Does a `## Dependency Order` section appear immediately after `## Milestones`? Is it a 4-column Markdown table with headers `ID | Title | Depends On | Artifact`? Does every row use an `M<N>` ID (no leading zeros) that is unique within the table? Does each `Depends On` cell list only IDs from the same table (or `—`)? Does every `Artifact` cell contain `—` (the RFC does not link downstream to feature maps — flag any path)? No `[ ]`/`[x]` checkbox syntax is valid here — flag any checkbox markup as a finding. |

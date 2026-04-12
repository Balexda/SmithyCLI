## Audit Checklist (.rfc.md)

| Category | What to check |
|----------|---------------|
| **Ambiguity** | Are problem statement, goals, and constraints clearly defined? Are there vague terms that need tightening? |
| **Milestone Completeness** | Does every milestone have a clear deliverable? Are milestones ordered logically with no gaps in coverage? |
| **Feasibility** | Are there known technical risks, dependencies, or unknowns that could block milestones? Are constraints realistic? |
| **Persona Coverage** | Are target personas identified by role with enough description to explain who they are and how this RFC benefits them? A Personas section that exists but only names personas without describing their context or benefit fails this check. Vague references like "users" or "developers" without further detail are not coverage. |
| **Out of Scope Completeness** | Are explicit exclusions documented in the Out of Scope section, not merely implied elsewhere? Are the scope boundaries drawn tightly enough that adjacent concerns cannot creep in? An Out of Scope section that exists but only gestures at exclusions ("not a full rewrite") without naming the specific capabilities being excluded fails this check. |
| **Decisions vs Open Questions** | Are resolved items listed under Decisions (not Open Questions)? Do Open Questions contain only genuinely unresolved unknowns? |
| **Dependency Order** | Does a `## Dependency Order` section appear immediately after `## Milestones`? Is it a 4-column Markdown table with headers `ID | Title | Depends On | Artifact`? Does every row use an `M<N>` ID (no leading zeros) that is unique within the table? Does each `Depends On` cell list only IDs from the same table (or `—`)? Does every `Artifact` cell contain either `—` or a repo-relative path to an existing `.features.md` file (flag any path that does not resolve; `—` is valid when the feature map has not yet been created)? No `[ ]`/`[x]` checkbox syntax is valid here — flag any checkbox markup as a finding. |

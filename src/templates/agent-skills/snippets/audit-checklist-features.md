## Audit Checklist (.features.md)

| Category | What to check |
|----------|---------------|
| **Feature Coverage** | Are all aspects of the milestone represented by at least one feature? |
| **Gaps** | Are there milestone goals or success criteria that no feature addresses? |
| **Overlap** | Are there features with unclear or overlapping boundaries? |
| **Dependency Clarity** | Are inter-feature dependencies within the milestone evident, or are they hidden? |
| **Dependency Order** | If the feature map contains a `## Dependency Order` section: is it a 4-column Markdown table with headers `ID | Title | Depends On | Artifact`? Does every row use an `F<N>` ID (no leading zeros) that is unique within the table? Does each `Depends On` cell list only IDs from the same table (or `—`)? Does every `Artifact` cell contain either `—` or a repo-relative path to an existing spec folder (flag any path that does not resolve)? Is the sequence logically justified? No `[ ]`/`[x]` checkbox syntax is valid here — flag any checkbox markup as a finding. If the feature map instead contains only a legacy `## Feature Dependency Order` section (checkbox-based), treat as N/A. |
| **RFC Alignment** | Does the feature map align with the RFC's stated goals and success criteria for this milestone? |

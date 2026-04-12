## Audit Checklist (.features.md)

| Category | What to check |
|----------|---------------|
| **Feature Coverage** | Are all aspects of the milestone represented by at least one feature? |
| **Gaps** | Are there milestone goals or success criteria that no feature addresses? |
| **Overlap** | Are there features with unclear or overlapping boundaries? |
| **Dependency Clarity** | Are inter-feature dependencies within the milestone evident, or are they hidden? |
| **Feature Dependency Order** | If the feature map contains a `## Feature Dependency Order` section: does it list every feature with dual checkboxes (`[ ][ ]`, `[x][ ]`, or `[x][x]`)? Is the sequence logically justified? Do `[x][ ]`/`[x][x]` entries match features with spec folders? Do `[x][x]` entries match features whose specs have all stories complete? If absent (legacy feature map), treat as N/A. |
| **RFC Alignment** | Does the feature map align with the RFC's stated goals and success criteria for this milestone? |

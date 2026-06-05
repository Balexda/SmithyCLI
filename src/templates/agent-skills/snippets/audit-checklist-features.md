## Audit Checklist (.features.md)

| Category | What to check |
|----------|---------------|
| **Feature Coverage** | Are all aspects of the milestone represented by at least one feature? |
| **Gaps** | Are there milestone goals or success criteria that no feature addresses? |
| **Overlap** | Are there features with unclear or overlapping boundaries? |
| **Dependency Clarity** | Are inter-feature dependencies within the milestone evident, or are they hidden? |
| **Feature Independence** | Are features that touch disjoint code areas or address functionally independent milestone goals marked as such, so they can be specced and cut in parallel? Is the implied ordering real (data flow / contract dependency), or merely conventional? Flag features whose `Depends On` overstates the actual prerequisite. |
| **Dependency Order** | If the feature map contains a `## Dependency Order` section: is it a 4-column Markdown table with headers `ID | Title | Depends On | Artifact`? Does every row use an `F<N>` ID (no leading zeros) that is unique within the table? Does each `Depends On` cell list only IDs from the same table (or `—`)? Does every `Artifact` cell contain either `—` or a repo-relative path to an existing spec folder (flag any path that does not resolve)? Is the sequence logically justified? No `[ ]`/`[x]` checkbox syntax is valid here — flag any checkbox markup as a finding. |
| **RFC Alignment** | Does the feature map align with the RFC's stated goals and success criteria for this milestone? |
| **Specification Debt** | Does the feature map contain a `## Specification Debt` section? Are debt items structured with required metadata? |
| **Feature Kind** | Does every feature declare a `**Kind**` of `backend` or `ui`? Flag any feature missing `**Kind**` or carrying an invalid value. |
| **UI Feature Fields** | For each `ui` feature, are `**Phase**` (`build`\|`wire`), `**Design System**`, `**Screens**`, and `**Flows**` present, with `**Phase**` one of `build`/`wire`? Flag ui features missing a required field, and `backend` features that carry ui-only fields (`Phase`/`Design System`/`Bundle`/`Flag`/`Screens`/`Flows`). |
| **Build/Wire Seam** | For each `build` feature carrying a `**Flag**`, is there a corresponding `wire` feature sharing that exact `**Flag**` value, and does the wire feature list its build feature in the `Depends On` cell? Flag a build flag with no matching wire, or a wire that does not depend on its build. |

Field definitions for the kind/phase schema: see `{{>feature-kinds}}`.

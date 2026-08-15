{{>debt-row-shape}}


**Choosing a level.** Impact asks how much getting it wrong costs, and
Confidence asks how sure you are of the recommended answer. A parent command
transcribing a review finding never picks either from scratch — it maps and
copies per the rules above — but you are grading from nothing, so use these:

| Level | `Impact` — the cost of being wrong | `Confidence` — how sure you are |
|-------|-----------------------------------|---------------------------------|
| `Critical` | Invalidates the artifact or forces significant rework. | (not a Confidence value) |
| `High` | Materially affects scope, architecture, or user experience; a wrong answer wastes meaningful effort. | Strong evidence in the codebase, docs, or conventions. You would be surprised if the user disagreed. |
| `Medium` | Affects quality or completeness, but is correctable later without major rework. | A reasonable inference where several valid approaches exist. The user might reasonably choose differently. |
| `Low` | A preference or stylistic choice with negligible downstream cost. | Genuine uncertainty. You are guessing, or nothing in scope gives a signal. |

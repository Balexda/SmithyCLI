### Competing Slice Lenses

Dispatch 2 competing **smithy-slice** sub-agents in parallel. Each receives the
same user story, spec artifacts, codebase file paths, and scout report — the
only difference is the **additional planning directives** field.

Use the following lens directives (one per sub-agent):

#### Minimal Path

> **Directive:** Achieve the user story's goals with minimum code churn. Prefer
> adding behavior where it naturally fits in the existing code structure —
> extend current functions, add cases to existing switches, augment existing
> tests. Avoid refactoring, extracting, or reorganizing unless strictly
> required by acceptance criteria. Produce fewer, more targeted tasks. In the
> Tradeoffs section, surface at least one lower-churn alternative even if you
> ultimately recommend against it. This directive biases your attention, not
> your coverage — still flag structural problems or missing tasks if you find
> them.

#### Structural Integrity

> **Directive:** Achieve the user story's goals with code in the architecturally
> correct location. If the right place for new behavior requires extracting a
> module, moving logic between layers, or reorganizing existing code, include
> those steps as tasks. Prioritize code health and maintainability over minimal
> diff. In the Tradeoffs section, surface at least one better-structured
> alternative even if you ultimately recommend against it. This directive biases
> your attention, not your coverage — still flag unnecessary refactoring or
> scope creep if you find them.

---

Pass the quoted directive text above as the **Additional planning directives**
field for the corresponding smithy-slice run.

After both return, dispatch the **smithy-reconcile** sub-agent. Pass it:

- Both slice decomposition outputs, each labeled with its lens name (e.g.,
  "**[Minimal Path]** …", "**[Structural Integrity]** …")
- The same context file paths
- The user story and spec artifact paths

Use the reconciled decomposition as the basis for presenting the approach to
the user.

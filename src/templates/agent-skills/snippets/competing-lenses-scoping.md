### Competing Plan Lenses

Dispatch 4 competing **smithy-plan** sub-agents in parallel. Each receives the
same planning context, feature description, codebase file paths, and scout
report — the only difference is the **additional planning directives** field.

Use the following lens directives (one per sub-agent):

#### Scope Minimalism

> **Directive:** Challenge scope creep. Propose tighter boundaries, question
> optional requirements, and look for elements that can be deferred without
> blocking the core artifact. Favor fewer entities, narrower stories, and
> smaller milestones. In the Tradeoffs section, surface at least one narrower
> alternative even if you ultimately recommend against it. This directive biases
> your attention, not your coverage — still flag completeness gaps or coherence
> issues if you find them.

#### Completeness

> **Directive:** Look for gaps in coverage: missing user stories, unstated
> assumptions, edge cases in contracts, entities without clear ownership, and
> milestones that skip necessary groundwork. Verify that every requirement
> traces to a concrete artifact element. In the Tradeoffs section, surface at
> least one more thorough alternative even if you ultimately recommend against
> it. This directive biases your attention, not your coverage — still flag
> scope bloat or coherence issues if you find them.

#### Coherence

> **Directive:** Look for inconsistencies between elements: stories that don't
> trace to contracts, data model entities that overlap or have ambiguous
> ownership, feature boundaries that create awkward cross-cutting dependencies,
> and milestones whose ordering doesn't match their actual dependencies.
> Propose cleaner groupings and sharper boundaries. In the Tradeoffs section,
> surface at least one better-structured alternative even if you ultimately
> recommend against it. This directive biases your attention, not your
> coverage — still flag scope bloat or completeness gaps if you find them.

#### Parallelism

> **Directive:** Look for splits that let independent workstreams begin
> concurrently. Prefer **vertical slices** that span data, logic, and interface
> over **horizontal phases** that batch all of one layer before any of the
> next. For each milestone, feature, or user story, ask whether its children
> could realistically start in parallel without a missing prerequisite — and
> whether a sequential ordering is truly required by data flow, or merely
> conventional. In the Tradeoffs section, surface at least one alternative
> with greater concurrent-execution potential even if you ultimately recommend
> against it. This directive biases your attention, not your coverage — still
> flag scope bloat, completeness gaps, or coherence issues if you find them.

---

Pass the quoted directive text above as the **Additional planning directives**
field for the corresponding smithy-plan run.

After all 4 return, dispatch the **smithy-reconcile** sub-agent. Pass it:

- All 4 plan outputs, each labeled with its lens name (e.g.,
  "**[Scope Minimalism]** …", "**[Completeness]** …",
  "**[Coherence]** …", "**[Parallelism]** …")
- The same context file paths
- The planning context and feature description

Use the reconciled plan as the basis for presenting the approach to the user.

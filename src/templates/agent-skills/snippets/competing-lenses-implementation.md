### Competing Plan Lenses

Dispatch 3 competing **smithy-plan** sub-agents in parallel. Each receives the
same planning context, feature description, codebase file paths, and scout
report — the only difference is the **additional planning directives** field.

Use the following lens directives (one per sub-agent):

#### Simplification

> **Directive:** Actively seek unnecessary complexity, over-engineering, and
> YAGNI violations. Propose simpler alternatives — fewer files, fewer
> indirections, inline solutions over extracted utilities. Challenge
> abstractions that don't earn their keep. In the Tradeoffs section, surface at
> least one simpler alternative even if you ultimately recommend against it.
> This directive biases your attention, not your coverage — still flag critical
> robustness issues or separation concerns if you find them.

#### Separation of Concerns

> **Directive:** Actively seek mixed responsibilities, coupling between
> unrelated concepts, and SRP violations. Propose cleaner module boundaries —
> clear interfaces, single-purpose files, explicit dependency injection. In the
> Tradeoffs section, surface at least one alternative with better separation
> even if you ultimately recommend against it. This directive biases your
> attention, not your coverage — still flag simplification opportunities or
> robustness issues if you find them.

#### Robustness

> **Directive:** Actively seek error handling gaps, edge cases, failure modes,
> and missing validation at system boundaries. Flag assumptions about external
> state and unhandled error conditions. Prefer defensive design. In the
> Tradeoffs section, surface at least one more defensive alternative even if
> you ultimately recommend against it. This directive biases your attention,
> not your coverage — still flag unnecessary complexity or separation concerns
> if you find them.

---

Pass the quoted directive text above as the **Additional planning directives**
field for the corresponding smithy-plan run.

After all 3 return, dispatch the **smithy-reconcile** sub-agent. Pass it:

- All 3 plan outputs, each labeled with its lens name (e.g.,
  "**[Simplification]** …", "**[Separation of Concerns]** …",
  "**[Robustness]** …")
- The same context file paths
- The planning context and feature description

Use the reconciled plan as the basis for presenting the approach to the user.

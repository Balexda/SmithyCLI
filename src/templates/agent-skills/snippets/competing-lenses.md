### Competing Plan Lenses

Dispatch 3 competing **smithy-plan** sub-agents in parallel, each with a
different focus lens:

| Lens | Emphasis |
|------|----------|
| **Simplification** | Over-engineering, YAGNI violations, unnecessary complexity, simpler alternatives |
| **Separation of Concerns** | SRP violations, coupling, mixed responsibilities, cleaner module boundaries |
| **Robustness** | Error handling gaps, edge cases, failure modes, defensive design |

For each sub-agent, pass the same planning context, feature description,
codebase file paths, and scout report (if any). Additionally, pass:

- **Focus lens**: the lens name from the table above (e.g., "Simplification",
  "Separation of Concerns", or "Robustness")

This is the only field that differs between the 3 runs.

After all 3 return, dispatch the **smithy-reconcile** sub-agent. Pass it:

- All 3 plan outputs, each labeled with its lens name (e.g.,
  "**[Simplification]** …", "**[Separation of Concerns]** …",
  "**[Robustness]** …")
- The same context file paths
- The planning context and feature description

Use the reconciled plan as the basis for presenting the approach to the user.

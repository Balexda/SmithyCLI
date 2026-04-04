### Competing Plan Lenses

Dispatch 3 competing **smithy-plan** sub-agents in parallel, each with a
different focus lens:

| Lens | Emphasis |
|------|----------|
| **Simplification** | Over-engineering, YAGNI violations, unnecessary complexity, simpler alternatives |
| **Separation of Concerns** | SRP violations, coupling, mixed responsibilities, cleaner module boundaries |
| **Robustness** | Error handling gaps, edge cases, failure modes, defensive design |

For each sub-agent, pass the same planning context, feature description, and
codebase file paths. The only difference is the focus lens.

After all 3 return their structured plans, dispatch the **smithy-reconcile**
sub-agent. Pass it:

- All 3 plan outputs, labeled by their focus lens
- The same context file paths
- The planning context and feature description

Use the reconciled plan as the basis for presenting the approach to the user.

# Contracts: Implementation From an Untracked Working Plan

## Interfaces
<!-- audience: builder; mode: reference; length: tables only; diagram: optional; examples: required -->

### Agent Dispatch

| Role | Inputs in the explicitly selected untracked-plan form | Result |
|------|------------------------------------------------------|--------|
| `smithy-implement` | Working-plan path, selected task brief, branch, and existing execution context | Existing task result. Success includes the SHA of the validated code-and-test commit. |
| `smithy-implementation-review` | Working-plan path, selected task brief, and existing diff inputs | Existing structured findings, evaluated against the brief. |
| `smithy-maid` | Request, working-plan path, and changed files | Existing documentation-check result, evaluated against the request and plan. |

| Condition | Response |
|-----------|----------|
| Caller omits the plan form | Apply the existing tracked-plan contract. |
| Required untracked-plan input is missing or unreadable | Report the missing input and stop the affected dispatch. |
| Tests or task commit fail | Return a non-success task result. |
| The plan is tracked or staging protection cannot be established | Block the untracked-plan dispatch. |
| Plan staging or commit evidence violates the boundary | Stop and surface the violation before accepting task completion. |

**Example**: An explicitly untracked implementation dispatch supplies `.local/working-plan.md`, the selected task brief, and the current branch. With passing tests and a code-and-test commit that excludes the plan, the implementer returns success and that commit's SHA.

## Integration Boundaries
<!-- audience: builder; mode: reference; length: tables only; diagram: optional; examples: required -->

| Boundary | Contract |
|----------|----------|
| Caller → agent | The caller selects the plan form and supplies the source inputs for the role. |
| Agent → Git | Only the implementation role creates task commits. The working plan is excluded from staging and commits regardless of role. |
| Result → caller | The caller uses a successful task result and its commit SHA to advance working-plan progress. |

**Example**: A forge dispatch for a legacy `.strike.md` plan uses the tracked form and derives task completion from its committed checkbox.

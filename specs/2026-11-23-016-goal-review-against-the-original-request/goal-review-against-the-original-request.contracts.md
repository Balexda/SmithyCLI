# Contracts: Goal Review Against the Original Request
<!-- applicability: code-shaped features only -->

## Interfaces
<!-- audience: builder; mode: reference; length: tables only; diagram: optional; examples: required -->

### Goal Review Dispatch

`reviewGoal(request, criteria, change) → { verdicts, findings, summary }`

| Input | Required | Contract |
|-------|----------|----------|
| Request | Yes | Original request verbatim, including requirements omitted by the plan. |
| Criteria | Yes | Acceptance criteria with stable references within the request, such as their supplied identifiers or positions. |
| Change | Yes | Implemented change under review. |

| Output | Contract |
|--------|----------|
| Verdicts | One entry per supplied criterion, keyed by its reference. Each entry records met, unmet or unverified and cites supporting evidence or identifies the gap. |
| Findings | List of findings in the canonical [review protocol](../../src/templates/agent-skills/snippets/review-protocol.md) shape, including kind and routed destination. The calling workflow consumes the route. |
| Summary | Brief account of the criteria reviewed and the overall assessment. |

| Condition | Response |
|-----------|----------|
| Evidence is insufficient | Return an unverified verdict for that criterion and identify the missing evidence. Continue reviewing the remaining criteria. |
| Dispatch fails or returns missing or duplicate verdicts | The caller treats the result as incomplete and cannot count the review as a pass. |

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| 2. Report invalid input to the caller | Unmet | The changed handler returns success for the invalid-input branch. |

## Integration Boundaries
<!-- audience: builder; mode: reference; length: tables only; diagram: optional; examples: recommended -->

| Boundary | Contract |
|----------|----------|
| Calling workflow → Goal reviewer | Pass the three review inputs. Omit the plan, tasks and other reviewers' findings. Bind the shared routing context to the caller's reporting surface without passing withheld material. |
| Goal reviewer → Calling workflow | Return read-only verdicts and routed findings. The caller checks the evidence, acts on each destination and uses verdicts to determine whether criteria remain open. |
| Runtime probe → Milestone 3 | Hand off recorded dispatch-context outcomes for Claude and Codex. For each degraded runtime, require the terminal and pull request to say that no independent review ran. |

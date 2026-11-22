# Feature Map: Context-Limited Result Judges

**Source RFC**: `docs/rfcs/2026-003-strike-redesign/strike-redesign.rfc.md`
**Milestone**: 2 — Context-Limited Result Judges
**Created**: 2026-11-22

## Features
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

### Feature 1: Goal Review Against the Original Request

```yaml
kind: backend
```

**Description**: Add a goal reviewer that receives the verbatim request, acceptance criteria and implemented change. It returns a verdict on every criterion.

**User-Facing Value**: Operators can see whether the change meets their original request even when the implementation plan missed part of it.

**Scope Boundaries**:
- Withhold the plan, tasks and other reviewers' findings. Verify the reviewer returns its verdicts without asking for the plan or tasks.
- Declare a provider-neutral tier and verify that the reviewer operates without an effort setting. Keep deployed text free of specific orchestrator, PRD and issue references, and keep the description within the template lint budget.
- Use the existing review protocol and kind gate for findings, including `kind` and routed `destination`. Keep each finding's confidence based on its evidence regardless of agreement between reviewers.
- Run and record the dispatch-context probe on Claude and Codex to establish whether sub-agents inherit context beyond their dispatch. If Codex inherits extra context, record it as degraded like Gemini and pass Milestone 3 the requirement to report that no independent review ran in both terminal output and the pull request.

### Feature 2: Diff-Only Review and Working Plan Protection

```yaml
kind: backend
```

**Description**: Add a diff-only dispatch profile to `smithy-implementation-review` that takes the change and repository. Verify whether either result judge can reach Strike's git-ignored working plan before Strike relies on those context limits.

**User-Facing Value**: Operators get a review of the change free of the original task's framing, backed by evidence about what the reviewer can access.

**Scope Boundaries**:
- Verify that the profile reviews without a slice goal, plan, tasks or original request. Preserve existing profiles and Forge's dispatch behavior, and verify that Forge dispatches neither the goal reviewer nor the diff-only profile.
- Use the existing review protocol and kind gate for findings, including `kind` and routed `destination`. Agreement between reviewers leaves confidence unchanged. Verify that both judges compose shared triage, their descriptions pass template lint, and their deployed text contains no specific orchestrator, PRD or issue references.
- Run the plan-access probe with a git-ignored plan file present in the working tree. Record a result for each judge on each runtime, covering the goal reviewer and diff-only profile on both Claude and Codex.
- Record the outcome as a requirement for Milestone 3. If neither judge can reach the plan on either runtime, trim it to the request, criteria and decisions before judging. If either judge can reach it, delete it before judging. If deletion would lose state Strike still needs, move the file out of the working tree and record new specification debt for the per-agent permission work that move requires.

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

_None — no specification debt was recorded._

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| F1 | Goal Review Against the Original Request | — | — |
| F2 | Diff-Only Review and Working Plan Protection | F1 | — |

The reviewer contracts can be developed in parallel. F2 needs the goal reviewer from F1 to finish the plan-access probe.

## Cross-Milestone Dependencies
<!-- audience: reviewer; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

| Dependency | Direction | Notes |
|------------|-----------|-------|
| Milestone 3: Interactive Strike From Idea to Pull Request | depended upon by | Strike dispatches both reviewers and applies the probe outcomes to working plan handling and runtime independence reporting. |

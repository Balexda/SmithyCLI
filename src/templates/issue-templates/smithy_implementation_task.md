---
name: [Smithy] Implementation Task (Spec → Code)
about: Implement a phase / user story derived from a spec & tasks.md (Step E / F)
title: "[Impl] "
labels: ["implementation"]
assignees: []
---

> Reference [`smithy.queue`](../../docs/dev/codex-workflow.md#e-spec--implementation-tasks-github-issues-smithyqueue)
> when drafting this issue and [`smithy.stage`](../../docs/dev/codex-workflow.md#f-implementation--pr-codex-or-copilot--smithystage-smithystage)
> when executing it. Those sections describe the required validation commands,
> acceptable outputs, and the agent escalation path.
> Use the smithy.stage agent to implement this issue (`codex run /prompt:smithy.stage ...`),
> and include that directive when assigning Copilot.

## Summary
<!-- Brief description of the behavior to implement and the user-visible outcome. -->

## Spec Alignment
- Spec ID:
- Journey / User story:
- Constitution principles:

## Implementation Notes (for Codex / Copilot)
When an automation agent implements this issue, it MUST:
- Use the smithy.stage agent to execute this issue (`codex run /prompt:smithy.stage ...`) and
  include that directive when assigning Copilot or other agents.
- Follow repo conventions in `CONTRIBUTING.md`, `AGENTS.md`, `docs/dev/coding-standards.md`, and relevant docs.
- Prefer **minimal diffs** and avoid refactors outside the stated scope.
- Keep existing behavior unchanged unless explicitly allowed above.
- Update or add tests alongside code changes (no untested behavior).
- Update docs / comments if they become stale.
- If something is unclear from the spec, **stop and request clarification** rather than guessing.

## Acceptance Criteria
- [ ] Behavior matches the spec and journeys referenced above.
- [ ] All UI states covered (loading / empty / error / success) where applicable.
- [ ] No console / runtime warnings introduced.
- [ ] No breaking changes to public APIs unless explicitly approved.
- [ ] All tests for touched modules are updated / created and passing.

## References
- Spec:
- RFC:
- Feature plan / Journey doc:
- Design mocks:
- Other:

## Testing & Validation Focus
<!-- Describe the key validation areas (not exact commands) smithy.stage/humans must cover.
     Example: “Project Hub empty/loading/error states”, “Rust CLI smoke tests”, “Manual regression slug X”. -->
- [ ] Unit / integration coverage expectations:
- [ ] UI/story/snapshot expectations:
- [ ] Manual regression slugs to run (see docs/tests/manual-regressions.md):
- [ ] Other validation focus:

---
name: [Smithy] Bug Report
about: Capture a defect with enough detail for Codex / Copilot to diagnose and fix
title: "[Bug] "
labels: ["bug"]
assignees: []
---

> Bug reports capture **behavior mismatches**—cases where the product does not
> behave as expected. Use smithy-fix directly (no issue) for pure CI/local
> failures or reviewer follow-ups. For behavior mismatches, link this issue to
> [`smithy-fix`](../../docs/dev/codex-workflow.md#g-repairs--smithyfix)
> so Codex/Copilot can apply the smithy-fix protocol
> (`tools/codex/prompts/smithy-fix.md`). Include the data an agent needs to choose
> the correct Trigger Type and reproduce the issue offline.

## Summary
<!-- One or two sentences describing the bug and its impact. -->

## Trigger Type
<!-- Use BEHAVIOR_MISMATCH for bug reports. (CI/LOCAL/REVIEW fixes should run smithy-fix without opening this template.) -->

## Environment
...
- Branch / commit:
- Environment (dev / staging / prod):

## Steps to Reproduce
1.
2.
3.

## Expected vs Actual
- Expected:
- Actual:

## Logs / Screenshots / Data
<!-- Paste relevant logs, stack traces, or screenshots. Redact secrets. -->

## Suspected Scope
<!-- Optional, but useful for automation. -->
- Likely modules / components:
- Likely recent changes (PRs / commits):

## Acceptance Criteria
- [ ] Repro steps no longer trigger the bug
- [ ] No regressions in related flows
- [ ] Tests added or updated to cover this scenario

## Automation Notes (Codex / Copilot)
- Use only the information in this issue + linked PRs/logs when proposing fixes.
- Map each change to the supplied repro/log evidence; prefer minimal diffs.
- List the validation commands (from `.github/workflows/codex-ci.yml`) that should
  be rerun to prove the issue is resolved.
- If the root cause is unclear, summarize hypotheses and request more data instead
  of guessing so the Microfix loop stays scoped.

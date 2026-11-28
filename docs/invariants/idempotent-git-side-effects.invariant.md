---
id: INV-6
kind: invariant
domain: system
title: "Git and GitHub side effects are idempotent and complete"
status: aligned
topics: [git-side-effects, github-operations, idempotency, retries, pagination, repo-identity, git-branching, template-authoring]
scope: [src/templates/agent-skills/commands/**, src/templates/agent-skills/skills/**, src/templates/agent-skills/snippets/**]
applies_to: [deployed commands, smithy.gh-issue, smithy.pr-review, pull requests, issues, branches]
established_by: [D-8, D-7]
excepts: []
---
# Git and GitHub side effects are idempotent and complete

## Rule

Re-running a command never creates a second pull request, issue, or branch.
A branch is created only from the default branch or a detached HEAD, and is
never renamed at push time. Repository identity is resolved once and reused.
A write with an unknown outcome is checked before it is retried. A listing
is paginated to the end before it is filtered. "Already handled" is decided
by an explicit marker.

## Rationale

Commands are re-run by design. A side effect that is not idempotent
duplicates on the second run, and a truncated read reports unseen work as
done (D-8, D-7).

## Known Exceptions

| Where | What diverges | Disposition + Why | Tracking Issue | Severity |
|-------|---------------|-------------------|----------------|----------|
| — | — | — | — | — |

## Citations

D-8, D-7. Paths are relative to `src/templates/agent-skills/`.

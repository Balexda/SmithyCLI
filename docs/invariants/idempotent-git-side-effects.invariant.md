---
id: INV-6
kind: invariant
domain: system
title: "Git and GitHub side effects are idempotent and complete"
status: drifting
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
| `commands/smithy.forge.prompt` (implementation repo check) | Repo identity is the worktree directory name | Temporary: use the common git dir and the remote | #649 | medium |
| `commands/smithy.orders.prompt` (linking) | Hierarchy is linked as blocked-by | Temporary: use sub-issues | #652 | medium |
| `skills/smithy.pr-review/scripts/get-comments.sh` | Reads one page of threads and of replies | Temporary: paginate both | #652 | medium |
| `skills/smithy.pr-review` (handled filter) | A handled thread is decided by `isResolved`, with no marker | Temporary: filter on the response marker | #652 | medium |
| `skills/smithy.pr-review/scripts/find-pr.sh`; `skills/smithy.gh-issue` scripts | Repo identity is resolved more than once | Temporary: resolve `ownerRepo` once and pass it | #652 | medium |
| `skills/smithy.gh-issue`, `skills/smithy.pr-review` (path selection) | A connection error triggers the fallback without checking whether the write landed | Temporary: check before falling back | #652 | medium |
| `skills/smithy.pr-review` (MCP path) | Skips conversation comments and replies with the wrong tool | Temporary: complete the MCP path | #652 | medium |

## Citations

D-8, D-7. Paths are relative to `src/templates/agent-skills/`.

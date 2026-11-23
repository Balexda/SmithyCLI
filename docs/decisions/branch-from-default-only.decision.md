---
id: D-7
kind: decision
domain: system
title: "Branch only from the default branch"
status: proposed
decided_at: 2026-11-22
topics: [git-branching, worktrees, branch-policy, template-authoring]
scope: [src/templates/agent-skills/commands/**, src/templates/agent-skills/snippets/**]
applies_to: [deployed commands, branch creation, commit-and-PR steps]
supersedes: []
superseded_by: []
establishes: [INV-6]
excepts: []
---
# Branch only from the default branch

## Context

The branch rule in `snippets/branch-policy.md` keys on the checkout's shape.
It keeps the current branch only in a linked worktree, and forge gets a
carve-out of its own. The rule only works if each command also defines an
auto-naming step, and a command that forgets that step commits straight to
the default branch. Worktree-based operation is now the norm, so the caller
is usually already on the branch it means. The supported flow is
`mark` → `cut` → `forge`, so no command needs a carve-out for running on
another command's branch.

## Decision

A command that commits to the repository decides its branch by one rule.

- **On the default branch, or on a detached HEAD:** it creates the branch
  name its parent phase supplies.
- **On any other branch:** it keeps that branch, adds no prefix, and does not
  rename it.

There is no worktree-shape test and no forge carve-out. The default branch
is the remote's current default, read from the remote and not from a local
`origin/HEAD` that may be stale. If that cannot be resolved, an interactive
run asks the user and a forked run stops. Pushes and pull requests use the
branch this rule kept or created as their head, and never rename it. A command that writes no
repository commit skips branching. This rule replaces the worktree-aware one
in `snippets/branch-policy.md`.

## Consequences

Good: every command follows one rule, which depends only on the current
branch. A pre-staged worktree's branch is always honoured.

Bad: invoking a command while on an unrelated feature branch commits onto
that branch, so the operator must start from the default branch or the
branch they mean.

## Establishes

INV-6 — its branch-creation clause. D-8 establishes the rest.

## Citations

D-4 (a forked run has no user to ask), D-8.

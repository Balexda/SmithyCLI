---
id: D-8
kind: decision
domain: system
title: "Git and GitHub side effects are idempotent and complete"
status: proposed
decided_at: 2026-11-22
topics: [git-side-effects, github-operations, idempotency, retries, pagination, repo-identity, template-authoring]
scope: [src/templates/agent-skills/commands/**, src/templates/agent-skills/skills/**, src/templates/agent-skills/snippets/**]
applies_to: [deployed commands, smithy.gh-issue, smithy.pr-review, pull requests, issues, branches]
supersedes: []
superseded_by: []
establishes: [INV-6]
excepts: []
---
# Git and GitHub side effects are idempotent and complete

## Context

Smithy commands are meant to be re-run: after a failed PR step, across
review batches, and as successive pipeline steps on one branch. Each git or
GitHub write therefore meets state an earlier run may already have created.
A write that does not check for that state duplicates it. A read filtered
before it is complete reports leftover work as done. Writes to artifacts and
record stores are covered by D-6.

## Decision

A git or GitHub side effect reaches the same end state however many times
the command runs, and it acts on all of what it reads.

- Before creating a pull request, issue, or branch, look for an existing one
  and reuse it.
- Resolve repository identity once per run and pass it on. Never derive it a
  second way.
- Before retrying a write whose outcome is unknown, check whether it landed.
- Paginate a listing to the end before filtering or capping it.
- Decide "already handled" from an explicit marker Smithy writes.
- Make each link mean the relationship it names. Hierarchy uses sub-issues,
  and blocked-by is for ordering between siblings.

## Consequences

Good: re-running is always safe, and batch workflows make progress instead
of repeating their first page.

Bad: each write costs an extra lookup and each listing a pagination loop. A
hand-written reply without the marker is not recognised as handled.

## Establishes

INV-6 — Git and GitHub side effects are idempotent and complete (D-7 adds its
branch clause).

## Citations

D-6, D-7, P-2.

# PRD: Planning Artifact Location Model

**Created**: 2026-11-11  |  **Status**: Draft

## Problem Statement
<!-- audience: stakeholder; mode: explanation; length: 2-3 paragraphs; diagram: optional; examples: discouraged -->

On 1 November 2026 the maintainer could not cut spec 007, a project that spans four repositories. Smithy keeps out-of-repo planning documents in one store per install, and that store was busy with spec 001. It was checked out on 001's branch, it held five uncommitted 001 files, and four 001 forge sessions were still running against it. Neither spec had done anything wrong; two workstreams simply cannot share one checkout. The same design fails in two more ways. A project that spans several repositories has no home of its own, because the store belongs to a single repository. Forge, which runs in a code worktree, follows a fixed path back to that shared store, but the progress it records there gets committed in the code worktree instead of the store. That is how uncommitted planning files pile up behind a running workstream.

All three failures have the same root cause: the location of planning documents is written into the prompt text once, at install time, in 97 places across the templates. Each new answer to "where do artifacts live" has been added as another layer on top of that fixed location: in-repo versus external, per-repository versus shared, named projects, worktrees, and cross-repository slices. The layers so far are agent-side path rewriting, a status lookup that tries several stores in turn, store-specific commit instructions inside prompts, and permission lists that name store paths. A stopgap under review (PR #610) lets commands choose a store at run time. That unblocks the incident, but it puts a second resolution mechanism on top of the first. Reviews of that work found the rule for "which project is in play" implemented in three places. They also found that the location instructions every planning command loads grew from 13 lines to 115, a context cost paid even by teams who keep their planning in-repo and never touch an external store.

We want one model for where planning artifacts and engraved records live, how every command finds them, and how they are committed. Parallel workstreams and multi-repo projects should each have their own home. Forge should find, and commit to, the right store from any worktree. Deployed prompts should carry no filesystem location at all. Teams that keep planning in their repository should see no change.

## Proposed Solution
<!-- audience: stakeholder; mode: explanation; length: 1-2 paragraphs; diagram: optional; examples: discouraged -->

Smithy's CLI becomes the single owner of where a workstream's planning
artifacts live. A deployed prompt never names a filesystem root. It refers to
artifacts by logical place — this workstream's specs, this repo's decisions —
and asks the CLI once per run for the concrete locations, which the CLI
resolves from one workspace model: the install, the project in play, and the
kind of store. That one answer serves the planning commands, status discovery,
engraved recall, and forge alike, so "which project is in play" is decided in
exactly one place. Writes to a store, including the commit that gives
artifacts their history, go through the CLI as well: prompts stop carrying git
commands, and a forge session standing in a code worktree leaves its progress
in the store rather than in the code checkout.

What the user observes: `smithy init` bakes no location into prompts; two
workstreams on one machine each get their own store and never share a
checkout or a branch; a project spanning several repos has one home keyed to
none of them; repo-level installs behave exactly as before; and the store
kinds collapse to two — in the repo, or in a project store, with today's
repo-keyed and shared default stores addressed as projects under reserved
names. The user-facing pieces of the phase-1 stopgap (named project stores,
`smithy status --project`, the `**Project**` header on artifacts) carry over;
its prefix-substitution mechanism is superseded.

## Target Users
<!-- audience: stakeholder; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- **The Smithy maintainer**, who runs several multi-repo workstreams from one
  machine and orchestrates mark → cut → forge agent sessions in parallel.
  Today a second workstream collides with the first's store checkout and
  branch, which is the incident that opened this PRD.
- **Teams with repo-level installs** who keep planning in the repo. They
  notice nothing today and must notice nothing afterwards; they are a hard
  compatibility constraint rather than a group gaining capability.
- **Template authors**, who maintain one template source for three agent
  runtimes and pay context budget for every line of location text. Today 97
  sites across 17 templates name a root, and the stopgap's location policy
  grows to 115 lines in every composing command.

## Success Signals
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: optional -->

- The 2026-11-01 scenario cannot recur: two specs in different projects are
  cut and forged in parallel on one machine with no shared checkout or
  branch, and a forge run in a code worktree records its progress in the
  store, not in the code worktree.
- Deployed templates contain no filesystem root — zero of today's 97
  `{{artifactsRoot}}` sites remain — so a prefix-mismatch bug has nothing to
  mismatch.
- "Which project is in play" is decided in one place, prompts carry no store
  `git` commands, and the location text each command carries returns to
  roughly its 13-line repo-mode size.
- Repo-mode installs show no observable behaviour change, including on a
  machine without a current `smithy` binary on PATH.


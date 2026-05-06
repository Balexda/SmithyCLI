## Branch Selection Policy

Apply this check before any auto-naming branch step in the parent phase,
and again at the commit-and-PR step. It exists so `smithy.<verb>` is safe
to invoke from a pre-existing checkout on a non-default branch —
orchestrators that pre-create a worktree on a known branch and hand it to
a Claude Code worker rely on the agent honoring the checkout rather than
renaming it.

### Detect

1. Discover the repository's default branch dynamically:

   ```bash
   git symbolic-ref refs/remotes/origin/HEAD --short
   ```

   The result looks like `origin/main`; strip the `origin/` prefix to get
   the default branch name. Do not assume `main`.

2. Discover the current branch:

   ```bash
   git rev-parse --abbrev-ref HEAD
   ```

### Decide

- **If the current branch is not the default branch, keep it.** Skip the
  parent phase's auto-naming step, do not run `git checkout -b`, and do
  not prepend `feature/` or any other prefix when later pushing or opening
  the PR. The current checkout is the working branch — an operator (or an
  upstream orchestrator) has already chosen it, often inside a dedicated
  git worktree, and the downstream tooling tracks the work by that exact
  branch name.
- **If the current branch is the default branch**, run the parent phase's
  auto-naming step (`git checkout -b <derived-name>`) to create a fresh
  working branch. This is the greenfield path where no operator has
  pre-staged a branch.

Confirm the resolved branch name to the user and proceed.

### PR step

The same rule applies during the commit-and-PR step: push the resolved
branch as-is, and open the PR with `--head <resolved-branch>` if needed.
**Never create a new branch or rename the current one as part of the
PR-creation command** (in particular, do not prepend `feature/` to the
resolved branch). The branch the agent commits and pushes from must be
the same branch the resulting PR is opened against.

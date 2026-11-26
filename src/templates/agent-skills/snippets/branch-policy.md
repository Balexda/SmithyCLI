{{!-- The branch rule of D-7, plus INV-6's never-a-second-branch clause. --}}
**Resolve the working branch before the first file write or commit.** The calling step supplies only the derived branch name.

1. If this run writes no repository commit, skip branching.
2. {{>default-branch}}
3. Read the current branch with `git rev-parse --abbrev-ref HEAD`, which prints `HEAD` on a detached HEAD.
4. Decide by the current branch alone:
   - **The default branch, or a detached HEAD:** switch to the derived name (step 5).
   - **Any other branch:** keep it. Add no prefix, do not rename it, and create no branch.
5. Switch without duplicating, deciding existence from checked sources only:
   - **Local:** if `git rev-parse --verify --quiet refs/heads/<name>` finds it, run `git checkout <name>`.
   - **Remote:** else, if the remote branch list `git remote show origin` printed names `<name>`, run `git fetch origin refs/heads/<name>:refs/remotes/origin/<name>`, then `git checkout -b <name> --track origin/<name>`. If that fetch fails, stop and report it; never fall through to creating the branch.
   - **Neither:** run `git checkout -b <name>`.

   After checking out an existing branch, repeat every artifact lookup the calling phase made before this step. A file that exists on this branch is routed the way the command routes an existing artifact (review or resume), never overwritten.
6. Tell the user the resolved branch and continue without waiting.
7. At push and PR time, push this branch under its own name and pass it as the PR head. Never rename it or add a prefix such as `feature/`.


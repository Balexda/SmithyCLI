**Commit, push, and open or reuse the PR.** The calling step names the files and the PR title and body.

1. Commit the files on the current branch. Nothing to commit is not an error: skip to step 3 and report 0 files produced.
2. Run `git push -u origin <branch>` under the branch's current name; never rename it or add a prefix.
3. Find an open PR whose head is this branch: `mcp__github__list_pull_requests` with `head` and `state: open`, else `gh pr view --json url,state` with `state` `OPEN`. If one is open, reuse its URL and create none; finding an open PR on this branch is not a failure. Otherwise, if step 1 committed, create one with the supplied title and body ({{>pr-create-tool-choice}}); if it did not, the PR is `No PR — nothing to change`.
4. Capture the PR URL for the one-shot output. If the push or PR step fails, keep the commit and render the one-shot output's PR-creation-failure fallback.

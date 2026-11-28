#!/usr/bin/env bash
# find-pr.sh — Detect the open PR for the current branch
#
# Usage: ${CLAUDE_SKILL_DIR}/scripts/find-pr.sh
#
# Resolves the PR the way `gh pr view` does — by the branch's tracking ref —
# and takes owner/repo from that PR's own URL, so the repository is never
# guessed from a second lookup.
#
# Output: JSON with owner, repo, pr, ownerRepo fields.
# Returns empty object ({}) if no open PR exists for the current branch.

set -euo pipefail

BRANCH=$(git branch --show-current)

# Detached HEAD — no branch to look up
if [ -z "$BRANCH" ]; then
  echo '{}'
  exit 0
fi

GH_STDERR=$(mktemp)
trap 'rm -f "$GH_STDERR"' EXIT
if ! PR_JSON=$(gh pr view --json number,state,url 2>"$GH_STDERR"); then
  # "No PR" is an answer; anything else (auth, network) is an error to surface.
  if grep -qi 'no pull requests found' "$GH_STDERR"; then
    echo '{}'
    exit 0
  fi
  cat "$GH_STDERR" >&2
  exit 1
fi

jq -c '
  if .state != "OPEN" then {}
  else (.url | capture("^https?://[^/]+/(?<owner>[^/]+)/(?<repo>[^/]+)/pull/")) as $r
    | {owner: $r.owner, repo: $r.repo, pr: .number, ownerRepo: "\($r.owner)/\($r.repo)"}
  end' <<<"$PR_JSON"

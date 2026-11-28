#!/usr/bin/env bash
# check-env.sh — Verify gh CLI is installed and can reach the given repository.
#
# Usage: ${CLAUDE_SKILL_DIR}/scripts/check-env.sh <ownerRepo>
#
# ownerRepo is owner/repo, resolved once by the caller from the origin remote;
# this script confirms gh can see that repository and never picks one itself.
# Output: JSON {"owner": "...", "repo": "...", "ownerRepo": "owner/repo"}.
# Exits 1 with a friendly stderr message if gh is missing or cannot reach it.

set -euo pipefail

OWNER_REPO="${1:?ownerRepo (owner/repo) required}"
if ! [[ "$OWNER_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "ownerRepo must look like owner/repo (got: $OWNER_REPO)." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh (GitHub CLI) is required but not installed. Install it from https://cli.github.com/" >&2
  exit 1
fi

# Capture stderr so we can surface gh's real error (auth failure, missing
# repo, rate limit, etc.) instead of a generic message.
GH_STDERR=$(mktemp)
trap 'rm -f "$GH_STDERR"' EXIT
if ! gh repo view "$OWNER_REPO" --json name >/dev/null 2>"$GH_STDERR"; then
  echo "Could not read GitHub repo $OWNER_REPO via gh:" >&2
  cat "$GH_STDERR" >&2
  exit 1
fi

jq -n --arg owner "${OWNER_REPO%%/*}" --arg repo "${OWNER_REPO##*/}" \
  '{owner: $owner, repo: $repo, ownerRepo: "\($owner)/\($repo)"}'

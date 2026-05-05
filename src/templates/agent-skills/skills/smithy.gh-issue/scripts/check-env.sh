#!/usr/bin/env bash
# check-env.sh — Verify gh CLI is installed and a GitHub remote is configured.
#
# Usage: ${CLAUDE_SKILL_DIR}/scripts/check-env.sh
#
# Output: JSON {"owner": "...", "repo": "...", "ownerRepo": "owner/repo"}.
# Exits 1 with a friendly stderr message if gh is missing or no GitHub remote exists.

set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "gh (GitHub CLI) is required but not installed. Install it from https://cli.github.com/" >&2
  exit 1
fi

if ! REPO_JSON=$(gh repo view --json owner,name 2>/dev/null); then
  echo "This repository does not have a GitHub remote configured." >&2
  exit 1
fi

OWNER=$(echo "$REPO_JSON" | jq -r '.owner.login')
NAME=$(echo "$REPO_JSON" | jq -r '.name')

jq -n --arg owner "$OWNER" --arg repo "$NAME" \
  '{owner: $owner, repo: $repo, ownerRepo: "\($owner)/\($repo)"}'

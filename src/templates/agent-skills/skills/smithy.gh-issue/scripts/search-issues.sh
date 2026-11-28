#!/usr/bin/env bash
# search-issues.sh — Search GitHub issues in one repository.
#
# Usage: ${CLAUDE_SKILL_DIR}/scripts/search-issues.sh <ownerRepo> <state> <search-query> [limit]
#
#   ownerRepo:    owner/repo, resolved once by the caller
#   state:        open | closed | all
#   search-query: any gh-compatible search string (e.g. "[Story] My Title in:title")
#   limit:        optional, defaults to 10
#
# Output: JSON array [{"number": N, "title": "...", "state": "...", "body": "..."}, ...].
# Returns an empty array ([]) if no issues match.

set -euo pipefail

OWNER_REPO="${1:?ownerRepo (owner/repo) required}"
if ! [[ "$OWNER_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "ownerRepo must look like owner/repo (got: $OWNER_REPO)." >&2
  exit 1
fi
STATE="${2:?state required (open|closed|all)}"
QUERY="${3:?search query required}"
LIMIT="${4:-10}"

gh issue list \
  -R "$OWNER_REPO" \
  --search "$QUERY" \
  --state "$STATE" \
  --json number,title,state,body \
  --limit "$LIMIT"

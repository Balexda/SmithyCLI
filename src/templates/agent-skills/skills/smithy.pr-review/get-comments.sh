#!/usr/bin/env bash
# get-comments.sh — Fetch root-level inline PR review comments (excludes thread replies)
#
# Usage: bash .claude/skills/smithy.pr-review/get-comments.sh <owner/repo> <pr-number>
#
# Output: JSON array of comment objects. Each has: id, path, line, diff_hunk, body, user.login
# Returns an empty array ([]) if there are no root-level comments.

set -euo pipefail

REPO="$1"
PR="$2"

gh api "repos/$REPO/pulls/$PR/comments" \
  --jq '[.[] | select(.in_reply_to_id == null)]'

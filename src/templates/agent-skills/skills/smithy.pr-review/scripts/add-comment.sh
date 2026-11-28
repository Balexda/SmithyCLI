#!/usr/bin/env bash
# add-comment.sh — Post a top-level PR conversation comment
#
# Usage: ${CLAUDE_SKILL_DIR}/scripts/add-comment.sh <owner/repo> <pr-number> <body-file>
#
# body-file: a plain Markdown file holding the comment text, including the
#            <!-- smithy-pr-review-response-to:<databaseId> --> marker. Write
#            it with your file-writing tool, not a shell heredoc.

set -euo pipefail

REPO="$1"
PR="$2"
BODY_FILE="$3"

gh api "repos/$REPO/issues/$PR/comments" \
  --method POST \
  -f body="$(cat "$BODY_FILE")"

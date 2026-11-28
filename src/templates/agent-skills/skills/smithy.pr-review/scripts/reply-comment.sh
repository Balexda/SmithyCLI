#!/usr/bin/env bash
# reply-comment.sh — Post an inline reply to a PR review comment
#
# Usage: ${CLAUDE_SKILL_DIR}/scripts/reply-comment.sh <owner/repo> <pr-number> <comment-id> <body-file>
#
# comment-id: the thread's root comment databaseId.
# body-file:  a plain Markdown file holding the reply text. Write it with your
#             file-writing tool, not a shell heredoc.
#
# Appends the marker <!-- smithy-pr-review-response-to:<comment-id> --> when
# the body does not already carry it, so get-comments.sh treats the thread as
# handled until a reviewer replies again.

set -euo pipefail

REPO="$1"
PR="$2"
COMMENT_ID="$3"
BODY_FILE="$4"

MARKER="<!-- smithy-pr-review-response-to:$COMMENT_ID -->"
BODY=$(cat "$BODY_FILE")
if [[ "$BODY" != *"$MARKER"* ]]; then
  BODY="$BODY"$'\n\n'"$MARKER"
fi

gh api "repos/$REPO/pulls/$PR/comments/$COMMENT_ID/replies" \
  --method POST \
  -f body="$BODY"

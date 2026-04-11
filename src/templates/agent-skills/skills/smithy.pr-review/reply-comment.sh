#!/usr/bin/env bash
# reply-comment.sh — Post an inline reply to a PR review comment
#
# Usage: bash .claude/skills/smithy.pr-review/reply-comment.sh <owner/repo> <comment-id> <body-file>
#
# body-file: path to a JSON file with content: {"body": "your reply text"}
# Write it with a heredoc before calling this script to avoid quoting issues:
#
#   cat > /tmp/smithy_reply_<id>.json << 'EOF'
#   {"body": "Fixed in abc1234: changed X to Y because Z"}
#   EOF
#   bash .claude/skills/smithy.pr-review/reply-comment.sh owner/repo 123456 /tmp/smithy_reply_123456.json

set -euo pipefail

REPO="$1"
COMMENT_ID="$2"
BODY_FILE="$3"

gh api "repos/$REPO/pulls/comments/$COMMENT_ID/replies" \
  --method POST \
  --input "$BODY_FILE"

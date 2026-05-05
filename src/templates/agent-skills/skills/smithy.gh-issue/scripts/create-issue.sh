#!/usr/bin/env bash
# create-issue.sh — Create a GitHub issue in the current repo from a body file.
#
# Usage: ${CLAUDE_SKILL_DIR}/scripts/create-issue.sh <title> <body-file>
#
# Write the body to a temp file with a heredoc before calling, to avoid quoting
# issues with markdown content:
#
#   cat > /tmp/smithy_issue_body.md << 'BODY'
#   ## My Issue
#   ...
#   BODY
#   ${CLAUDE_SKILL_DIR}/scripts/create-issue.sh "[Story] My Title" /tmp/smithy_issue_body.md
#
# Output: JSON {"number": N, "url": "https://github.com/owner/repo/issues/N"}.

set -euo pipefail

TITLE="${1:?title required}"
BODY_FILE="${2:?body file path required}"

if [ ! -f "$BODY_FILE" ]; then
  echo "Body file not found: $BODY_FILE" >&2
  exit 1
fi

URL=$(gh issue create --title "$TITLE" --body-file "$BODY_FILE")
NUMBER="${URL##*/}"

jq -n --arg url "$URL" --argjson number "$NUMBER" \
  '{number: $number, url: $url}'

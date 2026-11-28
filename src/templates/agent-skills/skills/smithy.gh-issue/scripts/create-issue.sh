#!/usr/bin/env bash
# create-issue.sh — Create a GitHub issue in one repository from a body file.
#
# Usage: ${CLAUDE_SKILL_DIR}/scripts/create-issue.sh <ownerRepo> <title> <body-file>
#
# ownerRepo is owner/repo, resolved once by the caller. Write the body to a
# temp file with your file-writing tool (not a shell heredoc) before calling:
#
#   ${CLAUDE_SKILL_DIR}/scripts/create-issue.sh acme/widgets "[Story] My Title" /tmp/smithy_issue_body.md
#
# Output: JSON {"number": N, "url": "https://github.com/owner/repo/issues/N"}.

set -euo pipefail

OWNER_REPO="${1:?ownerRepo (owner/repo) required}"
if ! [[ "$OWNER_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "ownerRepo must look like owner/repo (got: $OWNER_REPO)." >&2
  exit 1
fi
TITLE="${2:?title required}"
BODY_FILE="${3:?body file path required}"

if [ ! -f "$BODY_FILE" ]; then
  echo "Body file not found: $BODY_FILE" >&2
  exit 1
fi

# Validate jq up front — failing after `gh issue create` would leave an issue
# behind and a non-zero exit, which callers interpret as failure and may retry,
# producing duplicate tickets.
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to format create-issue output but is not installed." >&2
  exit 1
fi

URL=$(gh issue create -R "$OWNER_REPO" --title "$TITLE" --body-file "$BODY_FILE")
URL="${URL//[$'\t\r\n ']/}"
NUMBER="${URL##*/}"

if ! [[ "$NUMBER" =~ ^[0-9]+$ ]]; then
  echo "Could not parse issue number from gh output: $URL" >&2
  exit 1
fi

jq -n --arg url "$URL" --argjson number "$NUMBER" \
  '{number: $number, url: $url}'

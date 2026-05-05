#!/usr/bin/env bash
# link-blocked-by.sh — Mark one issue as blocked-by another via GraphQL.
#
# Usage: ${CLAUDE_SKILL_DIR}/scripts/link-blocked-by.sh <child-number> <blocker-number>
#
# Looks up node IDs for both issues in the current repo, then posts an
# addBlockedBy mutation. Output: JSON {"child": N, "blocker": N} on success.

set -euo pipefail

CHILD="${1:?child issue number required}"
BLOCKER="${2:?blocker issue number required}"

REPO_JSON=$(gh repo view --json owner,name)
OWNER=$(echo "$REPO_JSON" | jq -r '.owner.login')
NAME=$(echo "$REPO_JSON" | jq -r '.name')

CHILD_ID=$(gh api graphql \
  -F owner="$OWNER" -F name="$NAME" -F number="$CHILD" \
  -f query='query($owner:String!, $name:String!, $number:Int!) {
    repository(owner:$owner, name:$name) { issue(number:$number) { id } }
  }' --jq '.data.repository.issue.id')

BLOCKER_ID=$(gh api graphql \
  -F owner="$OWNER" -F name="$NAME" -F number="$BLOCKER" \
  -f query='query($owner:String!, $name:String!, $number:Int!) {
    repository(owner:$owner, name:$name) { issue(number:$number) { id } }
  }' --jq '.data.repository.issue.id')

gh api graphql \
  -F issue="$CHILD_ID" -F blocker="$BLOCKER_ID" \
  -f query='mutation($issue:ID!, $blocker:ID!) {
    addBlockedBy(input:{issueId:$issue, blockingIssueId:$blocker}) {
      issue { number } blockingIssue { number }
    }
  }' >/dev/null

jq -n --argjson child "$CHILD" --argjson blocker "$BLOCKER" \
  '{child: $child, blocker: $blocker}'

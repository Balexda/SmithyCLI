#!/usr/bin/env bash
# link-sub-issue.sh — Add one issue as a sub-issue of another via REST.
#
# Usage: ${CLAUDE_SKILL_DIR}/scripts/link-sub-issue.sh <parent-number> <child-number>
#
# Idempotent: when the child (matched by id) is already a sub-issue of the parent, nothing is
# written and the run still succeeds. The REST endpoint takes the child's
# numeric issue id, not its number, so the script looks the id up first.
# Output: JSON {"parent": N, "child": N, "status": "linked" | "already-linked"}.

set -euo pipefail

PARENT="${1:?parent issue number required}"
CHILD="${2:?child issue number required}"

for arg in "$PARENT" "$CHILD"; do
  if ! [[ "$arg" =~ ^[0-9]+$ ]]; then
    echo "Issue numbers must be bare positive integers (got: $arg)." >&2
    exit 1
  fi
done

REPO_JSON=$(gh repo view --json owner,name)
OWNER=$(echo "$REPO_JSON" | jq -r '.owner.login')
NAME=$(echo "$REPO_JSON" | jq -r '.name')
BASE="repos/$OWNER/$NAME/issues"

emit() {
  jq -n --argjson parent "$PARENT" --argjson child "$CHILD" --arg status "$1" \
    '{parent: $parent, child: $child, status: $status}'
}

CHILD_ID=$(gh api "$BASE/$CHILD" --jq '.id')
if [ -z "$CHILD_ID" ] || [ "$CHILD_ID" = "null" ]; then
  echo "Issue $CHILD not found in $OWNER/$NAME." >&2
  exit 1
fi

# Sub-issues may come from other repos, so match on id, not number. Read every
# page of the parent's sub-issues before deciding the link is absent.
EXISTING=$(gh api --paginate "$BASE/$PARENT/sub_issues" --jq '.[].id')
if grep -qx "$CHILD_ID" <<<"$EXISTING"; then
  emit already-linked
  exit 0
fi

gh api --method POST "$BASE/$PARENT/sub_issues" -F sub_issue_id="$CHILD_ID" >/dev/null
emit linked

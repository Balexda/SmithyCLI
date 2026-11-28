#!/usr/bin/env bash
# get-comments.sh — Fetch unhandled PR review threads and PR conversation comments
#
# Usage: ${CLAUDE_SKILL_DIR}/scripts/get-comments.sh <owner/repo> <pr-number>
#
# Output: JSON array of unhandled review items. Inline review threads have:
#   - kind: "inline_thread"
#   - replyMode: "inline"
#   - id: the thread's GraphQL node id
#   - isResolved (always false in output — resolved threads are filtered)
#   - comments[]: the full reply chain, databaseId, body, path, diffHunk,
#                 author.login, createdAt (ordered oldest → newest)
# Top-level PR conversation comments have:
#   - kind: "conversation_comment"
#   - replyMode: "conversation"
#   - comments[]: a single comment object with databaseId, body, author.login,
#                 createdAt, and null path/diffHunk fields
#
# Every page of threads, of each thread's replies, and of conversation
# comments is read before anything is filtered. "Handled" is decided by the
# response marker smithy-pr-review-response-to:<databaseId>, never by who
# commented last:
#   - an unresolved thread is handled when its newest comment carries the
#     marker for the thread's root comment; a later reviewer reply reopens it;
#   - a conversation comment is handled when a later comment by the
#     authenticated viewer carries its marker. Comments that themselves carry
#     a marker are responses, not feedback, and are dropped.
#
# Returns an empty array ([]) if there are no unhandled review items.

set -euo pipefail

REPO="${1:?owner/repo required}"
PR="${2:?pr number required}"

if ! [[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "ownerRepo must look like owner/repo (got: $REPO)." >&2
  exit 1
fi
OWNER="${REPO%%/*}"
NAME="${REPO##*/}"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

COMMENT_FIELDS='databaseId body path diffHunk author { login } createdAt'

THREADS_QUERY="
query(\$owner: String!, \$name: String!, \$pr: Int!, \$after: String) {
  viewer { login }
  repository(owner: \$owner, name: \$name) {
    pullRequest(number: \$pr) {
      reviewThreads(first: 100, after: \$after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          comments(first: 100) {
            pageInfo { hasNextPage endCursor }
            nodes { $COMMENT_FIELDS }
          }
        }
      }
    }
  }
}"

REPLIES_QUERY="
query(\$id: ID!, \$after: String) {
  node(id: \$id) {
    ... on PullRequestReviewThread {
      comments(first: 100, after: \$after) {
        pageInfo { hasNextPage endCursor }
        nodes { $COMMENT_FIELDS }
      }
    }
  }
}"

CONVERSATION_QUERY="
query(\$owner: String!, \$name: String!, \$pr: Int!, \$after: String) {
  repository(owner: \$owner, name: \$name) {
    pullRequest(number: \$pr) {
      comments(first: 100, after: \$after) {
        pageInfo { hasNextPage endCursor }
        nodes { databaseId body author { login } createdAt }
      }
    }
  }
}"

# page_all <file> <connection-jq-path> <gh args...>: read a connection to its
# last page, appending each page's nodes as one JSON line to <file>.
# The first page's raw response is kept in <file>.first.
page_all() {
  local out="$1" conn="$2"; shift 2
  local after="" page
  : > "$out"
  while :; do
    if [ -n "$after" ]; then
      page=$(gh api graphql "$@" -f after="$after")
    else
      page=$(gh api graphql "$@")
      printf '%s\n' "$page" > "$out.first"
    fi
    jq -c "$conn.nodes" <<<"$page" >> "$out"
    [ "$(jq -r "$conn.pageInfo.hasNextPage" <<<"$page")" = "true" ] || break
    after=$(jq -r "$conn.pageInfo.endCursor" <<<"$page")
  done
}

REPO_ARGS=(-F owner="$OWNER" -F name="$NAME" -F pr="$PR")

page_all "$WORK/threads" '.data.repository.pullRequest.reviewThreads' \
  "${REPO_ARGS[@]}" -f query="$THREADS_QUERY"
VIEWER=$(jq -r '.data.viewer.login // ""' "$WORK/threads.first")

# Complete every thread whose replies run past the first page.
jq -c '.[] | select(.comments.pageInfo.hasNextPage | not)' "$WORK/threads" > "$WORK/complete"
jq -c '.[] | select(.comments.pageInfo.hasNextPage)' "$WORK/threads" | while IFS= read -r thread; do
  printf '%s\n' "$thread" > "$WORK/thread"
  id=$(jq -r '.id' "$WORK/thread")
  cursor=$(jq -r '.comments.pageInfo.endCursor' "$WORK/thread")
  while :; do
    gh api graphql -F id="$id" -f after="$cursor" -f query="$REPLIES_QUERY" > "$WORK/page"
    jq -c --slurpfile page "$WORK/page" '.comments.nodes += $page[0].data.node.comments.nodes' \
      "$WORK/thread" > "$WORK/thread.next"
    mv "$WORK/thread.next" "$WORK/thread"
    [ "$(jq -r '.data.node.comments.pageInfo.hasNextPage' "$WORK/page")" = "true" ] || break
    cursor=$(jq -r '.data.node.comments.pageInfo.endCursor' "$WORK/page")
  done
  cat "$WORK/thread" >> "$WORK/complete"
done

page_all "$WORK/conversation" '.data.repository.pullRequest.comments' \
  "${REPO_ARGS[@]}" -f query="$CONVERSATION_QUERY"

jq -n --arg viewer "$VIEWER" \
  --slurpfile threads "$WORK/complete" \
  --slurpfile pages "$WORK/conversation" '
def marks($id): (.body // "") | test("smithy-pr-review-response-to:\($id)\\b");
def any_mark: (.body // "") | test("smithy-pr-review-response-to:[0-9]+");
($pages | add // [] | sort_by(.createdAt)) as $conversation
| [
    ( $threads[]
      | select(.isResolved == false)
      | (.comments.nodes | sort_by(.createdAt)) as $chain
      | select(($chain | length) > 0)
      | select(($chain[-1] | marks($chain[0].databaseId)) | not)
      | {kind: "inline_thread", replyMode: "inline", id, isResolved: false, comments: $chain} ),
    ( $conversation[] as $comment
      | select(($comment | any_mark) | not)
      | select([ $conversation[]
          | select((.author.login // "") == $viewer and .createdAt > $comment.createdAt)
          | select(marks($comment.databaseId)) ] | length == 0)
      | {kind: "conversation_comment", replyMode: "conversation", isResolved: false,
         comments: [{databaseId: $comment.databaseId, body: $comment.body, path: null,
                     diffHunk: null, author: $comment.author, createdAt: $comment.createdAt}]} )
  ]
| sort_by(.comments[0].createdAt)'

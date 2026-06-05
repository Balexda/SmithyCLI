#!/usr/bin/env bash
# Sync GitHub issue labels from scripts/labels.json.
#
# Idempotent: uses `gh label create --force` so existing labels are
# updated in place and new labels are created. Does NOT delete labels
# that are no longer in the config (do that manually if/when needed).
#
# Usage:
#   bash scripts/sync-labels.sh              # uses scripts/labels.json + $GITHUB_REPOSITORY
#   GH_REPO=owner/name bash scripts/sync-labels.sh
#   LABELS_JSON=path/to/file.json bash scripts/sync-labels.sh

set -euo pipefail

LABELS_JSON="${LABELS_JSON:-scripts/labels.json}"
REPO="${GH_REPO:-${GITHUB_REPOSITORY:-}}"

if [[ -z "$REPO" ]]; then
  echo "error: set GH_REPO=owner/name or run under GitHub Actions" >&2
  exit 1
fi

for cmd in jq gh; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: $cmd is required" >&2
    exit 1
  fi
done

count=$(jq length "$LABELS_JSON")
echo "Syncing $count labels from $LABELS_JSON to $REPO"

jq -c '.[]' "$LABELS_JSON" | while read -r row; do
  name=$(jq -rn --argjson row "$row" '$row.name')
  color=$(jq -rn --argjson row "$row" '$row.color')
  desc=$(jq -rn --argjson row "$row" '$row.description')
  printf '  - %-32s #%s\n' "$name" "$color"
  gh label create "$name" \
    --color "$color" \
    --description "$desc" \
    --force \
    --repo "$REPO"
done

echo "Done."

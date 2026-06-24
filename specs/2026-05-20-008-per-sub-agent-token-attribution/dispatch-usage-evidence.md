# Dispatch Usage Evidence

**Capture reviewed**: `evals/captures/scout-fixture-shallow.events.jsonl`
**Classifier**: `classifyDispatchUsageEvidence`
**Reviewed at**: `2026-05-20T00:00:00.000Z`

## Classification

```json
{
  "classification": "dispatch_attributable",
  "source_capture": "evals/captures/scout-fixture-shallow.events.jsonl",
  "observed_relationship": "Usage metadata has a stable dispatch relationship via tool_use_id=toolu_01J2xpdkVW6WQfnGhg2aR5eb, parent_tool_use_id=toolu_01J2xpdkVW6WQfnGhg2aR5eb; ignored 4 malformed, partial, or unattributable usage record(s)",
  "reviewed_at": "2026-05-20T00:00:00.000Z"
}
```

## Decision

The feature proceeds to the attribution implementation path. The reviewed
capture contains a known `Agent` dispatch with id
`toolu_01J2xpdkVW6WQfnGhg2aR5eb`, and usage-bearing sub-agent events tie back
to that dispatch through `parent_tool_use_id` and task progress `tool_use_id`.

This note records only the dispatch usage evidence classification for US1. It
does not add per-sub-agent token totals, nested report rows, or RFC fallback
resolution changes.

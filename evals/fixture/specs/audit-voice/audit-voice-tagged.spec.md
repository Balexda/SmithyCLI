<!--
PLANTED EVAL FIXTURE — DO NOT "FIX" THIS FILE.

This `.spec.md` exercises the Voice & Audience Tag Lint added to
`/smithy.audit` (EPIC #419, issue #424). Every `##` section below carries a
`<!-- audience: ... -->` voice tag, and six of the seven sections plant a
specific, deliberate tag/content defect the lint must catch. The seventh is
clean. Running `/smithy.audit` against this file must surface the planted
defects at the right severity.

Section → planted condition map (keep in sync with the consuming scenario
`evals/cases/audit-voice-lint.yaml`):

  ## Summary       — CLEAN tagged section (no finding expected).
  ## Goals         — unknown KEY  `audiance:`            → Critical.
  ## Approach      — unknown VALUE `mode: reference-guide`→ Critical.
  ## Background    — length budget violated (declared
                     `2-3 sentences`, body is ~8)         → Warning.
  ## Architecture  — `diagram: required` with no mermaid  → Warning.
  ## Data Handling — `examples: forbidden` with a code
                     block present                        → Warning.
  ## Contracts     — `applicability:` + `N/A — <reason>`
                     body → ACCEPTED, no warnings.

Maintainer instructions:
  - DO NOT "correct" the planted tags or bodies; doing so makes the
    audit-voice-lint scenario stop detecting the regression it exists to
    catch.
  - If the lint grammar or severities change in
    `src/templates/agent-skills/snippets/audit-checklist-voice.md`,
    update both this fixture and the scenario's `required_patterns`
    together.
-->

# Feature Specification: Tag-lint exercise spec

**Spec Folder**: `audit-voice`
**Branch**: `audit-voice/example`
**Created**: 2026-06-06
**Status**: Draft
**Input**: A purpose-built spec whose per-section voice tags exercise every
branch of the `/smithy.audit` voice lint.

## Summary
<!-- audience: stakeholder; mode: explanation; length: 2-3 sentences; diagram: optional; examples: discouraged -->

This spec exists only to drive the audit voice lint. It declares a clean
stakeholder-facing summary that fits comfortably inside its two-sentence
budget.

## Goals
<!-- audiance: reviewer; mode: explanation; length: 1-2 paragraphs; diagram: optional; examples: discouraged -->

The tag above misspells `audience` as `audiance`, which is an unrecognized
key. The lint must flag the unknown key as a Critical finding and quote the
offending token.

## Approach
<!-- audience: reviewer; mode: reference-guide; length: 1-2 paragraphs; diagram: optional; examples: discouraged -->

The `mode` value `reference-guide` is outside the fixed enum
`{explanation, reference, how-to, tutorial}`. The lint must flag the unknown
value as a Critical finding.

## Background
<!-- audience: stakeholder; mode: explanation; length: 2-3 sentences; diagram: optional; examples: discouraged -->

This section declares a two-to-three sentence budget but runs far past it. The
manual reconciliation process predates the current tooling. It was introduced
when the team was a third of its present size. The original author has since
left. Nobody fully owns it today. Each sprint a different engineer reconciles
the files by hand. The drift compounds quietly between sprints. By any honest
reading this paragraph is eight sentences long and materially overruns its
declared budget, which the lint must flag as a Warning.

## Architecture
<!-- audience: builder; mode: explanation; length: 1-2 paragraphs; diagram: required; examples: recommended -->

The tag declares `diagram: required`, but this section contains only prose and
no fenced mermaid block. The lint must flag the missing required diagram as a
Warning. The component talks to the queue, which talks to the worker pool,
which writes to the store — exactly the kind of three-node flow a diagram
would carry better than this sentence does.

## Data Handling
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

The tag declares `examples: forbidden`, yet the section includes a fenced code
block. The lint must flag the forbidden example as a Warning.

```ts
function handle(record: Record<string, unknown>): void {
  store.write(record);
}
```

## Contracts
<!-- audience: builder; mode: reference; length: tables only; diagram: optional; examples: required; applicability: code-shaped features only -->

N/A — docs-only exercise spec; the `applicability:` tag licenses this single-line N/A body, which the lint must ACCEPT with no length, diagram, or examples warnings.

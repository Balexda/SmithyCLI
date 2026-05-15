# Feature Map: Architectural Cost Reductions

**Source RFC**: `docs/rfcs/2026-001-token-savings/token-savings.rfc.md`
**Milestone**: 2 — Architectural Cost Reductions
**Created**: 2026-05-15

## Features

### Feature 2.3: smithy.implement Per-Task Spec Re-Read Reduction

**Description**: Reduce the repeated cold-context artifact reads paid by each `smithy.implement` sub-agent during `smithy.forge` by replacing per-task full-spec re-reading with a measured, bounded alternative selected at spec time: parent pre-paste of relevant acceptance excerpts or a per-task brief generated before dispatch. The feature owns the A/B decision, implementation, and token-delta evidence against the M1 forge baselines.

**User-Facing Value**: A contributor running `smithy.forge` on a multi-task slice spends fewer tokens on repeated planning-artifact lookup while preserving implementation quality and acceptance-scenario fidelity.

**Scope Boundaries**:
- Includes: the `src/templates/agent-skills/agents/smithy.implement.prompt` orchestration around how task-specific spec, data-model, contracts, and acceptance-scenario context is supplied to each implement dispatch; the pre-paste vs. per-task-brief decision record; measured token deltas against both JS and JVM forge baselines from M1; structural-eval pass-rate comparison and sampled output quality review for the affected forge runs.
- Excludes: editing `src/templates/agent-skills/snippets/tdd-protocol.md`; injecting the build-output protocol around test commands; changing `smithy.forge.prompt` Phase 6; model downgrades for any sub-agent; modifying the M1 forge or JVM eval scenarios except to consume their committed baselines.

### Feature 2.4: Inline smithy.maid in smithy.forge Phase 6

**Description**: Remove the separate low-cost `smithy.maid` sub-agent dispatch from `smithy.forge.prompt` Phase 6 by folding the same cleanup and hygiene responsibilities into the forge primary flow. The feature preserves the existing cleanup contract while eliminating the fresh sub-agent context and its token spend.

**User-Facing Value**: A forge run reaches the same final hygiene bar with one fewer sub-agent dispatch, reducing token cost and latency without making the user manage a separate cleanup step.

**Scope Boundaries**:
- Includes: `src/templates/agent-skills/commands/smithy.forge.prompt` Phase 6 orchestration; the inline checklist that replaces the `smithy.maid` dispatch; measured token delta against the M1 forge baseline; structural-eval pass-rate comparison; confirmation that the cleanup responsibilities previously delegated to `smithy.maid` remain covered.
- Excludes: any build-output protocol changes in the forge Validation block; changes to `smithy.implement.prompt`; changes to `smithy.maid` as a standalone reusable artifact outside this forge invocation path; trivial-slice review skipping.

### Feature 2.5: Trivial-Slice Review-Skip Heuristic

**Description**: Add a calibrated trivial-slice path for `smithy.forge` that skips the full implementation-review sub-agent when captured M1/M2 forge data shows the slice is small enough for a slim inline checklist to preserve quality. The initial RFC heuristic is `<50 changed lines / <3 files`, but the feature owns calibration against captured forge runs before the threshold ships.

**User-Facing Value**: Small, low-risk forge slices avoid paying for a full review sub-agent when the measurable quality risk does not justify the cost, while larger or riskier slices continue through the full review path.

**Scope Boundaries**:
- Includes: the calibrated threshold; the inline review checklist used only on slices that meet the threshold; fallback to the existing review sub-agent when the threshold is not met or when risk signals are present; measured token delta; at least two human-reviewed sampled outputs per affected path showing no quality regression.
- Excludes: Opus-to-Sonnet model downgrades for `smithy.implementation-review`; changing the implementation-review prompt for non-trivial slices; redefining task slicing rules; modifying M1 eval infrastructure beyond consuming its captured forge runs and baselines.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | F2.3 intentionally defers the pre-paste vs. per-task-brief choice until M1 token reporting and forge baselines exist. The feature spec must compare both options against the JS and JVM forge baselines before selecting the implementation path; shipping either path without that measurement would violate the RFC's measurement-first gate. | Dependency Relationships | High | High | open | F2.3 spec records the A/B result and selected path before implementation. |
| SD-002 | F2.5's trivial-slice threshold starts from the RFC's `<50 lines / <3 files` guess, but SD-006 in the RFC requires calibration against captured forge runs. The feature spec must either confirm that threshold or replace it with a data-backed one before the review-skip path lands. | Feature Boundaries | High | High | open | F2.5 spec documents the calibrated threshold and the captured-run evidence. |
| SD-003 | F2.3 and M3 F3.1 both touch `src/templates/agent-skills/agents/smithy.implement.prompt` in nearby areas. F2.3 owns the spec/context re-read mechanism, while F3.1 owns the build-output-protocol wrapper around test execution. | Overlap Between Features | Medium | High | open | F2.3 spec names the exact prompt subsection it owns and leaves test-output handling to F3.1. |
| SD-004 | F2.4 and M3 F3.1 both touch `src/templates/agent-skills/commands/smithy.forge.prompt` but in different sections. F2.4 owns Phase 6 orchestration; F3.1 owns the Validation block. | Overlap Between Features | Medium | High | open | F2.4 spec limits edits to Phase 6 and notes that the second-to-land PR rebases if needed. |

## Dependency Order

Recommended specification sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| F2.3 | smithy.implement Per-Task Spec Re-Read Reduction | — | — |
| F2.4 | Inline smithy.maid in smithy.forge Phase 6 | — | — |
| F2.5 | Trivial-Slice Review-Skip Heuristic | F2.3 | — |

All M2 features depend on Milestone 1's measurement substrate before implementation. F2.3 and F2.4 are parallel-startable once M1 closes because they touch different prompt files and remove different cost layers. F2.5 follows F2.3 so its calibration can use the post-F2.3 forge cost shape rather than tuning against a soon-to-change baseline.

## Cross-Milestone Dependencies

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| Milestone 1: Measurement Foundation | depends on | M2 does not begin implementation until M1 provides per-case token totals, committed forge baselines for JS and JVM fixtures, and captured forge-run evidence sufficient to compare token deltas and quality gates. |

M3 is not listed: per the source RFC (lines 23, 50, 193-194), M2 and M3 both depend only on M1 and construct in parallel. M3's touched-files coordination with M2 is governed by the RFC's Cross-Cutting Governance single-owner matrix and surfaced in this file as SD-003 and SD-004, not as a cross-milestone dependency.

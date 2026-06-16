# Context Delivery Decision Record

**Recorded at**: 2026-06-08T00:00:00Z
**Selected strategy**: none — selection deferred
**Merge gate**: blocked
**Evidence source**: not yet available. The Slice 1 harness
(`evals/lib/candidate-measurement.ts`) can build candidate runs and compute
deltas, but it ships no committed forge fixtures and no recorded token
captures. The required M1 JS and JVM forge baselines/captures are not present
in this repository.

## Why The Decision Is Blocked

This record cannot select a strategy yet. The contract requires complete,
reproducible measurements for both candidate strategies across **both** the JS
and JVM forge fixtures, and the spec's cross-story dependency is explicit: *"If
either fixture baseline is absent, the decision must block rather than select a
strategy from partial evidence."*

A repository scan finds neither fixture nor baseline:

| Required Evidence | Present | Notes |
|-------------------|---------|-------|
| JS forge fixture | no | No committed `smithy.forge` JS measurement fixture. |
| JVM forge fixture | no | No `evals/fixture/jvm` tree exists. |
| JS forge baseline / capture | no | `evals/baselines/` holds only `strike-health-check.json` (a strike eval, not forge). |
| JVM forge baseline / capture | no | No committed JVM baseline or capture. |
| `pre_pasted_excerpts` × {js, jvm} measurements | no | Cannot be produced without the fixtures/baselines above. |
| `per_task_brief` × {js, jvm} measurements | no | Cannot be produced without the fixtures/baselines above. |

Per the contract's error conditions, any missing fixture measurement,
missing candidate strategy, or absent baseline sets `merge_gate = blocked`.
All of those conditions currently hold.

## Candidate Results

None recorded. No real measured token totals or quality outcomes exist for
either strategy on either fixture. Illustrative or placeholder numbers are
deliberately **not** recorded here, because a decision record that presents
unreproducible figures as evidence is worse than an empty one — it would
unblock US2 on data the codebase does not contain.

## What Unblocks This Decision

1. Commit the M1 JS and JVM forge measurement fixtures (e.g. an
   `evals/fixture/jvm` tree and its JS counterpart) and their baseline token
   captures.
2. Run the candidate measurement harness against both fixtures for both
   strategies (`pre_pasted_excerpts`, `per_task_brief`) and capture real token
   and structural/sampled-review results.
3. Replace the "Candidate Results" section above with the measured rows, apply
   the quality gate, select the lower-token qualifying candidate, and flip the
   merge gate to `pass`.
4. Only then resolve SD-001 with a pointer to the committed evidence.

## Implementation Boundary

This record selects nothing and changes no production behavior. It does not
implement production forge dispatch packets or change build-output handling,
test-command handling, TDD protocol text, public Smithy CLI syntax, or
implementation sub-agent model assignment. US2 owns the production dispatch
path and must not be unblocked until this decision reaches `merge_gate: pass`.

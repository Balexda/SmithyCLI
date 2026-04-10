# Headless Execution Validation Spike — Findings

Spike to validate three assumptions about `claude -p` headless mode that
underpin the evals framework architecture (FR-014).

## Assumption A: Skill Loading

**Status**: pending

**Evidence**: TBD — will check for strike-specific structural markers
(`# Strike:`, `## Requirements`, `## Summary`, `## Tasks`) and absence of
generic refusal patterns in headless output.

**Fallback**: If `/smithy.strike` is not recognized as a deployed skill, test
raw prompt injection via `claude -p "$(cat .claude/commands/smithy.strike.md) ..."`.

---

## Assumption B: Sub-Agent Dispatch

**Status**: pending

### Per-Agent Status

| Sub-Agent | Status | Evidence |
|-----------|--------|----------|
| smithy-plan | pending | TBD — look for lens labels: Simplification, Separation of Concerns, Robustness |
| smithy-reconcile | pending | TBD — look for `reconcil`, `merged`, or `[via` markers |
| smithy-clarify | pending | TBD — look for `clarif` or `assumption` markers |
| smithy-scout | EXPECTED-ABSENT | Strike does not dispatch scout; absence is correct behavior (known spec gap vs US6) |

**Fallback**: TBD

---

## Assumption C: Stdout Capture

**Status**: pending

**Evidence**: TBD — will verify output file is non-empty, contains valid
Markdown (at least one `#` heading), and does not consist solely of error
messages.

---

## Fallback Approaches

TBD — document any alternative approaches tested if assumptions fail.

---

## Conclusion

TBD — recommendation for whether to proceed with the evals framework as
designed or pivot to an alternative architecture, based on spike results.

# Tasks: Validate Headless Execution Assumptions

**Source**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md` — User Story 1
**Data Model**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md`
**Contracts**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md`
**Story Number**: 01

---

## Slice 1: Headless Execution Validation Spike

**Goal**: Confirm or refute three assumptions about `claude -p` headless mode — that it loads deployed `.claude/` files, supports sub-agent dispatch, and captures skill output on stdout — and document findings with fallback approaches if any assumption fails.

**Justification**: The entire evals framework (US2-US11) depends on these three unvalidated assumptions about `claude -p` behavior. This spike produces validated knowledge and a reproducible script, enabling informed architecture decisions before any framework code is written. FR-014 explicitly requires this validation before proceeding.

**Addresses**: FR-014; Acceptance Scenarios 1.1, 1.2, 1.3

### Tasks

- [ ] **Create spike workspace** — Create `evals/spike/` directory. Create `evals/spike/FINDINGS.md` template with sections: `## Assumption A: Skill Loading` (status, evidence, fallback), `## Assumption B: Sub-Agent Dispatch` (per-agent status for plan, reconcile, clarify, scout), `## Assumption C: Stdout Capture` (status, evidence), `## Fallback Approaches`, `## Conclusion` (recommendation for framework architecture).
- [ ] **Write spike script** — Create `evals/spike/run-spike.sh` (executable shell script) that performs the full validation sequence:
  1. **Pre-flight checks**: verify `claude` is in PATH (`command -v claude`), verify `ANTHROPIC_API_KEY` is set. Exit with clear error if either is missing.
  2. **Build CLI**: run `npm run build` to produce `dist/cli.js`.
  3. **Create temp directory**: `mktemp -d` for an isolated workspace. Register `trap cleanup EXIT` to remove it on any exit.
  4. **Deploy skills**: run `node dist/cli.js init -a claude -y -d "$TMPDIR"` to deploy Smithy skills into the temp directory.
  5. **Verify deployment**: confirm `.claude/commands/smithy.strike.md`, `.claude/prompts/smithy.guidance.md`, and `.claude/agents/smithy.plan.md` exist in the temp directory. Exit with error if deployment failed.
  6. **Run strike headlessly**: invoke `claude -p "/smithy.strike 'add a health check endpoint'"` with cwd set to the temp directory, 300-second timeout (`timeout 300`), capturing stdout to `evals/spike/output-strike.txt` and stderr to `evals/spike/output-strike.stderr.txt`.
  7. **Check Assumption A (skill loading)**: grep the output for strike-specific structural markers — `# Strike:` heading, `## Requirements` or `## Summary` or `## Tasks` sections. Also check for absence of generic refusal patterns (`"I'd be happy to help"`, `"Sure, here's"`). Print per-check PASS/FAIL.
  8. **Check Assumption B (sub-agent dispatch)**: grep the output for evidence of each sub-agent: smithy-plan (lens labels: `Simplification`, `Separation of Concerns`, `Robustness`), smithy-reconcile (`reconcil` or `merged` or `[via`), smithy-clarify (`clarif` or `assumption`). Also check for smithy-scout (`[Ss]cout` or `consistency`) — expected to be absent since strike does not dispatch scout (document this as a known spec gap, not a spike failure). Print per-agent PASS/FAIL.
  9. **Check Assumption C (stdout capture)**: verify captured output file is non-empty, contains valid Markdown (at least one `#` heading), and does not consist solely of error messages.
  10. **Print summary**: display per-assumption PASS/FAIL verdict.
- [ ] **Run the spike** — Execute `bash evals/spike/run-spike.sh`. Observe the per-assumption verdicts. If any assumption fails, investigate the raw output files (`output-strike.txt`, `output-strike.stderr.txt`) to understand why.
- [ ] **Test fallback approach (if Assumption A fails)** — If `claude -p "/smithy.strike ..."` does not trigger the deployed skill, test the raw injection fallback: `claude -p "$(cat .claude/commands/smithy.strike.md) add a health check endpoint"` from the temp directory. Document whether this alternative successfully triggers the skill and produces structural output.
- [ ] **Document findings** — Fill in `evals/spike/FINDINGS.md` with: per-assumption pass/fail status with evidence (output excerpts showing structural markers or their absence), the exact commands used for reproducibility, the scout dispatch gap (strike dispatches plan x3, reconcile, clarify — but NOT scout, contradicting spec US6 acceptance scenario 1), any fallback approaches tested and their results, and a conclusion recommending whether to proceed with the evals framework as designed or pivot to an alternative architecture.
- [ ] **Commit spike artifacts** — Commit `evals/spike/run-spike.sh`, `evals/spike/FINDINGS.md`, and optionally `evals/spike/output-strike.txt` (if useful as evidence). Do not commit `output-strike.stderr.txt` unless it contains relevant diagnostic information.

**PR Outcome**: The team has validated (or refuted) the three core assumptions underpinning the evals framework, with a reproducible spike script and a findings document that guides the architecture for US2-US11. The scout dispatch gap between spec and implementation is documented for resolution before US6.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — This is the only slice. It is the prerequisite for all other stories in the spec.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Reference Fixture Exists and Is Deployable | depended upon by | US2 creates the reference fixture; this spike uses `smithy init` directly (no fixture needed). US2 depends on spike findings to confirm `smithy init` deployment works in a headless context. |
| User Story 3: Execute a Skill Headlessly and Capture Output | depended upon by | US3 builds the production runner. Its architecture depends on whether the spike confirms stdout capture, `.claude/` file loading, and sub-agent dispatch. |
| User Story 6: Verify Sub-Agent Invocation | depended upon by | US6 expects scout evidence in strike output. The spike will document that strike does not dispatch scout — US6 must account for this. |

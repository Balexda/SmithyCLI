# Feature Map: Measurement Foundation

**Source RFC**: `docs/rfcs/2026-001-token-savings/token-savings.rfc.md`
**Milestone**: 1 — Measurement Foundation
**Created**: 2026-05-12

## Features

### Feature 1.1: Reference Baseline Evals Infrastructure

**Description**: Anchor reference to the existing evals framework — `runScenario`, `validateStructure`, `loadScenarios`, `loadBaseline`, `compareToBaseline`, and the strike scenario's committed baseline — that every downstream M1 feature extends. Referenced, not owned: no work lands under this row. The dependency table carries it so downstream features can cite "F1.1 substrate" rather than re-deriving the prerequisite.

**User-Facing Value**: Future spec authors (and downstream M2/M3 features) see in one place which existing evals primitives they inherit, instead of inferring the substrate from cross-RFC reading.

**Scope Boundaries**:
- Includes: the existing files under `evals/lib/` (`runner.ts`, `report.ts`, `parse-stream.ts`, `scenario-loader.ts`, `baseline.ts`) and `evals/cases/strike-health-check.yaml` as inherited substrate. No edits.
- Excludes: any new code, new fields, new scenarios, new baselines — those are owned by F1.3a through F1.7.

### Feature 1.2: Expand-Evals Planning-Command Coverage (cross-RFC dependency)

**Description**: Hard read-only dependency on `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/` for the audit / mark / cut / render / ignite / spark scenarios, the YAML scenario loader extensions, and the committed baseline library. Referenced, not owned: no slice in this milestone edits anything inside the expand-evals spec folder. The dependency exists because M3 F3.2's quality net for sub-agent model downgrades is built on landing-soon expand-evals US1 (audit), US2 (mark), and US3 (cut) — but M1 itself only consumes the scenario / loader / baseline-library substrate where it already exists.

**User-Facing Value**: Reviewers reading this feature map see the boundary between the two specs and know which artifact owns what. Prevents accidental cross-ownership edits in either direction.

**Scope Boundaries**:
- Includes: as substrate, any expand-evals scenarios and baselines that merge to master during M1 are available to M1's reporting features (F1.3a / F1.7) for committed baseline inclusion.
- Excludes: any edits to files under `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/`; ownership of audit / mark / cut / render / ignite / spark scenarios; ownership of the YAML scenario loader or baseline library implementations.

### Feature 1.3a: Per-Case Token Totals in EvalReport

**Description**: Every `npm run eval` report attributes input and output token counts per scenario, surfaced through the full `evals/lib/` substrate: a `usage` field on stream events, token totals on `RunOutput`, `EvalResult`, and `EvalReport`, a per-case token column in `formatReport`'s rendering, the committed baseline file for the existing strike scenario in the new token-aware schema, and the baseline-file schema itself that F1.7's M1-closing sweep authors against. F1.3a is the foundational measurement-substrate feature on which the M1 completion gate (F1.7) and every downstream M2 / M3 cost-reduction feature build; it is not itself the milestone gate. Within F1.3, F1.3a is the always-shipping branch — the RFC carves F1.3b as contingent on its SD-001 evidence — but milestone closure is owned by F1.7.

**User-Facing Value**: A power user or contributor running `npm run eval` sees `input: NNNN, output: NNNN` per case in the report and a `baseline:` marker against the committed token envelope for the strike scenario, so any template edit's token impact is visible without re-running history. Downstream cost-reduction features in M2 and M3 inherit a non-speculative measurement substrate.

**Scope Boundaries**:
- Includes: `usage` field on `StreamEvent` in `evals/lib/types.ts` (additive, optional, loose-typed); token-extraction logic in `evals/lib/parse-stream.ts` reading `usage.input_tokens` / `usage.output_tokens` from the stream-json `result` (and where applicable, `assistant`) events; `tokens` field on `RunOutput` in `evals/lib/runner.ts`; aggregate `tokens` on `EvalResult` and `EvalReport` in `evals/lib/report.ts`; per-case rendering in `formatReport`; the baseline-file schema extension under `evals/baselines/*.json` to carry a token envelope alongside the existing structural envelope; the refreshed `evals/baselines/strike-health-check.json` committed with the new schema; the `compareToBaseline` extension that emits a token-delta `CheckResult` alongside the structural one; the touched-files matrix amendment that names `evals/lib/types.ts`, `evals/lib/parse-stream.ts`, and `evals/lib/runner.ts` as F1.3a owners (the RFC matrix currently understates these).
- Excludes: per-sub-agent attribution (F1.3b); the smithy.fix, smithy.forge-JS, and smithy.forge-JVM baselines (F1.4 / F1.5 / F1.7 commit those against the schema F1.3a establishes); planning-command baselines from F1.2 (committed as those scenarios merge under their own PRs, not under F1.3a).

### Feature 1.3b: Per-Sub-Agent Token Attribution

**Description**: Per-Agent-dispatch token usage rendered in `formatReport` beneath each case's totals, attributing usage to the dispatched sub-agent name. Dual-path acceptance per the RFC's SD-001 (stream-json per-sub-agent attribution risk): if the existing capture at `evals/captures/strike-health-check.events.jsonl` confirms per-dispatch usage records exist on `assistant` events keyed by `parent_tool_use_id`, F1.3b ships the rendering surface. If the capture shows parent-only attribution, F1.3b ships as a documentation deliverable that formally descopes per-sub-agent attribution to a post-M1 follow-up, updates the RFC Goals footnote, and closes the RFC's SD-001 to resolved. Either outcome closes F1.3b.

**User-Facing Value**: When per-dispatch usage is available, a reviewer reading an eval report can attribute cost to individual sub-agents (e.g., `smithy-plan-review: 12.4K in / 2.1K out`) and see which downgrade candidates are actually expensive. When unavailable, the report and downstream cost analysis lean on F1.3a's per-case totals plus the documented descope note, and program-wide work proceeds without ambiguity.

**Scope Boundaries**:
- Includes: review of `evals/captures/strike-health-check.events.jsonl` to confirm or refute per-dispatch usage; the per-sub-agent aggregation logic (group by `parent_tool_use_id`, map to dispatching `Agent` tool_use's `subagent_type`); a new `sub_agent_tokens` field on `EvalResult`; nested rendering in `formatReport` beneath each case row (the rendering format itself is captured as SD-004 below and is settled at this feature's spec time); the SD-001 closure entry in the RFC's debt table; the Goals-footnote update if the parent-only fallback path is taken.
- Excludes: changing F1.3a's per-case totals contract; per-sub-agent baseline envelopes (F1.3a's per-case envelope is sufficient for M2 / M3 deltas — per-agent envelopes are not in M1 scope); planning-command baselines.

### Feature 1.4: smithy.fix End-to-End Eval Scenario

**Description**: A new `evals/cases/fix-from-issue.yaml` exercising the high-cost CI-log path of `smithy.fix` against an offline-committed issue fixture and an offline-committed CI-log fixture, so the run is fully deterministic without network or live `gh` calls. Includes the structural expectations for fix's output, the sub-agent evidence patterns for whichever helpers fix dispatches, and the committed token baseline once F1.3a's schema is live. Closes the PRD success-signal gap that smithy.fix had no end-to-end coverage.

**User-Facing Value**: A contributor proposing any change near `smithy.fix.prompt` — particularly M3 F3.3's CI-log failure-extraction grep — sees a measured token delta and structural pass/fail in their PR description, instead of shipping on intuition.

**Scope Boundaries**:
- Includes: `evals/cases/fix-from-issue.yaml`; the offline issue fixture (planned path: `evals/fixture/issues/issue-001.md` or analogous — exact shape decided at spec time, see SD-003); a committed CI-log fixture (planned path: `evals/fixture/ci-logs/run-001.log` or analogous) plus the runner-level injection mechanism that lets `smithy.fix.prompt` consume the local file instead of calling `gh run view`; structural expectations and sub-agent evidence patterns; the committed `evals/baselines/fix-from-issue.json` against F1.3a's schema; coordination with F1.4-time decisions on how `smithy.fix.prompt` discovers the local issue (e.g., a `--from-file` argument or a scenario-prompt-level workaround).
- Excludes: the failure-extraction grep step itself (M3 F3.3 owns); any edit to `smithy.fix.prompt` (M3 owns its template edits); live `gh issue view` / `gh run view` invocations in the scenario; multi-issue scenarios or non-CI-log fix paths.

### Feature 1.5: smithy.forge End-to-End Eval Scenario + Runner git-init (RFC SD-002)

**Description**: A new `evals/cases/forge-tdd-slice.yaml` running a forge slice end-to-end against the existing JS fixture, paired with the runner change in `evals/lib/runner.ts` that runs `git init` (and seeds an initial commit on a non-default branch) inside the per-scenario temp copy whenever the scenario opts in via a `requires_git: true` field. Closes the RFC's SD-002 — without git, `smithy.forge` cannot `git checkout -b` or `git commit` mid-slice and the scenario fails before reasoning starts. The git-init step is gated behind the opt-in so read-only scenarios (strike, scout, planning-command scenarios) are unaffected and the existing fixture-checksum invariant is preserved.

**User-Facing Value**: A contributor proposing any forge orchestration or sub-agent change — particularly M2 F2.3 (per-task spec re-reads), F2.4 (inlining smithy.maid), and F2.5 (trivial-slice review-skip) — sees a measured token delta and structural pass/fail on the JS-fixture forge scenario in their PR description. RFC SD-002 closure is the prerequisite that turns "forge scenario" from speculation into shippable measurement.

**Scope Boundaries**:
- Includes: `evals/cases/forge-tdd-slice.yaml` with a deterministic single-slice fixture task (hand-authored failing test plus known-passing implementation surface); `requires_git: true` opt-in field on the scenario YAML schema (this is F1.5's only YAML-schema addition); the runner change that performs `git init && git add -A && git commit` inside the temp copy when the flag is set, ordered between `fs.cpSync` and `spawnClaude`; structural expectations targeting forge's slice-completion markers; sub-agent evidence patterns for `smithy-implement` and `smithy-implementation-review`; the committed `evals/baselines/forge-tdd-slice.json` against F1.3a's schema; an additive checksum-guardrail exclusion for the temp copy's new `.git/` directory (the source fixture is unchanged).
- Excludes: the JVM run of the forge scenario (F1.7 owns); the JVM fixture itself (F1.6 owns); any inlining of `smithy.maid` (M2 F2.4); any per-task spec re-read reduction (M2 F2.3); any change to `smithy.implement.prompt` or `smithy.forge.prompt`; multi-task or multi-slice forge scenarios.

### Feature 1.6: JVM Multi-Language Fixture

**Description**: A new `evals/fixture/jvm/` directory containing a minimal but realistic Gradle project sufficient to drive a forge slice end-to-end on a non-JS toolchain and to exercise the gradle clauses of M3 F3.1's forthcoming build-output protocol. Includes the per-scenario fixture-selection mechanism (a `fixture:` field on the scenario YAML schema) so a single forge scenario can target the existing JS fixture or the new JVM fixture without an orchestrator code change per scenario.

**User-Facing Value**: A contributor proposing any change that interacts with build tooling sees both the JS-fixture and JVM-fixture forge scenarios pass / fail and their token deltas, so the build-output protocol claims in M3 F3.1 land against a real non-JS toolchain rather than speculation. Future RFCs can add Cargo / Go / Python fixtures alongside JVM without re-deriving the selection mechanism.

**Scope Boundaries**:
- Includes: `evals/fixture/jvm/` containing `build.gradle(.kts)`, `settings.gradle(.kts)`, a single-package source tree under `src/main/java/...`, a single failing JUnit (or analogous) test ready for forge to operate against, and the minimum gradle wrapper or PATH-tool documentation needed for the scenario to run; the new optional `fixture:` field on the scenario YAML schema (semantics: relative path under `evals/fixture/`, default to the existing JS fixture when omitted, see SD-002 below); the runner / loader change that honors the field; an additive update to the existing `--fixture` flag pathway so per-scenario `fixture:` overrides it cleanly.
- Excludes: Cargo / Go / Python fixtures (RFC Out-of-Scope); refactoring the existing JS fixture; the build-output protocol itself (M3 F3.1 owns); any forge eval scenario YAML (F1.5 / F1.7 own).

### Feature 1.7: Forge-JVM Eval Scenario + M1 Baseline-Set Completeness Gate

**Description**: Extends the forge scenario from F1.5 to run against the JVM fixture from F1.6, commits the resulting `evals/baselines/forge-tdd-slice-jvm.json`, and serves as the M1 completion gate: verifies that committed baselines exist for the strike, smithy.fix, smithy.forge-JS, and smithy.forge-JVM scenarios — and that the baseline set as a whole is sufficient for M2 and M3 to compute token deltas on any prompt or sub-agent edit without re-running the full eval suite. Planning-command baselines from F1.2 are committed as those scenarios merge under their own PRs and do not gate F1.7 (see SD-005 below).

**User-Facing Value**: An M2 or M3 contributor knows the measurement substrate is complete the moment F1.7 lands — there is no implicit "we'll backfill baselines later" debt. The PR-description token-delta protocol that lands in M3 F3.4 has a guaranteed committed baseline floor to compute against.

**Scope Boundaries**:
- Includes: a forge-JVM scenario expressed either as a second YAML file (`evals/cases/forge-tdd-slice-jvm.yaml`) or as a fixture-parameterized run of the existing forge scenario (decided at F1.7 spec time); the committed `evals/baselines/forge-tdd-slice-jvm.json`; the M1-closing baseline-set audit (verify presence and shape of strike / fix / forge-JS / forge-JVM baselines); explicit confirmation in the F1.7 spec that planning-command baselines from F1.2 do not gate M1 closure and land as expand-evals scenarios merge.
- Excludes: editing F1.5's forge scenario shape (F1.5 owns the structural expectations); editing F1.6's JVM fixture (F1.6 owns); the M1-close `.claude/` snapshot-refresh chore (a separate chore PR per RFC Operational Constraints, not a feature row in this map); planning-command baselines (committed under expand-evals scenario-merge PRs as F1.2 lands them).

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | The wording of F1.7's "M1 baseline-set completeness sweep" was initially ambiguous on whether landing-soon planning-command baselines (delivered via the F1.2 cross-RFC dependency) gate M1 closure. Resolved in F1.7's scope statement above: F1.7 closes on strike + fix + forge-JS + forge-JVM baselines only; planning-command baselines land under their own expand-evals scenario-merge PRs and do not gate F1.7. Kept as debt to flag the resolution explicitly so M2 / M3 readers do not re-discover it. | Feature Boundaries | High | Medium | open | F1.7 spec carries the bounded closure rule in its acceptance scenarios. |
| SD-002 | F1.6's `fixture:` YAML field shape is not fully specified at the feature-map level. Open sub-decisions: exact field name (`fixture:` vs `fixture_path:`), absolute-vs-relative path, default semantics when omitted, interaction with the existing global `--fixture` flag. Recommended default settled in F1.6's scope statement: optional, relative path under `evals/fixture/`, default to the existing JS fixture when omitted, per-scenario value overrides the global flag. Final shape settled at F1.6 spec time. | Integration Points | Medium | Medium | open | F1.6 spec authors finalize the field shape; default per the recommendation above. |
| SD-003 | F1.4's high-cost CI-log path needs a deterministic offline fixture for `gh run view` output, and `smithy.fix.prompt` is GitHub-issue-driven by default. Open sub-decisions: how `smithy.fix.prompt` discovers the offline issue (a `--from-file` argument vs a scenario-prompt-level workaround vs a small runner mock/injection hook), and whether the CI-log payload sits alongside the issue under `evals/fixture/issues/` or under `evals/fixture/ci-logs/`. F1.4 spec authors finalize both. | Scope Within Milestone | Medium | Medium | open | F1.4 spec authors choose the discovery mechanism and fixture layout. |
| SD-004 | F1.3b's per-sub-agent rendering format in `formatReport` is not fully specified at the feature-map level (nested sub-rows under each case row vs a separate per-agent table vs an opt-in `--detail tokens` flag). Recommended default: nested sub-rows under each case row, gated by the same pattern as the existing `baseline:` marker (render only when at least one sub-agent has usage data). Final shape settled at F1.3b spec time. | Scope Within Milestone | Medium | Medium | open | F1.3b spec authors finalize the rendering format; default per the recommendation above. |
| SD-005 | F1.7's completion gate intentionally excludes planning-command baselines (delivered by the F1.2 cross-RFC dependency) from M1 closure. The risk is that an expand-evals scenario merges late and its baseline is then committed under a follow-up PR that does not visibly tie back to this milestone. Resolution: track each committed planning-command baseline as a comment row in F1.7's baseline audit at spec time, or carry the audit forward into the M1-close `.claude/` snapshot-refresh chore PR as a checklist line. | Integration | Medium | Medium | open | F1.7 spec or M1-close chore PR carries the audit comment. |
| SD-006 | The RFC's touched-files single-owner matrix lists `evals/lib/report.ts` and `evals/run-evals.ts` as the M1 (F1.3a / F1.3b) owners but does not name `evals/lib/types.ts`, `evals/lib/parse-stream.ts`, or `evals/lib/runner.ts`. F1.3a's scope explicitly includes those three files (no token fields, no usage extraction, no `RunOutput` token threading exist today). Resolution: F1.3a's feature spec amends the matrix at spec time, naming all five files. | Integration | Medium | High | open | F1.3a spec carries the matrix amendment in its `## Specification Debt` and PR body. |
| SD-007 | F1.5 and F1.6 both touch `evals/lib/runner.ts` (F1.5 adds the conditional `git init` step; F1.6 adds the `fixture:` field resolution). The two changes land in non-overlapping code paths but in the same file, so the second-to-land PR rebases against the first. Resolution: F1.5 owns the area around fixture copy and process spawn; F1.6 owns the area around fixture-path resolution. Mirrors the SD-009 / SD-012 / SD-013 sub-section partitioning pattern the RFC already uses for other shared files. | Integration | Low | High | open | F1.5 and F1.6 specs each enumerate their sub-section ownership; second-to-land rebases. |

## Dependency Order

Recommended specification sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| F1 | Feature 1.3a: Per-Case Token Totals in EvalReport | — | specs/2026-05-18-007-per-case-token-totals-in-evalreport/ |
| F2 | Feature 1.3b: Per-Sub-Agent Token Attribution | F1 | specs/2026-05-20-008-per-sub-agent-token-attribution/ |
| F3 | Feature 1.4: smithy.fix End-to-End Eval Scenario | F1 | — |
| F4 | Feature 1.5: smithy.forge End-to-End Eval Scenario + Runner git-init (RFC SD-002) | F1 | — |
| F5 | Feature 1.6: JVM Multi-Language Fixture | — | — |
| F6 | Feature 1.7: Forge-JVM Eval Scenario + M1 Baseline-Set Completeness Gate | F1, F4, F5 | — |

Feature 1.1 and Feature 1.2 are referenced-only rows with no implementation work, so they are intentionally omitted from the Dependency Order table. No spec will be authored against them in this milestone because they are inherited substrate / cross-RFC dependency.

Parallel-startable on day one: F1.3a, F1.3b, F1.4, F1.5, F1.6 (five-way concurrency). F1.3b can begin in parallel with F1.3a because it primarily consumes the already-captured `evals/captures/strike-health-check.events.jsonl` evidence; its code path joins F1.3a's rendering surface. F1.4 and F1.5 each depend on F1.3a only for their committed baseline files. F1.6's fixture authoring and `fixture:` field plumbing are independent of every other feature. F1.7 fans in last as the M1 closer. The M1-close `.claude/` snapshot-refresh chore PR follows F1.7 — it is not a feature row in this map.

## Cross-Milestone Dependencies

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| Milestone 2: Architectural Cost Reductions | depended upon by | M2 F2.3 (per-task spec re-read reduction) consumes F1.3a token reporting and the F1.5 forge baseline to choose between pre-paste and per-task-brief at spec time. M2 F2.4 (inlining smithy.maid into forge Phase 6) consumes the F1.5 forge baseline. M2 F2.5 (trivial-slice review-skip heuristic) consumes the F1.5 forge baseline plus F1.3a / F1.3b totals for the calibration window per SD-006 of the RFC. |
| Milestone 3: Early Cost Savings | depended upon by | M3 F3.1 (build-output protocol) consumes the F1.6 JVM fixture as the substrate for its gradle clauses. M3 F3.2 (sub-agent model downgrades) consumes F1.3a / F1.3b for the quality net, plus a hard cross-RFC prerequisite on F1.2 (expand-evals US1 / US2 / US3) before any model-line edit lands. M3 F3.3 (CI-log failure-extraction) consumes the F1.4 baseline to demonstrate a token delta. M3 F3.4 (PR-description token-delta protocol) consumes F1.3a's per-case totals plus the F1.7-gated complete baseline set so contributors can compute deltas locally without re-running the full eval suite. |
| Cross-RFC: `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/` | depends on | F1.2 carries this as a read-only reference dependency. M1's reporting features (F1.3a / F1.7) accommodate planning-command baselines as the expand-evals scenarios merge; F1.7's M1 closure does not gate on expand-evals merge timing per SD-001 above. The hard prerequisite on expand-evals US1 / US2 / US3 is M3 F3.2's, not M1's. |

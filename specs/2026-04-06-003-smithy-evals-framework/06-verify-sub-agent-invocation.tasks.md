# Tasks: Verify Sub-Agent Invocation

**Source**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md` — User Story 6
**Data Model**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md`
**Contracts**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md`
**Story Number**: 06

---

## Context

The sub-agent verification **machinery** is already in place from earlier stories:

- `extractSubAgentDispatches` (FR-015) parses `AgentDispatch` records out of stream-json events.
- `verifySubAgents` (contract: SubAgentVerifier) matches scenario patterns against extracted text and dispatch description/result fields per FR-016.
- `run-evals.ts` already reads `scenario.sub_agent_evidence` and funnels results through `scenarioRunToResult` into the final `EvalReport`.

What US6 actually delivers is the **scenario data** that exercises this machinery against the real strike output, plus resolution of the spec's known scout gap (AS 6.1): the spike confirms strike does not dispatch smithy-scout, so the reconciliation path is a **standalone scout scenario**, not a modification to strike.

Patterns used below are grounded in `evals/spike/FINDINGS.md` — not speculative:

- `smithy-plan` — lens labels `Separation of Concerns` and `Robustness` appear in strike's reconciled plan output (4 spike matches, including `[via Robustness]` attribution markers in `evals/spike/output-strike.txt`). `Simplification` is not present in the spike artifacts and must not appear in the pattern.
- `smithy-reconcile` — phrases like `reconciled plan` and `smithy-reconcile` appear in output (7 spike matches).
- `smithy-clarify` — strike emits a dispatch line such as `"Now dispatching the **smithy-clarify** agent"` in assistant text (1 spike match); per FR-016, the pattern should target that dispatch phrasing rather than relying on agent-name detection.

---

## Slice 1: Strike Sub-Agent Evidence for Plan, Reconcile, Clarify

**Goal**: Extend `strikeScenario` with `sub_agent_evidence` entries covering the three sub-agents that strike actually dispatches, so the existing orchestrator wiring produces real pass/fail signal when the strike eval runs.

**Justification**: This is a standalone, observable increment — after this slice, `npm run eval` against the fixture produces sub-agent checks for plan, reconcile, and clarify in the final `EvalReport`. The underlying verifier is already implemented and wired; only scenario data is missing. Merging this slice alone visibly strengthens the strike eval's regression coverage.

**Addresses**: FR-012, FR-016; Acceptance Scenarios 6.2, 6.3, 6.4

### Tasks

- [x] Extend `strikeScenario` in `evals/lib/strike-scenario.ts` with a `sub_agent_evidence` field containing three entries — one each for `smithy-plan`, `smithy-reconcile`, and `smithy-clarify` — using patterns grounded in the spike findings (`evals/spike/FINDINGS.md`): a plan lens-label alternation (`Separation of Concerns|Robustness`), a reconcile evidence pattern such as `reconciled plan|smithy-reconcile`, and a clarify dispatch pattern such as `dispatching the.*smithy-clarify` that matches the assistant-text dispatch message per FR-016's guidance for clarify.
- [x] Update the `strikeScenario` module docstring to remove the "US6 will extend this scenario with `sub_agent_evidence`" forward reference and document the FR-012/FR-016 coverage now in place.
- [x] Extend `evals/lib/strike-scenario.test.ts` so the unit test asserts the new `sub_agent_evidence` shape — presence of all three agents, valid regex patterns, and that each pattern compiles without throwing. Follow the existing test file's conventions for structural assertions on the scenario constant.

**PR Outcome**: `strikeScenario` exports three `sub_agent_evidence` entries; `npm run test:evals` passes; a real `npm run eval` run surfaces `[PASS]`/`[FAIL]` lines for `smithy-plan evidence present`, `smithy-reconcile evidence present`, and `smithy-clarify evidence present` in the strike scenario output.

---

## Slice 2: Standalone Scout Scenario and Multi-Scenario Orchestration

**Goal**: Add a standalone `scoutScenario` that invokes `smithy-scout` directly and assert scout-specific evidence, then update `run-evals.ts` to execute both strike and scout scenarios in a single run and aggregate them into one `EvalReport`.

**Justification**: This resolves AS 6.1's known gap (strike does not dispatch scout) via the path the spec mandates: standalone scout eval rather than modifying strike. It also delivers the first multi-scenario run in the framework, which the summary pipeline was explicitly designed for (`buildReport` already accepts `EvalResult[]`). The slice stands alone: merging it produces a second eval case with its own structural and sub-agent checks, visible in the existing report output.

**Addresses**: FR-012, FR-016; Acceptance Scenario 6.1 (reconciled via standalone scout coverage per spike recommendation in `evals/spike/FINDINGS.md`)

### Tasks

- [x] Create `evals/lib/scout-scenario.ts` exporting a `scoutScenario: EvalScenario` that invokes `smithy-scout` directly against the fixture. Resolve the invocation shape for sub-agents that are not slash commands: since the runner composes `${scenario.skill} ${scenario.prompt}` into the `claude -p` invocation, author `skill` and `prompt` so the combined string is a natural-language instruction that causes Claude to dispatch the `smithy-scout` Agent tool (e.g., `skill: ''` with a prompt that explicitly asks Claude to run the smithy-scout sub-agent, or an equivalent phrasing). Verify the chosen shape against the runner contract before committing, and document the choice in the module docstring. _(Delivered earlier by US8 PR #237.)_
- [x] Define scout-appropriate `structural_expectations` for `scoutScenario`. At minimum, require a top-level scout report heading (e.g., `## Scout Report`) and include `forbidden_patterns` for the generic refusal strings already used by the strike scenario to detect skill-did-not-trigger cases per FR-012. Draw heading choices from the deployed `smithy-scout.md` agent definition so expectations match real output. _(Delivered earlier by US8 PR #237.)_
- [x] Add a `sub_agent_evidence` entry on `scoutScenario` targeting `smithy-scout` — the pattern must satisfy FR-016 by matching the dispatch description/result or the scout's own output markers, not agent-name presence alone. _(Delivered earlier by US8 PR #237.)_
- [x] Create `evals/lib/scout-scenario.test.ts` mirroring `strike-scenario.test.ts`: validate the scenario's shape, that all regex patterns compile, and that required structural and sub-agent evidence fields are present. _(Delivered earlier by US8 PR #237.)_
- [x] Update `evals/run-evals.ts` to run both `strikeScenario` and `scoutScenario` in sequence, each through the existing `runScenario` → `validateStructure` → `verifySubAgents` → `scenarioRunToResult` pipeline, then pass the combined `EvalResult[]` array into `buildReport`. Preserve per-scenario stdout logging so developers can see progress case-by-case, and keep the run-wide timer behavior (`runStartPerf` → `totalDurationMs`) unchanged. The existing `--timeout` override should continue to apply to both scenarios. The `--case <name>` filter is out of scope here — it is owned by US7 (YAML scenario loading). _(Delivered earlier by US8 PR #237; multi-scenario orchestration was wired when scout-scenario.ts landed.)_
- [x] Update the `run-evals.ts` module docstring to reflect multi-scenario execution and update the FR/AS coverage list at the top to include FR-016 and AS 6.1-6.4.

**PR Outcome**: `npm run eval` runs both strike and scout scenarios against the fixture, the final `EvalReport` summary lists two cases with their individual pass/fail status, and the run exits non-zero if either scenario fails. AS 6.1 is covered by the scout scenario producing at least one `smithy-scout evidence present` check result per run.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | The exact invocation shape for sub-agents that are not slash commands (how `scoutScenario.skill` + `scoutScenario.prompt` compose into a `claude -p` argument that reliably causes Claude to dispatch the `smithy-scout` Agent tool in headless mode) is not validated. The runner contract treats `skill` and `prompt` as opaque strings and concatenates them. Slice 2's first task resolves this empirically during implementation, but if the natural-language approach fails to trigger smithy-scout dispatch, US6's AS 6.1 resolution may require a small runner enhancement (e.g., scenarios that bypass the slash-command shape) — that enhancement would be follow-up spec work, not part of this slice. | Technical Risk | Medium | Medium | open | — |

---

## Dependency Order

| ID | Title                                                          | Depends On | Artifact |
|----|----------------------------------------------------------------|------------|----------|
| S1 | Strike Sub-Agent Evidence for Plan, Reconcile, Clarify         | —          | —        |
| S2 | Standalone Scout Scenario and Multi-Scenario Orchestration     | S1         | —        |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 5: Verify Strike End-to-End Output | depends on | US6 extends `strikeScenario` (US5's artifact) with `sub_agent_evidence`. The scenario constant, its test harness, and the orchestrator wiring that threads `sub_agent_evidence` into `verifySubAgents` must already exist. |
| User Story 7: Define Eval Scenarios Declaratively | depended upon by | US7 migrates hardcoded scenarios to YAML. Both `strikeScenario` and `scoutScenario` established here will be translated into `evals/cases/*.yaml` by US7; the `--case <name>` filter is deferred to US7 and intentionally not added in Slice 2. |
| User Story 8: Fixture Contains Deliberate Inconsistencies for Scout | depended upon by | US8 plants deliberate inconsistencies and asserts scout detects them. It builds on the standalone `scoutScenario` introduced in Slice 2 — US8 adds fixture flaws and tightens scout expectations, it does not re-create the scenario. |

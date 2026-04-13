# Tasks: Verify Strike End-to-End Output

**Source**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md` — User Story 5
**Data Model**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md`
**Contracts**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md`
**Story Number**: 05

---

## Slice 1: Strike Scenario with Structural Expectations

**Goal**: Define strike's end-to-end structural expectations as a typed `EvalScenario`, validate the expectations against the checked-in spike output, and wire the scenario into `run-evals.ts` so `npm run eval` exercises the full strike flow with production-grade checks.

**Justification**: This is a single-PR deliverable that transitions the orchestrator from its US4 placeholder smoke-test (`required_headings: ['## Plan']`) to the first real eval scenario. A reusable `strikeScenario` module gives US6 a stable import point for extending with `sub_agent_evidence` and gives the test suite a unit-testable location so the expectations can be verified locally without a live `claude` invocation, using the spike capture as a ground-truth sample.

**Addresses**: FR-005, FR-006, FR-012; Acceptance Scenarios 5.1, 5.2, 5.3

### Tasks

- [ ] **Define the strike scenario module**

  Create `evals/lib/strike-scenario.ts` exporting a typed `strikeScenario: EvalScenario` constant (type imported from `./types.js`). Populate `structural_expectations` so the scenario captures the strike-specific markers locked in the spec's US5 Clarifications and FR-012.

  _Acceptance criteria:_
  - `skill` is `/smithy.strike` and `prompt` is a feature description consistent with AS 5.1
  - `required_headings` include the three top-level sections called out in AS 5.3
  - `required_patterns` include a regex matching the `**Phase N: <Label>**` bold workflow markers from AS 5.3
  - `forbidden_patterns` block the generic refusal patterns listed in FR-012 and the leading-frontmatter case from AS 5.2
  - No `# Strike:` heading is asserted — the spec explicitly notes this heading does not appear in actual strike output
  - `timeout` is unset (or left to the orchestrator default) so the framework default applies and the `--timeout` CLI override still takes effect

- [ ] **Validate the strike scenario against captured spike output**

  Add `evals/lib/strike-scenario.test.ts` that reads `evals/spike/output-strike.txt` and runs `validateStructure` from `./structural.js` against the exported scenario. This pins the scenario to a real-world strike capture so drift in either the expectations or the sample surfaces immediately under `npm run test:evals`.

  _Acceptance criteria:_
  - Every structural check produced by `validateStructure` against the spike sample passes, demonstrating AS 5.1 and AS 5.3 coverage
  - A negative case demonstrates AS 5.2 by verifying the scenario flags a failure when the sample is prefixed with synthetic YAML frontmatter
  - A negative case demonstrates FR-012 by verifying the scenario flags a failure when the sample is replaced with a synthetic generic-refusal string
  - The test imports `strikeScenario` by name rather than redefining expectations inline, preserving a single source of truth

- [ ] **Wire the strike scenario into the orchestrator**

  Replace the hardcoded smoke-test scenario in `evals/run-evals.ts` with `strikeScenario` imported from `./lib/strike-scenario.js`. The orchestrator's existing structural and sub-agent validation pipeline (from US4 Slice 2) must continue to operate unchanged — only the scenario source changes.

  _Acceptance criteria:_
  - `run-evals.ts` no longer defines an inline `EvalScenario` literal; it imports `strikeScenario`
  - `--timeout` CLI override still applies on top of the imported scenario
  - Orchestrator banner continues to print skill, prompt, fixture, and timeout
  - The existing `sub_agent_evidence` branch is preserved so US6 can populate it on `strikeScenario` without further edits to `run-evals.ts`
  - `npm run typecheck` and `npm run test:evals` both pass

**PR Outcome**: `npm run eval` invokes `/smithy.strike` against the reference fixture and validates its output against the real strike structural markers. Structural regressions in strike's flagship output surface as named `[FAIL]` entries, and the expectations are independently unit-tested against the spike capture so they can evolve safely without a live `claude` invocation.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

| ID | Title                                          | Depends On | Artifact |
|----|------------------------------------------------|------------|----------|
| S1 | Strike Scenario with Structural Expectations   | —          | —        |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 3: Execute a Skill Headlessly and Capture Output | depends on | `runScenario` and `extractCanonicalText` are the execution path that produces the text the strike expectations are checked against. |
| User Story 4: Validate Output Structure | depends on | `validateStructure` is imported by both the orchestrator and the new scenario unit test. |
| User Story 6: Verify Sub-Agent Invocation | depended upon by | US6 extends `strikeScenario` by adding `sub_agent_evidence` entries; the scenario module is the stable attachment point. |
| User Story 7: Define Eval Scenarios Declaratively | depended upon by | US7 will migrate `strike-scenario.ts` into `evals/cases/*.yaml`; the exported constant is the source material. |

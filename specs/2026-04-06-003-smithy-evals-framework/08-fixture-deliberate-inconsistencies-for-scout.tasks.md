# Tasks: Fixture Contains Deliberate Inconsistencies for Scout

**Source**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md` — User Story 8
**Data Model**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md`
**Contracts**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md`
**Story Number**: 08

---

## Slice 1: Plant Scout-Detectable Inconsistencies and Wire Scout Scenario

**Goal**: Plant deliberate, documented inconsistencies in `evals/fixture/` that smithy-scout is expected to classify as at least one Warning or Conflict, and add a `scoutScenario` eval case wired into `run-evals.ts` so `npm run eval` verifies that scout both produces a structurally valid Scout Report and surfaces at least one detected finding against the fixture.

**Justification**: US8 is only observable once scout is actually being run against the fixture — planting inconsistencies without a scout case that validates detection would ship dead weight. Bundling the fixture plant, the new `scoutScenario` module, its unit test, and the orchestrator wiring into a single PR delivers AS 8.1 end-to-end in one mergeable increment, parallel to the US5 pattern established by `strike-scenario.ts`. Authoring the structural check as "at least one data row in Warnings or Conflicts" (rather than matching specific planted text) makes AS 8.2 hold automatically: future plants extend coverage without touching the runner or the scenario.

**Addresses**: FR-005, FR-006, FR-007-adjacent (declarative scenario shape), FR-012; Acceptance Scenarios 8.1, 8.2

### Tasks

- [x] **Plant a deliberate scout-detectable inconsistency in the fixture**

  Introduce at least one deliberate inconsistency in `evals/fixture/` that maps to a row in smithy-scout's Severity Guidelines table (see `src/templates/agent-skills/agents/smithy.scout.prompt` — e.g., a doc comment that contradicts a function signature, or a TODO/FIXME marker). Only use plant types reliably detected at **shallow** depth — stale doc comments, signature mismatches, and TODO markers. Do NOT plant dead exports or other deep-scan-only inconsistencies, as the scout scenario runs at shallow depth. The plant must live in a file scout would scan at shallow depth (`src/routes/users.ts`, `src/types.ts`, or `src/index.ts`). The fixture must still type-check conceptually — do not break imports or introduce syntax errors, because other eval scenarios copy this fixture verbatim.

  _Acceptance criteria:_
  - The plant is a real inconsistency scout can describe at shallow depth (stale doc / signature mismatch / TODO), not just a cosmetic comment
  - The fixture remains syntactically valid TypeScript so existing fixture tests in `evals/fixture.test.ts` still pass
  - `npm test` continues to pass (the existing fixture deployment test re-hashes the directory, so any edits are implicitly covered)
  - No new runtime files are added — the plant is an edit inside existing fixture source files

- [x] **Document the planted inconsistencies in the fixture README**

  Extend `evals/fixture/README.md` with a "Planted Inconsistencies" section listing each deliberate flaw, the file it lives in, and the scout severity category it is expected to trigger. This is the signal that tells future maintainers (and smithy-fix / smithy-scout itself at higher depths) not to "clean up" the plant.

  _Acceptance criteria:_
  - The README section explicitly states that the inconsistencies are intentional and exist for US8 eval coverage
  - Each plant is listed with file path and expected scout category (Warning vs Conflict)
  - The section is discoverable from the README's existing "Intentional Gap" context so the fixture's twin purposes (health-check gap + planted inconsistencies) are documented together

- [x] **Create the scout scenario module**

  Add `evals/lib/scout-scenario.ts` exporting a typed `scoutScenario: EvalScenario` constant (type imported from `./types.js`), following the shape of `strike-scenario.ts`. The scenario's `skill` and `prompt` must be authored so headless `claude -p` dispatches smithy-scout against the fixture source at shallow depth with a concrete planning context (e.g., planning a health check endpoint). Structural expectations must assert that scout's report template is present AND that at least one finding row is emitted.

  _Acceptance criteria:_
  - `skill` / `prompt` are authored so Claude dispatches the smithy-scout sub-agent against `src/` in the fixture working directory at shallow depth with a concrete planning context; the spike already confirmed sub-agent dispatch works in headless mode (FR-014)
  - `required_headings` include `## Scout Report` plus the section headings produced by scout's report template (see `smithy.scout.prompt` Output section)
  - `required_patterns` include a regex that matches at least one data row in the Warnings or Conflicts markdown table (AS 8.1 — proves detection occurred, not merely that the template was rendered)
  - The required-row regex is written so any Warning/Conflict row passes — adding a new plant later must not require editing the scenario (AS 8.2)
  - `forbidden_patterns` block generic refusal patterns listed in FR-012
  - `sub_agent_evidence` includes an entry for `smithy-scout` whose `pattern` matches either the dispatch message in assistant text or the agent's report output (per FR-016)
  - `timeout` is left to the framework default so the `--timeout` CLI override still applies

- [x] **Unit test the scout scenario against synthetic samples**

  Add `evals/lib/scout-scenario.test.ts` that exercises `validateStructure` and `verifySubAgents` from `./structural.js` against synthetic scout outputs. The tests must pin both the positive and negative cases without requiring a live `claude` invocation, mirroring the coverage approach in `strike-scenario.test.ts`.

  _Acceptance criteria:_
  - A positive sample containing `## Scout Report`, a populated `### Warnings` or `### Conflicts` table with at least one row, and plausible dispatch evidence passes every check produced by the scenario
  - A negative sample where the Warnings and Conflicts tables are empty (only header rows) fails the "≥1 finding row" check — this is the test that locks AS 8.1
  - A negative sample missing `## Scout Report` entirely fails the required-heading check
  - A negative sample containing one of FR-012's generic refusal strings fails the forbidden-pattern check
  - The test imports `scoutScenario` by name rather than redefining expectations inline, preserving a single source of truth

- [x] **Wire the scout scenario into the orchestrator**

  Update `evals/run-evals.ts` to run `scoutScenario` alongside `strikeScenario` so `npm run eval` exercises both cases in a single invocation. The orchestrator's existing structural and sub-agent validation pipeline (from US4 Slice 2) and `EvalReport` aggregation (from US9 Slice 2) must continue to operate unchanged — only the scenario list grows.

  _Acceptance criteria:_
  - `run-evals.ts` imports `scoutScenario` from `./lib/scout-scenario.js` and includes it in the list of scenarios executed
  - `--case <name>` filtering still works and can select either scenario by name (honors FR-008 even though full YAML loading lands in US7)
  - `--timeout` CLI override still applies to both scenarios
  - The orchestrator banner prints skill, prompt, fixture, and timeout for each scenario
  - The final `EvalReport` aggregates both scenarios' results via the existing `formatReport` path
  - `npm run typecheck` and `npm run test:evals` both pass

**PR Outcome**: `evals/fixture/` carries documented, deliberate inconsistencies, and `npm run eval` now runs a standalone scout case in addition to strike. The scout case fails fast if scout stops producing a valid Scout Report or stops detecting at least one finding in the fixture, and adding a new plant later requires only editing fixture source — no runner, scenario, or test changes.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

| ID | Title                                                       | Depends On | Artifact |
|----|-------------------------------------------------------------|------------|----------|
| S1 | Plant Scout-Detectable Inconsistencies and Wire Scout Scenario | —          | —        |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Reference Fixture Exists and Is Deployable | depends on | The planted inconsistencies live inside the fixture established by US2; this story edits that fixture rather than creating it. |
| User Story 3: Execute a Skill Headlessly and Capture Output | depends on | `runScenario` and `extractCanonicalText` are the execution path that produces the text the scout expectations are checked against. |
| User Story 4: Validate Output Structure | depends on | `validateStructure` and `verifySubAgents` are imported by both the orchestrator and the new scout scenario unit test. |
| User Story 5: Verify Strike End-to-End Output | depends on | The scout scenario module, unit test, and orchestrator wiring follow the `strike-scenario.ts` pattern established in US5 Slice 1. |
| User Story 9: Eval Summary Report | depends on | The scout case is aggregated into the existing `EvalReport` produced by `buildReport` / `formatReport`. |
| User Story 7: Define Eval Scenarios Declaratively | depended upon by | US7 will migrate `scout-scenario.ts` into `evals/cases/*.yaml` alongside `strike-scenario.ts`; the exported constant is the source material. |

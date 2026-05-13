# Tasks: Cut eval validates the cut command produces tasks with inherited spec debt

**Source**: `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/expand-evals-coverage-planning-and-audit.spec.md` — User Story 3
**Data Model**: `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/expand-evals-coverage-planning-and-audit.data-model.md`
**Contracts**: `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/expand-evals-coverage-planning-and-audit.contracts.md`
**Story Number**: 03

---

## Slice 1: Plant the cut-eval spec fixture and document it

**Goal**: A scenario-isolated directory `evals/fixture/specs/cut-eval/` exists containing three representative parent-artifact files (`cut-eval.spec.md` with one user story whose row in `## Dependency Order` carries `US1`, plus a `## Specification Debt` table with one `SD-001` row whose `Status` is `open`; `cut-eval.data-model.md`; `cut-eval.contracts.md`), and `evals/fixture/README.md` carries a `## Planted Parent Artifacts` row referencing the new plant directory — creating the section if it does not yet exist.

**Justification**: The three spec artifacts are coupled by relative path and must be authored as a unit; cut's Phase 1 reads all three and short-circuits if any are missing. Co-locating the README row with the plant keeps the "this is a deliberate fixture, do not delete" signal next to the file it protects, matches the US1 and US2 precedents of landing plant + README documentation in the same PR, and stays merge-safe regardless of whether US2 Slice 2 (which first introduced the `## Planted Parent Artifacts` section) has landed. This slice has no code dependency on US2's runner git-init — the plant itself is pure static content.

**Addresses**: FR-004, FR-005, FR-013, FR-014; AS 3.1 (planted-fixture precondition: `SD-001` row with `Status: open`), AS 3.2 (planted-fixture precondition: `US1` row in `## Dependency Order`), AS 3.3 (source-fixture checksum invariant — plant is committed static content).

### Tasks

- [x] **Plant the cut-eval spec, data-model, and contracts fixture**

  Create the scenario-isolated directory `evals/fixture/specs/cut-eval/` containing three files conforming to the canonical Smithy spec / data-model / contracts shape: `cut-eval.spec.md`, `cut-eval.data-model.md`, `cut-eval.contracts.md`. The spec must contain at least one user story whose `## Dependency Order` row carries the ID `US1`, AND a `## Specification Debt` table with at least one row whose `ID` is `SD-001` and `Status` is `open` (satisfies AS 3.1 and AS 3.2 preconditions). The data-model and contracts files are minimal but structurally valid instances of their canonical templates so cut's Phase 1 reads succeed. All three files open with a top-of-file comment naming the consuming scenario (`cut-from-spec`) and that the plants are representative (non-flawed).

  _Acceptance criteria:_
  - Files exist at `evals/fixture/specs/cut-eval/cut-eval.spec.md`, `evals/fixture/specs/cut-eval/cut-eval.data-model.md`, and `evals/fixture/specs/cut-eval/cut-eval.contracts.md`
  - The spec contains a `## Specification Debt` table whose `SD-001` row has `Status` `open` (AS 3.1 precondition)
  - The spec contains a `## Dependency Order` 4-column table whose first user-story row carries the ID `US1` (AS 3.2 precondition)
  - Top-of-file comments in all three files name the consuming scenario (`cut-from-spec`)
  - File contents reference no paths outside `evals/fixture/specs/cut-eval/` (FR-004 data-model isolation rule)
  - `evals/fixture/src/` and existing scout `## Planted Inconsistencies` rows are untouched (FR-013)

- [ ] **Document the cut-eval plant in the fixture README**

  Extend `evals/fixture/README.md` with one row recording the cut-eval plant directory in the `## Planted Parent Artifacts` section. If that section does not yet exist when this task runs (US2 Slice 2 may or may not have landed first), create it using the schema established by US2 Slice 2: positioned after `## Planted Inconsistencies` and before `## Usage`, with a one-paragraph intro distinguishing representative plants from scout-flawed plants, and a 4-column table (`Path | Owner Scenario | Realism | Purpose`). If the section already exists from US2, append a row only.

  _Acceptance criteria:_
  - `evals/fixture/README.md` has a `## Planted Parent Artifacts` section (created if absent, extended if present)
  - The section contains one row for `evals/fixture/specs/cut-eval/` naming `cut-from-spec` as owner, `representative` as realism, and a one-line purpose
  - When this task creates the section, it is positioned after `## Planted Inconsistencies` and before `## Usage`, with the intro paragraph distinguishing representative plants from scout-flawed plants
  - Existing `## Planted Inconsistencies` rows and any pre-existing `## Planted Parent Artifacts` rows are unchanged
  - The convention extends cleanly to US4–US6 future plants (one row per future plant)

**PR Outcome**: A reviewable, path-stable planted spec artifact set is committed under `evals/fixture/specs/cut-eval/`. The fixture README documents the cut-eval plant so future maintainers see the eval-only purpose. Slice 2's YAML can reference the plant by exact path on its first authored draft. Inherited debt SD-003 transitions toward `resolved` once the directory layout is in place; SD-008's "regex alternation in `required_patterns`" mitigation is unblocked.

---

## Slice 2: Author the cut-from-spec YAML scenario

**Goal**: `evals/cases/cut-from-spec.yaml` exists, is auto-discovered by `loadScenarios`, and `npm run eval -- --case cut-from-spec` reports PASS against the Slice 1 plants once US2 Slice 1's runner git-init is present, with sub-agent evidence covering smithy-scout, smithy-clarify, and smithy-plan-review.

**Justification**: The YAML scenario is the user-facing deliverable that closes AS 3.1, 3.2, and 3.3. It depends on Slice 1 because its `prompt` field references the Slice 1 plant by exact path. Slice 2 also has a **hard cross-story dependency** on US2 Slice 1 (runner git-init): without that change the `cut-from-spec` scenario reports FAIL on every `npm run eval` invocation, which is a regression in the new test suite. Slice 2 MUST NOT merge until US2 Slice 1 has merged — see the Cross-Story Dependencies table. AS 3.2 cannot be asserted by `validateStructure` against `extracted_text` (the `## Dependency Order` table lives in the on-disk tasks file, not the terminal one-shot snippet — see SD-010); the scenario uses `inherited from spec:` in the terminal `## Specification Debt` section as a proxy invariant, since that literal is only emitted when cut's Phase 1 step 3 succeeds, which only runs when the spec read succeeded — the same precondition that triggers tasks-file generation including `## Dependency Order`. The `inherited from spec:` literal is pinned by an inline YAML comment cross-referencing Phase 1 step 3 of `smithy.cut.prompt` (the upstream-debt inheritance step) so template drift surfaces the regression immediately. Empirical timeout calibration, the PR success/failure regex alternation, and `forbidden_patterns` are YAML-field-level concerns that belong here.

**Addresses**: FR-001, FR-002, FR-003, FR-005, FR-009, FR-010, FR-011, FR-012, FR-014; AS 3.1 (`inherited from spec:` literal in terminal debt section), AS 3.2 (proxy via `inherited from spec:` debt-row check per SD-010 constraint), AS 3.3 (source fixture unchanged after run via the runner's existing `hashDirectory` guards); SC-001, SC-002, SC-005, SC-006.

### Tasks

- [ ] **Author the cut-from-spec YAML scenario**

  Create `evals/cases/cut-from-spec.yaml` per the `EvalScenario` shape in `evals/lib/types.ts`, mirroring the precedent in `evals/cases/strike-health-check.yaml` and the planned `evals/cases/mark-from-features.yaml`. Set `skill: /smithy.cut` and `prompt` to the exact repo-relative path of the Slice 1 spec plant followed by the explicit user-story number (per FR-005). Anchor `required_headings` to the literal one-shot-snippet section headings stamped by cut's Phase output. Anchor `required_patterns` to (a) the literal `inherited from spec:` substring — carry an inline YAML comment pinning the cross-reference to Phase 1 step 3 of `src/templates/agent-skills/commands/smithy.cut.prompt` (the upstream-debt inheritance step) so future template drift is caught (AS 3.1, proxy for AS 3.2 per SD-010); (b) the `**Spec folder**:` bullet; (c) a regex alternation accepting either the PR success-branch URL marker or the documented PR-creation-failure paragraph wording (resolves inherited SD-008 via the regex-alternation option). Author `sub_agent_evidence` covering smithy-scout, smithy-clarify, and smithy-plan-review using the marker conventions from contracts §3. Include the strike-convention `forbidden_patterns` (FR-011). Calibrate `timeout:` empirically during scenario authoring and record the observed cut run-time in an inline YAML comment.

  _Acceptance criteria:_
  - `name: cut-from-spec`; `skill: /smithy.cut`; `prompt` is the exact repo-relative path to the Slice 1 spec plant followed by the user-story number `1`
  - `required_headings` contains the literal one-shot-snippet section headings stamped by the cut template (AS 3.1 anchor)
  - `required_patterns` contains the literal substring `inherited from spec:` (AS 3.1) with an inline YAML comment cross-referencing Phase 1 step 3 of `src/templates/agent-skills/commands/smithy.cut.prompt` (the upstream-debt inheritance step)
  - `required_patterns` contains the `\*\*Spec folder\*\*` marker
  - `required_patterns` contains a regex alternation matching either the PR success-branch URL or the `PR creation failed` paragraph wording (resolves inherited SD-008)
  - `sub_agent_evidence` has three entries covering smithy-scout, smithy-clarify, and smithy-plan-review, each with a template-stable pattern per contracts §3 marker conventions
  - `forbidden_patterns` ⊇ the three strike-convention entries (FR-011)
  - `timeout` is set to a positive empirically calibrated number of seconds (not the 120s default), with an inline comment recording the observed wall-clock (FR-010, inherited SD-006)
  - YAML loads without warning via `loadScenarios`; `npm run eval -- --case cut-from-spec` selects only this scenario and reports PASS once US2 Slice 1 is in place (SC-001, SC-002)
  - Strike, scout, and any landed sibling scenarios continue to PASS unchanged after this scenario is added (FR-012, SC-003)
  - `npm run test:evals` (offline unit tests) continues to pass with the new YAML file present (SC-006)

**PR Outcome**: `npm run eval -- --case cut-from-spec` exercises `/smithy.cut` against the planted spec artifact set and reports PASS, with sub-agent evidence for all three expected dispatches and `inherited from spec:` confirming AS 3.1 / AS 3.2 (proxy). The scenario passes whether `gh` PR creation succeeds or falls through to the PR-creation-failure branch. Inherited debt SD-006, SD-008, SD-010, and SD-011 transition toward `resolved` once the YAML scenario lands and is calibrated.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Mark/cut/render/ignite scenarios all run `git checkout -b` inside the temp fixture copy. The runner's current `fs.cpSync` may not preserve a `.git` directory if the source fixture is not a standalone git repo. Need to confirm the temp copy is git-initialized (or has the source fixture as a git repo) — otherwise the scenarios fail at the branch-creation step before any output is captured. | Edge Cases | Critical | Medium | inherited | Owned by US2 Slice 1, not this story. US3 Slice 2 has a runtime dependency on that work — see Cross-Story Dependencies. |
| SD-002 | inherited from spec: The audit scenario's planted flaw (a `.spec.md` missing its `## Dependency Order` table) is tied to one specific checklist invariant in `{{>audit-checklist-spec}}`. If the audit checklist's wording around dependency order changes (e.g., "Dependency Order" → "Implementation Order"), the `required_patterns` literal `Dependency Order` will silently fail. Implementers add an audit-checklist comment cross-referencing the eval scenario, and update both together. | Functional Scope | Critical | Medium | inherited | Owned by US1; not addressed by this story. |
| SD-003 | inherited from spec: Cross-talk between mark and cut/render plants. Mark's `.features.md` parser auto-selects "the first `### Feature N` not yet specc'd" when no feature number is given; even with exact-path prompts, a planted features-map referencing another scenario's plant could trip the routing logic. Mitigation: scenario-isolated subdirectories (`evals/fixture/rfcs/mark-eval/`, `.../cut-eval/`, `.../render-eval/`) and planted features-maps reference only their own children. Implementers verify the directory layout before each scenario lands. | Edge Cases | Critical | Medium | inherited | Mitigation partially applied here: US3 Slice 1 plants under the isolated subdirectory `evals/fixture/specs/cut-eval/`. The cut scenario itself has no `### Feature N` auto-selection risk (cut consumes specs, not features-maps), so the cross-talk surface for US3 is narrow. Status flips to `resolved` once the parent SD-003 is fully addressed across US3 / US4 / US5 plants. |
| SD-004 | inherited from spec: Per-command structural-expectations rigor: for ignite the on-disk RFC contains many mandatory headings (`## Summary` through `## Milestones`), but the **scenario** validates against the **terminal one-shot snippet** (`## Summary` / `## Assumptions` / `## Specification Debt` / `## PR`) — not the on-disk artifact. Implementers confirm at scenario-authoring time whether scenarios assert against the terminal snippet (the simpler, runner-supported path) or read the on-disk RFC (would require runner changes that this feature explicitly does not introduce). | Functional Scope | High | Medium | inherited | Resolved-in-spirit for the cut scenario by Slice 2's deliberate choice to assert against the terminal one-shot snippet. The on-disk tasks file is out of reach for `validateStructure` (extracted_text only); SD-010 tracks the cut-specific variant of this constraint. |
| SD-005 | inherited from spec: Spark's empty-state stub string is currently documented in `smithy.spark.prompt` Phase 2.5 as `No comparable off-the-shelf options identified during survey.`. If smithy-survey's prompt template changes the wording, the eval's regex alternation silently fails. Mitigation: pin the stub string in both the survey template and the eval scenario, with cross-reference comments. | Functional Scope | High | Medium | inherited | Owned by US6 (spark eval); not addressed by this story. |
| SD-006 | inherited from spec: Per-scenario `timeout:` calibration. Strike's full pipeline takes ~3-7 min today; ignite (with 3 plan lenses, reconcile, clarify, prose, plan-review) is likely 5-10 min; mark and render with full clarify+plan+refine+plan-review fan-out are similar. The `DEFAULT_TIMEOUT_MS` of 120s is almost certainly too short for ignite/mark/render. Implementers calibrate timeouts empirically during scenario authoring; calibration values land in the YAML scenario's `timeout:` field. | Non-Functional Quality | High | Medium | inherited | Planned for resolution by Slice 2 of this tasks file via empirical calibration of the cut scenario's `timeout:` value; status flips to `resolved` for the cut variant once the YAML lands with a calibrated value and an inline-comment record of the observed wall-clock. |
| SD-007 | inherited from spec: Whether the runner's temp-copy includes a `.git` directory or initializes one. `runScenario` in `evals/lib/runner.ts` does `fs.cpSync(fixtureDir, tmpDir, { recursive: true })` — if `evals/fixture/` is not under a separate `.git`, mark/cut/render/ignite scenarios calling `git checkout -b` will fail. The orchestrator may need to `git init` the temp copy before deploying skills. (Closely related to SD-001.) | Integration | High | Medium | inherited | Owned by US2 Slice 1, not this story. US3 Slice 2 has a runtime dependency on that work — see Cross-Story Dependencies. |
| SD-008 | inherited from spec: Whether scenarios that create a PR (`gh pr create` in mark/cut/render/ignite) need to be neutralized in the eval environment. Without `gh` auth in CI/local eval context, the one-shot snippet's PR-creation-failure branch will trigger, which still produces output but emits a different terminal contract. Implementers either (a) assert against the failure branch in `required_patterns`, (b) provide stub `gh` credentials, or (c) accept either branch via regex alternation. | Integration | High | Medium | inherited | Planned for resolution by Slice 2 of this tasks file via option (c) — regex alternation in `required_patterns` accepting either branch; status flips to `resolved` for the cut variant once the YAML scenario lands. |
| SD-009 | inherited from spec: Per-mode variants for each command (mark with-RFC vs. with-features-map; ignite with-PRD vs. without; render with-RFC vs. with-features.md; cut with explicit story vs. auto-select; audit forge-branch mode) are deferred to follow-up features. This feature ships exactly one canonical scenario per command. | Functional Scope | Medium | High | inherited | This story ships exactly one canonical cut scenario (with explicit story number, not auto-select); per-mode variants for cut remain deferred. |
| SD-010 | inherited from spec: Render scenario's structural expectations validate against the terminal one-shot snippet, not the on-disk `.features.md` written by render. The runner only validates `extracted_text` from stream-json, so on-disk validation would require a runner-level enhancement out of scope here. (Same constraint as SD-004; tracked separately because render has the most prominent on-disk-vs-terminal divergence.) | Domain & Data Model | Medium | Medium | inherited | Applies identically to the cut scenario: AS 3.2's `## Dependency Order` table lives in the on-disk tasks file and is invisible to `validateStructure`. Slice 2 resolves this for the cut variant by using `inherited from spec:` in the terminal `## Specification Debt` section as a proxy invariant. Status flips to `resolved` for the cut variant once the YAML scenario lands. |
| SD-011 | inherited from spec: The audit scenario uses `skill: /smithy.audit` and `prompt: <exact-path>`; the runner's `runScenario` composes this as `/smithy.audit <path>`. Implementers verify this composition works for the slash-command-with-path form during scenario authoring; if the runner mishandles the path argument, additional escaping or quoting may be needed. | Interaction & UX | Medium | High | inherited | Applies to the cut scenario as well — `prompt` is composed by the runner as `/smithy.cut <path> <story-number>`. Slice 2's empirical calibration step verifies the slash-command-with-path-plus-arg form round-trips correctly; status flips to `resolved` for the cut variant once the calibration succeeds. |
| SD-012 | inherited from spec: Baseline files for the six new scenarios (`evals/baselines/<scenario>.json`) are intentionally not authored in this round; baselines for new scenarios are added only after at least two clean runs prove structural stability. The convention-based loader returns `null` on missing files, so this is a no-op for the orchestrator. Follow-up feature(s) snapshot baselines once scenarios are stable. | Functional Scope | Medium | Medium | inherited | Honored — Slice 2 does not author a baseline file for `cut-from-spec`. |
| SD-013 | The "`inherited from spec:`" literal is anchored at `src/templates/agent-skills/commands/smithy.cut.prompt` Phase 1 step 3 (the upstream-debt inheritance step). The YAML cross-reference comment names the template by phase+step rather than by line number; if the future maintainer needs the literal but the template prose has been refactored, the comment guides them to the producing phase but not to a precise byte offset. Acceptable: the YAML comment is the strongest available pin; alternative would be extracting the literal into a snippet partial, which is out of scope for this story. | Functional Scope | Medium | High | open | — |
| SD-014 | Task bodies across both slices exceed the 50–100-word target prescribed by the structured task format (Slice 1 plant-task ~240 words; Slice 1 README-task ~200 words; Slice 2 YAML-task ~440 words). The US1 and US2 precedent tasks files exhibit the same overflow, so trimming aggressively would diverge from sibling precedent without confirmation; the verbosity carries load-bearing detail (AS preconditions, FR cross-references, regex anchors, scout-conflict resolutions). Implementer may trim during execution if a passage proves redundant once context is in hand, but mechanical word-budget cuts risk stripping load-bearing detail. | plan-review:Task-format compliance | Important | Low | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Plant the cut-eval spec fixture and document it | — | — |
| S2 | Author the cut-from-spec YAML scenario | S1 | — |

S1 lands first because S2's `prompt` field references the plant by exact path. The two tasks inside S1 (plant the three artifacts; extend the README) are independent of each other but co-located in one PR for reviewer-context-locality reasons.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| US2 Slice 1 (runner git-init in `evals/lib/runner.ts`) | hard dependency (Slice 2) | Slice 2 has a hard dependency on US2 Slice 1 and MUST NOT land until US2 Slice 1 has merged. Without the runner's git-init, cut's Phase 5 `git checkout -b` fails in the temp copy and the `cut-from-spec` scenario reports FAIL on every `npm run eval` invocation — that is a regression in the new test suite and a CI-visible failure once SC-001 is gated on the new scenario passing. Slice 1 (plant + README documentation) has no such dependency and can merge in either order relative to US2. |
| US2 Slice 2 (`## Planted Parent Artifacts` README section creation) | depends on | Soft dependency — US3 Slice 1's README task uses a "create-if-absent" strategy so it works whether US2 Slice 2 has landed or not. If both PRs land in parallel, the conflict surface is one section header + two table rows; trivial to resolve. |
| US1 (audit eval) | depends on | Soft, documentary-only. US1 establishes the `evals/fixture/specs/<scenario-slug>/` plant-directory convention; US3 reuses it under `evals/fixture/specs/cut-eval/`. No code or merge ordering enforced. |
| US4 (render eval), US5 (ignite eval), US6 (spark eval) | depended upon by | Siblings reuse the plant-directory and README-row conventions established by US1 + US2 + US3. No code or merge ordering enforced; the convention is documentary. |

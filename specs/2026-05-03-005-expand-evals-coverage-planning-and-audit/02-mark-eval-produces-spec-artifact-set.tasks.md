# Tasks: Mark eval validates the mark command produces a complete spec artifact set

**Source**: `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/expand-evals-coverage-planning-and-audit.spec.md` — User Story 2
**Data Model**: `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/expand-evals-coverage-planning-and-audit.data-model.md`
**Contracts**: `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/expand-evals-coverage-planning-and-audit.contracts.md`
**Story Number**: 02

---

## Slice 1: Initialize git in the runner's temp fixture copy

**Goal**: `runScenario` in `evals/lib/runner.ts` produces a temp directory that is a valid git repository with a HEAD commit before any skill invocation, so scenarios whose producing command issues `git checkout -b` (mark/cut/render/ignite) succeed independent of whether `evals/fixture/` is itself under git.

**Justification**: Without `.git` in the temp copy, mark's Phase 1 `git checkout -b` fails before any one-shot output is captured — AS 2.1 and AS 2.2 become impossible to satisfy. The runner owns temp-copy lifecycle and is the architecturally correct layer to make the copy a viable working environment. Isolating this change as its own slice makes it reviewable against the existing strike/scout regression guards and unblocks US3/US4/US5/US6 simultaneously. It resolves inherited spec debt SD-001/SD-007.

**Addresses**: SD-001, SD-007 (inherited); supports AS 2.1, AS 2.2, AS 2.4 (mark must reach the one-shot output stage); FR-003 (no new runner module — change is confined to the existing `runScenario` body); FR-013 (source fixture untouched).

### Tasks

- [ ] **Initialize git inside the temp fixture copy before deploying skills**

  Extend `runScenario` in `evals/lib/runner.ts` so that immediately after `fs.cpSync(fixtureDir, tmpDir, …)` and before the `node dist/cli.js init` deploy step, the runner runs `git init`, sets repo-local `user.email` and `user.name` via `git config` (no `--global` flag — eval must never mutate the developer's git config), stages everything with `git add -A`, and creates an initial commit. Use `execFileSync` against the temp directory's `cwd` with stdio drained so output does not pollute the runner's stdout/stderr. Keep the calls inside the existing `try` block so the `finally` cleanup still fires on failure.

  _Acceptance criteria:_
  - After `runScenario` enters the temp directory, the directory is a valid git repository whose `HEAD` resolves to a non-empty initial commit
  - `user.email` and `user.name` are set as repo-local config (no `--global` flag)
  - Source fixture directory (`fixtureDir`) is unchanged; `hashDirectory` before/after matches (FR-013)
  - Existing `strike-health-check` and `scout-fixture-shallow` scenarios continue to PASS unchanged (FR-012, SC-003)
  - Git subprocess failures surface as thrown errors that propagate through the existing `try`/`finally` so temp directories are still cleaned up
  - Change is inline in `runScenario`, not extracted into a helper module — extraction is deferred until US3+ reveals a recurring pattern

**PR Outcome**: The eval runner produces a temp fixture that is a valid git repository on every run. Scenarios whose producing command issues `git checkout -b` no longer fail at branch creation. Existing strike/scout scenarios remain green. Spec debt SD-001 and SD-007 transition to `resolved` in this tasks file.

---

## Slice 2: Plant the mark-eval features-map fixture and document it

**Goal**: A planted features-map at `evals/fixture/rfcs/mark-eval/01-core.features.md` (plus a co-located `mark-eval.rfc.md` for the features-map's `**Source RFC**` header) exists with at least one feature row whose `Artifact` cell is `—`, and `evals/fixture/README.md` carries a new `## Planted Parent Artifacts` section recording the plant.

**Justification**: The plant is the artifact Slice 3's YAML references by exact path. Landing it before the YAML lets reviewers see the plant in isolation, settles the slug, and ensures Slice 3's `prompt` field resolves on its first run. Co-locating the README documentation with the plant keeps the "this is a deliberate fixture, do not delete" signal next to the file it protects. A new `## Planted Parent Artifacts` section is added rather than extending the existing `## Planted Inconsistencies` table — the existing section's intro paragraph explicitly frames its rows as scout-detectable inconsistencies for US8 of the evals framework spec, and a `representative` plant carries no flaw and serves a different scenario. The data-model `realism` enum (`minimal | representative | flawed`) supports this two-section split directly.

**Addresses**: FR-004, FR-005, FR-013, FR-014; AS 2.1 (planted-fixture precondition with `Artifact: —`), AS 2.3 (source-fixture checksum invariant — `Artifact` cell stays `—` in source).

### Tasks

- [ ] **Plant the mark-eval features-map and co-located RFC fixture**

  Create the scenario-isolated directory `evals/fixture/rfcs/mark-eval/` containing two files: `01-core.features.md` (the artifact the scenario prompt consumes) and `mark-eval.rfc.md` (the `**Source RFC**` target referenced by the features-map header). The features-map must conform to the canonical schema rendered by `smithy.render` — `**Source RFC**` header, at least one `### Feature 1: <Title>` section with Description / User-Facing Value / Scope Boundaries, a `## Specification Debt` placeholder, and a `## Dependency Order` 4-column table with one `F1` row whose `Artifact` cell is `—`. The RFC plant is a minimal but realistic Smithy RFC that satisfies mark's input expectations. Both files open with a top-of-file comment identifying the owning scenario (`mark-from-features`) and that the plant is representative (non-flawed) — no "do not fix" instruction is needed because there is no flaw to preserve, but the comment names the owning scenario so future maintainers see the eval-only purpose.

  _Acceptance criteria:_
  - Files exist at `evals/fixture/rfcs/mark-eval/01-core.features.md` and `evals/fixture/rfcs/mark-eval/mark-eval.rfc.md`
  - The features-map has a `**Source RFC**` header line pointing at the co-located RFC by relative path
  - The features-map has at least one `### Feature 1: <Title>` section with the required sub-fields (Description, User-Facing Value, Scope Boundaries) per the render template's Phase 3 schema
  - The features-map `## Dependency Order` 4-column table has at least one `F1` row whose `Artifact` cell is `—`
  - Top-of-file comments in both files name the consuming scenario (`mark-from-features`)
  - File contents reference no paths outside `evals/fixture/rfcs/mark-eval/` (data-model isolation rule, FR-004)
  - `evals/fixture/src/` and the existing scout `## Planted Inconsistencies` rows are untouched (FR-013)

- [ ] **Add a Planted Parent Artifacts section to the fixture README**

  Extend `evals/fixture/README.md` with a new `## Planted Parent Artifacts` section positioned immediately after the existing `## Planted Inconsistencies` section and before `## Usage`. The section's intro paragraph explains that these plants are representative (non-flawed) parent artifacts consumed by scenarios that exercise planning commands, and that they MUST NOT be moved, renamed, or "cleaned up" without coordinating the owning scenario. Seed the section with a 4-column table (`Path | Owner Scenario | Realism | Purpose`) carrying one row for the mark-eval plant directory. Leave the existing `## Planted Inconsistencies` section unchanged.

  _Acceptance criteria:_
  - `evals/fixture/README.md` has a new `## Planted Parent Artifacts` section positioned after `## Planted Inconsistencies` and before `## Usage`
  - The section opens with a one-paragraph intro distinguishing representative plants from the scout-flawed plants documented above
  - The 4-column table has one row for the mark-eval plant: path, owning scenario (`mark-from-features`), realism (`representative`), purpose
  - The section explicitly states the plant must not be moved, renamed, or "cleaned up" without coordinating the owning scenario
  - The convention extends cleanly to US3–US6 future plants (one row per future plant added in their slices)
  - Existing `## Planted Inconsistencies` rows are unchanged

**PR Outcome**: A reviewable, path-stable planted features-map and co-located RFC are committed at the agreed paths under `evals/fixture/rfcs/mark-eval/`. The fixture README documents the new plant under a section whose title accurately reflects its nature (representative parent artifact, not flawed inconsistency). Slice 3's YAML can reference the plant by exact path on its first authored draft.

---

## Slice 3: Author the mark-from-features YAML scenario

**Goal**: `evals/cases/mark-from-features.yaml` exists, is auto-discovered by `loadScenarios`, and `npm run eval -- --case mark-from-features` reports PASS against the Slice 2 plants and the Slice 1 git-init runner support, with sub-agent evidence covering smithy-scout, smithy-plan, smithy-clarify, smithy-refine, and smithy-plan-review.

**Justification**: The YAML scenario is the user-facing deliverable that closes AS 2.1, 2.2, and 2.4. It depends on both prior slices: without Slice 1 the scenario hangs at mark's `git checkout -b`; without Slice 2 the scenario's `prompt` has nothing to reference. Empirical timeout calibration is a YAML-field-level concern that belongs to this slice. Pattern alternation for the PR success/failure branch (AS 2.4) is resolved by anchoring `required_patterns` to template-stable substrings from the one-shot snippet's Error Fallbacks block.

**Addresses**: FR-001, FR-002, FR-003, FR-005, FR-009, FR-010, FR-011, FR-012, FR-014; AS 2.1 (one-shot snippet headings + `**Spec folder**:` bullet), AS 2.2 (sub-agent evidence for all five agents), AS 2.3 (source fixture unchanged after run), AS 2.4 (tolerates `gh` auth absent via regex alternation); SC-001, SC-002, SC-005, SC-006.

### Tasks

- [ ] **Author the mark-from-features YAML scenario**

  Create `evals/cases/mark-from-features.yaml` per the `EvalScenario` shape in `evals/lib/types.ts`, mirroring the precedent in `evals/cases/strike-health-check.yaml` for structure and comment style. Set `skill: /smithy.mark` and `prompt: evals/fixture/rfcs/mark-eval/01-core.features.md 1` (exact repo-relative path with explicit feature number, per FR-005 and inherited SD-003). Anchor `required_headings` to the four literal one-shot-snippet section headings stamped by mark's Phase 6 output. Anchor `required_patterns` to the `**Spec folder**:` bullet AND a single regex alternation accepting either the success-branch PR URL marker OR the documented PR-creation-failure paragraph from the one-shot snippet's Error Fallbacks (AS 2.4). Author `sub_agent_evidence` covering smithy-scout, smithy-plan, smithy-clarify, smithy-refine, and smithy-plan-review using the marker conventions in contracts §3; record `^[Rr]efine` as a fallback pattern in a YAML comment for refine in case `## Step \d+:` proves unstable empirically. Include the strike-convention `forbidden_patterns` (FR-011). Calibrate `timeout:` empirically during scenario authoring and record the observed mark run-time in an inline YAML comment so future maintainers can re-calibrate after template drift.

  _Acceptance criteria:_
  - `name: mark-from-features`; `skill: /smithy.mark`; `prompt` is the exact repo-relative path to the Slice 2 features-map followed by a space and the feature number `1`
  - `required_headings` contains the four one-shot-snippet section headings stamped by the mark template (AS 2.1)
  - `required_patterns` contains `\*\*Spec folder\*\*` AND a regex alternation matching either the PR success-branch URL marker or the documented PR-creation-failure paragraph wording (AS 2.4)
  - `sub_agent_evidence` has five entries covering smithy-scout, smithy-plan, smithy-clarify, smithy-refine, smithy-plan-review, each with a template-stable pattern per contracts §3 marker conventions; refine carries an inline-comment fallback pattern (AS 2.2)
  - `forbidden_patterns` ⊇ the three strike-convention entries (FR-011)
  - `timeout` is set to a positive empirically calibrated number of seconds (not the 120s default), with an inline comment recording the observed wall-clock (FR-010, inherited SD-006)
  - YAML loads without warning via `loadScenarios`; `npm run eval -- --case mark-from-features` selects only this scenario and reports PASS (SC-001, SC-002)
  - Strike and scout scenarios continue to PASS unchanged after this scenario is added (FR-012, SC-003)
  - `npm run test:evals` (offline unit tests) continues to pass with the new YAML file present (SC-006)

**PR Outcome**: `npm run eval -- --case mark-from-features` exercises `/smithy.mark` against the planted features-map and reports PASS, with sub-agent evidence for all five expected dispatches. The scenario passes whether `gh` PR creation succeeds or falls through to the PR-creation-failure branch (AS 2.4). Existing strike and scout scenarios remain green (FR-012). US2's independent test from the spec passes.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Mark/cut/render/ignite scenarios all run `git checkout -b` inside the temp fixture copy. The runner's current `fs.cpSync` may not preserve a `.git` directory if the source fixture is not a standalone git repo. Need to confirm the temp copy is git-initialized (or has the source fixture as a git repo) — otherwise the scenarios fail at the branch-creation step before any output is captured. | Edge Cases | Critical | Medium | resolved | Resolved 2026-05-11 by Slice 1 of this tasks file — `runScenario` initializes a working git repo (with repo-local user identity and initial commit) in `tmpDir` before deploying skills. |
| SD-002 | inherited from spec: The audit scenario's planted flaw (a `.spec.md` missing its `## Dependency Order` table) is tied to one specific checklist invariant in `{{>audit-checklist-spec}}`. If the audit checklist's wording around dependency order changes (e.g., "Dependency Order" → "Implementation Order"), the `required_patterns` literal `Dependency Order` will silently fail. Implementers add an audit-checklist comment cross-referencing the eval scenario, and update both together. | Functional Scope | Critical | Medium | inherited | — |
| SD-003 | inherited from spec: Cross-talk between mark and cut/render plants. Mark's `.features.md` parser auto-selects "the first `### Feature N` not yet specc'd" when no feature number is given; even with exact-path prompts, a planted features-map referencing another scenario's plant could trip the routing logic. Mitigation: scenario-isolated subdirectories (`evals/fixture/rfcs/mark-eval/`, `.../cut-eval/`, `.../render-eval/`) and planted features-maps reference only their own children. Implementers verify the directory layout before each scenario lands. | Edge Cases | Critical | Medium | inherited | — |
| SD-004 | inherited from spec: Per-command structural-expectations rigor: for ignite the on-disk RFC contains many mandatory headings (`## Summary` through `## Milestones`), but the **scenario** validates against the **terminal one-shot snippet** (`## Summary` / `## Assumptions` / `## Specification Debt` / `## PR`) — not the on-disk artifact. Implementers confirm at scenario-authoring time whether scenarios assert against the terminal snippet (the simpler, runner-supported path) or read the on-disk RFC (would require runner changes that this feature explicitly does not introduce). | Functional Scope | High | Medium | inherited | — |
| SD-005 | inherited from spec: Spark's empty-state stub string is currently documented in `smithy.spark.prompt` Phase 2.5 as `No comparable off-the-shelf options identified during survey.`. If smithy-survey's prompt template changes the wording, the eval's regex alternation silently fails. Mitigation: pin the stub string in both the survey template and the eval scenario, with cross-reference comments. | Functional Scope | High | Medium | inherited | — |
| SD-006 | inherited from spec: Per-scenario `timeout:` calibration. Strike's full pipeline takes ~3-7 min today; ignite (with 3 plan lenses, reconcile, clarify, prose, plan-review) is likely 5-10 min; mark and render with full clarify+plan+refine+plan-review fan-out are similar. The `DEFAULT_TIMEOUT_MS` of 120s is almost certainly too short for ignite/mark/render. Implementers calibrate timeouts empirically during scenario authoring; calibration values land in the YAML scenario's `timeout:` field. | Non-Functional Quality | High | Medium | inherited | — |
| SD-007 | inherited from spec: Whether the runner's temp-copy includes a `.git` directory or initializes one. `runScenario` in `evals/lib/runner.ts` does `fs.cpSync(fixtureDir, tmpDir, { recursive: true })` — if `evals/fixture/` is not under a separate `.git`, mark/cut/render/ignite scenarios calling `git checkout -b` will fail. The orchestrator may need to `git init` the temp copy before deploying skills. (Closely related to SD-001.) | Integration | High | Medium | resolved | Resolved 2026-05-11 by Slice 1 of this tasks file — `runScenario` calls `git init` plus repo-local config and an initial commit on `tmpDir` after `fs.cpSync`. |
| SD-008 | inherited from spec: Whether scenarios that create a PR (`gh pr create` in mark/cut/render/ignite) need to be neutralized in the eval environment. Without `gh` auth in CI/local eval context, the one-shot snippet's PR-creation-failure branch will trigger, which still produces output but emits a different terminal contract. Implementers either (a) assert against the failure branch in `required_patterns`, (b) provide stub `gh` credentials, or (c) accept either branch via regex alternation. | Integration | High | Medium | resolved | Resolved 2026-05-11 by Slice 3 of this tasks file — `required_patterns` uses regex alternation accepting either the success URL marker or the PR-creation-failure paragraph (option c). |
| SD-009 | inherited from spec: Per-mode variants for each command (mark with-RFC vs. with-features-map; ignite with-PRD vs. without; render with-RFC vs. with-features.md; cut with explicit story vs. auto-select; audit forge-branch mode) are deferred to follow-up features. This feature ships exactly one canonical scenario per command. | Functional Scope | Medium | High | inherited | — |
| SD-010 | inherited from spec: Render scenario's structural expectations validate against the terminal one-shot snippet, not the on-disk `.features.md` written by render. The runner only validates `extracted_text` from stream-json, so on-disk validation would require a runner-level enhancement out of scope here. (Same constraint as SD-004; tracked separately because render has the most prominent on-disk-vs-terminal divergence.) | Domain & Data Model | Medium | Medium | inherited | — |
| SD-011 | inherited from spec: The audit scenario uses `skill: /smithy.audit` and `prompt: <exact-path>`; the runner's `runScenario` composes this as `/smithy.audit <path>`. Implementers verify this composition works for the slash-command-with-path form during scenario authoring; if the runner mishandles the path argument, additional escaping or quoting may be needed. | Interaction & UX | Medium | High | inherited | — |
| SD-012 | inherited from spec: Baseline files for the six new scenarios (`evals/baselines/<scenario>.json`) are intentionally not authored in this round; baselines for new scenarios are added only after at least two clean runs prove structural stability. The convention-based loader returns `null` on missing files, so this is a no-op for the orchestrator. Follow-up feature(s) snapshot baselines once scenarios are stable. | Functional Scope | Medium | Medium | inherited | — |
| SD-013 | Slice 1 testing strategy is implicit. Should `evals/lib/runner.test.ts` gain a focused assertion that `.git` exists and a HEAD commit is present in `tmpDir` after `runScenario` setup, or is integration coverage via strike+scout still passing sufficient? Recommendation: add a focused unit-level assertion to guard against silent regressions in the init sequence; rely on strike+scout passing as the end-to-end signal. | Testing Strategy | Medium | Medium | open | — |
| SD-014 | Slice 2 features-map content depth is underspecified at the planning level. The slice description names the schema elements (`**Source RFC**`, `### Feature 1`, `## Dependency Order` with `F1` row, etc.) but does not specify milestone framing, problem statement, or scope text that mark's input parser may need. The canonical schema in `src/templates/agent-skills/README.md` and the rendered `smithy.render` template are the implementation-time sources of truth; implementer authors against that schema rather than minimum-viable content. | Scope Edges | Medium | Medium | open | — |
| SD-015 | Slice 3 timeout calibration risk. Mark's full pipeline with smithy-scout + smithy-plan + smithy-clarify + smithy-refine + smithy-plan-review is the heaviest sub-agent fan-out short of ignite. If empirical wall-clock exceeds ~15 minutes, the eval may exceed reasonable developer patience and the scenario may need to be split or scoped down (e.g., a `--no-plan` mode is not available today). Empirical calibration loop during Slice 3 authoring is the only mitigation; closely related to inherited SD-006. | Technical Risk | High | Medium | open | — |
| SD-016 | Slice 1 scope edges: should the runner change also update `evals/README.md` (upstream evals docs) to mention git-init behavior, or is the inline runner.ts comment plus the Slice 2 `evals/fixture/README.md` update sufficient? Recommendation: add a one-paragraph note in `evals/README.md` so future contributors understand why the temp copy has `.git/`. Not strictly required for AS 2.x to pass. | Scope Edges | Low | Medium | open | — |
| SD-017 | Slice 3's acceptance criteria require `required_patterns` to anchor against the documented PR-creation-failure paragraph (AS 2.4) but do not name the specific stable substring from the one-shot snippet's `### Error Fallbacks` block. The paragraph contains template-substituted placeholders (`<spec folder>`, `<error message>`), so a literal-paragraph match will fail; the stable template-emitted substring is `PR creation failed` (plus, optionally, `Re-run\s+the PR creation step manually`). Implementer must anchor the failure-branch alternation to this literal substring rather than a placeholder-bearing line. | plan-review:Logical gap | Important | Low | open | — |
| SD-018 | smithy-plan-review's stable output marker is undocumented in the spec's `### Sub-Agent Evidence Matrix` and in `contracts §3` — both say "plan-review's stable marker" without naming one. The tasks file passes this gap through to the YAML author with no concrete pattern. Implementer must empirically capture plan-review's output from a recent dispatch during Slice 3 authoring and document the chosen marker in a YAML comment alongside the pattern. | plan-review:Logical gap | Important | Low | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Initialize git in the runner's temp fixture copy | — | — |
| S2 | Plant the mark-eval features-map fixture and document it | — | — |
| S3 | Author the mark-from-features YAML scenario | S1, S2 | — |

S1 and S2 are independent and may land in either order or in parallel. S3 depends on both: without S1 the scenario hangs at mark's `git checkout -b`; without S2 the scenario's `prompt` references a missing file.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| US3 (cut eval), US4 (render eval), US5 (ignite eval) | depended upon by | S1's runner git-init change is reusable infrastructure these stories depend on. No merge-ordering coupling is enforced — once S1 lands here, US3/US4/US5 can author their scenarios against the existing git-initialized temp copy. If US3/US4/US5 land first, each would need to reproduce the same runner change, which would create a merge conflict. The conventional ordering is: US2's S1 lands first, then US3–US5 reference it. |
| US1 (audit eval) | depends on | US1 establishes the `evals/fixture/specs/<scenario-slug>/` plant-directory convention and the four-column documentation pattern for plants. US2 reuses the convention under `evals/fixture/rfcs/<scenario-slug>/` and extends the README with a new `## Planted Parent Artifacts` section (rather than appending to US1's flawed-plant `## Planted Inconsistencies` table). No code or merge ordering is enforced; the convention is documentary. |

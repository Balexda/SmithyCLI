# Tasks: Audit eval validates the audit command catches a planted flaw

**Source**: `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/expand-evals-coverage-planning-and-audit.spec.md` — User Story 1
**Data Model**: `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/expand-evals-coverage-planning-and-audit.data-model.md`
**Contracts**: `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/expand-evals-coverage-planning-and-audit.contracts.md`
**Story Number**: 01

---

## Slice 1: Plant the flawed audit-eval spec fixture

**Goal**: A reviewable planted `.spec.md` exists at `evals/fixture/specs/audit-eval/audit-eval-flawed.spec.md` with all canonical spec sections present except `## Dependency Order`, and a top-of-file flaw-comment block instructing future maintainers not to restore the missing section.

**Justification**: The planted fixture is the foundational artifact Slice 2 references by exact path. Landing it first settles the slug, lets reviewers see the planted flaw in isolation, and ensures Slice 2's YAML `prompt` field resolves on its first run.

**Addresses**: FR-004, FR-006, FR-013; AS 1.1 (planted-fixture precondition); AS 1.2 (flaw must be physically removable to prove FAIL).

### Tasks

- [x] **Plant the flawed audit-eval spec fixture**

  Create `evals/fixture/specs/audit-eval/audit-eval-flawed.spec.md` as a complete-but-deliberately-flawed spec matching the canonical spec template, then delete the `## Dependency Order` section entirely. Open the file with a multi-line comment block per the data model's `flawed` plant rule, naming the violated checklist invariant from `src/templates/agent-skills/snippets/audit-checklist-spec.md` and instructing maintainers not to restore the section.

  _Acceptance criteria:_
  - File exists at `evals/fixture/specs/audit-eval/audit-eval-flawed.spec.md`
  - Top-of-file comment block names the violated invariant and the do-not-restore instruction
  - `## Dependency Order` section is absent (no heading, no table, no placeholder)
  - All other canonical spec sections present and internally coherent
  - File content references no paths outside `evals/fixture/specs/audit-eval/` (data-model isolation rule)
  - `evals/fixture/src/` is untouched (FR-013 source-fixture checksum invariant)

**PR Outcome**: A reviewable planted-spec fixture is committed at a stable, agreed path. The `audit-eval/` directory exists with one canonical defective artifact ready for Slice 2 to reference.

---

## Slice 2: Author the audit-flawed-spec YAML scenario and document the plant

**Goal**: `evals/cases/audit-flawed-spec.yaml` exists, is auto-discovered by `loadScenarios`, and `npm run eval -- --case audit-flawed-spec` reports PASS against the Slice 1 fixture; `evals/fixture/README.md` records the new plant in the existing `## Planted Inconsistencies` table.

**Justification**: The YAML scenario and the README row are tightly coupled to the same plant — shipping them together avoids a half-documented intermediate state and matches FR-002's "no orchestrator changes" contract.

**Addresses**: FR-001, FR-002, FR-003, FR-005, FR-007, FR-011, FR-012, FR-014; AS 1.1 (PASS with `Dependency Order` + `Critical` in output); AS 1.2 (FAIL when flaw repaired); AS 1.3 (FAIL when audit template breaks file-argument mode).

### Tasks

- [ ] **Author the audit-flawed-spec YAML scenario**

  Create `evals/cases/audit-flawed-spec.yaml` per the `EvalScenario` shape in `evals/lib/types.ts`, mirroring the precedent in `evals/cases/strike-health-check.yaml`. Anchor `required_patterns` and `required_headings` to template-stable markers emitted by audit's File Argument Mode against the Slice 1 plant (AS 1.1–1.3, FR-007, FR-014).

  _Acceptance criteria:_
  - `name: audit-flawed-spec`; `skill: /smithy.audit`; `prompt` is the exact repo-relative path to the Slice 1 plant
  - `required_patterns` contains a pattern matching the literal token `Critical` as emitted by the audit template's Output section (which renders it as `**Critical**`) — the regex should match whether asterisks are present or absent — AND one matching `Dependency Order` (FR-007)
  - `required_headings` is non-empty: the audit template emits **no** ATX `## …` headings in File Argument Mode — its Output section is a numbered prose-bold list (`1. **Executive Summary**`, `2. **Audit Report**`, `3. **Scorecard**`, `4. **Next Steps**`). Because the loader requires `required_headings` to be non-empty and matches whole lines, pick at least one line the audit reliably emits verbatim and document the choice in a YAML comment; use `required_patterns` for the load-bearing `**Critical**` and `Dependency Order` markers
  - `forbidden_patterns` ⊇ the three strike-convention entries: `"I'd be happy to help"`, `"Sure, here's"`, `'^---\r?\n'` (FR-011)
  - `sub_agent_evidence` field is absent (audit dispatches no sub-agents per the Sub-Agent Evidence Matrix)
  - `timeout` field is absent (audit is single-agent; 120s default suffices)
  - YAML loads without warning via `loadScenarios`; `--case audit-flawed-spec` selects only this scenario

- [ ] **Document the audit-eval plant in the fixture README**

  Append one row to the `## Planted Inconsistencies` table in `evals/fixture/README.md` recording the Slice 1 plant. Use the existing 4-column table shape so the convention extends cleanly for US2–US6 follow-on plants; do not introduce a new section or schema change.

  _Acceptance criteria:_
  - New row added to the existing `## Planted Inconsistencies` table
  - Row identifies the plant path, the violated invariant (missing `## Dependency Order`), the owning scenario (`audit-flawed-spec`), and that the plant must not be "fixed"
  - Existing rows for `evals/fixture/src/routes/users.ts` plants are unchanged
  - No new top-level or sub-section is introduced

**PR Outcome**: `npm run eval -- --case audit-flawed-spec` exercises `/smithy.audit` against the planted flaw and reports PASS. Restoring `## Dependency Order` in the plant causes the next run to report FAIL (SC-004). The fixture README documents the new plant so future maintainers and the scout scenario understand its deliberate flaw. Strike and scout scenarios continue to pass unchanged (FR-012).

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Mark/cut/render/ignite scenarios all run `git checkout -b` inside the temp fixture copy. The runner's current `fs.cpSync` may not preserve a `.git` directory if the source fixture is not a standalone git repo. Need to confirm the temp copy is git-initialized (or has the source fixture as a git repo) — otherwise the scenarios fail at the branch-creation step before any output is captured. | Edge Cases | Critical | Medium | inherited | — |
| SD-002 | inherited from spec: The audit scenario's planted flaw (a `.spec.md` missing its `## Dependency Order` table) is tied to one specific checklist invariant in `{{>audit-checklist-spec}}`. If the audit checklist's wording around dependency order changes (e.g., "Dependency Order" → "Implementation Order"), the `required_patterns` literal `Dependency Order` will silently fail. Implementers add an audit-checklist comment cross-referencing the eval scenario, and update both together. | Functional Scope | Critical | Medium | inherited | — |
| SD-003 | inherited from spec: Cross-talk between mark and cut/render plants. Mark's `.features.md` parser auto-selects "the first `### Feature N` not yet specc'd" when no feature number is given; even with exact-path prompts, a planted features-map referencing another scenario's plant could trip the routing logic. Mitigation: scenario-isolated subdirectories (`evals/fixture/rfcs/mark-eval/`, `.../cut-eval/`, `.../render-eval/`) and planted features-maps reference only their own children. Implementers verify the directory layout before each scenario lands. | Edge Cases | Critical | Medium | inherited | — |
| SD-004 | inherited from spec: Per-command structural-expectations rigor: for ignite the on-disk RFC contains many mandatory headings (`## Summary` through `## Milestones`), but the **scenario** validates against the **terminal one-shot snippet** (`## Summary` / `## Assumptions` / `## Specification Debt` / `## PR`) — not the on-disk artifact. Implementers confirm at scenario-authoring time whether scenarios assert against the terminal snippet (the simpler, runner-supported path) or read the on-disk RFC (would require runner changes that this feature explicitly does not introduce). | Functional Scope | High | Medium | inherited | — |
| SD-005 | inherited from spec: Spark's empty-state stub string is currently documented in `smithy.spark.prompt` Phase 2.5 as `No comparable off-the-shelf options identified during survey.`. If smithy-survey's prompt template changes the wording, the eval's regex alternation silently fails. Mitigation: pin the stub string in both the survey template and the eval scenario, with cross-reference comments. | Functional Scope | High | Medium | inherited | — |
| SD-006 | inherited from spec: Per-scenario `timeout:` calibration. Strike's full pipeline takes ~3-7 min today; ignite (with 3 plan lenses, reconcile, clarify, prose, plan-review) is likely 5-10 min; mark and render with full clarify+plan+refine+plan-review fan-out are similar. The `DEFAULT_TIMEOUT_MS` of 120s is almost certainly too short for ignite/mark/render. Implementers calibrate timeouts empirically during scenario authoring; calibration values land in the YAML scenario's `timeout:` field. | Non-Functional Quality | High | Medium | inherited | — |
| SD-007 | inherited from spec: Whether the runner's temp-copy includes a `.git` directory or initializes one. `runScenario` in `evals/lib/runner.ts` does `fs.cpSync(fixtureDir, tmpDir, { recursive: true })` — if `evals/fixture/` is not under a separate `.git`, mark/cut/render/ignite scenarios calling `git checkout -b` will fail. The orchestrator may need to `git init` the temp copy before deploying skills. (Closely related to SD-001.) | Integration | High | Medium | inherited | — |
| SD-008 | inherited from spec: Whether scenarios that create a PR (`gh pr create` in mark/cut/render/ignite) need to be neutralized in the eval environment. Without `gh` auth in CI/local eval context, the one-shot snippet's PR-creation-failure branch will trigger, which still produces output but emits a different terminal contract. Implementers either (a) assert against the failure branch in `required_patterns`, (b) provide stub `gh` credentials, or (c) accept either branch via regex alternation. | Integration | High | Medium | inherited | — |
| SD-009 | inherited from spec: Per-mode variants for each command (mark with-RFC vs. with-features-map; ignite with-PRD vs. without; render with-RFC vs. with-features.md; cut with explicit story vs. auto-select; audit forge-branch mode) are deferred to follow-up features. This feature ships exactly one canonical scenario per command. | Functional Scope | Medium | High | inherited | — |
| SD-010 | inherited from spec: Render scenario's structural expectations validate against the terminal one-shot snippet, not the on-disk `.features.md` written by render. The runner only validates `extracted_text` from stream-json, so on-disk validation would require a runner-level enhancement out of scope here. (Same constraint as SD-004; tracked separately because render has the most prominent on-disk-vs-terminal divergence.) | Domain & Data Model | Medium | Medium | inherited | — |
| SD-011 | inherited from spec: The audit scenario uses `skill: /smithy.audit` and `prompt: <exact-path>`; the runner's `runScenario` composes this as `/smithy.audit <path>`. Implementers verify this composition works for the slash-command-with-path form during scenario authoring; if the runner mishandles the path argument, additional escaping or quoting may be needed. | Interaction & UX | Medium | High | inherited | — |
| SD-012 | inherited from spec: Baseline files for the six new scenarios (`evals/baselines/<scenario>.json`) are intentionally not authored in this round; baselines for new scenarios are added only after at least two clean runs prove structural stability. The convention-based loader returns `null` on missing files, so this is a no-op for the orchestrator. Follow-up feature(s) snapshot baselines once scenarios are stable. | Functional Scope | Medium | Medium | inherited | — |
| SD-013 | The `Dependency Order` row in `src/templates/agent-skills/snippets/audit-checklist-spec.md` opens with "If the spec contains a `## Dependency Order` section: ..." — its body checks are conditional on the section being present. The Slice 1 plant deliberately omits the section, so this checklist row will not fire its body checks against the plant. The contract (§5 Audit Scenario Detection Contract) nonetheless expects audit to surface the missing section as a Critical finding, presumably because the auditing agent infers the section is mandatory in a multi-story spec from the canonical template. If the first Slice 2 scenario run fails to flag the missing section, add an unconditional "Required Sections" row to the audit checklist that names `## Dependency Order` as mandatory for multi-story specs, and update SD-002's resolution accordingly. | Functional Scope | Important | Low | open | — |
| SD-014 | The audit-eval plant has no sibling `.data-model.md` or `.contracts.md` under `evals/fixture/specs/audit-eval/`. `/smithy.audit` in File Argument Mode performs a **Gather context documents** step that, for a `.spec.md` target, reads the sibling `.data-model.md` and `.contracts.md` in the same folder to drive the Cross-Document Consistency and Contract Completeness checklist rows; without them, audit may produce competing findings about missing siblings that overshadow the intended `Dependency Order` Critical signal. Slice 2's `required_patterns` (`Dependency Order` literal + at least one `Critical` label) should remain lenient enough to pass with extra findings present, but if the first scenario run shows the missing-siblings findings dominating, add minimal sibling stubs under `evals/fixture/specs/audit-eval/` before scenario stabilization. | Integration | Important | Low | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Plant the flawed audit-eval spec fixture | — | — |
| S2 | Author the audit-flawed-spec YAML scenario and document the plant | S1 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| US2–US6 (mark/cut/render/ignite/spark eval scenarios) | depended upon by | This story establishes the `evals/fixture/specs/audit-eval/` plant-directory convention and the existing-`## Planted Inconsistencies`-table extension pattern. US2–US6 follow the same conventions when adding their plants under `evals/fixture/{prds,rfcs,specs}/<scenario-slug>/`. No code or merge ordering is enforced; the convention is documentary. |

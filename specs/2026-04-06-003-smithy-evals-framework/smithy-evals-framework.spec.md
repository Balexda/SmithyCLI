# Feature Specification: Smithy Evals Framework

**Spec Folder**: `2026-04-06-003-smithy-evals-framework`
**Branch**: `claude/smithy-evals-framework-eeV5U`
**Created**: 2026-04-06
**Status**: Draft
**Input**: User description — establish Tier 3 (execution behavior) testing for Smithy agent-skills, focusing on structural validation of headless `claude -p` output against a reference fixture.

## Clarifications

### Session 2026-04-06

- Q: Should this spec cover Tier 2 improvements (shared validation package for deployed files)? → A: No, focus on Tier 3 (execution behavior) only. Tier 2 is a separate spec.
- Q: Which skills should the eval framework cover initially? → A: Strike + all sub-agents it dispatches (plan x3 lenses, reconcile, scout, clarify). NOT orders (needs GitHub API mocking which requires Docker). The goal is depth-over-breadth: one end-to-end command tested thoroughly.
- Q: Include rubric grading (LLM-as-judge) in v1? → A: Defer to v2. Structural-only validation for now.
- Q: How should eval scenarios be defined? → A: YAML files in `evals/cases/`, one per scenario.
- Q: Which sub-agents dispatched by strike should be verified? → A: All of them (plan x3 competing lenses, reconcile, scout, clarify).
- Q: How complex should the reference fixture be? → A: Minimal (5-6 files, Express-style API). Enough for meaningful planning but low maintenance burden.
- Q: Docker for isolation? → A: No Docker for v1. Copy fixture to temp directory. Add Docker later if contamination is a real problem.

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

## User Scenarios & Testing *(mandatory)*

### User Story 1: Validate Headless Execution Assumptions (Priority: P1)

As a Smithy developer, I want to confirm that `claude -p` headless mode loads deployed `.claude/` files and supports sub-agent dispatch so that I can proceed with building the evals framework on solid ground.

**Why this priority**: The entire framework depends on three unvalidated assumptions about `claude -p` behavior. If any fail, the architecture needs rethinking before any other story is implemented.

**Independent Test**: Run `claude -p "/smithy.strike 'add a health check endpoint'"` in a directory with deployed Smithy skills, observe whether the skill is triggered and sub-agents are dispatched.

**Acceptance Scenarios**:

1. **Given** a directory with Smithy skills deployed via `smithy init -a claude -y`, **When** `claude -p "/smithy.strike 'add a health check'"` is run, **Then** the output reflects the strike skill (not a generic Claude response).
2. **Given** a deployed smithy-plan agent, **When** strike runs in headless mode, **Then** evidence of sub-agent dispatch appears in the output (e.g., competing lens labels, scout report).
3. **Given** headless mode does NOT load `.claude/` files, **When** the spike reveals this, **Then** a fallback approach is documented (e.g., injecting prompt content directly via `claude -p "$(cat .claude/commands/smithy.strike.md) ..."`).

---

### User Story 2: Reference Fixture Exists and Is Deployable (Priority: P1)

As a Smithy developer, I want a minimal reference codebase checked into the repo so that all eval runs test against the same known project state.

**Why this priority**: Every eval case depends on a fixture to run against. Without it, nothing can execute.

**Independent Test**: Run `smithy init -a claude -y` against the fixture directory, confirm skills are deployed successfully.

**Acceptance Scenarios**:

1. **Given** the fixture project in `evals/fixture/`, **When** `smithy init -a claude -y` runs against it, **Then** skills are deployed to `.claude/commands/`, `.claude/prompts/`, and `.claude/agents/`.
2. **Given** the fixture project, **When** a plan eval runs against it, **Then** the plan references specific files and structures from the fixture (not generic advice).

---

### User Story 3: Execute a Skill Headlessly and Capture Output (Priority: P1)

As a Smithy developer, I want to execute a deployed agent-skill via `claude -p` in headless mode against a reference fixture so that I can capture the skill's output for automated validation.

**Why this priority**: Nothing else works without the ability to invoke skills headlessly and capture their output. This is the foundational capability.

**Independent Test**: Run `claude -p "/smithy.strike 'add a health check endpoint'"` against a fixture project with Smithy skills deployed, confirm stdout is captured to a file.

**Acceptance Scenarios**:

1. **Given** a reference fixture with Smithy skills deployed via `smithy init`, **When** the eval runner invokes `claude -p` with a skill prompt, **Then** the skill's full output is captured as a string.
2. **Given** a skill invocation that exceeds the per-case timeout (default 120s), **When** the timeout is reached, **Then** the process is killed and the case is recorded as a timeout failure.
3. **Given** no `claude` CLI in PATH or no valid API key, **When** the eval runner starts, **Then** it fails fast with a clear error message before attempting any skill invocations.
4. **Given** the reference fixture on disk, **When** an eval case runs, **Then** the fixture source directory is not modified (a copy in a temp directory is used instead).

---

### User Story 4: Validate Output Structure (Priority: P1)

As a Smithy developer, I want to validate that a skill's output contains the expected headings, sections, and table structures so that I can detect structural regressions without manual review.

**Why this priority**: Structural validation is the core value proposition of the evals framework — it replaces vibes-based "looks right" with automated checks.

**Independent Test**: Given a known skill output string, run the structural validator with a set of expectations (required headings, section presence), confirm it returns pass/fail per check.

**Acceptance Scenarios**:

1. **Given** a skill output and a scenario's structural expectations (list of required headings), **When** the validator runs, **Then** it returns a pass/fail result per heading check.
2. **Given** a skill output missing a required section (e.g., `### Risks` absent from a plan output), **When** the validator runs, **Then** the missing section is reported as a failure with the expected heading name.
3. **Given** a skill output with all required structural elements present, **When** the validator runs, **Then** all checks pass regardless of content quality (structural checks are format-only).

---

### User Story 5: Verify Strike End-to-End Output (Priority: P1)

As a Smithy developer, I want to run `/smithy.strike` against the reference fixture and validate that the output has the correct overall structure so that I can catch regressions in the flagship command.

**Why this priority**: Strike is the most-used command and exercises the full planning pipeline. If strike works end-to-end, the core agent-skill machinery is healthy.

**Independent Test**: Invoke `/smithy.strike "add a health check endpoint"` via `claude -p` against the fixture, validate the output contains expected top-level sections.

**Acceptance Scenarios**:

1. **Given** the reference fixture with Smithy skills deployed, **When** `/smithy.strike` is invoked with a feature description, **Then** the output contains the expected strike output sections.
2. **Given** a strike eval case, **When** the output is captured, **Then** no YAML frontmatter (`---`) appears at the top of the output (frontmatter should be stripped for Claude).
3. **Given** a successful strike run, **When** the structural validator checks the output, **Then** the skill is confirmed triggered by the presence of strike-specific structural markers (e.g., `## Summary`, `## Approach`, `## Risks` sections and `**Phase N: <Label>**` bold workflow-stage markers (e.g., `**Phase 1: Branch**`)) AND the absence of generic refusal patterns (e.g., "I'd be happy to help", "Sure, here's"). Note: `# Strike:` heading does NOT appear in actual output — spike confirmed the actual top-level heading is `## Summary`.

---

### User Story 6: Verify Sub-Agent Invocation (Priority: P1)

As a Smithy developer, I want to verify that strike dispatches all expected sub-agents (plan x3 lenses, reconcile, scout, clarify) so that I can detect when the agent dispatch chain breaks.

**Why this priority**: Sub-agent dispatch is the most fragile part of strike — prompt changes can silently break agent invocation. This is the highest-risk area for silent regressions.

**Independent Test**: Run a strike eval and check the output for evidence that each sub-agent was invoked (e.g., scout report section, reconciled plan section, competing lens references).

**Acceptance Scenarios**:

1. **Given** a strike eval run against the fixture (with Claude variant deployed), **When** the output is analyzed, **Then** evidence of smithy-scout invocation is present (e.g., a scout report or consistency scan section). **KNOWN GAP (spike finding)**: Strike does not currently dispatch smithy-scout — 0 scout matches in the spike run. This scenario must be reconciled before US6 implementation: either strike is updated to dispatch scout, or this acceptance criterion is removed from the strike eval and replaced with a standalone scout eval.
2. **Given** a strike eval run, **When** the output is analyzed, **Then** evidence of smithy-plan invocation is present (e.g., competing plan references or lens labels like "Simplification", "Separation of Concerns", "Robustness").
3. **Given** a strike eval run, **When** the output is analyzed, **Then** evidence of smithy-reconcile invocation is present (e.g., a reconciled plan or merged approach section).
4. **Given** a strike eval run, **When** the output is analyzed, **Then** evidence of smithy-clarify invocation is present (e.g., clarification questions or assumption triage).

---

### User Story 7: Define Eval Scenarios Declaratively (Priority: P2)

As a Smithy developer, I want to define eval scenarios in YAML files so that I can add new eval cases without modifying runner code.

**Why this priority**: Important for maintainability but not blocking — the framework could launch with hardcoded cases and migrate to YAML. YAML separation is a quality-of-life improvement.

**Independent Test**: Create a new YAML scenario file, run the eval runner, confirm the new case is picked up and executed without code changes.

**Acceptance Scenarios**:

1. **Given** a YAML file in `evals/cases/` with a skill name, prompt, and structural expectations, **When** the eval runner starts, **Then** the scenario is loaded and executed.
2. **Given** multiple YAML scenario files, **When** the eval runner is invoked with `--case <name>`, **Then** only the specified case runs.
3. **Given** a YAML scenario file with an invalid structure (missing required fields), **When** the eval runner loads it, **Then** a clear validation error is reported and the case is skipped.

---

### User Story 8: Fixture Contains Deliberate Inconsistencies for Scout (Priority: P2)

As a Smithy developer, I want the reference fixture to contain deliberate inconsistencies so that scout evals can verify inconsistency detection, not just structural output format.

**Why this priority**: The fixture already exists (US2), but adding deliberate flaws enriches scout eval coverage. Can be added after the basic framework works.

**Independent Test**: Run a scout eval against the fixture, confirm the scout detects the planted inconsistency.

**Acceptance Scenarios**:

1. **Given** the fixture project with a deliberate stale doc comment, **When** a scout eval runs against it, **Then** the scout detects at least one inconsistency (e.g., stale doc comment, mismatched signature).
2. **Given** the fixture project, **When** a new deliberate inconsistency is added, **Then** the scout eval detects it without changes to the eval runner.

---

### User Story 9: Eval Summary Report (Priority: P2)

As a Smithy developer, I want a pass/fail summary printed to stdout after all eval cases run so that I can quickly see which cases passed and which failed.

**Why this priority**: Essential for usability but the report format can be refined over time. A basic pass/fail summary is sufficient for v1.

**Independent Test**: Run the eval suite, confirm stdout contains a summary with case names and pass/fail status.

**Acceptance Scenarios**:

1. **Given** a completed eval run with 3 cases (2 pass, 1 fail), **When** the summary is printed, **Then** each case name appears with its pass/fail status and the overall result is FAIL.
2. **Given** a completed eval run with all cases passing, **When** the summary is printed, **Then** the overall result is PASS with the total count.
3. **Given** a case that timed out, **When** the summary is printed, **Then** the timeout is reported as a distinct failure reason (not just "FAIL").

---

### User Story 10: Baseline Structural Expectations (Priority: P3)

As a Smithy developer, I want to store known-good output snapshots as baselines so that I can compare new eval outputs against a previous known-good run to detect regressions beyond structural checks.

**Why this priority**: Baselines add regression detection value but the framework is useful without them (YAML structural expectations cover format; baselines cover content drift). Can be layered on after the structural framework works.

**Clarification**: Baselines are distinct from the YAML structural expectations. YAML expectations define *format rules* (e.g., "must have `## Plan` heading"). Baselines are *snapshot files* of a previous known-good output, used to detect content drift (e.g., "the approach section used to mention file X but no longer does"). Baselines are optional; structural expectations are required per scenario.

**Independent Test**: Store a baseline snapshot, modify a skill template to change output content, re-run evals, confirm the baseline comparison flags the drift.

**Acceptance Scenarios**:

1. **Given** a baseline snapshot file for a scenario, **When** the eval runs and output content substantially matches the baseline, **Then** the case passes the baseline comparison.
2. **Given** a baseline snapshot, **When** the eval output has structural changes not present in the baseline, **Then** the case flags a regression with a summary of what changed.
3. **Given** a new eval case with no baseline, **When** the eval runs, **Then** the structural checks still run (baselines are optional, not required).

---

### User Story 11: Cost and Time Transparency (Priority: P3)

As a Smithy developer, I want to see estimated run duration before starting an eval run so that I can make informed decisions about when to run evals.

**Why this priority**: Nice-to-have for developer experience. The framework is fully usable without it.

**Independent Test**: Run the eval suite, confirm a duration estimate or per-case timing is displayed.

**Acceptance Scenarios**:

1. **Given** the eval runner is invoked, **When** execution begins, **Then** the number of cases to run is displayed.
2. **Given** a completed eval run, **When** the summary is printed, **Then** the total elapsed time and per-case duration are included.

---

### Edge Cases

- Eval case where `claude -p` returns an empty response (model refusal, API error).
- Eval case where the skill produces output but in an unexpected format (e.g., raw text instead of Markdown).
- Concurrent eval runs modifying the same temp directory (should use unique temp dirs per run).
- Fixture directory accidentally deleted or corrupted.
- `claude` CLI version incompatible with `-p` flag or `.claude/` file loading behavior.
- API rate limiting during multi-case sequential execution.

### Eval Strategy Note: Standalone vs. Indirect Coverage

Plan and scout are tested **both** ways:
- **Indirectly** via strike (US5, US6) — verifying they are dispatched as sub-agents and their output appears in strike's output.
- **Standalone** via their own YAML eval scenarios — invoking them directly as sub-agents with their own structural expectations (e.g., `## Plan` with 4 sections for plan, `## Scout Report` with severity tables for scout). This validates their output structure independently of strike's orchestration.

## Dependency Order

| ID   | Title                                                    | Depends On      | Artifact                                                                                          |
|------|----------------------------------------------------------|-----------------|---------------------------------------------------------------------------------------------------|
| US1  | Validate Headless Execution Assumptions                  | —               | `specs/2026-04-06-003-smithy-evals-framework/01-validate-headless-execution-assumptions.tasks.md` |
| US2  | Reference Fixture Exists and Is Deployable               | US1             | `specs/2026-04-06-003-smithy-evals-framework/02-reference-fixture-exists-and-is-deployable.tasks.md` |
| US3  | Execute a Skill Headlessly and Capture Output            | US1, US2        | `specs/2026-04-06-003-smithy-evals-framework/03-execute-skill-headlessly-and-capture-output.tasks.md` |
| US4  | Validate Output Structure                                | US3             | `specs/2026-04-06-003-smithy-evals-framework/04-validate-output-structure.tasks.md`               |
| US5  | Verify Strike End-to-End Output                          | US3, US4        | `specs/2026-04-06-003-smithy-evals-framework/05-verify-strike-end-to-end-output.tasks.md`         |
| US6  | Verify Sub-Agent Invocation                              | US5             | `specs/2026-04-06-003-smithy-evals-framework/06-verify-sub-agent-invocation.tasks.md`             |
| US7  | Define Eval Scenarios Declaratively                      | US5             | `specs/2026-04-06-003-smithy-evals-framework/07-define-eval-scenarios-declaratively.tasks.md`     |
| US8  | Fixture Contains Deliberate Inconsistencies for Scout    | US2, US5        | `specs/2026-04-06-003-smithy-evals-framework/08-fixture-deliberate-inconsistencies-for-scout.tasks.md` |
| US9  | Eval Summary Report                                      | US3, US4        | `specs/2026-04-06-003-smithy-evals-framework/09-eval-summary-report.tasks.md`                     |
| US10 | Baseline Structural Expectations                         | US4, US5        | `specs/2026-04-06-003-smithy-evals-framework/10-baseline-structural-expectations.tasks.md`        |
| US11 | Cost and Time Transparency                               | US9             | —                                                                                                 |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST execute agent-skills via `claude --output-format stream-json -p` in headless mode, capture the full stdout as newline-delimited JSON, and extract readable text using the following precedence rule: if a `result` event is present and has non-empty text, use `result.text` as the canonical `extracted_text`; otherwise fall back to the concatenation of `assistant` event text blocks. Naïve concatenation of both sources MUST NOT be used — the spike confirmed the final result can appear twice in the stream (headless auto-reply), which would cause double-matching on structural and pattern checks. Plain text stdout (without `--output-format stream-json`) is insufficient because it hides tool-use and sub-agent dispatch events needed for FR-012.
- **FR-002**: The system MUST copy the reference fixture to a unique temp directory before each eval case to prevent cross-case contamination.
- **FR-003**: The system MUST validate that `claude` is available in PATH and API credentials are configured before running any eval cases.
- **FR-004**: The system MUST enforce a per-case timeout (configurable, default 120 seconds) and kill the process on timeout.
- **FR-005**: The system MUST validate skill output against structural expectations defined in the scenario (required headings, section presence).
- **FR-006**: The system MUST report per-check pass/fail results for each structural assertion.
- **FR-007**: The system MUST support YAML-based scenario definitions with skill name, prompt text, and structural expectations.
- **FR-008**: The system MUST support filtering which cases to run via a `--case` CLI argument.
- **FR-009**: The system MUST print a summary report to stdout with per-case pass/fail status and overall result.
- **FR-010**: The system MUST run via a dedicated `npm run eval` script, completely decoupled from `npm test` and `pretest`.
- **FR-011**: The system MUST verify that the source fixture directory was not modified after each eval case (checksum validation).
- **FR-012**: The system MUST detect whether the slash command actually triggered the deployed skill by checking for skill-specific structural markers (e.g., `## Summary` / `**Phase N: <Label>**` such as `**Phase 1: Branch**` for strike, `## Plan` for plan) AND the absence of generic refusal patterns (e.g., "I'd be happy to help", "Sure, here's"). A scenario MAY define custom `required_patterns` and `forbidden_patterns` for this purpose. Note: `# Strike:` heading does not appear in actual strike output — use `## Summary` and `**Phase N: <Label>**` markers instead.
- **FR-013**: The system MUST clean up temp directories after each eval case completes, regardless of pass/fail/timeout/error status.
- **FR-014**: Before building the full framework, a validation spike MUST confirm that `claude -p` headless mode (a) loads `.claude/commands/`, `.claude/prompts/`, and `.claude/agents/` from the working directory, (b) supports sub-agent dispatch, and (c) captures skill output on stdout. If any assumption fails, a fallback approach MUST be documented. **Status: COMPLETE** — all three assumptions passed; see `evals/spike/FINDINGS.md`.
- **FR-015**: The system MUST include a stream-json parser utility (`evals/lib/parse-stream.ts`, promoted from `evals/spike/parse-stream.mjs`) that exports: `parseStreamString(content)`, `extractText(events)`, `extractResult(events)`, `extractToolUses(events)`, `extractToolResults(events)`, `extractSubAgentDispatches(events)`, `summarizeEvents(events)`, and `extractCanonicalText(events)`. `extractCanonicalText` implements the FR-001 precedence rule and is the primary text-extraction entrypoint for the Runner. This utility is the single source of truth for interpreting `claude --output-format stream-json` output throughout the framework.
- **FR-016**: Sub-agent verification MUST require the scenario's configured `pattern` to match at least one of: (a) the extracted text, or (b) an `AgentDispatch.description` or `AgentDispatch.resultText` from the stream. Agent-name detection alone (checking whether a dispatch mentions the agent name without the configured pattern matching) MUST NOT be treated as a pass criterion — it is supplementary metadata for reporting only. For smithy-clarify, whose output may be consumed internally by strike, the scenario `pattern` SHOULD be authored to match the dispatch message in assistant text (e.g., `"dispatching the.*smithy-clarify"`).

### Key Entities

- **EvalScenario**: A declarative test case definition (YAML) specifying which skill to invoke, with what prompt, and what structural properties the output must have.
- **EvalResult**: The outcome of running a single scenario — captured output, per-check pass/fail results, duration, and any errors.
- **EvalReport**: An aggregate summary across all scenarios in a run — total pass/fail counts, per-case results, and overall status.
- **ReferenceFixture**: A minimal, static TypeScript project checked into the repo that serves as the target for all skill invocations.

## Assumptions

- The `claude` CLI supports `-p` (headless/pipe mode) for non-interactive skill execution.
- Headless mode loads `.claude/commands/`, `.claude/prompts/`, and `.claude/agents/` from the working directory (same as interactive mode).
- Sub-agent dispatch works in headless mode (plan, scout, reconcile, clarify are invoked by the skill prompt, not by interactive user action).
- Both OAuth (via `claude login`) and `ANTHROPIC_API_KEY` are valid for authentication in headless mode — the spike ran successfully with OAuth only. The eval runner must support both.
- Developers running evals have the `claude` CLI installed and authenticated locally.
- A minimal 5-6 file fixture is sufficient for strike/plan/scout to produce structurally meaningful output.

## Specification Debt

_None — all ambiguities resolved._

## Out of Scope

- **Rubric grading / LLM-as-judge** — deferred to v2 once structural evals prove valuable.
- **Docker isolation** — deferred to v2. Temp directory copy + checksum validation is sufficient for v1.
- **CI integration** — evals run locally on demand only.
- **Tier 2 improvements** (shared validation package for deployed file format) — separate spec.
- **Gemini / Codex evals** — Tier 3 focuses on Claude Code execution only for now.
- **smithy.orders evals** — requires GitHub API mocking, which needs Docker.
- **Multi-run statistical analysis** (median-of-N scoring, variance tracking) — deferred to v2 with rubric grading.
- **Automatic baseline generation or updating** — baselines are created and updated manually.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The eval framework can execute at least 3 eval cases (strike end-to-end, plan standalone, scout standalone) against the reference fixture and produce a pass/fail report.
- **SC-002**: Structural validation detects when a required output section is missing (e.g., removing `### Risks` from a plan template causes the plan eval to fail).
- **SC-003**: Sub-agent invocation is verified for all agents dispatched by strike (plan x3, reconcile, scout, clarify).
- **SC-004**: The eval suite runs in under 10 minutes for all cases combined (assuming typical LLM response times).
- **SC-005**: Evals are fully decoupled from `npm test` — running `npm test` never triggers eval cases.
- **SC-006**: Adding a new eval case requires only creating a YAML file in `evals/cases/` — no runner code changes needed.

# Data Model: Smithy Evals Framework

## Overview

The evals framework operates on three core entities: scenario definitions (input), eval results (per-case output), and eval reports (aggregate output). All data is file-based — YAML for scenarios, JSON for baselines, and in-memory structures for results and reports during execution.

## Entities

### 1) EvalScenario (`evals/cases/*.yaml`)

Purpose: Declares a single eval case — which skill to invoke, with what arguments, and what structural properties the output must satisfy.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Unique identifier for the case (e.g., `strike-health-check`) |
| `skill` | string | Yes | The skill to invoke (e.g., `/smithy.strike`, `smithy-plan`) |
| `prompt` | string | Yes | The prompt text or `$ARGUMENTS` to pass to the skill |
| `model` | string | No | Model override for `claude -p` (defaults to framework default) |
| `timeout` | number | No | Per-case timeout in seconds (defaults to 120) |
| `structural_expectations` | object | Yes | Structural checks to run against the output |
| `structural_expectations.required_headings` | string[] | Yes | Markdown headings that must be present (e.g., `["## Plan", "### Approach"]`) |
| `structural_expectations.required_tables` | object[] | No | Tables that must be present with expected column names |
| `structural_expectations.forbidden_patterns` | string[] | No | Regex patterns that must NOT appear in the output (e.g., `["^---\\n"]` for frontmatter) |
| `structural_expectations.required_patterns` | string[] | No | Regex patterns that MUST appear in the output |
| `sub_agent_evidence` | object[] | No | Agent name + evidence pattern pairs indicating a sub-agent was invoked (e.g., `{agent: "smithy-plan", pattern: "Simplification|Robustness"}`). Each entry specifies the agent name (for reporting) and a regex pattern matched against BOTH the extracted text AND the `AgentDispatch` description/result from stream events. For agents like smithy-clarify whose output may be consumed internally, the dispatch message in assistant text is the primary evidence source. |

Validation rules:
- `name` must be unique across all scenario files.
- `skill` must be a valid Smithy skill name (command or agent).
- `structural_expectations.required_headings` must contain at least one entry.

### 1b) StreamEvent / AgentDispatch (in-memory, transient — not stored)

Purpose: Intermediate representations produced by `StreamParser` (`evals/lib/parse-stream.ts`) while processing `claude --output-format stream-json` output. Not persisted; used to produce `extracted_text` and `sub_agent_checks`.

**StreamEvent** — a single parsed line from the NDJSON output:

| Field | Type | Notes |
|-------|------|-------|
| `type` | string | `system`, `user`, `assistant`, `result`, `rate_limit_event` |
| `message` | object | Present on `assistant`/`user` events; contains `content[]` blocks |

**AgentDispatch** — an `Agent` tool-use block with its result, extracted by `extractSubAgentDispatches`:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Tool-use ID (correlates with tool_result in user events) |
| `description` | string | Short description passed to the Agent tool |
| `prompt` | string | Full prompt passed to the sub-agent |
| `resultText` | string | Text content of the tool_result response |

---

### 2) EvalResult (in-memory)

Purpose: Captures the outcome of running a single eval scenario, including the raw output, per-check results, and timing information.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `scenario_name` | string | Yes | References the EvalScenario `name` |
| `status` | enum | Yes | `pass`, `fail`, `timeout`, `error`. Note: `pending` and `running` are orchestrator-internal states used during execution but not persisted in the final result. |
| `extracted_text` | string | Yes | Canonical text for structural checks, resolved with precedence: `result.text` if the `result` event is present and non-empty; otherwise concatenated `assistant` text blocks. Never both combined — the stream can emit the final result twice (headless auto-reply), which would cause false double-matches. Raw NDJSON is not stored. |
| `duration_ms` | number | Yes | Wall-clock time for the skill invocation |
| `structural_checks` | CheckResult[] | Yes | Per-check pass/fail results |
| `sub_agent_checks` | CheckResult[] | No | Per-agent invocation verification results |
| `error` | string | No | Error message if status is `error` or `timeout` |

### 3) CheckResult (in-memory, nested in EvalResult)

Purpose: A single structural or sub-agent check result.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `check_name` | string | Yes | Human-readable check description (e.g., `"has '## Plan' heading"`) |
| `passed` | boolean | Yes | Whether the check passed |
| `expected` | string | No | What was expected (e.g., the heading text) |
| `actual` | string | No | What was found (or "not found") |

### 4) EvalReport (in-memory / stdout)

Purpose: Aggregate summary across all scenarios in a single eval run.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `timestamp` | string | Yes | ISO 8601 timestamp of the run |
| `total_cases` | number | Yes | Number of scenarios executed |
| `passed` | number | Yes | Count of scenarios with status `pass` |
| `failed` | number | Yes | Count of scenarios with status `fail`, `timeout`, or `error` |
| `overall_status` | enum | Yes | `pass` (all cases pass) or `fail` (any case fails) |
| `results` | EvalResult[] | Yes | Per-case results |
| `total_duration_ms` | number | Yes | Total wall-clock time for the entire run |

## Relationships

- EvalReport 1:N EvalResult — one report contains results for all scenarios in a run.
- EvalResult 1:N CheckResult — one result contains all structural and sub-agent checks for that scenario.
- EvalResult N:1 EvalScenario — each result references the scenario it was run against (via `scenario_name`).

## State Transitions

### Eval case lifecycle

1. `pending` → `running`
   - Trigger: the orchestrator selects the next scenario to execute.
   - Effects: fixture is copied to temp dir, `claude -p` is spawned.

2. `running` → `pass`
   - Trigger: skill output is captured and all structural checks pass.
   - Effects: result is recorded with status `pass`.

3. `running` → `fail`
   - Trigger: skill output is captured but one or more structural checks fail.
   - Effects: result is recorded with status `fail` and failing check details.

4. `running` → `timeout`
   - Trigger: per-case timeout is exceeded.
   - Effects: process is killed, result is recorded with status `timeout`.

5. `running` → `error`
   - Trigger: `claude -p` exits with non-zero code, or an unexpected error occurs.
   - Effects: result is recorded with status `error` and the error message.

## Identity & Uniqueness

- Scenarios are uniquely identified by their `name` field, which must be unique across all YAML files in `evals/cases/`.
- Eval results are identified by `scenario_name` + run timestamp (a scenario can only have one result per run).

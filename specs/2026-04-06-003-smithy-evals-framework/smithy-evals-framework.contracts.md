# Contracts: Smithy Evals Framework

## Overview

The evals framework has three internal integration boundaries: the runner (executes skills), the structural validator (checks output format), and the orchestrator (composes runner + validator into an eval pipeline). The primary external boundary is the `claude` CLI invoked via child process.

## Interfaces

### StreamParser

**Purpose**: Parses `claude --output-format stream-json` output (newline-delimited JSON events) into structured data for text extraction and sub-agent analysis. Promoted from `evals/spike/parse-stream.mjs`.
**Consumers**: Runner, SubAgentVerifier, Orchestrator
**Providers**: `evals/lib/parse-stream.ts`

#### Exports

| Function | Signature | Description |
|----------|-----------|-------------|
| `parseStreamString` | `(content: string) => StreamEvent[]` | Parse raw NDJSON stdout into event objects |
| `extractText` | `(events: StreamEvent[]) => string` | Concatenate all `assistant` text blocks in order |
| `extractResult` | `(events: StreamEvent[]) => ResultSummary \| null` | Return final `result` event (text, subtype, duration_ms, num_turns) |
| `extractToolUses` | `(events: StreamEvent[]) => ToolUse[]` | All tool invocations from assistant messages |
| `extractToolResults` | `(events: StreamEvent[]) => ToolResult[]` | Tool results from user messages |
| `extractSubAgentDispatches` | `(events: StreamEvent[]) => AgentDispatch[]` | Agent tool-use blocks with their result text |
| `summarizeEvents` | `(events: StreamEvent[]) => EventSummary` | Aggregate counts, tool names, duration, text length |

#### Stream Event Types (observed in spike)

| Event type | Count (spike) | Description |
|------------|---------------|-------------|
| `system` | 62 | Hook events, session metadata |
| `user` | 63 | Auto-generated headless-mode prompts |
| `assistant` | 70 | Responses with `text` and `tool_use` content blocks |
| `result` | 1 | Final result: `result` field, `subtype`, `duration_ms`, `num_turns` |
| `rate_limit_event` | 1 | Rate limit notification |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Malformed JSON line | Thrown error | `JSON.parse` failure on a non-empty line |
| Empty content string | Empty array | Returns `[]` |

---

### Runner

**Purpose**: Executes a single eval scenario by invoking `claude --output-format stream-json -p` against a copy of the reference fixture and returning the parsed output.
**Consumers**: Orchestrator (`run-evals.ts`)
**Providers**: `evals/lib/runner.ts`

#### Signature

```
runScenario(scenario: EvalScenario, fixtureDir: string): Promise<RunOutput>
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scenario` | EvalScenario | Yes | The parsed scenario definition (skill, prompt, timeout) |
| `fixtureDir` | string | Yes | Path to the source fixture directory (will be copied to temp) |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `extracted_text` | string | Assistant text extracted from stream-json events (used for structural validation) |
| `stream_events` | StreamEvent[] | Parsed stream-json events (used for sub-agent verification via `extractSubAgentDispatches`) |
| `duration_ms` | number | Wall-clock execution time |
| `exit_code` | number | Process exit code |
| `timed_out` | boolean | Whether the process was killed due to timeout |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| `claude` not in PATH | Thrown error | Runner validates CLI availability before spawning |
| Process timeout | `{ timed_out: true }` | Process killed via SIGTERM, partial output returned |
| Non-zero exit code | `{ exit_code: N }` | Output still captured; caller decides if this is an error |
| Fixture copy fails | Thrown error | Filesystem error copying fixture to temp directory |

---

### StructuralValidator

**Purpose**: Validates a skill output string against a set of structural expectations (headings, patterns, tables) and returns per-check results.
**Consumers**: Orchestrator (`run-evals.ts`)
**Providers**: `evals/lib/structural.ts`

#### Signature

```
validateStructure(output: string, expectations: StructuralExpectations): CheckResult[]
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `output` | string | Yes | The raw skill output to validate |
| `expectations` | StructuralExpectations | Yes | The structural checks from the scenario YAML |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `CheckResult[]` | array | One entry per check, each with `check_name`, `passed`, `expected`, `actual` |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Empty output string | All checks fail | Checks run against empty string; all heading/pattern checks will fail |
| Invalid regex in expectations | Thrown error | Malformed regex in `required_patterns` or `forbidden_patterns` |

---

### SubAgentVerifier

**Purpose**: Checks whether expected sub-agents were invoked by looking for evidence in both the extracted text AND the stream-json agent dispatch events.
**Consumers**: Orchestrator (`run-evals.ts`)
**Providers**: `evals/lib/structural.ts` (co-located with StructuralValidator — both operate on parsed output; they share a module despite being separate logical interfaces)

#### Signature

```
verifySubAgents(
  text: string,
  dispatches: AgentDispatch[],
  evidence: SubAgentEvidence[]
): CheckResult[]
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Extracted assistant text to search with pattern |
| `dispatches` | AgentDispatch[] | Yes | Sub-agent dispatch events from `extractSubAgentDispatches` |
| `evidence` | SubAgentEvidence[] | Yes | Agent name + pattern pairs from the scenario |

#### Evidence Matching Logic

For each `SubAgentEvidence` entry, a check passes if ANY of the following is true:
1. The `pattern` regex matches the extracted `text` (output content pattern)
2. The `pattern` regex matches any `AgentDispatch.description` or `AgentDispatch.resultText` from the stream events
3. The dispatch `description` or `resultText` contains the agent name (e.g., `"smithy-clarify"`)

This dual-source approach is required because smithy-clarify evidence may only appear as a dispatch message in the assistant text (`"dispatching the **smithy-clarify** agent"`) with no output markers in the final result — as observed in the spike.

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `CheckResult[]` | array | One entry per sub-agent, indicating whether evidence of invocation was found |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Empty evidence array | Empty result array | No checks to run |

---

### Orchestrator CLI

**Purpose**: CLI entry point that loads scenarios, runs them through the runner and validator, and produces the summary report.
**Consumers**: Developer via `npm run eval` or `node evals/run-evals.ts`
**Providers**: `evals/run-evals.ts`

#### Signature

```
run-evals [--case <name>] [--timeout <seconds>] [--fixture <path>]
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `--case` | string | No | Run only the named scenario (matches YAML `name` field) |
| `--timeout` | number | No | Override the default per-case timeout (seconds) |
| `--fixture` | string | No | Override the fixture directory path (defaults to `evals/fixture/`) |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| stdout | text | Summary report with per-case pass/fail status and overall result |
| exit code | number | `0` if all cases pass, `1` if any case fails |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| No scenario files found | Exit 1 with message | No YAML files in `evals/cases/` |
| `--case` name not found | Exit 1 with message | Named case does not match any scenario |
| `claude` CLI not available | Exit 1 with message | Fail-fast before running any cases |
| Neither OAuth nor `ANTHROPIC_API_KEY` configured | Exit 1 with message | Fail-fast before running any cases. Both auth methods are valid; confirmed working via the spike. |
| Fixture directory missing | Exit 1 with message | `evals/fixture/` does not exist |

## Events / Hooks

No events or hooks are published by the evals framework. It is a standalone CLI tool.

## Integration Boundaries

### Claude CLI (`claude --output-format stream-json -p`)

The primary external dependency. The runner invokes `claude --output-format stream-json -p "<prompt>"` as a child process with the fixture's temp copy as the working directory. The contract with the CLI is:

- **Input**: prompt string via `-p` flag with `--output-format stream-json`; working directory containing `.claude/` with deployed skills
- **Output**: newline-delimited JSON events on stdout (stream-json format); exit code 0 on success. Text is extracted from `assistant` events and the `result` event via `StreamParser`.
- **Auth**: Both OAuth (`claude login`) and `ANTHROPIC_API_KEY` work. Confirmed by spike (ran with OAuth only).
- **Assumption validated**: headless mode loads `.claude/commands/`, `.claude/prompts/`, and `.claude/agents/` from cwd — confirmed by spike (FINDINGS.md Assumption A: PASS).

### Smithy CLI (`smithy init`)

Used during fixture setup (either pre-baked into the committed fixture or run as part of eval setup). The contract is:

- **Input**: `smithy init -a claude -y` targeting the fixture directory
- **Output**: deployed skills in `.claude/commands/`, `.claude/prompts/`, `.claude/agents/`

### Filesystem (temp directories)

The runner creates a temp directory per eval case by copying the fixture. The contract is:

- Temp directories are created in the OS temp directory
- Each eval case gets a unique temp directory
- Temp directories are cleaned up after the case completes (regardless of pass/fail)
- The source fixture directory is verified unmodified via checksum after each case

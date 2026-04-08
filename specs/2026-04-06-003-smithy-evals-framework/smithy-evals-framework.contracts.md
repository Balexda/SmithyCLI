# Contracts: Smithy Evals Framework

## Overview

The evals framework has three internal integration boundaries: the runner (executes skills), the structural validator (checks output format), and the orchestrator (composes runner + validator into an eval pipeline). The primary external boundary is the `claude` CLI invoked via child process.

## Interfaces

### Runner

**Purpose**: Executes a single eval scenario by invoking `claude -p` against a copy of the reference fixture and returning the captured output.
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
| `output` | string | Raw stdout from `claude -p` |
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

**Purpose**: Checks whether expected sub-agents were invoked by looking for evidence patterns in the skill output.
**Consumers**: Orchestrator (`run-evals.ts`)
**Providers**: `evals/lib/structural.ts` (co-located with StructuralValidator — both operate on output strings with regex patterns, so they share a module despite being separate logical interfaces)

#### Signature

```
verifySubAgents(output: string, evidence: SubAgentEvidence[]): CheckResult[]
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `output` | string | Yes | The raw skill output to check |
| `evidence` | SubAgentEvidence[] | Yes | Agent name + pattern pairs from the scenario |

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
| API key not configured | Exit 1 with message | Fail-fast before running any cases |
| Fixture directory missing | Exit 1 with message | `evals/fixture/` does not exist |

## Events / Hooks

No events or hooks are published by the evals framework. It is a standalone CLI tool.

## Integration Boundaries

### Claude CLI (`claude -p`)

The primary external dependency. The runner invokes `claude -p "<prompt>"` as a child process with the fixture's temp copy as the working directory. The contract with the CLI is:

- **Input**: prompt string via `-p` flag, working directory containing `.claude/` with deployed skills
- **Output**: skill output on stdout, exit code 0 on success
- **Assumption**: headless mode loads `.claude/commands/`, `.claude/prompts/`, and `.claude/agents/` from cwd

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

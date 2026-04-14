/**
 * Shared types for the Smithy evals framework.
 *
 * These types mirror the data model defined in the spec:
 *   specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md
 *
 * StreamEvent is intentionally loose (optional fields, not a discriminated
 * union) so the parser tolerates new claude CLI event types without code
 * changes.
 */

// ---------------------------------------------------------------------------
// Stream parsing types (in-memory, transient)
// ---------------------------------------------------------------------------

/**
 * A single parsed line from the `claude --output-format stream-json` NDJSON
 * output. Typed loosely so that new/unknown event types pass through without
 * requiring code changes.
 */
export interface StreamEvent {
  type: string;
  message?: {
    content?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  } | undefined;
  /** Present on `result` events. */
  result?: string | undefined;
  /** Present on `result` events. */
  subtype?: string | undefined;
  /** Present on `result` events. */
  duration_ms?: number | undefined;
  /** Present on `result` events. */
  num_turns?: number | undefined;
  /** Allow any additional fields from unknown event types. */
  [key: string]: unknown;
}

/** Extracted from the final `result` stream event. */
export interface ResultSummary {
  text: string;
  subtype: string;
  duration_ms: number;
  num_turns: number;
}

/** A tool invocation extracted from assistant messages. */
export interface ToolUse {
  name: string;
  id: string;
  input: Record<string, unknown>;
}

/** A tool result extracted from user messages. */
export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

/** An Agent tool-use block paired with its result text. */
export interface AgentDispatch {
  id: string;
  description: string;
  prompt: string;
  resultText: string;
}

/** Aggregate summary produced by `summarizeEvents`. */
export interface EventSummary {
  eventCounts: Record<string, number>;
  toolUseCount: number;
  toolNames: string[];
  resultSubtype: string;
  durationMs: number;
  numTurns: number;
  textLength: number;
}

// ---------------------------------------------------------------------------
// Scenario / expectation types (from YAML definitions)
// ---------------------------------------------------------------------------

/** Structural checks to run against skill output. */
export interface StructuralExpectations {
  required_headings: string[];
  required_tables?: { columns: string[] }[] | undefined;
  forbidden_patterns?: string[] | undefined;
  required_patterns?: string[] | undefined;
}

/** Agent name + evidence pattern pair for sub-agent verification. */
export interface SubAgentEvidence {
  agent: string;
  pattern: string;
}

/** A single eval scenario loaded from YAML. */
export interface EvalScenario {
  name: string;
  skill: string;
  prompt: string;
  model?: string | undefined;
  timeout?: number | undefined;
  structural_expectations: StructuralExpectations;
  sub_agent_evidence?: SubAgentEvidence[] | undefined;
}

// ---------------------------------------------------------------------------
// Runner output
// ---------------------------------------------------------------------------

/** Output produced by `runScenario`. */
export interface RunOutput {
  extracted_text: string;
  stream_events: StreamEvent[];
  duration_ms: number;
  exit_code: number;
  timed_out: boolean;
}

// ---------------------------------------------------------------------------
// Check / result types (per-scenario output)
// ---------------------------------------------------------------------------

/** Result of a single structural or sub-agent check. */
export interface CheckResult {
  check_name: string;
  passed: boolean;
  expected?: string | undefined;
  actual?: string | undefined;
}

/** Result of running a single eval scenario. */
export interface EvalResult {
  scenario_name: string;
  status: 'pass' | 'fail' | 'timeout' | 'error';
  extracted_text: string;
  duration_ms: number;
  structural_checks: CheckResult[];
  sub_agent_checks?: CheckResult[] | undefined;
  error?: string | undefined;
}

// ---------------------------------------------------------------------------
// Aggregate report (across all scenarios in a single run)
// ---------------------------------------------------------------------------

/**
 * Aggregate summary across all scenarios in a single eval run.
 *
 * Mirrors the EvalReport entity in the data model (§4). Produced by
 * `buildReport` in `evals/lib/report.ts` and rendered to stdout by
 * `formatReport`. `overall_status` is `'pass'` only when every result in
 * `results` has status `'pass'`; any `fail`/`timeout`/`error` case flips it
 * to `'fail'`.
 */
export interface EvalReport {
  /** ISO 8601 timestamp marking when the run started (or was reported). */
  timestamp: string;
  /** Number of scenarios executed in this run. */
  total_cases: number;
  /** Count of scenarios with status `pass`. */
  passed: number;
  /** Count of scenarios with status `fail`, `timeout`, or `error`. */
  failed: number;
  /** `pass` only if every result passed; `fail` if any case did not. */
  overall_status: 'pass' | 'fail';
  /** Per-case results, in execution order. */
  results: EvalResult[];
  /** Total wall-clock time for the entire run, in milliseconds. */
  total_duration_ms: number;
}

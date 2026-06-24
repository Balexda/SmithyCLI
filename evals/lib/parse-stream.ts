/**
 * Utilities for parsing agent JSONL output.
 *
 * Agent stream output is newline-delimited JSON, one event per line.
 * Each event has a `type` field. Claude/Gemini emit assistant/user/result
 * stream-json events; Codex emits exec JSON events such as agent_message.
 *
 * Ported from `evals/spike/parse-stream.mjs` with the following changes:
 * - `parseStreamFile` removed (file I/O is the runner's concern)
 * - `countEventTypes` inlined into `summarizeEvents`
 * - `extractCanonicalText` added (FR-001 precedence rule)
 */

import type {
  StreamEvent,
  ResultSummary,
  ToolUse,
  ToolResult,
  AgentDispatch,
  EventSummary,
  TokenTotals,
} from './types.js';

/**
 * Parse a stream-json string into an array of event objects.
 * Empty content returns []. Malformed JSON lines throw SyntaxError.
 */
export function parseStreamString(content: string): StreamEvent[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as StreamEvent;
    } catch (err) {
      const lineNum = index + 1;
      const preview = line.length > 120 ? line.slice(0, 120) + '\u2026' : line;
      const message = err instanceof Error ? err.message : String(err);
      throw new SyntaxError(
        `stream-json parse error at line ${lineNum}: ${message}\n  ${preview}`,
      );
    }
  });
}

/**
 * Extract all assistant text content from events.
 * Concatenates text blocks from assistant messages in order.
 */
export function extractText(events: StreamEvent[]): string {
  const texts: string[] = [];
  for (const event of events) {
    if (event.type === 'assistant' && typeof event.message === 'object') {
      const content = event.message.content ?? [];
      for (const block of content) {
        if (block['type'] === 'text') {
          texts.push(block['text'] as string);
        }
      }
    }

    if (
      (event.type === 'agent_message' || event.type === 'assistant_message') &&
      typeof event.message === 'string'
    ) {
      texts.push(event.message);
    }

    const item = getObjectField(event, 'item') ?? getObjectField(event, 'payload');
    if (
      item &&
      (event.type === 'item.completed' || event.type === 'response_item') &&
      item['type'] === 'agent_message' &&
      typeof item['text'] === 'string'
    ) {
      texts.push(item['text']);
    }

    if (
      item &&
      (event.type === 'item.completed' || event.type === 'response_item') &&
      item['type'] === 'message' &&
      item['role'] === 'assistant'
    ) {
      texts.push(...extractContentText(item['content']));
    }
  }
  return texts.join('\n');
}

/**
 * Extract the final result from the stream.
 * Returns null if no result event is found.
 */
export function extractResult(events: StreamEvent[]): ResultSummary | null {
  const resultEvent = events.findLast((e) => e.type === 'result');
  if (!resultEvent) return null;
  return {
    text: resultEvent.result ?? '',
    subtype: resultEvent.subtype ?? 'unknown',
    duration_ms: resultEvent.duration_ms ?? 0,
    num_turns: resultEvent.num_turns ?? 0,
  };
}

/**
 * Extract all tool uses from assistant messages.
 */
export function extractToolUses(events: StreamEvent[]): ToolUse[] {
  const tools: ToolUse[] = [];
  for (const event of events) {
    if (event.type !== 'assistant' || typeof event.message !== 'object') continue;
    const content = event.message.content ?? [];
    for (const block of content) {
      if (block['type'] === 'tool_use') {
        tools.push({
          name: block['name'] as string,
          id: block['id'] as string,
          input: (block['input'] as Record<string, unknown>) ?? {},
        });
      }
    }
  }
  return tools;
}

/**
 * Extract tool results from user messages.
 *
 * `tool_result.content` arrives in one of two shapes from the claude CLI:
 *
 * 1. A plain string (typical for `Bash`, `Read`, etc.) — kept verbatim.
 * 2. An array of content blocks (typical for `Agent` tool dispatches and any
 *    sub-agent that returns structured content) — each `{type: "text", text}`
 *    block's `text` field is concatenated with newlines, mirroring how
 *    `extractText` flattens assistant messages. Non-text blocks are ignored.
 *
 * Returning the concatenated text (rather than a JSON-stringified array) lets
 * scenario authors write regex patterns against the actual output — newline
 * handling is consistent with `extracted_text`, and the trailing
 * `agentId: ... <usage>` metadata footer that claude appends to Agent results
 * stays out of the way (it's a separate text block, but it doesn't double-
 * escape `\n` characters into the literal `\n` substring that pollutes
 * pattern matching).
 *
 * As a last resort — for genuinely opaque content shapes (objects, etc.) —
 * the value is JSON-stringified to keep the field a string.
 */
export function extractToolResults(events: StreamEvent[]): ToolResult[] {
  const results: ToolResult[] = [];
  for (const event of events) {
    if (event.type !== 'user' || typeof event.message !== 'object') continue;
    const content = event.message.content ?? [];
    for (const block of content) {
      if (block['type'] === 'tool_result') {
        const blockContent = block['content'];
        let text: string;
        if (typeof blockContent === 'string') {
          text = blockContent;
        } else if (Array.isArray(blockContent)) {
          text = (blockContent as Array<Record<string, unknown>>)
            .filter((b) => b['type'] === 'text' && typeof b['text'] === 'string')
            .map((b) => b['text'] as string)
            .join('\n');
        } else {
          text = JSON.stringify(blockContent);
        }
        results.push({
          tool_use_id: block['tool_use_id'] as string,
          content: text,
          is_error: (block['is_error'] as boolean) ?? false,
        });
      }
    }
  }
  return results;
}

/**
 * Extract sub-agent dispatches (Agent tool uses) and their results.
 * Supports both Claude's `Agent` tool and Gemini's `invoke_agent` tool.
 */
export function extractSubAgentDispatches(
  events: StreamEvent[],
): AgentDispatch[] {
  const toolUses = extractToolUses(events);
  const toolResults = extractToolResults(events);
  const resultMap = new Map(toolResults.map((r) => [r.tool_use_id, r]));

  return toolUses
    .filter((t) => t.name === 'Agent' || t.name === 'invoke_agent')
    .map((t) => {
      // Claude `Agent` uses { description, prompt }
      // Gemini `invoke_agent` uses { agent_name, prompt }
      const description = (t.input['description'] ?? t.input['agent_name'] ?? '') as string;
      const prompt = (t.input['prompt'] ?? '') as string;
      return {
        id: t.id,
        description,
        prompt,
        resultText: resultMap.get(t.id)?.content ?? '',
      };
    });
}

/**
 * Produce a summary of a stream-json run.
 * countEventTypes is inlined — not a separate export.
 */
export function summarizeEvents(events: StreamEvent[]): EventSummary {
  // Inline countEventTypes
  const eventCounts: Record<string, number> = {};
  for (const event of events) {
    const type = event.type ?? 'unknown';
    eventCounts[type] = (eventCounts[type] ?? 0) + 1;
  }

  const toolUses = extractToolUses(events);
  const result = extractResult(events);
  const text = extractText(events);
  const toolNames = [...new Set(toolUses.map((t) => t.name))];

  return {
    eventCounts,
    toolUseCount: toolUses.length,
    toolNames,
    resultSubtype: result?.subtype ?? 'none',
    durationMs: result?.duration_ms ?? 0,
    numTurns: result?.num_turns ?? 0,
    textLength: text.length,
  };
}

/**
 * Extract the canonical text from a stream, using FR-001 precedence:
 * - Return result.text if a result event is present with non-empty text
 * - Otherwise return the concatenation of assistant text blocks
 * - Never combine both sources (the duplicate-output issue from FINDINGS.md
 *   item 6 means naive concatenation produces false double-matches)
 */
export function extractCanonicalText(events: StreamEvent[]): string {
  const result = extractResult(events);
  if (result && result.text.length > 0) {
    return result.text;
  }
  return extractText(events);
}

/**
 * Extract normalized token totals from stream usage metadata.
 *
 * Terminal `result` events report cumulative totals when present, so they take
 * precedence over non-terminal usage to avoid double-counting. If no terminal
 * result has valid usage, valid non-terminal usage values are summed.
 */
export function extractTokenTotals(events: StreamEvent[]): TokenTotals {
  const terminalUsages = events
    .filter((event) => event.type === 'result')
    .map((event) => normalizeUsage(event.usage))
    .filter(hasUsageValue);

  if (terminalUsages.length > 0) {
    return terminalUsages.reduce<TokenTotals>(
      (totals, usage) => ({
        input: Math.max(totals.input, usage.input ?? 0),
        output: Math.max(totals.output, usage.output ?? 0),
      }),
      zeroTokenTotals(),
    );
  }

  return events
    .filter((event) => event.type !== 'result')
    .map((event) => normalizeUsage(event.usage))
    .reduce<TokenTotals>(
      (totals, usage) => ({
        input: totals.input + (usage.input ?? 0),
        output: totals.output + (usage.output ?? 0),
      }),
      zeroTokenTotals(),
    );
}

function getObjectField(
  object: Record<string, unknown>,
  field: string,
): Record<string, unknown> | undefined {
  const value = object[field];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function extractContentText(content: unknown): string[] {
  if (!Array.isArray(content)) return [];

  return (content as Array<Record<string, unknown>>)
    .flatMap((block) => {
      if (typeof block['text'] === 'string') return [block['text']];
      if (typeof block['output_text'] === 'string') return [block['output_text']];
      return [];
    });
}

interface NormalizedUsage {
  input?: number | undefined;
  output?: number | undefined;
}

function normalizeUsage(usage: unknown): NormalizedUsage {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return {};
  }

  const usageRecord = usage as Record<string, unknown>;
  return {
    input: normalizeTokenCount(usageRecord['input_tokens']),
    output: normalizeTokenCount(usageRecord['output_tokens']),
  };
}

function normalizeTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : undefined;
}

function hasUsageValue(usage: NormalizedUsage): boolean {
  return usage.input !== undefined || usage.output !== undefined;
}

function zeroTokenTotals(): TokenTotals {
  return { input: 0, output: 0 };
}

/**
 * Utilities for parsing `claude --output-format stream-json` output.
 *
 * Stream-json output is newline-delimited JSON, one event per line.
 * Each event has a `type` field: system, assistant, user, result, rate_limit_event.
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
    if (event.type !== 'assistant') continue;
    const content = event.message?.content ?? [];
    for (const block of content) {
      if (block['type'] === 'text') {
        texts.push(block['text'] as string);
      }
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
    if (event.type !== 'assistant') continue;
    const content = event.message?.content ?? [];
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
    if (event.type !== 'user') continue;
    const content = event.message?.content ?? [];
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
 */
export function extractSubAgentDispatches(
  events: StreamEvent[],
): AgentDispatch[] {
  const toolUses = extractToolUses(events);
  const toolResults = extractToolResults(events);
  const resultMap = new Map(toolResults.map((r) => [r.tool_use_id, r]));

  return toolUses
    .filter((t) => t.name === 'Agent')
    .map((t) => ({
      id: t.id,
      description: (t.input['description'] as string) ?? '',
      prompt: (t.input['prompt'] as string) ?? '',
      resultText: resultMap.get(t.id)?.content ?? '',
    }));
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

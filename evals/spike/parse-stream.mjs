/**
 * Utilities for parsing `claude --output-format stream-json` output.
 *
 * Stream-json output is newline-delimited JSON, one event per line.
 * Each event has a `type` field: system, assistant, user, result, rate_limit_event.
 *
 * Usage:
 *   import { parseStreamFile, extractText, extractToolUses, extractResult, summarizeEvents } from './parse-stream.mjs';
 *   const events = await parseStreamFile('output-strike-raw.json');
 *   const text = extractText(events);
 *   const result = extractResult(events);
 */

import { readFile } from "node:fs/promises";

/**
 * Parse a stream-json file into an array of event objects.
 * @param {string} filePath - Path to the stream-json file
 * @returns {Promise<object[]>} Array of parsed event objects
 */
export async function parseStreamFile(filePath) {
  const content = await readFile(filePath, "utf-8");
  return parseStreamString(content);
}

/**
 * Parse a stream-json string into an array of event objects.
 * @param {string} content - Raw stream-json content (newline-delimited JSON)
 * @returns {object[]} Array of parsed event objects
 */
export function parseStreamString(content) {
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

/**
 * Extract all assistant text content from events.
 * Concatenates text blocks from assistant messages in order.
 * @param {object[]} events - Parsed stream events
 * @returns {string} All assistant text joined with newlines
 */
export function extractText(events) {
  const texts = [];
  for (const event of events) {
    if (event.type !== "assistant") continue;
    const content = event.message?.content ?? [];
    for (const block of content) {
      if (block.type === "text") {
        texts.push(block.text);
      }
    }
  }
  return texts.join("\n");
}

/**
 * Extract the final result text from the stream.
 * @param {object[]} events - Parsed stream events
 * @returns {{ text: string, subtype: string, duration_ms: number, num_turns: number } | null}
 */
export function extractResult(events) {
  const resultEvent = events.find((e) => e.type === "result");
  if (!resultEvent) return null;
  return {
    text: resultEvent.result ?? "",
    subtype: resultEvent.subtype ?? "unknown",
    duration_ms: resultEvent.duration_ms ?? 0,
    num_turns: resultEvent.num_turns ?? 0,
  };
}

/**
 * Extract all tool uses from assistant messages.
 * @param {object[]} events - Parsed stream events
 * @returns {{ name: string, id: string, input: object }[]}
 */
export function extractToolUses(events) {
  const tools = [];
  for (const event of events) {
    if (event.type !== "assistant") continue;
    const content = event.message?.content ?? [];
    for (const block of content) {
      if (block.type === "tool_use") {
        tools.push({
          name: block.name,
          id: block.id,
          input: block.input,
        });
      }
    }
  }
  return tools;
}

/**
 * Extract tool results from user messages.
 * @param {object[]} events - Parsed stream events
 * @returns {{ tool_use_id: string, content: string, is_error: boolean }[]}
 */
export function extractToolResults(events) {
  const results = [];
  for (const event of events) {
    if (event.type !== "user") continue;
    const content = event.message?.content ?? [];
    for (const block of content) {
      if (block.type === "tool_result") {
        results.push({
          tool_use_id: block.tool_use_id,
          content:
            typeof block.content === "string"
              ? block.content
              : JSON.stringify(block.content),
          is_error: block.is_error ?? false,
        });
      }
    }
  }
  return results;
}

/**
 * Count events by type.
 * @param {object[]} events - Parsed stream events
 * @returns {Record<string, number>}
 */
export function countEventTypes(events) {
  const counts = {};
  for (const event of events) {
    const type = event.type ?? "unknown";
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

/**
 * Produce a summary of a stream-json run.
 * @param {object[]} events - Parsed stream events
 * @returns {{ eventCounts: Record<string, number>, toolUseCount: number, toolNames: string[], resultSubtype: string, durationMs: number, numTurns: number, textLength: number }}
 */
export function summarizeEvents(events) {
  const eventCounts = countEventTypes(events);
  const toolUses = extractToolUses(events);
  const result = extractResult(events);
  const text = extractText(events);
  const toolNames = [...new Set(toolUses.map((t) => t.name))];

  return {
    eventCounts,
    toolUseCount: toolUses.length,
    toolNames,
    resultSubtype: result?.subtype ?? "none",
    durationMs: result?.duration_ms ?? 0,
    numTurns: result?.num_turns ?? 0,
    textLength: text.length,
  };
}

/**
 * Extract sub-agent dispatches (Agent tool uses) and their results.
 * @param {object[]} events - Parsed stream events
 * @returns {{ id: string, description: string, prompt: string, resultText: string }[]}
 */
export function extractSubAgentDispatches(events) {
  const toolUses = extractToolUses(events);
  const toolResults = extractToolResults(events);
  const resultMap = new Map(toolResults.map((r) => [r.tool_use_id, r]));

  return toolUses
    .filter((t) => t.name === "Agent")
    .map((t) => ({
      id: t.id,
      description: t.input?.description ?? "",
      prompt: t.input?.prompt ?? "",
      resultText: resultMap.get(t.id)?.content ?? "",
    }));
}

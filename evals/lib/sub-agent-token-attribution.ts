import { extractToolUses } from './parse-stream.js';
import type {
  DispatchUsageRecord,
  StreamEvent,
  SubAgentTokenTotals,
  ToolUse,
} from './types.js';

interface TokenPair {
  input: number;
  output: number;
}

interface DispatchUsage {
  dispatchId: string;
  usage: TokenPair;
}

const DISPATCH_TOOL_NAMES = new Set(['Agent', 'invoke_agent']);

/**
 * Extract normalized token usage records that are reliably tied to a known
 * sub-agent dispatch by stable dispatch identifier.
 *
 * A dispatch reports usage in one of two shapes, and they are not additive:
 *
 * 1. On completion, the `tool_result` event carries `tool_use_result.usage`,
 *    which is the authoritative total for the whole dispatch (its token fields
 *    sum to the sibling `totalTokens`). This is preferred whenever present.
 * 2. While in flight, the sub-agent's own assistant turns carry message-level
 *    usage. These are only a partial view, so they are used solely as a
 *    fallback for dispatches that never produced a completion record.
 */
export function extractDispatchUsageRecords(
  events: StreamEvent[],
): DispatchUsageRecord[] {
  const dispatches = indexDispatches(events);
  const completed = new Map<string, TokenPair>();
  const inFlight = new Map<string, TokenPair>();
  const seenSnapshots = new Set<string>();

  events.forEach((event, index) => {
    const completion = observeCompletedUsage(event, dispatches);
    if (completion) {
      completed.set(completion.dispatchId, completion.usage);
      return;
    }

    const snapshot = observeInFlightUsage(event, dispatches);
    if (!snapshot) return;

    // One assistant message is re-emitted once per content block and repeats
    // the same message-level usage on every copy, so count each message once.
    const messageKey = messageId(event) ?? `event-${index}`;
    const snapshotKey = `${snapshot.dispatchId}:${messageKey}`;
    if (seenSnapshots.has(snapshotKey)) return;
    seenSnapshots.add(snapshotKey);

    const running = inFlight.get(snapshot.dispatchId) ?? { input: 0, output: 0 };
    inFlight.set(snapshot.dispatchId, {
      input: running.input + snapshot.usage.input,
      output: running.output + snapshot.usage.output,
    });
  });

  return [...dispatches.entries()].flatMap(([dispatchId, agent]) => {
    const usage = completed.get(dispatchId) ?? inFlight.get(dispatchId);
    if (!usage) return [];

    return [
      {
        dispatch_id: dispatchId,
        agent,
        input: usage.input,
        output: usage.output,
      },
    ];
  });
}

/**
 * Aggregate dispatch-attributable usage into stable per-sub-agent token rows
 * for one scenario. Unattributable parent-level usage intentionally produces
 * no rows; the existing per-case token total remains the authoritative total.
 */
export function extractSubAgentTokenTotals(
  events: StreamEvent[],
): SubAgentTokenTotals[] {
  const totals = new Map<
    string,
    { input: number; output: number; dispatchIds: Set<string> }
  >();

  for (const record of extractDispatchUsageRecords(events)) {
    const current =
      totals.get(record.agent) ?? { input: 0, output: 0, dispatchIds: new Set<string>() };
    current.input += record.input;
    current.output += record.output;
    current.dispatchIds.add(record.dispatch_id);
    totals.set(record.agent, current);
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([agent, total]) => ({
      agent,
      input: total.input,
      output: total.output,
      dispatch_count: total.dispatchIds.size,
    }));
}

/** Map every observed sub-agent dispatch id to its stable display name. */
function indexDispatches(events: StreamEvent[]): Map<string, string> {
  return new Map(
    extractToolUses(events)
      .filter(isSubAgentDispatch)
      .filter((toolUse) => typeof toolUse.id === 'string' && toolUse.id.length > 0)
      .map((toolUse) => [toolUse.id, displayNameForDispatch(toolUse)]),
  );
}

/**
 * Read the authoritative usage a finished dispatch reports on its tool_result
 * event. The dispatch id lives on the `tool_result` content block rather than
 * at the top level of the event.
 */
function observeCompletedUsage(
  event: StreamEvent,
  dispatches: Map<string, string>,
): DispatchUsage | null {
  const result = event['tool_use_result'];
  if (!isRecord(result)) return null;

  const usage = normalizeTokens(result['usage']);
  if (!usage) return null;

  const dispatchId = completedDispatchId(event, dispatches);
  if (!dispatchId) return null;

  return { dispatchId, usage };
}

function observeInFlightUsage(
  event: StreamEvent,
  dispatches: Map<string, string>,
): DispatchUsage | null {
  const usage = normalizeTokens(getUsageObject(event));
  if (!usage) return null;

  const dispatchId = getDispatchId(event, dispatches);
  if (!dispatchId) return null;

  return { dispatchId, usage };
}

function completedDispatchId(
  event: StreamEvent,
  dispatches: Map<string, string>,
): string | undefined {
  for (const block of contentBlocks(event)) {
    const toolUseId = block['tool_use_id'];
    if (typeof toolUseId === 'string' && dispatches.has(toolUseId)) {
      return toolUseId;
    }
  }

  return getDispatchId(event, dispatches);
}

function getDispatchId(
  event: StreamEvent,
  dispatches: Map<string, string>,
): string | undefined {
  const parentToolUseId = event['parent_tool_use_id'];
  if (typeof parentToolUseId === 'string' && dispatches.has(parentToolUseId)) {
    return parentToolUseId;
  }

  const toolUseId = event['tool_use_id'];
  if (typeof toolUseId === 'string' && dispatches.has(toolUseId)) {
    return toolUseId;
  }

  return undefined;
}

function contentBlocks(event: StreamEvent): Record<string, unknown>[] {
  if (!isRecord(event.message)) return [];
  const content = event.message['content'];
  return Array.isArray(content) ? content.filter(isRecord) : [];
}

function messageId(event: StreamEvent): string | undefined {
  if (!isRecord(event.message)) return undefined;
  return stringField(event.message['id']);
}

function getUsageObject(event: StreamEvent): Record<string, unknown> | null {
  if (isRecord(event['usage'])) return event['usage'];
  if (isRecord(event.message) && isRecord(event.message['usage'])) {
    return event.message['usage'];
  }
  if (isRecord(event['item']) && isRecord(event['item']['usage'])) {
    return event['item']['usage'];
  }
  if (isRecord(event['payload']) && isRecord(event['payload']['usage'])) {
    return event['payload']['usage'];
  }
  return null;
}

function isSubAgentDispatch(toolUse: ToolUse): boolean {
  return DISPATCH_TOOL_NAMES.has(toolUse.name);
}

/**
 * Prefer the stable sub-agent type over the per-dispatch task label so
 * repeated dispatches of one sub-agent aggregate into a single row.
 */
function displayNameForDispatch(toolUse: ToolUse): string {
  return (
    stringField(toolUse.input['subagent_type']) ??
    stringField(toolUse.input['agent_name']) ??
    stringField(toolUse.input['description']) ??
    fallbackDisplayName(toolUse.id)
  );
}

function fallbackDisplayName(dispatchId: string): string {
  return `unknown sub-agent ${dispatchId}`;
}

function stringField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Malformed token fields are dropped rather than coerced. */
function normalizeTokens(usage: unknown): TokenPair | null {
  if (!isRecord(usage)) return null;

  const input = normalizeTokenCount(usage['input_tokens']);
  const output = normalizeTokenCount(usage['output_tokens']);
  if (input === undefined && output === undefined) return null;

  return { input: input ?? 0, output: output ?? 0 };
}

function normalizeTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

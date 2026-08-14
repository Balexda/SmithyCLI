import { extractToolUses } from './parse-stream.js';
import type {
  DispatchUsageRecord,
  StreamEvent,
  SubAgentTokenTotals,
  ToolUse,
} from './types.js';

interface UsageObservation {
  dispatchId?: string | undefined;
  input?: number | undefined;
  output?: number | undefined;
}

const DISPATCH_TOOL_NAMES = new Set(['Agent', 'invoke_agent']);

/**
 * Extract normalized token usage records that are reliably tied to a known
 * sub-agent dispatch by stable dispatch identifier.
 */
export function extractDispatchUsageRecords(
  events: StreamEvent[],
): DispatchUsageRecord[] {
  const dispatches = new Map(
    extractToolUses(events)
      .filter(isSubAgentDispatch)
      .filter((toolUse) => typeof toolUse.id === 'string' && toolUse.id.length > 0)
      .map((toolUse) => [toolUse.id, displayNameForDispatch(toolUse)]),
  );

  return events.flatMap((event) => {
    const observation = observeDispatchUsage(event, dispatches);
    if (!observation?.dispatchId) return [];

    return [
      {
        dispatch_id: observation.dispatchId,
        agent: dispatches.get(observation.dispatchId) ?? fallbackDisplayName(observation.dispatchId),
        input: observation.input ?? 0,
        output: observation.output ?? 0,
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

function observeDispatchUsage(
  event: StreamEvent,
  dispatches: Map<string, string>,
): UsageObservation | null {
  const usage = getUsageObject(event);
  if (!usage) return null;

  const dispatchId = getDispatchId(event, dispatches);
  if (!dispatchId) return null;

  const input = normalizeTokenCount(usage['input_tokens']);
  const output = normalizeTokenCount(usage['output_tokens']);
  if (input === undefined && output === undefined) return null;

  return { dispatchId, input, output };
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

function displayNameForDispatch(toolUse: ToolUse): string {
  const configuredName =
    toolUse.name === 'invoke_agent'
      ? stringField(toolUse.input['agent_name'])
      : stringField(toolUse.input['description']);
  return configuredName ?? fallbackDisplayName(toolUse.id);
}

function fallbackDisplayName(dispatchId: string): string {
  return `unknown sub-agent ${dispatchId}`;
}

function stringField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

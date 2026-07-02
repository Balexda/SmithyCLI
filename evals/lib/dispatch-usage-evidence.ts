import { extractToolUses } from './parse-stream.js';
import type { DispatchUsageEvidence, StreamEvent } from './types.js';

export interface DispatchUsageEvidenceOptions {
  sourceCapture?: string;
  reviewedAt?: string;
}

interface UsageObservation {
  relationship?: 'parent_tool_use_id' | 'tool_use_id';
  dispatchId?: string;
  hasValidUsage: boolean;
}

const TOKEN_USAGE_FIELDS = [
  'input_tokens',
  'output_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
  'total_tokens',
] as const;

/**
 * Classify whether parsed stream usage metadata is attributable to sub-agent
 * dispatches. This intentionally stops at evidence classification; it does not
 * compute token totals or alter report rendering.
 */
export function classifyDispatchUsageEvidence(
  events: StreamEvent[],
  options: DispatchUsageEvidenceOptions = {},
): DispatchUsageEvidence {
  const source_capture = options.sourceCapture ?? 'unknown';
  const reviewed_at = options.reviewedAt ?? new Date().toISOString();
  const dispatchIds = new Set(
    extractToolUses(events)
      .filter((toolUse) => toolUse.name === 'Agent' || toolUse.name === 'invoke_agent')
      .map((toolUse) => toolUse.id)
      .filter((id) => typeof id === 'string' && id.length > 0),
  );

  const observations = events
    .map((event) => observeUsage(event, dispatchIds))
    .filter((observation): observation is UsageObservation => observation !== null);

  const attributable = observations.filter(
    (observation) => observation.hasValidUsage && observation.dispatchId,
  );

  if (attributable.length > 0) {
    const relationships = unique(
      attributable.map(
        (observation) => `${observation.relationship}=${observation.dispatchId}`,
      ),
    );
    const ignoredCount = observations.length - attributable.length;
    const ignoredSuffix =
      ignoredCount > 0
        ? `; ignored ${ignoredCount} malformed, partial, or unattributable usage record(s)`
        : '';
    return {
      classification: 'dispatch_attributable',
      source_capture,
      observed_relationship:
        `Usage metadata has a stable dispatch relationship via ${relationships.join(', ')}` +
        ignoredSuffix,
      reviewed_at,
    };
  }

  const validUsageCount = observations.filter(
    (observation) => observation.hasValidUsage,
  ).length;
  const observed_relationship =
    validUsageCount > 0
      ? `Observed ${validUsageCount} parseable usage record(s), but none included parent_tool_use_id or tool_use_id matching a known Agent dispatch`
      : 'No parseable usage metadata with non-negative token counts was observed';

  return {
    classification: 'parent_only',
    source_capture,
    observed_relationship,
    reviewed_at,
  };
}

function observeUsage(
  event: StreamEvent,
  dispatchIds: Set<string>,
): UsageObservation | null {
  const usage = getUsageObject(event);
  if (!usage) return null;

  const relationship = getDispatchRelationship(event, dispatchIds);
  return {
    ...relationship,
    hasValidUsage: hasValidTokenUsage(usage),
  };
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

function getDispatchRelationship(
  event: StreamEvent,
  dispatchIds: Set<string>,
): Pick<UsageObservation, 'relationship' | 'dispatchId'> {
  const parentToolUseId = event['parent_tool_use_id'];
  if (typeof parentToolUseId === 'string' && dispatchIds.has(parentToolUseId)) {
    return { relationship: 'parent_tool_use_id', dispatchId: parentToolUseId };
  }

  const toolUseId = event['tool_use_id'];
  if (typeof toolUseId === 'string' && dispatchIds.has(toolUseId)) {
    return { relationship: 'tool_use_id', dispatchId: toolUseId };
  }

  return {};
}

function hasValidTokenUsage(usage: Record<string, unknown>): boolean {
  return TOKEN_USAGE_FIELDS.some((field) => isNonNegativeInteger(usage[field]));
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

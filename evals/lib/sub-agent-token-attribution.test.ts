import { describe, expect, it } from 'vitest';
import {
  extractDispatchUsageRecords,
  extractSubAgentTokenTotals,
} from './sub-agent-token-attribution.js';
import type { StreamEvent } from './types.js';

function dispatchEvent(
  id: string,
  input: Record<string, unknown>,
  name = 'Agent',
): StreamEvent {
  return {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          name,
          id,
          input,
        },
      ],
    },
  };
}

function usageEvent(
  dispatchId: string | null,
  usage: Record<string, unknown>,
  relationship: 'parent_tool_use_id' | 'tool_use_id' = 'parent_tool_use_id',
): StreamEvent {
  return {
    type: 'assistant',
    [relationship]: dispatchId,
    message: {
      content: [{ type: 'text', text: 'sub-agent output' }],
      usage,
    },
  };
}

describe('extractDispatchUsageRecords', () => {
  it('normalizes usage tied to an Agent dispatch by parent_tool_use_id', () => {
    const events: StreamEvent[] = [
      dispatchEvent('toolu_agent_1', {
        description: 'Scout repo',
        prompt: 'scan',
      }),
      usageEvent('toolu_agent_1', { input_tokens: 17, output_tokens: 5 }),
    ];

    expect(extractDispatchUsageRecords(events)).toEqual([
      {
        dispatch_id: 'toolu_agent_1',
        agent: 'Scout repo',
        input: 17,
        output: 5,
      },
    ]);
  });

  it('normalizes usage tied to an invoke_agent dispatch by tool_use_id', () => {
    const events: StreamEvent[] = [
      dispatchEvent(
        'toolu_gemini_1',
        { agent_name: 'smithy-plan', prompt: 'plan' },
        'invoke_agent',
      ),
      usageEvent(
        'toolu_gemini_1',
        { input_tokens: 23, output_tokens: 7 },
        'tool_use_id',
      ),
    ];

    expect(extractDispatchUsageRecords(events)).toEqual([
      {
        dispatch_id: 'toolu_gemini_1',
        agent: 'smithy-plan',
        input: 23,
        output: 7,
      },
    ]);
  });

  it('ignores parent-only, ambiguous, and malformed usage records', () => {
    const events: StreamEvent[] = [
      dispatchEvent('toolu_agent_1', {
        description: 'Scout repo',
        prompt: 'scan',
      }),
      usageEvent(null, { input_tokens: 10, output_tokens: 2 }),
      usageEvent('unknown_dispatch', { input_tokens: 10, output_tokens: 2 }),
      usageEvent('toolu_agent_1', {
        input_tokens: '10',
        output_tokens: Number.POSITIVE_INFINITY,
        total_tokens: 12,
      }),
    ];

    expect(extractDispatchUsageRecords(events)).toEqual([]);
  });

  it('keeps failed dispatches attributable when usage is parseable', () => {
    const events: StreamEvent[] = [
      dispatchEvent('toolu_agent_1', {
        description: 'Scout repo',
        prompt: 'scan',
      }),
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_agent_1',
              is_error: true,
              content: 'failed',
            },
          ],
        },
      },
      usageEvent('toolu_agent_1', { input_tokens: 9, output_tokens: 0 }),
    ];

    expect(extractDispatchUsageRecords(events)).toEqual([
      {
        dispatch_id: 'toolu_agent_1',
        agent: 'Scout repo',
        input: 9,
        output: 0,
      },
    ]);
  });
});

describe('extractSubAgentTokenTotals', () => {
  it('aggregates repeated dispatches of the same sub-agent into one stable row', () => {
    const events: StreamEvent[] = [
      dispatchEvent('toolu_agent_1', {
        description: 'Scout repo',
        prompt: 'scan once',
      }),
      dispatchEvent('toolu_agent_2', {
        description: 'Scout repo',
        prompt: 'scan twice',
      }),
      dispatchEvent('toolu_agent_3', {
        description: 'Plan change',
        prompt: 'plan',
      }),
      usageEvent('toolu_agent_2', { input_tokens: 10, output_tokens: 2 }),
      usageEvent('toolu_agent_1', { input_tokens: 7, output_tokens: 3 }),
      usageEvent('toolu_agent_3', { input_tokens: 5, output_tokens: 1 }),
    ];

    expect(extractSubAgentTokenTotals(events)).toEqual([
      {
        agent: 'Plan change',
        input: 5,
        output: 1,
        dispatch_count: 1,
      },
      {
        agent: 'Scout repo',
        input: 17,
        output: 5,
        dispatch_count: 2,
      },
    ]);
  });

  it('uses deterministic fallback names for unknown or malformed labels', () => {
    const events: StreamEvent[] = [
      dispatchEvent('toolu_agent_1', {
        description: '',
        prompt: 'scan',
      }),
      dispatchEvent('toolu_agent_2', {
        description: { nested: 'bad' },
        prompt: 'scan',
      }),
      usageEvent('toolu_agent_2', { input_tokens: 3, output_tokens: 1 }),
      usageEvent('toolu_agent_1', { input_tokens: 2, output_tokens: 1 }),
    ];

    expect(extractSubAgentTokenTotals(events)).toEqual([
      {
        agent: 'unknown sub-agent toolu_agent_1',
        input: 2,
        output: 1,
        dispatch_count: 1,
      },
      {
        agent: 'unknown sub-agent toolu_agent_2',
        input: 3,
        output: 1,
        dispatch_count: 1,
      },
    ]);
  });

  it('returns empty totals for unattributable usage so per-case totals remain authoritative elsewhere', () => {
    const events: StreamEvent[] = [
      dispatchEvent('toolu_agent_1', {
        description: 'Scout repo',
        prompt: 'scan',
      }),
      usageEvent(null, { input_tokens: 10, output_tokens: 2 }),
      usageEvent('unknown_dispatch', { input_tokens: 4, output_tokens: 1 }),
    ];

    expect(extractSubAgentTokenTotals(events)).toEqual([]);
  });

  it('ignores malformed token fields while preserving parseable fields as non-negative integers', () => {
    const events: StreamEvent[] = [
      dispatchEvent('toolu_agent_1', {
        description: 'Scout repo',
        prompt: 'scan',
      }),
      usageEvent('toolu_agent_1', {
        input_tokens: 6,
        output_tokens: 'bad',
      }),
    ];

    expect(extractSubAgentTokenTotals(events)).toEqual([
      {
        agent: 'Scout repo',
        input: 6,
        output: 0,
        dispatch_count: 1,
      },
    ]);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseStreamString } from './parse-stream.js';
import {
  extractDispatchUsageRecords,
  extractSubAgentTokenTotals,
} from './sub-agent-token-attribution.js';
import type { StreamEvent } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const capturesDir = path.resolve(here, '..', 'captures');

function loadCapture(name: string): StreamEvent[] {
  return parseStreamString(
    fs.readFileSync(path.resolve(capturesDir, `${name}.events.jsonl`), 'utf8'),
  );
}

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

/**
 * The completion shape a finished Claude Agent dispatch emits: a user
 * `tool_result` event carrying the dispatch id on the content block and the
 * authoritative usage under `tool_use_result.usage`.
 */
function completionEvent(
  dispatchId: string,
  usage: Record<string, unknown>,
): StreamEvent {
  return {
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: dispatchId,
          content: [{ type: 'text', text: 'sub-agent report' }],
        },
      ],
    },
    tool_use_result: {
      status: 'completed',
      agentType: 'smithy-scout',
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

  it('reads the authoritative usage a completed dispatch reports on tool_use_result', () => {
    const events: StreamEvent[] = [
      dispatchEvent('toolu_agent_1', {
        subagent_type: 'smithy-scout',
        description: 'Scout repo',
      }),
      completionEvent('toolu_agent_1', {
        input_tokens: 1,
        output_tokens: 435,
        cache_read_input_tokens: 4467,
      }),
    ];

    expect(extractDispatchUsageRecords(events)).toEqual([
      {
        dispatch_id: 'toolu_agent_1',
        agent: 'smithy-scout',
        input: 1,
        output: 435,
      },
    ]);
  });

  it('prefers completion usage over in-flight snapshots instead of summing both', () => {
    const events: StreamEvent[] = [
      dispatchEvent('toolu_agent_1', { subagent_type: 'smithy-scout' }),
      usageEvent('toolu_agent_1', { input_tokens: 3, output_tokens: 1 }),
      completionEvent('toolu_agent_1', { input_tokens: 1, output_tokens: 435 }),
    ];

    expect(extractDispatchUsageRecords(events)).toEqual([
      {
        dispatch_id: 'toolu_agent_1',
        agent: 'smithy-scout',
        input: 1,
        output: 435,
      },
    ]);
  });

  it('counts a repeated message-level usage snapshot only once', () => {
    const repeated = (): StreamEvent => ({
      type: 'assistant',
      parent_tool_use_id: 'toolu_agent_1',
      message: {
        id: 'msg_shared',
        content: [{ type: 'tool_use', name: 'Read', id: 'toolu_read', input: {} }],
        usage: { input_tokens: 6, output_tokens: 1 },
      },
    });

    const events: StreamEvent[] = [
      dispatchEvent('toolu_agent_1', { subagent_type: 'smithy-plan' }),
      repeated(),
      repeated(),
      repeated(),
    ];

    expect(extractDispatchUsageRecords(events)).toEqual([
      {
        dispatch_id: 'toolu_agent_1',
        agent: 'smithy-plan',
        input: 6,
        output: 1,
      },
    ]);
  });

  it('still sums distinct in-flight messages for one dispatch', () => {
    const turn = (id: string, input: number, output: number): StreamEvent => ({
      type: 'assistant',
      parent_tool_use_id: 'toolu_agent_1',
      message: {
        id,
        content: [{ type: 'text', text: 'work' }],
        usage: { input_tokens: input, output_tokens: output },
      },
    });

    const events: StreamEvent[] = [
      dispatchEvent('toolu_agent_1', { subagent_type: 'smithy-plan' }),
      turn('msg_a', 6, 1),
      turn('msg_b', 4, 2),
    ];

    expect(extractDispatchUsageRecords(events)).toEqual([
      {
        dispatch_id: 'toolu_agent_1',
        agent: 'smithy-plan',
        input: 10,
        output: 3,
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

  it('groups repeated dispatches by stable subagent_type, not the per-dispatch label', () => {
    const events: StreamEvent[] = [
      dispatchEvent('toolu_agent_1', {
        subagent_type: 'smithy-plan',
        description: 'Simplification lens plan',
      }),
      dispatchEvent('toolu_agent_2', {
        subagent_type: 'smithy-plan',
        description: 'Robustness lens plan',
      }),
      completionEvent('toolu_agent_1', { input_tokens: 1, output_tokens: 1834 }),
      completionEvent('toolu_agent_2', { input_tokens: 1, output_tokens: 3181 }),
    ];

    expect(extractSubAgentTokenTotals(events)).toEqual([
      {
        agent: 'smithy-plan',
        input: 2,
        output: 5015,
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

describe('committed captures', () => {
  it('attributes the scout capture to its completed dispatch total', () => {
    // scout-fixture-shallow.events.jsonl:19 reports the dispatch's own
    // authoritative usage under tool_use_result.usage.
    expect(extractSubAgentTokenTotals(loadCapture('scout-fixture-shallow'))).toEqual([
      {
        agent: 'smithy-scout',
        input: 1,
        output: 435,
        dispatch_count: 1,
      },
    ]);
  });

  it('aggregates the strike capture by sub-agent type', () => {
    // Three smithy-plan dispatches carry distinct per-dispatch descriptions and
    // must still collapse into one row.
    expect(extractSubAgentTokenTotals(loadCapture('strike-health-check'))).toEqual([
      { agent: 'smithy-clarify', input: 1, output: 1981, dispatch_count: 1 },
      { agent: 'smithy-plan', input: 3, output: 8626, dispatch_count: 3 },
      { agent: 'smithy-plan-review', input: 1, output: 3570, dispatch_count: 1 },
      { agent: 'smithy-reconcile', input: 1, output: 4930, dispatch_count: 1 },
    ]);
  });
});

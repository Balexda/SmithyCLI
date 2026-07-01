import { describe, expect, it } from 'vitest';
import { classifyDispatchUsageEvidence } from './dispatch-usage-evidence.js';
import type { StreamEvent } from './types.js';

const reviewedAt = '2026-05-20T00:00:00.000Z';
const sourceCapture = 'evals/captures/example.events.jsonl';

function agentToolUseEvent(id: string): StreamEvent {
  return {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          name: 'Agent',
          id,
          input: { description: 'Scout repo', prompt: 'scan' },
        },
      ],
    },
  };
}

describe('classifyDispatchUsageEvidence', () => {
  it('classifies dispatch-attributable streams when usage has a stable parent_tool_use_id relationship', () => {
    const events: StreamEvent[] = [
      agentToolUseEvent('toolu_dispatch_1'),
      {
        type: 'assistant',
        parent_tool_use_id: 'toolu_dispatch_1',
        message: {
          content: [{ type: 'text', text: 'sub-agent output' }],
          usage: { input_tokens: 10, output_tokens: 4 },
        },
      },
    ];

    const evidence = classifyDispatchUsageEvidence(events, {
      sourceCapture,
      reviewedAt,
    });

    expect(evidence).toEqual({
      classification: 'dispatch_attributable',
      source_capture: sourceCapture,
      observed_relationship:
        'Usage metadata has a stable dispatch relationship via parent_tool_use_id=toolu_dispatch_1',
      reviewed_at: reviewedAt,
    });
  });

  it('classifies parent-only streams when usage is present only on parent events', () => {
    const events: StreamEvent[] = [
      agentToolUseEvent('toolu_dispatch_1'),
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{ type: 'text', text: 'parent output' }],
          usage: { input_tokens: 50, output_tokens: 12 },
        },
      },
      {
        type: 'result',
        result: 'done',
      },
    ];

    const evidence = classifyDispatchUsageEvidence(events, {
      sourceCapture,
      reviewedAt,
    });

    expect(evidence.classification).toBe('parent_only');
    expect(evidence.source_capture).toBe(sourceCapture);
    expect(evidence.observed_relationship).toBe(
      'Observed 1 parseable usage record(s), but none included parent_tool_use_id or tool_use_id matching a known Agent dispatch',
    );
    expect(evidence.reviewed_at).toBe(reviewedAt);
  });

  it('does not infer attribution from malformed or ambiguous usage metadata', () => {
    const events: StreamEvent[] = [
      agentToolUseEvent('toolu_dispatch_1'),
      {
        type: 'assistant',
        parent_tool_use_id: 'unknown_dispatch',
        message: {
          content: [{ type: 'text', text: 'ambiguous usage' }],
          usage: { input_tokens: 8, output_tokens: 3 },
        },
      },
      {
        type: 'system',
        tool_use_id: 'toolu_dispatch_1',
        usage: { input_tokens: '8', output_tokens: null },
      },
    ];

    const evidence = classifyDispatchUsageEvidence(events, {
      sourceCapture,
      reviewedAt,
    });

    expect(evidence.classification).toBe('parent_only');
    expect(evidence.observed_relationship).toBe(
      'Observed 1 parseable usage record(s), but none included parent_tool_use_id or tool_use_id matching a known Agent dispatch',
    );
  });

  it('keeps usable dispatch evidence while ignoring malformed or ambiguous records', () => {
    const events: StreamEvent[] = [
      agentToolUseEvent('toolu_dispatch_1'),
      {
        type: 'system',
        tool_use_id: 'toolu_dispatch_1',
        usage: { total_tokens: 14 },
      },
      {
        type: 'assistant',
        parent_tool_use_id: 'unknown_dispatch',
        message: {
          content: [{ type: 'text', text: 'ambiguous parent' }],
          usage: { input_tokens: 6 },
        },
      },
      {
        type: 'system',
        tool_use_id: 'toolu_dispatch_1',
        usage: { total_tokens: 'bad' },
      },
    ];

    const evidence = classifyDispatchUsageEvidence(events, {
      sourceCapture,
      reviewedAt,
    });

    expect(evidence.classification).toBe('dispatch_attributable');
    expect(evidence.observed_relationship).toBe(
      'Usage metadata has a stable dispatch relationship via tool_use_id=toolu_dispatch_1; ignored 2 malformed, partial, or unattributable usage record(s)',
    );
  });

  it('does not throw on a malformed Agent tool-use block with a missing id', () => {
    const events: StreamEvent[] = [
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Agent',
              // id intentionally omitted to simulate provider-shape drift
              input: { description: 'Scout repo', prompt: 'scan' },
            },
          ],
        },
      },
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{ type: 'text', text: 'parent output' }],
          usage: { input_tokens: 50, output_tokens: 12 },
        },
      },
    ];

    const evidence = classifyDispatchUsageEvidence(events, {
      sourceCapture,
      reviewedAt,
    });

    expect(evidence.classification).toBe('parent_only');
  });
});

import { describe, it, expect } from 'vitest';
import {
  parseStreamString,
  extractCanonicalText,
  extractSubAgentDispatches,
  extractTokenTotals,
} from './parse-stream.js';
import type { StreamEvent } from './types.js';

// ---------------------------------------------------------------------------
// Helpers: factory functions for common event shapes
// ---------------------------------------------------------------------------

function assistantTextEvent(text: string): StreamEvent {
  return {
    type: 'assistant',
    message: {
      content: [{ type: 'text', text }],
    },
  };
}

function resultEvent(text: string): StreamEvent {
  return {
    type: 'result',
    result: text,
    subtype: 'success',
    duration_ms: 1000,
    num_turns: 5,
  };
}

function agentToolUseEvent(id: string, description: string, prompt: string): StreamEvent {
  return {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          name: 'Agent',
          id,
          input: { description, prompt },
        },
      ],
    },
  };
}

function toolResultEvent(toolUseId: string, content: string): StreamEvent {
  return {
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content,
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseStreamString', () => {
  it('returns an empty array for empty input', () => {
    expect(parseStreamString('')).toEqual([]);
  });

  it('parses a single valid event', () => {
    const result = parseStreamString('{"type":"system"}');
    expect(result).toEqual([{ type: 'system' }]);
  });

  it('throws SyntaxError on malformed JSON', () => {
    expect(() => parseStreamString('not json')).toThrow(SyntaxError);
  });

  it('passes unknown event types through without error', () => {
    const input = '{"type":"future_event_type","data":"whatever"}';
    const result = parseStreamString(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('future_event_type');
    expect(result[0]!['data']).toBe('whatever');
  });

  it('handles Windows-style \\r\\n line endings', () => {
    const input = '{"type":"system"}\r\n{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}\r\n';
    const result = parseStreamString(input);
    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe('system');
    expect(result[1]!.type).toBe('assistant');
  });
});

describe('extractCanonicalText', () => {
  it('prefers result.text when a result event has non-empty text', () => {
    const events: StreamEvent[] = [
      assistantTextEvent('assistant output'),
      resultEvent('Final result text'),
    ];
    expect(extractCanonicalText(events)).toBe('Final result text');
  });

  it('falls back to assistant text when no result event exists', () => {
    const events: StreamEvent[] = [
      assistantTextEvent('Hello'),
      assistantTextEvent('World'),
    ];
    expect(extractCanonicalText(events)).toBe('Hello\nWorld');
  });

  it('falls back to assistant text when result.text is empty', () => {
    const events: StreamEvent[] = [
      assistantTextEvent('fallback text'),
      resultEvent(''),
    ];
    expect(extractCanonicalText(events)).toBe('fallback text');
  });

  it('extracts Codex exec agent_message events', () => {
    const events: StreamEvent[] = [
      { type: 'thread.started', thread_id: 'thread_123' },
      { type: 'agent_message', message: 'Codex final text' },
    ];

    expect(extractCanonicalText(events)).toBe('Codex final text');
  });

  it('extracts Codex/OpenAI response item assistant text events', () => {
    const events: StreamEvent[] = [
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Item final text' }],
        },
      },
    ];

    expect(extractCanonicalText(events)).toBe('Item final text');
  });

  it('extracts Codex item.completed agent_message text events', () => {
    const events: StreamEvent[] = [
      {
        type: 'item.completed',
        item: {
          type: 'agent_message',
          text: 'Completed item text',
        },
      },
    ];

    expect(extractCanonicalText(events)).toBe('Completed item text');
  });
});

describe('extractTokenTotals', () => {
  it('returns zero totals for empty or usage-free event arrays', () => {
    expect(extractTokenTotals([])).toEqual({ input: 0, output: 0 });
    expect(extractTokenTotals([assistantTextEvent('no usage')])).toEqual({
      input: 0,
      output: 0,
    });
  });

  it('sums valid non-terminal usage when no terminal usage exists', () => {
    const events: StreamEvent[] = [
      { type: 'assistant', usage: { input_tokens: 10, output_tokens: 3 } },
      { type: 'message_delta', usage: { input_tokens: 4, output_tokens: 8 } },
      { type: 'future_event_type', usage: { input_tokens: 6, output_tokens: 1 } },
    ];

    expect(extractTokenTotals(events)).toEqual({ input: 20, output: 12 });
  });

  it('ignores malformed usage fields while preserving valid fields', () => {
    const events: StreamEvent[] = [
      { type: 'assistant', usage: { input_tokens: null, output_tokens: 5 } },
      { type: 'assistant', usage: { input_tokens: '7', output_tokens: 2.5 } },
      { type: 'assistant', usage: { input_tokens: -1, output_tokens: Number.NaN } },
      { type: 'assistant', usage: { input_tokens: Number.POSITIVE_INFINITY, output_tokens: 9 } },
      { type: 'assistant', usage: { input_tokens: 12, output_tokens: 0 } },
    ];

    expect(extractTokenTotals(events)).toEqual({ input: 12, output: 14 });
  });

  it('uses terminal result usage instead of summing non-terminal usage', () => {
    const events: StreamEvent[] = [
      { type: 'assistant', usage: { input_tokens: 100, output_tokens: 50 } },
      { type: 'result', usage: { input_tokens: 42, output_tokens: 12 } },
    ];

    expect(extractTokenTotals(events)).toEqual({ input: 42, output: 12 });
  });

  it('takes per-field maximum usage across terminal result events', () => {
    const events: StreamEvent[] = [
      { type: 'assistant', usage: { input_tokens: 100, output_tokens: 100 } },
      { type: 'result', usage: { input_tokens: 40, output_tokens: 12 } },
      { type: 'result', usage: { input_tokens: 35, output_tokens: 18 } },
    ];

    expect(extractTokenTotals(events)).toEqual({ input: 40, output: 18 });
  });
});

describe('extractSubAgentDispatches', () => {
  it('correctly pairs an Agent tool_use with its matching tool_result', () => {
    const events: StreamEvent[] = [
      agentToolUseEvent('tool_123', 'test agent', 'do something'),
      toolResultEvent('tool_123', 'Agent result text'),
    ];

    const dispatches = extractSubAgentDispatches(events);

    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toEqual({
      id: 'tool_123',
      description: 'test agent',
      prompt: 'do something',
      resultText: 'Agent result text',
    });
  });

  it('flattens array-shaped tool_result content into clean text', () => {
    // Live `Agent` tool dispatches return content as an array of text blocks
    // (the agent's actual output, plus a metadata footer). The extractor must
    // join those text fields directly so regex patterns match real newlines —
    // not JSON-stringify the whole array, which would turn `\n` into the
    // literal substring `\\n` and double-escape pattern matching.
    const arrayResultEvent: StreamEvent = {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool_456',
            content: [
              { type: 'text', text: '## Plan\n\n**Directive**: keep it simple' },
              { type: 'text', text: 'agentId: abc123 <usage>tokens: 100</usage>' },
            ],
          },
        ],
      },
    };

    const events: StreamEvent[] = [
      agentToolUseEvent('tool_456', 'plan agent', 'plan it'),
      arrayResultEvent,
    ];

    const dispatches = extractSubAgentDispatches(events);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]!.resultText).toBe(
      '## Plan\n\n**Directive**: keep it simple\nagentId: abc123 <usage>tokens: 100</usage>',
    );
    // Real newline (0x0A) survives — pattern `## Plan\n\n\\*\\*Directive\\*\\*` matches.
    expect(/## Plan\n\n\*\*Directive\*\*/.test(dispatches[0]!.resultText)).toBe(true);
  });
});

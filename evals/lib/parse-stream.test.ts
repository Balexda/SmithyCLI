import { describe, it, expect } from 'vitest';
import {
  parseStreamString,
  extractCanonicalText,
  extractSubAgentDispatches,
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

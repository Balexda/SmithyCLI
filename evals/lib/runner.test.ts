import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

import type { EvalScenario, StreamEvent } from './types.js';

// ---------------------------------------------------------------------------
// Mock node:child_process
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(),
}));

// Import after mock is declared so the module picks up the mocked version.
const { spawn, execFileSync } = await import('node:child_process');
const { runScenario, preflight, hashDirectory } = await import('./runner.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScenario(overrides?: Partial<EvalScenario>): EvalScenario {
  return {
    name: 'test-scenario',
    skill: '/smithy.strike',
    prompt: 'do something',
    structural_expectations: {
      required_headings: [],
    },
    ...overrides,
  };
}

function ndjsonLines(...events: Record<string, unknown>[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

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
    duration_ms: 1234,
    num_turns: 3,
  };
}

/**
 * Create a mock child process object that emits data on stdout and then closes.
 * `stdoutData` is the full string to emit. `exitCode` is the code passed to
 * the 'close' handler.
 */
function createMockChild(
  stdoutData: string,
  exitCode: number,
  opts?: { delayClose?: boolean },
): {
  child: Record<string, unknown>;
  triggerClose: () => void;
} {
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  const childEmitter = new EventEmitter();

  let closeCallback: ((code: number) => void) | undefined;

  const child = {
    stdout: stdoutEmitter,
    stderr: stderrEmitter,
    on: (event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'close') {
        closeCallback = cb as (code: number) => void;
      }
      childEmitter.on(event, cb);
      return child;
    },
    kill: vi.fn(),
    pid: 12345,
  };

  const triggerClose = () => {
    closeCallback?.(exitCode);
  };

  // If not delaying, schedule stdout emission + close on next tick.
  if (!opts?.delayClose) {
    process.nextTick(() => {
      if (stdoutData) {
        stdoutEmitter.emit('data', Buffer.from(stdoutData));
      }
      triggerClose();
    });
  } else {
    // Emit stdout immediately but do NOT close.
    process.nextTick(() => {
      if (stdoutData) {
        stdoutEmitter.emit('data', Buffer.from(stdoutData));
      }
    });
  }

  return { child, triggerClose };
}

/**
 * Create a real temporary "fixture" directory with known files for
 * fixture-integrity and cleanup tests.
 */
function createRealFixture(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-runner-test-fixture-'));
  fs.writeFileSync(path.join(dir, 'file-a.txt'), 'content-a');
  fs.mkdirSync(path.join(dir, 'subdir'));
  fs.writeFileSync(path.join(dir, 'subdir', 'file-b.txt'), 'content-b');
  return {
    dir,
    cleanup: () => {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  // Ensure timers are real by default; individual tests override as needed.
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// runScenario tests
// ---------------------------------------------------------------------------

describe('runScenario', () => {
  it('successful run with NDJSON stdout produces correct RunOutput', async () => {
    const assistantEv = assistantTextEvent('Hello world');
    const resultEv = resultEvent('Final canonical text');
    const stdout = ndjsonLines(assistantEv, resultEv);

    const { child } = createMockChild(stdout, 0);
    vi.mocked(spawn).mockReturnValue(child as never);

    const fixture = createRealFixture();
    try {
      const output = await runScenario(makeScenario(), fixture.dir);

      // FR-001: result.text is preferred over assistant text.
      expect(output.extracted_text).toBe('Final canonical text');

      // stream_events parsed correctly.
      expect(output.stream_events).toHaveLength(2);
      expect(output.stream_events[0]!.type).toBe('assistant');
      expect(output.stream_events[1]!.type).toBe('result');

      // Timing and exit info.
      expect(output.duration_ms).toBeGreaterThanOrEqual(0);
      expect(output.exit_code).toBe(0);
      expect(output.timed_out).toBe(false);

      // Fixture isolation: spawn must target the temp copy, not the source.
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        ['--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', '-p', '/smithy.strike do something'],
        expect.objectContaining({
          cwd: expect.stringContaining('smithy-eval-'),
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );

      // Skills deployment: smithy init must run in the temp copy before claude.
      expect(execFileSync).toHaveBeenCalledWith(
        'node',
        expect.arrayContaining(['init', '-a', 'claude', '-y']),
        expect.objectContaining({
          cwd: expect.stringContaining('smithy-eval-'),
        }),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it('non-zero exit code is surfaced', async () => {
    const stdout = ndjsonLines(assistantTextEvent('partial'));
    const { child } = createMockChild(stdout, 1);
    vi.mocked(spawn).mockReturnValue(child as never);

    const fixture = createRealFixture();
    try {
      const output = await runScenario(makeScenario(), fixture.dir);
      expect(output.exit_code).toBe(1);
    } finally {
      fixture.cleanup();
    }
  });

  it('timeout is detected and timed_out: true is returned', async () => {
    // Use fake timers so we can advance the timeout without real waiting.
    vi.useFakeTimers();

    const { child, triggerClose } = createMockChild('', 0, {
      delayClose: true,
    });
    vi.mocked(spawn).mockReturnValue(child as never);

    const fixture = createRealFixture();
    try {
      // Scenario with a very short timeout (1 second).
      const scenario = makeScenario({ timeout: 1 });
      const promise = runScenario(scenario, fixture.dir);

      // Advance time past the timeout threshold (1000ms).
      await vi.advanceTimersByTimeAsync(1500);

      // The kill should have been called due to timeout.
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');

      // Now simulate the child closing after being killed.
      triggerClose();

      const output = await promise;
      expect(output.timed_out).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it('fixture source directory is unchanged after the run', async () => {
    const stdout = ndjsonLines(resultEvent('output'));
    const { child } = createMockChild(stdout, 0);
    vi.mocked(spawn).mockReturnValue(child as never);

    const fixture = createRealFixture();
    try {
      const hashBefore = hashDirectory(fixture.dir);

      await runScenario(makeScenario(), fixture.dir);

      const hashAfter = hashDirectory(fixture.dir);
      expect(hashAfter).toBe(hashBefore);
    } finally {
      fixture.cleanup();
    }
  });

  it('temp directory is removed after the run (success case)', async () => {
    const stdout = ndjsonLines(resultEvent('output'));
    const { child } = createMockChild(stdout, 0);
    vi.mocked(spawn).mockReturnValue(child as never);

    // Spy on fs.mkdtempSync to capture the temp directory path.
    const realMkdtempSync = fs.mkdtempSync;
    let capturedTmpDir: string | undefined;
    const mkdtempSpy = vi.spyOn(fs, 'mkdtempSync').mockImplementation(
      (...args: Parameters<typeof fs.mkdtempSync>) => {
        const result = realMkdtempSync(...args);
        capturedTmpDir = result;
        return result;
      },
    );

    const fixture = createRealFixture();
    try {
      await runScenario(makeScenario(), fixture.dir);

      expect(capturedTmpDir).toBeDefined();
      expect(fs.existsSync(capturedTmpDir!)).toBe(false);
    } finally {
      fixture.cleanup();
      mkdtempSpy.mockRestore();
    }
  });

  it('temp directory is removed after the run (error case)', async () => {
    // Simulate an error by making spawn emit an error event.
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();
    const childEmitter = new EventEmitter();

    const errorChild = {
      stdout: stdoutEmitter,
      stderr: stderrEmitter,
      on: (event: string, cb: (...args: unknown[]) => void) => {
        childEmitter.on(event, cb);
        return errorChild;
      },
      kill: vi.fn(),
      pid: 12345,
    };

    vi.mocked(spawn).mockReturnValue(errorChild as never);

    // Trigger an error on the child process on next tick.
    process.nextTick(() => {
      childEmitter.emit('error', new Error('spawn failed'));
    });

    const realMkdtempSync = fs.mkdtempSync;
    let capturedTmpDir: string | undefined;
    const mkdtempSpy = vi.spyOn(fs, 'mkdtempSync').mockImplementation(
      (...args: Parameters<typeof fs.mkdtempSync>) => {
        const result = realMkdtempSync(...args);
        capturedTmpDir = result;
        return result;
      },
    );

    const fixture = createRealFixture();
    try {
      await expect(runScenario(makeScenario(), fixture.dir)).rejects.toThrow();

      expect(capturedTmpDir).toBeDefined();
      expect(fs.existsSync(capturedTmpDir!)).toBe(false);
    } finally {
      fixture.cleanup();
      mkdtempSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// preflight tests
// ---------------------------------------------------------------------------

describe('preflight', () => {
  const savedApiKey = process.env['ANTHROPIC_API_KEY'];
  const savedOauthToken = process.env['CLAUDE_CODE_OAUTH_TOKEN'];

  afterEach(() => {
    if (savedApiKey !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = savedApiKey;
    } else {
      delete process.env['ANTHROPIC_API_KEY'];
    }
    if (savedOauthToken !== undefined) {
      process.env['CLAUDE_CODE_OAUTH_TOKEN'] = savedOauthToken;
    } else {
      delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];
    }
  });

  it('throws when the CLI is unavailable', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('command not found');
    });

    expect(() => preflight()).toThrow('claude CLI not found or not functional');
  });

  it('passes when ANTHROPIC_API_KEY is set', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];

    vi.mocked(execFileSync).mockReturnValue(Buffer.from('1.0.0'));

    expect(() => preflight()).not.toThrow();
  });

  it('passes when CLAUDE_CODE_OAUTH_TOKEN is set without invoking auth status', () => {
    delete process.env['ANTHROPIC_API_KEY'];
    process.env['CLAUDE_CODE_OAUTH_TOKEN'] = 'oat-test-token';

    vi.mocked(execFileSync).mockImplementation(
      (_command: string, args?: readonly string[]) => {
        if (args && args[0] === '--version') {
          return Buffer.from('1.0.0');
        }
        // Reaching `auth status` with the token set means the explicit branch
        // is missing — fail the test.
        throw new Error('auth status should not have been called');
      },
    );

    expect(() => preflight()).not.toThrow();

    const calls = vi.mocked(execFileSync).mock.calls;
    const sawAuthStatus = calls.some(
      ([, args]) => Array.isArray(args) && args[0] === 'auth' && args[1] === 'status',
    );
    expect(sawAuthStatus).toBe(false);
  });

  it('passes when no env credential but OAuth is active', () => {
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];

    vi.mocked(execFileSync).mockImplementation(
      (_command: string, args?: readonly string[]) => {
        if (args && args[0] === '--version') {
          return Buffer.from('1.0.0');
        }
        if (args && args[0] === 'auth' && args[1] === 'status') {
          return Buffer.from('Logged in as user@example.com');
        }
        return Buffer.from('');
      },
    );

    expect(() => preflight()).not.toThrow();
  });

  it('throws when no env credential and no OAuth login', () => {
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['CLAUDE_CODE_OAUTH_TOKEN'];

    vi.mocked(execFileSync).mockImplementation(
      (_command: string, args?: readonly string[]) => {
        if (args && args[0] === '--version') {
          return Buffer.from('1.0.0');
        }
        throw new Error('not logged in');
      },
    );

    expect(() => preflight()).toThrow(
      /CLAUDE_CODE_OAUTH_TOKEN/,
    );
  });
});

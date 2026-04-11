import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { EvalScenario } from './types.js';

// ---------------------------------------------------------------------------
// Mocking child_process — must be set up before importing runner
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

// Import after mock registration so the module picks up the mocks.
const { spawn, spawnSync } = await import('node:child_process');
const { runScenario, preflight } = await import('./runner.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal scenario with defaults. */
function makeScenario(overrides?: Partial<EvalScenario>): EvalScenario {
  return {
    name: 'test-scenario',
    skill: '/smithy.strike',
    prompt: 'add a health check endpoint',
    structural_expectations: { required_headings: ['## Plan'] },
    ...overrides,
  };
}

/**
 * Create a mock ChildProcess that emits data on stdout and closes with the
 * given exit code after a microtask.
 */
function mockSpawnChild(
  stdoutData: string,
  exitCode: number,
  opts?: { neverClose?: boolean; emitError?: Error },
): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  Object.assign(child, {
    stdout,
    stderr,
    stdin: null,
    pid: 12345,
    kill: vi.fn(() => {
      // When killed (e.g. by timeout), emit close with null exit code.
      process.nextTick(() => {
        child.emit('close', null, 'SIGTERM');
      });
      return true;
    }),
  });

  if (opts?.emitError) {
    process.nextTick(() => {
      child.emit('error', opts.emitError);
    });
  } else if (!opts?.neverClose) {
    // Emit stdout data then close on next tick.
    process.nextTick(() => {
      stdout.end(stdoutData);
      process.nextTick(() => {
        child.emit('close', exitCode, null);
      });
    });
  }

  return child;
}

/** Build NDJSON stream output for successful runs. */
function ndjsonOutput(resultText: string): string {
  const assistantEvent = JSON.stringify({
    type: 'assistant',
    message: {
      content: [{ type: 'text', text: 'assistant output' }],
    },
  });
  const resultEvent = JSON.stringify({
    type: 'result',
    result: resultText,
    subtype: 'success',
    duration_ms: 5000,
    num_turns: 3,
  });
  return `${assistantEvent}\n${resultEvent}\n`;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let fixtureDir: string;

beforeEach(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), 'runner-test-fixture-'));
  await writeFile(join(fixtureDir, 'index.ts'), 'console.log("hello");');
  await mkdir(join(fixtureDir, 'src'), { recursive: true });
  await writeFile(join(fixtureDir, 'src', 'app.ts'), 'export default {};');
});

afterEach(async () => {
  await rm(fixtureDir, { recursive: true, force: true }).catch(() => {});
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// runScenario tests
// ---------------------------------------------------------------------------

describe('runScenario', () => {
  it('produces correct RunOutput for a successful NDJSON run', async () => {
    const stdout = ndjsonOutput('Final result text');

    vi.mocked(spawn).mockImplementation(() => mockSpawnChild(stdout, 0));

    const result = await runScenario(makeScenario(), fixtureDir);

    expect(result.extracted_text).toBe('Final result text');
    expect(result.exit_code).toBe(0);
    expect(result.timed_out).toBe(false);
    expect(result.stream_events.length).toBeGreaterThan(0);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('surfaces non-zero exit code', async () => {
    const stdout = ndjsonOutput('partial output');

    vi.mocked(spawn).mockImplementation(() => mockSpawnChild(stdout, 1));

    const result = await runScenario(makeScenario(), fixtureDir);

    expect(result.exit_code).toBe(1);
    expect(result.extracted_text).toBe('partial output');
  });

  it('returns timed_out: true when the process exceeds timeout', async () => {
    const scenario = makeScenario({ timeout: 0.01 }); // 10ms

    // Create a child that never closes on its own — the timer will kill it.
    vi.mocked(spawn).mockImplementation(() =>
      mockSpawnChild('', 0, { neverClose: true }),
    );

    const result = await runScenario(scenario, fixtureDir);

    expect(result.timed_out).toBe(true);
  });

  it('does not modify the source fixture directory', async () => {
    const stdout = ndjsonOutput('ok');

    vi.mocked(spawn).mockImplementation(() => mockSpawnChild(stdout, 0));

    const filesBefore = (await readdir(fixtureDir, { recursive: true })).sort();

    await runScenario(makeScenario(), fixtureDir);

    const filesAfter = (await readdir(fixtureDir, { recursive: true })).sort();
    expect(filesAfter).toEqual(filesBefore);
  });

  it('cleans up the temp directory after the run', async () => {
    const stdout = ndjsonOutput('ok');

    let capturedCwd: string | undefined;
    vi.mocked(spawn).mockImplementation((_cmd, _args, opts) => {
      capturedCwd = (opts as { cwd?: string }).cwd;
      return mockSpawnChild(stdout, 0);
    });

    await runScenario(makeScenario(), fixtureDir);

    expect(capturedCwd).toBeDefined();
    const tempExists = await readdir(capturedCwd!).then(
      () => true,
      () => false,
    );
    expect(tempExists).toBe(false);
  });

  it('cleans up the temp directory even on error', async () => {
    let capturedCwd: string | undefined;
    vi.mocked(spawn).mockImplementation((_cmd, _args, opts) => {
      capturedCwd = (opts as { cwd?: string }).cwd;
      return mockSpawnChild('', 0, {
        emitError: new Error('spawn ENOENT'),
      });
    });

    await expect(runScenario(makeScenario(), fixtureDir)).rejects.toThrow();

    expect(capturedCwd).toBeDefined();
    const tempExists = await readdir(capturedCwd!).then(
      () => true,
      () => false,
    );
    expect(tempExists).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// preflight tests
// ---------------------------------------------------------------------------

describe('preflight', () => {
  it('throws when claude CLI is unavailable', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: null,
      signal: null,
      output: [],
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      pid: 0,
      error: new Error('spawn claude ENOENT'),
    });

    expect(() => preflight()).toThrow('claude CLI is not available');
  });

  it('passes when ANTHROPIC_API_KEY is set', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      signal: null,
      output: [],
      stdout: Buffer.from('1.0.0'),
      stderr: Buffer.alloc(0),
      pid: 12345,
    });

    const original = process.env['ANTHROPIC_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'sk-test-key';
    try {
      expect(() => preflight()).not.toThrow();
    } finally {
      if (original === undefined) {
        delete process.env['ANTHROPIC_API_KEY'];
      } else {
        process.env['ANTHROPIC_API_KEY'] = original;
      }
    }
  });

  it('passes when no API key but OAuth is active', () => {
    const original = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];

    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        signal: null,
        output: [],
        stdout: Buffer.from('1.0.0'),
        stderr: Buffer.alloc(0),
        pid: 12345,
      })
      .mockReturnValueOnce({
        status: 0,
        signal: null,
        output: [],
        stdout: Buffer.from('Logged in'),
        stderr: Buffer.alloc(0),
        pid: 12345,
      });

    try {
      expect(() => preflight()).not.toThrow();
    } finally {
      if (original !== undefined) {
        process.env['ANTHROPIC_API_KEY'] = original;
      }
    }
  });

  it('throws when neither API key nor OAuth is configured', () => {
    const original = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];

    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        signal: null,
        output: [],
        stdout: Buffer.from('1.0.0'),
        stderr: Buffer.alloc(0),
        pid: 12345,
      })
      .mockReturnValueOnce({
        status: 1,
        signal: null,
        output: [],
        stdout: Buffer.alloc(0),
        stderr: Buffer.from('Not logged in'),
        pid: 12345,
      });

    try {
      expect(() => preflight()).toThrow('No authentication configured');
    } finally {
      if (original !== undefined) {
        process.env['ANTHROPIC_API_KEY'] = original;
      }
    }
  });
});

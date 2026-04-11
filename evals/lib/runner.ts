/**
 * Eval runner — executes a single eval scenario by invoking
 * `claude --output-format stream-json -p` against a temp copy of the
 * reference fixture and returning the parsed output.
 *
 * Implements FR-001, FR-002, FR-003, FR-004, FR-011, FR-013.
 */

import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { EvalScenario, RunOutput, StreamEvent } from './types.js';
import { parseStreamString, extractCanonicalText } from './parse-stream.js';

/** Path to the built Smithy CLI, resolved relative to this module. */
const CLI_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../dist/cli.js',
);

/** Default per-case timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 120_000;

/** Grace period after SIGTERM before escalating to SIGKILL. */
const SIGKILL_GRACE_MS = 5_000;

/** Final safety net — force-resolve if SIGKILL also doesn't produce a close event. */
const FORCE_RESOLVE_MS = 2_000;

/** Directories excluded from fixture checksum computation. */
const CHECKSUM_EXCLUDE_DIRS = new Set([
  'node_modules',
  '.claude',
  '.smithy',
  'dist',
]);

// ---------------------------------------------------------------------------
// Fixture checksum
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 hash of a directory's contents, excluding directories
 * listed in `CHECKSUM_EXCLUDE_DIRS`. Files are sorted by relative path to
 * ensure deterministic output.
 */
export function hashDirectory(dirPath: string): string {
  const hash = crypto.createHash('sha256');
  const entries: string[] = [];

  function collectFiles(dir: string, prefix: string): void {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory() && CHECKSUM_EXCLUDE_DIRS.has(item.name)) {
        continue;
      }
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) {
        collectFiles(path.join(dir, item.name), rel);
      } else {
        entries.push(rel);
      }
    }
  }

  collectFiles(dirPath, '');
  entries.sort();

  for (const rel of entries) {
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(dirPath, rel)));
  }

  return hash.digest('hex');
}

// ---------------------------------------------------------------------------
// Process spawning
// ---------------------------------------------------------------------------

interface SpawnResult {
  stdout: string;
  exit_code: number;
  timed_out: boolean;
  duration_ms: number;
}

/**
 * Spawn `claude` with the given arguments and enforce a timeout.
 * Returns collected stdout, the exit code, whether a timeout occurred,
 * and wall-clock duration.
 */
function spawnClaude(
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<SpawnResult> {
  return new Promise<SpawnResult>((resolve, reject) => {
    const start = performance.now();
    let timedOut = false;

    const child = spawn('claude', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const chunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    // Capture stderr but we don't need it in the output —
    // just drain so the pipe doesn't block.
    child.stderr.on('data', () => {
      // intentionally ignored
    });

    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;

    function settle(code: number | null): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      clearTimeout(forceTimer);
      const duration = performance.now() - start;
      resolve({
        stdout: Buffer.concat(chunks).toString('utf-8'),
        exit_code: code ?? 1,
        timed_out: timedOut,
        duration_ms: Math.round(duration),
      });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');

      // Escalate to SIGKILL if the process doesn't exit after SIGTERM.
      killTimer = setTimeout(() => {
        child.kill('SIGKILL');

        // Last resort: force-resolve if even SIGKILL doesn't produce a
        // close event (e.g. zombie process or broken pipe).
        forceTimer = setTimeout(() => {
          settle(null);
        }, FORCE_RESOLVE_MS);
      }, SIGKILL_GRACE_MS);
    }, timeoutMs);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      clearTimeout(forceTimer);
      reject(err);
    });

    child.on('close', (code) => {
      settle(code);
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate that the `claude` CLI is functional and that at least one
 * authentication path is configured (FR-003).
 *
 * This MUST be called before any scenario executes so that missing tooling
 * or credentials are caught eagerly — not on the first `runScenario` call.
 *
 * @throws {Error} If the `claude` CLI is not found, not functional, or no
 *   valid authentication (API key or OAuth login) is configured.
 */
export function preflight(): void {
  // (a) Validate that the `claude` CLI is functional.
  try {
    execFileSync('claude', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    });
  } catch {
    throw new Error(
      'claude CLI not found or not functional. ' +
      'Install it from https://docs.anthropic.com/en/docs/claude-code/overview ' +
      'and ensure it\'s in your PATH.',
    );
  }

  // (b) Verify that at least one auth path is configured.
  if (process.env['ANTHROPIC_API_KEY']) {
    // API key is set — accept it as a valid auth method.
    return;
  }

  // No API key — probe whether OAuth is active.
  try {
    const result = execFileSync('claude', ['auth', 'status'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    // If the command succeeds (exit code 0), OAuth is active.
    // Some versions may output status text — we just need a zero exit.
    const output = result.toString('utf-8');
    if (output.toLowerCase().includes('not logged in')) {
      throw new Error('OAuth not active');
    }
  } catch {
    throw new Error(
      'No API key or OAuth login found. ' +
      'Set ANTHROPIC_API_KEY or run `claude login`.',
    );
  }
}

/**
 * Execute a single eval scenario.
 *
 * 1. Copies `fixtureDir` to a unique temp directory (FR-002).
 * 2. Computes a SHA-256 checksum of the source fixture before execution (FR-011).
 * 3. Spawns `claude --output-format stream-json -p "<invocation>"` in the temp copy.
 * 4. Enforces per-case timeout (FR-004).
 * 5. Extracts canonical text via `extractCanonicalText` (FR-001).
 * 6. Re-verifies the source fixture checksum (FR-011).
 * 7. Cleans up the temp directory in a `finally` block (FR-013).
 */
export async function runScenario(
  scenario: EvalScenario,
  fixtureDir: string,
): Promise<RunOutput> {
  // Create a unique temp directory and copy the fixture into it.
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'smithy-eval-'),
  );

  try {
    // FR-002: Copy fixture to temp directory.
    fs.cpSync(fixtureDir, tmpDir, { recursive: true });

    // Deploy Smithy skills into the temp copy. The fixture intentionally does
    // not commit .claude/ — skills are deployed fresh each run so evals always
    // test against the latest templates.
    execFileSync('node', [CLI_PATH, 'init', '-a', 'claude', '-y'], {
      cwd: tmpDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // FR-011: Checksum the source fixture *before* execution.
    const checksumBefore = hashDirectory(fixtureDir);

    // Build the invocation string: skill + prompt composed into slash-command form.
    // No shell quoting needed — spawn passes args directly to the process.
    const invocation = `${scenario.skill} ${scenario.prompt}`;

    // Determine timeout: scenario-level override (in seconds) → default.
    const timeoutMs = scenario.timeout != null
      ? scenario.timeout * 1000
      : DEFAULT_TIMEOUT_MS;

    // FR-001 / FR-003: Spawn claude in stream-json mode.
    const result = await spawnClaude(
      ['--output-format', 'stream-json', '-p', invocation],
      tmpDir,
      timeoutMs,
    );

    // Parse the NDJSON output.
    // On clean runs (exit 0, no timeout), parse errors propagate — they
    // indicate a real regression in output capture. On incomplete runs
    // (timeout or non-zero exit), tolerate malformed/partial output.
    let events: StreamEvent[] = [];
    let extractedText = '';
    if (result.timed_out || result.exit_code !== 0) {
      try {
        events = parseStreamString(result.stdout);
        extractedText = extractCanonicalText(events);
      } catch {
        // Partial/malformed output from timeout or error — keep empty defaults.
      }
    } else {
      events = parseStreamString(result.stdout);
      extractedText = extractCanonicalText(events);
    }

    // FR-011: Re-verify the source fixture after execution.
    const checksumAfter = hashDirectory(fixtureDir);
    if (checksumAfter !== checksumBefore) {
      throw new Error(
        'Source fixture directory was modified during eval execution. ' +
        `Expected checksum ${checksumBefore}, got ${checksumAfter}.`,
      );
    }

    return {
      extracted_text: extractedText,
      stream_events: events,
      duration_ms: result.duration_ms,
      exit_code: result.exit_code,
      timed_out: result.timed_out,
    };
  } finally {
    // FR-013: Always clean up the temp directory.
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

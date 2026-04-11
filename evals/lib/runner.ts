/**
 * Eval runner — executes a single eval scenario by invoking
 * `claude --output-format stream-json -p` against a temp copy of the
 * reference fixture and returning parsed output.
 *
 * Implements FR-001, FR-002, FR-003, FR-004, FR-011, FR-013 (consumes FR-015 StreamParser).
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

import { extractCanonicalText, parseStreamString } from './parse-stream.js';
import type { EvalScenario, RunOutput } from './types.js';

// ---------------------------------------------------------------------------
// Pre-flight validation (FR-003)
// ---------------------------------------------------------------------------

/**
 * Validate that the `claude` CLI is functional and that authentication is
 * configured before any scenario executes.
 *
 * Checks:
 * 1. `claude --version` runs successfully (exit code 0).
 * 2. Either `ANTHROPIC_API_KEY` is set or `claude auth status` reports an
 *    active OAuth session.
 *
 * Throws with an actionable message if either check fails.
 */
export function preflight(): void {
  // --- Check 1: Is the claude CLI functional? ---
  const versionResult = spawnSync('claude', ['--version'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  });

  if (versionResult.error || versionResult.status !== 0) {
    throw new Error(
      'claude CLI is not available or not functional. ' +
      'Install it and ensure it is in your PATH.',
    );
  }

  // --- Check 2: Is authentication configured? ---
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (apiKey !== undefined && apiKey !== '') {
    // API key is set — auth is satisfied.
    return;
  }

  // No API key — check for active OAuth session.
  const authResult = spawnSync('claude', ['auth', 'status'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  });

  if (authResult.error || authResult.status !== 0) {
    throw new Error(
      'No authentication configured. ' +
      "Set ANTHROPIC_API_KEY or run 'claude login' to authenticate.",
    );
  }
}

/** Default per-case timeout in milliseconds (FR-004). */
const DEFAULT_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Fixture checksum utilities (FR-011)
// ---------------------------------------------------------------------------

/**
 * Recursively collect all file paths under `dir`, returned sorted by their
 * relative path (POSIX-style forward slashes) for deterministic ordering.
 */
async function collectFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);

  // Sort by relative path using forward slashes for cross-platform determinism.
  results.sort((a, b) => {
    const relA = relative(dir, a).split(sep).join('/');
    const relB = relative(dir, b).split(sep).join('/');
    return relA.localeCompare(relB);
  });

  return results;
}

/**
 * Compute a SHA-256 checksum over all files in `dir`. The hash covers the
 * sorted list of relative file paths concatenated with their raw contents,
 * producing a single deterministic digest.
 */
async function computeFixtureChecksum(dir: string): Promise<string> {
  const files = await collectFiles(dir);
  const hash = createHash('sha256');

  for (const filePath of files) {
    const relPath = relative(dir, filePath).split(sep).join('/');
    hash.update(relPath);
    const content = await readFile(filePath);
    hash.update(content);
  }

  return hash.digest('hex');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Execute a single eval scenario.
 *
 * 1. Copy the fixture to a unique temp directory (FR-002).
 * 2. Compute a SHA-256 checksum of the source fixture (FR-011).
 * 3. Spawn `claude --output-format stream-json -p "<invocation>"` with
 *    `cwd` set to the temp copy.
 * 4. Enforce the per-case timeout (FR-004).
 * 5. Parse the NDJSON stdout and extract canonical text (FR-001).
 * 6. Re-verify the source fixture checksum (FR-011).
 * 7. Clean up the temp directory in a `finally` block (FR-013).
 */
export async function runScenario(
  scenario: EvalScenario,
  fixtureDir: string,
): Promise<RunOutput> {
  // Validate the fixture directory exists.
  const fixtureStat = await stat(fixtureDir).catch(() => null);
  if (!fixtureStat?.isDirectory()) {
    throw new Error(`Fixture directory does not exist: ${fixtureDir}`);
  }

  // FR-002: Copy the fixture to a unique temp directory.
  const tempDir = await mkdtemp(join(tmpdir(), 'smithy-eval-'));

  try {
    await cp(fixtureDir, tempDir, { recursive: true });

    // FR-011: Compute checksum of source fixture before execution.
    const checksumBefore = await computeFixtureChecksum(fixtureDir);

    // Build the invocation string: skill + prompt composed into one string.
    // No wrapper quotes — spawn bypasses the shell, so the full string is
    // passed as a single argv element to `-p`. Wrapper quotes would be
    // delivered literally and break prompts containing apostrophes.
    const invocation = `${scenario.skill} ${scenario.prompt}`;

    const timeoutMs = scenario.timeout !== undefined
      ? scenario.timeout * 1000
      : DEFAULT_TIMEOUT_MS;

    // Spawn claude CLI.
    const { stdout, exitCode, timedOut, durationMs } = await spawnClaude(
      invocation,
      tempDir,
      timeoutMs,
    );

    // Parse stream events and extract canonical text.
    const streamEvents = parseStreamString(stdout);
    const extractedText = extractCanonicalText(streamEvents);

    // FR-011: Re-verify the source fixture checksum after execution.
    const checksumAfter = await computeFixtureChecksum(fixtureDir);
    if (checksumBefore !== checksumAfter) {
      throw new Error(
        'Source fixture directory was modified during eval execution. ' +
        `Checksum before: ${checksumBefore}, after: ${checksumAfter}`,
      );
    }

    return {
      extracted_text: extractedText,
      stream_events: streamEvents,
      duration_ms: durationMs,
      exit_code: exitCode,
      timed_out: timedOut,
    };
  } finally {
    // FR-013: Always clean up the temp directory.
    await rm(tempDir, { recursive: true, force: true }).catch(() => {
      // Best-effort cleanup — do not let cleanup errors mask the original error.
    });
  }
}

// ---------------------------------------------------------------------------
// Child process helper
// ---------------------------------------------------------------------------

interface SpawnResult {
  stdout: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
}

/**
 * Spawn `claude --output-format stream-json -p "<invocation>"` and collect
 * stdout. Enforces a timeout and returns partial output if the process is
 * killed.
 */
function spawnClaude(
  invocation: string,
  cwd: string,
  timeoutMs: number,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let timedOut = false;

    const child = spawn(
      'claude',
      ['--output-format', 'stream-json', '-p', invocation],
      {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const stdoutChunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on('data', () => {
      // Intentionally ignored — stderr is not captured in RunOutput.
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to spawn claude CLI: ${err.message}. ` +
          'Is claude installed and available in PATH?',
        ),
      );
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');

      resolve({
        stdout,
        exitCode: code ?? 1,
        timedOut,
        durationMs,
      });
    });
  });
}

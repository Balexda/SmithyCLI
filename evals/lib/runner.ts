/**
 * Eval runner — executes a single eval scenario by invoking
 * the target agent (claude, gemini, or codex) in headless mode
 * against a temp copy of the reference fixture and returning the parsed output.
 *
 * Implements FR-001, FR-002, FR-003, FR-004, FR-011, FR-013.
 */

import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { EvalAgent, EvalFixture, EvalScenario, RunOutput, StreamEvent } from './types.js';
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
  '.gemini',
  '.agents',
  '.codex',
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
 * Spawn the target agent with the given arguments and enforce a timeout.
 * Returns collected stdout, the exit code, whether a timeout occurred,
 * and wall-clock duration.
 */
function spawnAgent(
  agent: EvalAgent,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<SpawnResult> {
  return new Promise<SpawnResult>((resolve, reject) => {
    const start = performance.now();
    let timedOut = false;

    const child = spawn(agent, args, {
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
// Git initialization (runner-internal)
// ---------------------------------------------------------------------------

/** Repo-local git identity used inside the eval temp copy. The git subprocess
 *  also runs with `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_SYSTEM=/dev/null`
 *  (see `initGitInTempCopy`) so the developer's global / system git config is
 *  neither read, written, nor required. */
const EVAL_GIT_USER_EMAIL = 'eval-runner@smithy.local';
const EVAL_GIT_USER_NAME = 'Smithy Eval Runner';

/**
 * `execFileSync` options for every git invocation inside the eval temp copy.
 * Silences git stdio and points `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_SYSTEM`
 * at `/dev/null` so the developer's machine-local git config is neither read
 * nor required (see `initGitInTempCopy`'s docstring for the full rationale).
 */
function evalGitOpts(tmpDir: string) {
  return {
    cwd: tmpDir,
    stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
  };
}

/**
 * Stage every change in `tmpDir` and commit it with the eval identity. Used
 * for both the initial fixture baseline (from `initGitInTempCopy`) and the
 * post-`smithy init` baseline that snapshots the deployed `.claude/` /
 * `.smithy/` files (from `runScenario`). `--allow-empty` makes the helper
 * safe to call when nothing changed since the last commit. Identity and
 * `core.hooksPath` are re-specified via `-c` as a belt-and-suspenders match
 * to the repo-local config set in `initGitInTempCopy`.
 */
function commitAllInTempCopy(tmpDir: string, message: string): void {
  const gitOpts = evalGitOpts(tmpDir);
  execFileSync('git', ['add', '-A'], gitOpts);
  execFileSync(
    'git',
    [
      '-c', `user.email=${EVAL_GIT_USER_EMAIL}`,
      '-c', `user.name=${EVAL_GIT_USER_NAME}`,
      '-c', 'core.hooksPath=/dev/null',
      'commit',
      '--no-gpg-sign',
      '--allow-empty',
      '-m', message,
    ],
    gitOpts,
  );
}

/**
 * Initialize `tmpDir` as a git repository with a baseline commit, using a
 * repo-local identity. All git stdio is silenced so it does not leak into
 * the runner's own streams. Any failure throws (`execFileSync`'s default),
 * which `runScenario`'s `finally` block converts into a clean tmp-dir
 * teardown.
 *
 * The git subprocess env points `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM`
 * at `/dev/null` so the developer's `~/.gitconfig` and `/etc/gitconfig` are
 * neither read nor required — eval behavior is deterministic regardless of
 * machine-local git settings (custom hooks, `core.autocrlf`,
 * `init.templateDir`, etc.).
 *
 * Hook neutralization: `core.hooksPath` is set to `/dev/null` in repo-local
 * config and re-specified via `-c` on the commit, so neither the bootstrap
 * commit nor any later commit inside the temp copy can fire `pre-commit` /
 * `commit-msg` / other hooks inherited from the developer's
 * `~/.git-templates` or `GIT_TEMPLATE_DIR`.
 *
 * Belt-and-suspenders identity handling: we set `user.email` / `user.name`
 * via `git config --local` AND re-specify them with `-c` on the commit so
 * the commit succeeds even in environments where local config is ignored
 * (e.g. some CI sandboxes that override config search paths).
 */
function initGitInTempCopy(tmpDir: string): void {
  const gitOpts = evalGitOpts(tmpDir);

  // `-c init.defaultBranch=main` avoids the "hint: Using 'master' as the
  // name for the initial branch" advice on stderr (silenced anyway) and
  // pins the branch name regardless of the developer's git defaults.
  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], gitOpts);

  // Repo-local identity and hook bypass. Never `--global`.
  execFileSync(
    'git',
    ['config', '--local', 'user.email', EVAL_GIT_USER_EMAIL],
    gitOpts,
  );
  execFileSync(
    'git',
    ['config', '--local', 'user.name', EVAL_GIT_USER_NAME],
    gitOpts,
  );
  execFileSync(
    'git',
    ['config', '--local', 'core.hooksPath', '/dev/null'],
    gitOpts,
  );

  commitAllInTempCopy(tmpDir, 'eval: fixture baseline');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate that the target agent CLI is functional and configured.
 *
 * @throws {Error} If the CLI is not found or not functional.
 */
export function preflight(agent: EvalAgent = 'claude'): void {
  // (a) Validate that the CLI is functional.
  try {
    execFileSync(agent, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    });
  } catch {
    throw new Error(
      `${agent} CLI not found or not functional. ` +
      `Ensure it's in your PATH.`,
    );
  }

  if (agent === 'claude') {
    // (b) Verify that at least one auth path is configured for Claude.
    if (process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_CODE_OAUTH_TOKEN']) {
      return;
    }

    try {
      const result = execFileSync('claude', ['auth', 'status'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10_000,
      });
      const output = result.toString('utf-8');
      if (output.toLowerCase().includes('not logged in')) {
        throw new Error('OAuth not active');
      }
    } catch {
      throw new Error(
        'No API key or OAuth login found for Claude. ' +
        'Set ANTHROPIC_API_KEY, set CLAUDE_CODE_OAUTH_TOKEN, or run `claude login`.',
      );
    }
  } else if (agent === 'gemini') {
    // (b) Verify that at least one auth path is configured for Gemini.
    if (!process.env['GOOGLE_API_KEY']) {
      throw new Error('No API key found for Gemini. Set GOOGLE_API_KEY.');
    }
  } else if (agent === 'codex') {
    // Codex local evals rely on the developer's existing Codex CLI auth/config.
    // There is intentionally no API-key preflight for this path.
  }
}

/**
 * Execute a single eval scenario.
 *
 * 1. Copies `fixtureDir` to a unique temp directory (FR-002).
 * 2. Computes a SHA-256 checksum of the source fixture before execution (FR-011).
 * 3. Spawns `agent --output-format stream-json -p "<invocation>"` in the temp copy.
 * 4. Enforces per-case timeout (FR-004).
 * 5. Extracts canonical text via `extractCanonicalText` (FR-001).
 * 6. Re-verifies the source fixture checksum (FR-011).
 * 7. Cleans up the temp directory in a `finally` block (FR-013).
 */
export async function runScenario(
  scenario: EvalScenario,
  fixtureDir: string,
  agent: EvalAgent = 'claude',
): Promise<RunOutput> {
  const selectedFixtureDir = resolveScenarioFixtureDir(scenario, fixtureDir);
  const requiresGit = scenario.requires_git ?? true;

  // Create a unique temp directory and copy the fixture into it.
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'smithy-eval-'),
  );

  try {
    // FR-002: Copy fixture to temp directory.
    fs.cpSync(selectedFixtureDir, tmpDir, { recursive: true });

    if (requiresGit) {
      // Initialize the temp copy as a git repository with a baseline commit
      // BEFORE any skill invocation. Scenarios whose producing command runs
      // `git checkout -b` (mark / cut / render / ignite) fail at branch creation
      // unless the working tree is a real git repo with a HEAD commit. Doing
      // this here decouples the runner from whether the fixture source is
      // itself under git (SD-001 / SD-007). A repo-local identity is configured
      // so the developer's global git config is never touched.
      initGitInTempCopy(tmpDir);
    }

    // Deploy Smithy skills into the temp copy.
    execFileSync('node', [CLI_PATH, 'init', '-a', agent, '-y'], {
      cwd: tmpDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (requiresGit) {
      // Commit a second baseline so the worktree is clean when `claude` spawns.
      // `smithy init` writes `.claude/`, `.smithy/`, and may update `.gitignore`,
      // which would otherwise leave the temp repo dirty for the whole scenario.
      // Producing commands that gate behavior on `git status --porcelain` clean
      // (e.g. refine paths in mark / cut) need this to detect no-op runs.
      commitAllInTempCopy(tmpDir, 'eval: post-init baseline');
    }

    // FR-011: Checksum the source fixture *before* execution.
    const checksumBefore = hashDirectory(selectedFixtureDir);

    // Build the invocation string. Claude/Gemini scenarios use slash-command
    // form; Codex uses deployed skills, so name the matching skill directly.
    const invocation = buildInvocation(scenario, agent);

    // Determine timeout: scenario-level override (in seconds) → default.
    const timeoutMs = scenario.timeout != null
      ? scenario.timeout * 1000
      : DEFAULT_TIMEOUT_MS;

    const result = await spawnAgent(
      agent,
      buildAgentArgs(agent, invocation, tmpDir),
      tmpDir,
      timeoutMs,
    );

    // Parse the NDJSON output.
    let events: StreamEvent[] = [];
    let extractedText = '';
    if (result.timed_out || result.exit_code !== 0) {
      try {
        events = parseStreamString(result.stdout);
        extractedText = extractCanonicalText(events);
      } catch {
        // Partial/malformed output — keep empty defaults.
      }
    } else {
      events = parseStreamString(result.stdout);
      extractedText = extractCanonicalText(events);
    }

    // FR-011: Re-verify the source fixture after execution.
    const checksumAfter = hashDirectory(selectedFixtureDir);
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

function resolveScenarioFixtureDir(
  scenario: EvalScenario,
  fixtureDir: string,
): string {
  const fixture = scenario.fixture ?? 'js';
  assertFixture(fixture, scenario.name);

  const selectedDir = fixture === 'js'
    ? fixtureDir
    : path.join(fixtureDir, fixture);
  const stat = fs.statSync(selectedDir, { throwIfNoEntry: false });
  if (!stat) {
    throw new Error(
      `Scenario "${scenario.name}" requested fixture "${fixture}", but fixture directory was not found: ${selectedDir}`,
    );
  }
  if (!stat.isDirectory()) {
    throw new Error(
      `Scenario "${scenario.name}" requested fixture "${fixture}", but fixture path is not a directory: ${selectedDir}`,
    );
  }

  return selectedDir;
}

function assertFixture(fixture: string, scenarioName: string): asserts fixture is EvalFixture {
  if (fixture !== 'js' && fixture !== 'jvm') {
    throw new Error(
      `Scenario "${scenarioName}" requested unsupported fixture "${fixture}". Supported fixtures: js, jvm`,
    );
  }
}

function buildAgentArgs(agent: EvalAgent, invocation: string, tmpDir: string): string[] {
  if (agent === 'codex') {
    return [
      'exec',
      '--json',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '--cd', tmpDir,
      invocation,
    ];
  }

  return [
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'bypassPermissions',
    '-p', invocation,
  ];
}

function buildInvocation(scenario: EvalScenario, agent: EvalAgent): string {
  const prompt = scenario.prompt.trim();
  if (agent !== 'codex') {
    return `${scenario.skill} ${scenario.prompt}`;
  }

  const skillName = codexSkillName(scenario.skill);
  if (!skillName) return prompt;

  return `Use the ${skillName} skill.\n\nInput:\n${prompt}`;
}

function codexSkillName(skill: string): string {
  const normalized = skill.trim().replace(/^\//, '').replace(/\./g, '-');
  return normalized;
}

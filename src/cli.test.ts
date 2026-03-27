import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

describe('CLI --version', () => {
  it('reports the version from package.json', () => {
    const output = execFileSync('node', ['dist/cli.js', '--version'], {
      encoding: 'utf-8',
    }).trim();
    expect(output).toBe(pkg.version);
  });
});

describe('CLI init (interactive)', () => {
  it('shows the interactive prompt when no flags are passed', () => {
    // Use Node-native timeout via spawnSync instead of shell `timeout` command
    // so the test works cross-platform (Windows, macOS without coreutils).
    const result = spawnSync('node', ['dist/cli.js', 'init'], {
      encoding: 'utf-8',
      timeout: 2000,
    });
    const output = result.stdout + result.stderr;
    expect(output).toContain('Welcome to Smithy CLI');
    expect(output).toContain('Which AI assistant CLI');
  });
});

describe('CLI init --yes (non-interactive)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs to completion with -y and deploys all agents by default', () => {
    const output = execFileSync('node', ['dist/cli.js', 'init', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    expect(output).toContain('Welcome to Smithy CLI');
    expect(output).toContain('Initialization complete');

    // All three agents deployed
    expect(fs.existsSync(path.join(tmpDir, '.gemini', 'skills'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'tools', 'codex', 'prompts'))).toBe(true);

    // Issue templates deployed
    expect(fs.existsSync(path.join(tmpDir, '.github', 'ISSUE_TEMPLATE'))).toBe(true);
  });

  it('deploys only claude when --agent claude is specified', () => {
    const output = execFileSync('node', ['dist/cli.js', 'init', '-a', 'claude', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    expect(output).toContain('Initialization complete');

    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.gemini', 'skills'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'tools', 'codex', 'prompts'))).toBe(false);
  });

  it('skips issue templates with --no-issue-templates', () => {
    execFileSync('node', ['dist/cli.js', 'init', '--no-issue-templates', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    expect(fs.existsSync(path.join(tmpDir, '.github', 'ISSUE_TEMPLATE'))).toBe(false);
  });

  it('skips permissions with --permissions none', () => {
    execFileSync('node', ['dist/cli.js', 'init', '-a', 'claude', '--permissions', 'none', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
    // No permissions file when --permissions none
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(false);
  });

  it('rejects invalid agent names', () => {
    expect(() => {
      execFileSync('node', ['dist/cli.js', 'init', '--agent', 'bogus'], {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }).toThrow();
  });
});

describe('CLI uninit --yes (non-interactive)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-test-'));
    // Deploy first so there's something to remove
    execFileSync('node', ['dist/cli.js', 'init', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes artifacts without prompting', () => {
    const output = execFileSync('node', ['dist/cli.js', 'uninit', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    expect(output).toContain('Auto-confirming removal');
    expect(output).toContain('Successfully removed');
  });
});

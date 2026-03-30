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

    // Issue templates deployed to .smithy/ (repo default)
    expect(fs.existsSync(path.join(tmpDir, '.smithy'))).toBe(true);
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
    expect(fs.existsSync(path.join(tmpDir, '.smithy'))).toBe(false);
  });

  it('skips permissions with --no-permissions', () => {
    execFileSync('node', ['dist/cli.js', 'init', '-a', 'claude', '--no-permissions', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
    // No permissions file when --no-permissions
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

  it('rejects --location incompatible with agent', () => {
    const result = spawnSync('node', ['dist/cli.js', 'init', '-a', 'gemini', '--location', 'local', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    const output = result.stdout + result.stderr;
    expect(output).toContain('not supported by gemini');
    // Should not deploy anything
    expect(fs.existsSync(path.join(tmpDir, '.gemini', 'skills'))).toBe(false);
  });

  it('accepts --location flag', () => {
    execFileSync('node', ['dist/cli.js', 'init', '-a', 'claude', '--location', 'repo', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(true);
  });

  it('deploys permissions to local with --location local', () => {
    execFileSync('node', ['dist/cli.js', 'init', '-a', 'claude', '--location', 'local', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
    // Local permissions go to settings.local.json
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.local.json'))).toBe(true);
    // Repo-level settings.json should NOT be created
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(false);
  });

  it('deploys issue templates to .smithy/local/ with --location local', () => {
    execFileSync('node', ['dist/cli.js', 'init', '-a', 'claude', '--location', 'local', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    expect(fs.existsSync(path.join(tmpDir, '.smithy', 'local'))).toBe(true);
    // .smithy/local/ should be in gitignore
    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.smithy/local/');
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

  it('actually deletes prompt and command files from disk', () => {
    // Verify files exist before uninit
    expect(fs.readdirSync(path.join(tmpDir, '.claude', 'prompts')).length).toBeGreaterThan(0);

    execFileSync('node', ['dist/cli.js', 'uninit', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });

    // Prompts should be empty (or only contain non-smithy files)
    const promptsDir = path.join(tmpDir, '.claude', 'prompts');
    if (fs.existsSync(promptsDir)) {
      const remaining = fs.readdirSync(promptsDir).filter(f => f.startsWith('smithy.'));
      expect(remaining).toEqual([]);
    }

    // Commands should also be cleaned
    const commandsDir = path.join(tmpDir, '.claude', 'commands');
    if (fs.existsSync(commandsDir)) {
      const remaining = fs.readdirSync(commandsDir).filter(f => f.startsWith('smithy.'));
      expect(remaining).toEqual([]);
    }
  });

  it('preserves .claude/settings.json after uninit', () => {
    // settings.json should exist after init -y (permissions default to true)
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(true);

    execFileSync('node', ['dist/cli.js', 'uninit', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });

    // settings.json should still exist after uninit
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(true);
  });

  it('preserves user-created files in .claude/prompts/', () => {
    const userFile = path.join(tmpDir, '.claude', 'prompts', 'my-custom-prompt.md');
    fs.writeFileSync(userFile, '# My custom prompt');

    execFileSync('node', ['dist/cli.js', 'uninit', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });

    expect(fs.existsSync(userFile)).toBe(true);
  });
});

describe('CLI uninit on clean directory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports no artifacts found on never-initialized directory', () => {
    const output = execFileSync('node', ['dist/cli.js', 'uninit', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    expect(output).toContain('No Smithy artifacts were found to remove');
  });
});

describe('CLI init lifecycle and idempotency', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('init -> uninit -> init produces clean state', () => {
    execFileSync('node', ['dist/cli.js', 'init', '-a', 'claude', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    const firstFiles = fs.readdirSync(path.join(tmpDir, '.claude', 'prompts')).sort();

    execFileSync('node', ['dist/cli.js', 'uninit', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });

    execFileSync('node', ['dist/cli.js', 'init', '-a', 'claude', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    const secondFiles = fs.readdirSync(path.join(tmpDir, '.claude', 'prompts')).sort();

    expect(secondFiles).toEqual(firstFiles);
  });

  it('double init is idempotent (no duplicate gitignore entries)', () => {
    execFileSync('node', ['dist/cli.js', 'init', '-a', 'claude', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });
    execFileSync('node', ['dist/cli.js', 'init', '-a', 'claude', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    const claudeEntries = gitignore.split('\n').filter(l => l.trim() === '.claude/settings.local.json');
    expect(claudeEntries.length).toBe(1);
  });

  it('creates .gitignore from scratch when none exists', () => {
    expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(false);

    execFileSync('node', ['dist/cli.js', 'init', '-a', 'claude', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });

    expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('.claude/settings.local.json');
  });

  it('adds only agent-specific gitignore entries for --agent claude', () => {
    execFileSync('node', ['dist/cli.js', 'init', '-a', 'claude', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('.claude/settings.local.json');
    expect(content).not.toContain('.gemini/');
    expect(content).not.toContain('.codex/');
    expect(content).not.toContain('tools/codex/');
  });

  it('does not add directory-level gitignore entries for gemini or codex', () => {
    execFileSync('node', ['dist/cli.js', 'init', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('.claude/settings.local.json');
    expect(content).not.toContain('.gemini/');
    expect(content).not.toContain('.codex/');
    expect(content).not.toContain('tools/codex/');
  });

  it('creates settings.json with --agent claude --permissions', () => {
    execFileSync('node', ['dist/cli.js', 'init', '-a', 'claude', '--permissions', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.permissions.allow.length).toBeGreaterThan(0);
    expect(config.permissions.deny.length).toBeGreaterThan(0);
  });

  it('deploys actual issue template files to .smithy/', () => {
    execFileSync('node', ['dist/cli.js', 'init', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });

    const smithyDir = path.join(tmpDir, '.smithy');
    const files = fs.readdirSync(smithyDir);
    // Should contain at least config.yml and some .md templates
    expect(files.some(f => f.endsWith('.yml'))).toBe(true);
    expect(files.some(f => f.endsWith('.md'))).toBe(true);
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it('uninit removes only matching issue template files, preserves others', () => {
    execFileSync('node', ['dist/cli.js', 'init', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });

    // Add a custom file in .smithy/
    const customFile = path.join(tmpDir, '.smithy', 'custom-template.md');
    fs.writeFileSync(customFile, '---\nname: Custom\n---\nCustom template');

    execFileSync('node', ['dist/cli.js', 'uninit', '-y', '-d', tmpDir], {
      encoding: 'utf-8',
    });

    // Custom file should survive (uninit only removes known smithy files)
    expect(fs.existsSync(customFile)).toBe(true);
  });
});

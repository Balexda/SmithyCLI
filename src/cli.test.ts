import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const CLI = path.resolve('dist/cli.js');

describe('CLI --version', () => {
  it('reports the version from package.json', () => {
    const output = execFileSync('node', [CLI, '--version'], {
      encoding: 'utf-8',
    }).trim();
    expect(output).toBe(pkg.version);
  });
});

describe('CLI init (interactive)', () => {
  it('shows the interactive prompt when no flags are passed', () => {
    // Use Node-native timeout via spawnSync instead of shell `timeout` command
    // so the test works cross-platform (Windows, macOS without coreutils).
    const result = spawnSync('node', [CLI, 'init'], {
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
    const output = execFileSync('node', [CLI, 'init', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    expect(output).toContain('Welcome to Smithy CLI');
    expect(output).toContain('Initialization complete');

    // Both agents deployed
    expect(fs.existsSync(path.join(tmpDir, '.gemini', 'skills'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);

    // Issue templates deployed to .smithy/ (repo default)
    expect(fs.existsSync(path.join(tmpDir, '.smithy'))).toBe(true);
  });

  it('deploys only claude when --agent claude is specified', () => {
    const output = execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    expect(output).toContain('Initialization complete');

    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.gemini', 'skills'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'tools', 'codex', 'prompts'))).toBe(false);
  });

  it('skips issue templates with --no-issue-templates', () => {
    execFileSync('node', [CLI, 'init', '--no-issue-templates', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    // .smithy/ may exist (for manifests), but should have no issue template files
    const smithyDir = path.join(tmpDir, '.smithy');
    if (fs.existsSync(smithyDir)) {
      const files = fs.readdirSync(smithyDir);
      const issueFiles = files.filter(f => f.endsWith('.md') || f === 'config.yml');
      expect(issueFiles).toEqual([]);
    }
  });

  it('skips permissions with --no-permissions', () => {
    // Also pass --no-session-titles so settings.json is not created at all.
    execFileSync('node', [CLI, 'init', '-a', 'claude', '--no-permissions', '--no-session-titles', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
    // No settings file when both permissions and session-titles are disabled
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(false);
  });

  it('deploys session-title hook by default', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'hooks', 'smithy-session-title.mjs'))).toBe(true);
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'));
    expect(config.hooks.UserPromptSubmit[0].hooks[0].command).toContain('smithy-session-title.mjs');
  });

  it('skips session-title hook with --no-session-titles', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '--no-session-titles', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'hooks'))).toBe(false);
    // settings.json may exist for permissions, but it must not contain our hook
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      expect(config.hooks).toBeUndefined();
    }
  });

  it('rejects invalid agent names', () => {
    expect(() => {
      execFileSync('node', [CLI, 'init', '--agent', 'bogus'], {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }).toThrow();
  });

  it('rejects --location incompatible with agent', () => {
    const result = spawnSync('node', [CLI, 'init', '-a', 'gemini', '--location', 'user', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    const output = result.stdout + result.stderr;
    expect(output).toContain('not supported by gemini');
    // Should not deploy anything
    expect(fs.existsSync(path.join(tmpDir, '.gemini', 'skills'))).toBe(false);
  });

  it('accepts --location flag', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '--location', 'repo', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(true);
  });

});

describe('CLI uninit --yes (non-interactive)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-test-'));
    // Deploy first so there's something to remove
    execFileSync('node', [CLI, 'init', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes artifacts without prompting', () => {
    const output = execFileSync('node', [CLI, 'uninit', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    expect(output).toContain('Auto-confirming removal');
    expect(output).toContain('Successfully removed');
  });

  it('actually deletes prompt and command files from disk', () => {
    // Verify files exist before uninit
    expect(fs.readdirSync(path.join(tmpDir, '.claude', 'prompts')).length).toBeGreaterThan(0);

    execFileSync('node', [CLI, 'uninit', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
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

    execFileSync('node', [CLI, 'uninit', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // settings.json should still exist after uninit
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(true);
  });

  it('removes the session-title hook script and its settings.json entry on uninit', () => {
    // beforeEach already ran `init -y` which deploys the hook by default
    const hookScript = path.join(tmpDir, '.claude', 'hooks', 'smithy-session-title.mjs');
    expect(fs.existsSync(hookScript)).toBe(true);
    const beforeConfig = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'),
    );
    expect(beforeConfig.hooks?.UserPromptSubmit).toBeDefined();

    execFileSync('node', [CLI, 'uninit', '-y'], { encoding: 'utf-8', cwd: tmpDir });

    expect(fs.existsSync(hookScript)).toBe(false);
    // settings.json is preserved (still has permissions) but hook entry is gone
    const afterConfig = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'),
    );
    expect(afterConfig.hooks).toBeUndefined();
    expect(afterConfig.permissions).toBeDefined();
  });

  it('preserves user-created files in .claude/prompts/', () => {
    const userFile = path.join(tmpDir, '.claude', 'prompts', 'my-custom-prompt.md');
    fs.writeFileSync(userFile, '# My custom prompt');

    execFileSync('node', [CLI, 'uninit', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
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
    const output = execFileSync('node', [CLI, 'uninit', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    expect(output).toContain('No Smithy artifacts were found to remove');
  });
});

describe('CLI update (non-interactive)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('errors when no manifest exists', () => {
    const result = spawnSync('node', [CLI, 'update', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    const output = result.stdout + result.stderr;
    expect(output).toContain('No smithy manifest found');
  });

  it('updates successfully after init', () => {
    execFileSync('node', [CLI, 'init', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const output = execFileSync('node', [CLI, 'update', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    expect(output).toContain('Smithy CLI — Update');
    expect(output).toContain('Found repo manifest');
    expect(output).not.toContain('Welcome to Smithy CLI');
    expect(output).toContain('Upgrade complete');
  });

  it('upgrade alias works', () => {
    execFileSync('node', [CLI, 'init', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const output = execFileSync('node', [CLI, 'upgrade', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    expect(output).toContain('Smithy CLI — Update');
    expect(output).not.toContain('Welcome to Smithy CLI');
    expect(output).toContain('Upgrade complete');
  });

  it('preserves manifest config through update', () => {
    // Init with only claude
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    execFileSync('node', [CLI, 'update', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // Should still be claude-only, not all agents
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.gemini', 'skills'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'tools', 'codex', 'prompts'))).toBe(false);
  });

  it('manifest version is updated after update', () => {
    execFileSync('node', [CLI, 'init', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // Tamper with manifest version to simulate older install
    const manifestPath = path.join(tmpDir, '.smithy', 'smithy-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.smithyVersion = '0.0.1';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    execFileSync('node', [CLI, 'update', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const updated = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(updated.smithyVersion).toBe(pkg.version);
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
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    const firstFiles = fs.readdirSync(path.join(tmpDir, '.claude', 'prompts')).sort();

    execFileSync('node', [CLI, 'uninit', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    const secondFiles = fs.readdirSync(path.join(tmpDir, '.claude', 'prompts')).sort();

    expect(secondFiles).toEqual(firstFiles);
  });

  it('double init is idempotent (no duplicate gitignore entries)', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    const claudeEntries = gitignore.split('\n').filter(l => l.trim() === '.claude/settings.local.json');
    expect(claudeEntries.length).toBe(1);
  });

  it('creates .gitignore from scratch when none exists', () => {
    expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(false);

    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('.claude/settings.local.json');
  });

  it('adds only agent-specific gitignore entries for --agent claude', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('.claude/settings.local.json');
    expect(content).not.toContain('.gemini/');
    expect(content).not.toContain('.codex/');
    expect(content).not.toContain('tools/codex/');
  });

  it('does not add directory-level gitignore entries for gemini or codex', () => {
    execFileSync('node', [CLI, 'init', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('.claude/settings.local.json');
    expect(content).not.toContain('.gemini/');
    expect(content).not.toContain('.codex/');
    expect(content).not.toContain('tools/codex/');
  });

  it('creates settings.json with --agent claude --permissions', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '--permissions', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.permissions.allow.length).toBeGreaterThan(0);
    expect(config.permissions.deny.length).toBeGreaterThan(0);
  });

  it('deploys actual issue template files to .smithy/', () => {
    execFileSync('node', [CLI, 'init', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const smithyDir = path.join(tmpDir, '.smithy');
    const files = fs.readdirSync(smithyDir);
    // Should contain at least config.yml and some .md templates
    expect(files.some(f => f.endsWith('.yml'))).toBe(true);
    expect(files.some(f => f.endsWith('.md'))).toBe(true);
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it('uninit removes only matching issue template files, preserves others', () => {
    execFileSync('node', [CLI, 'init', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // Add a custom file in .smithy/
    const customFile = path.join(tmpDir, '.smithy', 'custom-template.md');
    fs.writeFileSync(customFile, '---\nname: Custom\n---\nCustom template');

    execFileSync('node', [CLI, 'uninit', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // Custom file should survive (uninit only removes known smithy files)
    expect(fs.existsSync(customFile)).toBe(true);
  });
});

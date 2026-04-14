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

describe('CLI status', () => {
  let tmpDir: string;

  const TABLE_HEADER =
    '| ID | Title | Depends On | Artifact |\n|----|-------|------------|----------|';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-status-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function write(relPath: string, contents: string): void {
    const abs = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
  }

  it('shows the subcommand and all options in --help', () => {
    const output = execFileSync('node', [CLI, 'status', '--help'], {
      encoding: 'utf-8',
    });
    expect(output).toContain('status');
    expect(output).toContain('--root');
    expect(output).toContain('--format');
    expect(output).toContain('--status');
    expect(output).toContain('--type');
    expect(output).toContain('--all');
    expect(output).toContain('--graph');
    expect(output).toContain('--no-color');
  });

  it('emits contract-shaped JSON with records, summary, tree, graph', () => {
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Feature Specification: Feature A\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Story One | — | specs/feature-a/01-first.tasks.md |\n`,
    );
    write(
      'specs/feature-a/01-first.tasks.md',
      `# Tasks\n\n## Slice 1: First\n\n- [x] Task one\n- [x] Task two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | First | — | — |\n`,
    );

    const output = execFileSync('node', [CLI, 'status', '--format', 'json', '--root', tmpDir], {
      encoding: 'utf-8',
    });

    const payload = JSON.parse(output) as {
      summary: {
        counts: Record<'rfc' | 'features' | 'spec' | 'tasks', Record<string, number>>;
        orphan_count: number;
        broken_link_count: number;
        parse_error_count: number;
      };
      records: Array<{
        type: string;
        path: string;
        title: string;
        status: string;
        dependency_order: { rows: unknown[]; id_prefix: string; format: string };
      }>;
      tree: { roots: unknown[] };
      graph: { nodes: unknown; layers: unknown[]; cycles: unknown[]; dangling_refs: unknown[] };
    };

    // Top-level shape matches the contracts.
    expect(payload).toHaveProperty('summary');
    expect(payload).toHaveProperty('records');
    expect(payload).toHaveProperty('tree');
    expect(payload).toHaveProperty('graph');

    // Records embed the parsed dependency_order sub-object.
    const specRecord = payload.records.find((r) => r.type === 'spec');
    expect(specRecord).toBeDefined();
    expect(specRecord?.dependency_order.format).toBe('table');
    expect(specRecord?.dependency_order.id_prefix).toBe('US');

    // Tasks record classifies as done (2/2 checkboxes in slice body).
    const tasksRecord = payload.records.find((r) => r.type === 'tasks');
    expect(tasksRecord).toBeDefined();
    expect(tasksRecord?.status).toBe('done');

    // Spec rolls up to done because its only child is done.
    expect(specRecord?.status).toBe('done');

    // Summary counts match the records.
    expect(payload.summary.counts.spec.done).toBe(1);
    expect(payload.summary.counts.tasks.done).toBe(1);
    expect(payload.summary.parse_error_count).toBe(0);
  });

  it('exits 0 with a friendly hint on an empty repo', () => {
    const result = spawnSync('node', [CLI, 'status', '--root', tmpDir], {
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/smithy\.ignite|smithy\.mark/);
  });

  it('exits 2 with a stderr message when --root points to a nonexistent path', () => {
    const missing = path.join(tmpDir, 'does-not-exist');
    const result = spawnSync('node', [CLI, 'status', '--root', missing], {
      encoding: 'utf-8',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('does not exist');
  });

  it('emits a minimal flat text listing in type/path/title/status column order', () => {
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Feature Specification: Feature A\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Story | — | — |\n`,
    );

    const output = execFileSync('node', [CLI, 'status', '--root', tmpDir], {
      encoding: 'utf-8',
    });

    // Flat listing: one line per record. Column order is type, path,
    // title, status per the Slice 3 task spec.
    const line = output
      .split('\n')
      .find((l) => l.includes('specs/feature-a/feature-a.spec.md'));
    expect(line).toBeDefined();
    const cols = (line ?? '').split('\t');
    expect(cols[0]).toBe('spec');
    expect(cols[1]).toBe('specs/feature-a/feature-a.spec.md');
    expect(cols[2]).toBe('Feature A');
    expect(cols[3]).toBe('not-started');
  });

  it('emits a valid (empty) JSON payload for an empty repo in --format json mode', () => {
    const output = execFileSync('node', [CLI, 'status', '--format', 'json', '--root', tmpDir], {
      encoding: 'utf-8',
    });
    // Must be parseable as JSON — machine consumers parse stdout
    // unconditionally in JSON mode.
    const payload = JSON.parse(output) as {
      summary: { parse_error_count: number };
      records: unknown[];
      tree: { roots: unknown[] };
      graph: { nodes: unknown; layers: unknown[] };
    };
    expect(payload.records).toEqual([]);
    expect(payload.summary.parse_error_count).toBe(0);
    expect(payload.tree.roots).toEqual([]);
    expect(payload.graph.layers).toEqual([]);
  });

  it('exits 2 with a stderr message on an invalid --status value', () => {
    const result = spawnSync(
      'node',
      [CLI, 'status', '--root', tmpDir, '--status', 'bogus'],
      { encoding: 'utf-8' },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('invalid --status');
    expect(result.stderr).toContain('done');
  });

  it('exits 2 with a stderr message on an invalid --type value', () => {
    const result = spawnSync(
      'node',
      [CLI, 'status', '--root', tmpDir, '--type', 'bogus'],
      { encoding: 'utf-8' },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('invalid --type');
    expect(result.stderr).toContain('rfc');
  });

  it('surfaces individual parse failures as records with status unknown and exits 0', () => {
    // A parent-type artifact whose `## Dependency Order` section uses
    // the legacy checkbox format triggers the `unknown` classifier
    // branch AND emits a `format_legacy` warning (SD-002 rule).
    write(
      'specs/broken/broken.spec.md',
      '# Broken\n\n## Dependency Order\n\n- [ ] US1 Story One → specs/broken/01-story.tasks.md\n- [ ] US2 Story Two → specs/broken/02-story.tasks.md\n',
    );

    const result = spawnSync('node', [CLI, 'status', '--format', 'json', '--root', tmpDir], {
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);

    const payload = JSON.parse(result.stdout) as {
      records: Array<{ status: string; warnings: string[] }>;
      summary: { parse_error_count: number };
    };
    const unknownRecord = payload.records.find((r) => r.status === 'unknown');
    expect(unknownRecord).toBeDefined();
    expect(unknownRecord?.warnings.length).toBeGreaterThan(0);
    expect(payload.summary.parse_error_count).toBeGreaterThan(0);
  });

  it('populates tree.roots via buildTree against a full-chain + orphan + broken-link fixture', async () => {
    // US2 Slice 1: verify the JSON payload's `tree` field is populated
    // by `buildTree(records)` and matches byte-for-byte a tree built
    // from the same records in-process. Fixture intentionally mixes
    // three shapes: one full RFC→features→spec→tasks chain, one
    // orphaned spec, and one broken-link tasks file whose declared
    // `**Source**:` header points at a missing spec.
    const FEATURE_TABLE = `${TABLE_HEADER}\n| F1 | Chain Feature | — | specs/chain-feature/ |\n`;
    const CHAIN_SPEC_TABLE = `${TABLE_HEADER}\n| US1 | Chain Story | — | specs/chain-feature/01-chain-story.tasks.md |\n`;

    // Full chain: RFC → features → spec → tasks
    write(
      'docs/rfcs/0001-demo.rfc.md',
      `# Demo RFC\n\n## Dependency Order\n\n${TABLE_HEADER}\n| M1 | Milestone One | — | docs/rfcs/0001-demo.features.md |\n`,
    );
    write(
      'docs/rfcs/0001-demo.features.md',
      `# Demo Features\n\n## Dependency Order\n\n${FEATURE_TABLE}`,
    );
    write(
      'specs/chain-feature/chain-feature.spec.md',
      `# Feature Specification: Chain Feature\n\n## Dependency Order\n\n${CHAIN_SPEC_TABLE}`,
    );
    write(
      'specs/chain-feature/01-chain-story.tasks.md',
      `# Tasks\n\n**Source**: \`specs/chain-feature/chain-feature.spec.md\` — User Story 1\n\n## Slice 1: First\n\n- [ ] Task one\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | First | — | — |\n`,
    );

    // Orphaned spec: not referenced by any feature map.
    write(
      'specs/orphan-feature/orphan-feature.spec.md',
      `# Feature Specification: Orphan Feature\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Lone Story | — | — |\n`,
    );

    // Broken-link tasks: declares a **Source** that does not exist.
    write(
      'specs/lost/01-dangling.tasks.md',
      '# Tasks\n\n**Source**: `specs/deleted/deleted.spec.md` — User Story 1\n\n## Slice 1: Lost\n\n- [ ] Task\n',
    );

    const output = execFileSync(
      'node',
      [CLI, 'status', '--format', 'json', '--root', tmpDir],
      { encoding: 'utf-8' },
    );
    const payload = JSON.parse(output) as {
      records: unknown[];
      tree: { roots: Array<{ record: { path: string; title: string }; children: unknown[] }> };
    };

    // Import `buildTree` from the status module so we can compute an
    // expected tree from the records the CLI produced, and assert
    // byte-for-byte equality against the tree the CLI emitted.
    const { buildTree } = await import('./status/tree.js');
    // Import the types via the records payload; we cast here because
    // JSON.parse loses the ArtifactRecord type branding.
    const expectedTree = buildTree(payload.records as Parameters<typeof buildTree>[0]);

    // Byte-for-byte match: serialize both sides and compare strings.
    expect(JSON.stringify(payload.tree)).toBe(JSON.stringify(expectedTree));

    // Structural sanity: the tree should contain the Orphaned Specs
    // group, the Broken Links group, and a real chain root.
    const rootPaths = payload.tree.roots.map((r) => r.record.path);
    expect(rootPaths).toContain('__orphaned_specs__');
    expect(rootPaths).toContain('__broken_links__');

    // The Orphaned Specs group has exactly one child (our orphan spec).
    const orphanGroup = payload.tree.roots.find(
      (r) => r.record.path === '__orphaned_specs__',
    );
    expect(orphanGroup).toBeDefined();
    expect(orphanGroup?.children).toHaveLength(1);

    // The Broken Links group has exactly one child (our dangling tasks).
    const brokenGroup = payload.tree.roots.find(
      (r) => r.record.path === '__broken_links__',
    );
    expect(brokenGroup).toBeDefined();
    expect(brokenGroup?.children).toHaveLength(1);

    // A full-chain root (the RFC) also lives in roots, somewhere
    // below the group sentinels.
    const realRoots = payload.tree.roots.filter(
      (r) => !r.record.path.startsWith('__'),
    );
    expect(realRoots.length).toBeGreaterThanOrEqual(1);
    // Walk from the RFC down four levels to confirm the tasks record
    // is reachable at the deepest position (AS 2.1).
    const rfcRoot = realRoots.find((r) => r.record.path.endsWith('.rfc.md'));
    expect(rfcRoot).toBeDefined();
    const features = rfcRoot?.children as
      | Array<{ record: { path: string }; children: Array<{ record: { path: string }; children: Array<{ record: { path: string } }> }> }>
      | undefined;
    expect(features?.[0]?.record.path).toBe('docs/rfcs/0001-demo.features.md');
    expect(features?.[0]?.children[0]?.record.path).toBe(
      'specs/chain-feature/chain-feature.spec.md',
    );
    expect(features?.[0]?.children[0]?.children[0]?.record.path).toBe(
      'specs/chain-feature/01-chain-story.tasks.md',
    );
  });

  it('accepts all downstream option stubs without error', () => {
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Story | — | — |\n`,
    );

    const result = spawnSync(
      'node',
      [
        CLI,
        'status',
        '--root', tmpDir,
        '--status', 'in-progress',
        '--type', 'spec',
        '--all',
        '--graph',
        '--no-color',
      ],
      { encoding: 'utf-8' },
    );
    // Commander should not reject any of these stubs.
    expect(result.status).toBe(0);
  });
});

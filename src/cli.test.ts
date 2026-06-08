import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ORDERS_DEFAULT_TEMPLATES } from './orders-templates.js';

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
    // Budget generously: cold-start CI runners can take >2s to load Node +
    // the 80KB dist/cli.js bundle and reach Inquirer's first prompt. The
    // timeout exists only to prevent an infinite hang when Inquirer is
    // waiting on stdin — the assertions key off captured output, not
    // wall-clock speed.
    const result = spawnSync('node', [CLI, 'init'], {
      encoding: 'utf-8',
      timeout: 15_000,
    });
    const output = result.stdout + result.stderr;
    expect(output).toContain('Welcome to Smithy CLI');
    expect(output).toContain('Which AI assistant CLI');
  }, 20_000);
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

    // All repo-scoped agents deployed
    expect(fs.existsSync(path.join(tmpDir, '.gemini', 'skills'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'tools', 'codex', 'prompts'))).toBe(true);

    // Manifest directory created at .smithy/ (repo default)
    expect(fs.existsSync(path.join(tmpDir, '.smithy'))).toBe(true);
  });

  it('deploys gemini with conditional templates and skills with scripts', () => {
    execFileSync('node', [CLI, 'init', '-a', 'gemini', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const geminiSkillsDir = path.join(tmpDir, '.gemini', 'skills');
    expect(fs.existsSync(geminiSkillsDir)).toBe(true);

    // Verify smithy.gh-issue is deployed with scripts
    const ghIssueDir = path.join(geminiSkillsDir, 'smithy.gh-issue');
    expect(fs.existsSync(path.join(ghIssueDir, 'scripts', 'check-env.sh'))).toBe(true);

    // Verify SKILL.md content has Gemini-specific path (conditional rendering worked)
    const skillMd = fs.readFileSync(path.join(ghIssueDir, 'SKILL.md'), 'utf8');
    expect(skillMd).toContain('./.gemini/skills/smithy.gh-issue/scripts/check-env.sh');
    expect(skillMd).not.toContain('${CLAUDE_SKILL_DIR}');
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

  it('deploys only codex when --agent codex is specified', () => {
    const output = execFileSync('node', [CLI, 'init', '-a', 'codex', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    expect(output).toContain('Initialization complete');

    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'smithy-forge', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'smithy-fix', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'smithy.pr-review', 'scripts', 'find-pr.sh'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'smithy.pr-review', 'scripts', 'add-comment.sh'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'tools', 'codex', 'prompts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.gemini', 'skills'))).toBe(false);
  });

  it('does not advertise the retired --issue-templates / --no-issue-templates flags', () => {
    const result = spawnSync('node', [CLI, 'init', '--help'], {
      encoding: 'utf-8',
    });
    const output = result.stdout + result.stderr;
    expect(output).not.toContain('--issue-templates');
    expect(output).not.toContain('--no-issue-templates');
  });

  describe('--artifacts-location', () => {
    it('defaults to repo mode — no artifactsLocation field in the manifest, no tilde prefix in deployed prompts', () => {
      execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
        encoding: 'utf-8',
        cwd: tmpDir,
      });
      const manifestPath = path.join(tmpDir, '.smithy', 'smithy-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.artifactsLocation).toBeUndefined();

      const strike = fs.readFileSync(
        path.join(tmpDir, '.claude', 'commands', 'smithy.strike.md'),
        'utf8',
      );
      // Path in the Phase 3 write instruction renders without a prefix.
      expect(strike).toContain(
        'Write a single strike document to `specs/strikes/YYYY-MM-DD-<slug>.strike.md`',
      );
      expect(strike).not.toContain('{{artifactsRoot}}');
      // The policy snippet mentions ~/.smithy/repos/<repo>/ as part of its
      // explanation — that's expected. Make sure no actual artifact path got a
      // tilde prefix.
      expect(strike).not.toContain('~/.smithy/repos/<repo>/specs/strikes/YYYY');
    });

    it('--artifacts-location external persists in the manifest and bakes ~/.smithy/repos/<repo>/ into deployed prompts', () => {
      execFileSync(
        'node',
        [CLI, 'init', '-a', 'claude', '-y', '--artifacts-location', 'external'],
        { encoding: 'utf-8', cwd: tmpDir },
      );
      const manifestPath = path.join(tmpDir, '.smithy', 'smithy-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.artifactsLocation).toBe('external');

      const expectedPrefix = `~/.smithy/repos/${path.basename(tmpDir)}/`;
      const strike = fs.readFileSync(
        path.join(tmpDir, '.claude', 'commands', 'smithy.strike.md'),
        'utf8',
      );
      expect(strike).toContain(`${expectedPrefix}specs/strikes/`);
      expect(strike).toContain('## Authored Smithy Artifacts Location');
      expect(strike).not.toContain('{{artifactsRoot}}');
    });

    it('update round-trips the artifactsLocation field — no flag required', () => {
      execFileSync(
        'node',
        [CLI, 'init', '-a', 'claude', '-y', '--artifacts-location', 'external'],
        { encoding: 'utf-8', cwd: tmpDir },
      );
      execFileSync('node', [CLI, 'update', '-y'], {
        encoding: 'utf-8',
        cwd: tmpDir,
      });
      const manifestPath = path.join(tmpDir, '.smithy', 'smithy-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.artifactsLocation).toBe('external');

      const expectedPrefix = `~/.smithy/repos/${path.basename(tmpDir)}/`;
      const strike = fs.readFileSync(
        path.join(tmpDir, '.claude', 'commands', 'smithy.strike.md'),
        'utf8',
      );
      expect(strike).toContain(`${expectedPrefix}specs/strikes/`);
    });

    it('update --artifacts-location repo migrates an external manifest back to in-repo paths', () => {
      execFileSync(
        'node',
        [CLI, 'init', '-a', 'claude', '-y', '--artifacts-location', 'external'],
        { encoding: 'utf-8', cwd: tmpDir },
      );
      execFileSync(
        'node',
        [CLI, 'update', '-y', '--artifacts-location', 'repo'],
        { encoding: 'utf-8', cwd: tmpDir },
      );

      const manifestPath = path.join(tmpDir, '.smithy', 'smithy-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.artifactsLocation).toBeUndefined();

      const strike = fs.readFileSync(
        path.join(tmpDir, '.claude', 'commands', 'smithy.strike.md'),
        'utf8',
      );
      expect(strike).toContain(
        'Write a single strike document to `specs/strikes/YYYY-MM-DD-<slug>.strike.md`',
      );
      expect(strike).not.toContain('~/.smithy/repos/<repo>/specs/strikes/YYYY');
    });
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

  it('rejects --location user for codex', () => {
    const result = spawnSync('node', [CLI, 'init', '-a', 'codex', '--location', 'user', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    const output = result.stdout + result.stderr;
    expect(output).toContain('not supported by codex');
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills'))).toBe(false);
  });

  it('accepts --location flag', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '--location', 'repo', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(true);
  });

  it('init --yes provisions the four orders templates and emits a counts line', () => {
    const output = execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const ordersDir = path.join(tmpDir, '.smithy', 'templates', 'orders');
    for (const type of ['rfc', 'features', 'spec', 'tasks'] as const) {
      const dest = path.join(ordersDir, `${type}.md`);
      expect(fs.existsSync(dest)).toBe(true);
      expect(fs.readFileSync(dest, 'utf8')).toBe(ORDERS_DEFAULT_TEMPLATES[type]);
    }

    expect(output).toContain('Orders templates: 4 templates written, 0 preserved');
  });

});

describe('CLI init cross-location isolation (orders templates)', () => {
  let tmpDir: string;
  let tmpHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-test-target-'));
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-test-home-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  // The four orders-template files US1 Slice 2 provisions under
  // <manifestDir>/templates/orders/. Asserted by name (not by directory
  // listing) so the isolation contract is observable and stable even if
  // sibling artifacts land alongside them later.
  const ORDERS_FILES = ['rfc.md', 'features.md', 'spec.md', 'tasks.md'];

  it('--location repo populates <targetDir>/.smithy/templates/orders/ and leaves <HOME>/.smithy/ alone (AS 3.1)', () => {
    // HOME / USERPROFILE are overridden via the spawn env (not via mutating
    // process.env) so the developer's real ~/.smithy/ is never read or
    // written, and other tests in this file are unaffected. os.homedir()
    // — which resolveManifestDir() calls for 'user' location — honors HOME
    // on POSIX and USERPROFILE on Windows, so setting both gives
    // cross-platform parity on every supported CI runner.
    execFileSync('node', [CLI, 'init', '-a', 'claude', '--location', 'repo', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
      env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
    });

    for (const f of ORDERS_FILES) {
      expect(fs.existsSync(path.join(tmpDir, '.smithy', 'templates', 'orders', f))).toBe(true);
    }
    // The isolated user home must not have been touched for orders templates
    // when provisioning was directed at the repo location.
    expect(fs.existsSync(path.join(tmpHome, '.smithy', 'templates', 'orders'))).toBe(false);
  });

  it('--location user populates <HOME>/.smithy/templates/orders/ and leaves <targetDir>/.smithy/ alone (AS 3.2)', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '--location', 'user', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
      env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
    });

    for (const f of ORDERS_FILES) {
      expect(fs.existsSync(path.join(tmpHome, '.smithy', 'templates', 'orders', f))).toBe(true);
    }
    // The target repo's .smithy/ must not contain an orders/ subtree when
    // provisioning was directed at the user-level home. We assert on the
    // templates/orders/ subtree specifically (not the entire .smithy/
    // tree) because under --location user the target .smithy/ may
    // legitimately hold sibling artifacts (e.g. a smithy-manifest.json
    // from other init flows). The isolation contract this slice owns is
    // the orders subtree.
    expect(fs.existsSync(path.join(tmpDir, '.smithy', 'templates', 'orders'))).toBe(false);
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

  it('replays a claude plus codex manifest without adding gemini', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const manifestPath = path.join(tmpDir, '.smithy', 'smithy-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.agents = ['claude', 'codex'];
    manifest.files.codex = [];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    execFileSync('node', [CLI, 'update', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const updated = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(updated.agents).toEqual(['claude', 'codex']);
    expect(updated.files.codex.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'tools', 'codex', 'prompts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.gemini', 'skills'))).toBe(false);
  });

  it('refuses to update a manifest with an unsupported agent', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const manifestPath = path.join(tmpDir, '.smithy', 'smithy-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.agents = ['claude', 'future-agent'];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = spawnSync('node', [CLI, 'update', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    const output = result.stdout + result.stderr;
    expect(result.status).toBe(1);
    expect(output).toContain('unsupported agent');
    expect(output).toContain('future-agent');
    expect(output).toContain('refusing to update');
    expect(output).not.toContain('Upgrade complete');

    const after = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(after.agents).toEqual(['claude', 'future-agent']);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
  });

  it('refuses to update a manifest with no agents', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const manifestPath = path.join(tmpDir, '.smithy', 'smithy-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.agents = [];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = spawnSync('node', [CLI, 'update', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    const output = result.stdout + result.stderr;
    expect(result.status).toBe(1);
    expect(output).toContain('manifest contains no agents');
    expect(output).toContain('refusing to update');
    expect(output).not.toContain('Upgrade complete');

    const after = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(after.agents).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(true);
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

  it('--reset-permissions overwrites stale entries with the canonical baseline', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // Inject a fake stale entry into settings.json that the canonical
    // baseline does not include. Without --reset-permissions, the merge in
    // writePermissions would preserve it.
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings.permissions.allow.push('Bash(stale-custom-entry)');
    settings.permissions.ask.push('Bash(stale-ask-entry)');
    settings.model = 'claude-sonnet-4-6';
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    const output = execFileSync(
      'node',
      [CLI, 'update', '-y', '--reset-permissions'],
      { encoding: 'utf-8', cwd: tmpDir },
    );
    expect(output).toContain('Reset permissions to Smithy baseline');

    const after = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(after.permissions.allow).not.toContain('Bash(stale-custom-entry)');
    expect(after.permissions.ask).not.toContain('Bash(stale-ask-entry)');
    // Canonical entries are still present
    expect(after.permissions.allow).toContain('Bash(git status)');
    // Non-permissions keys preserved
    expect(after.model).toBe('claude-sonnet-4-6');
  });

  it('refuses to update when manifest deployLocation does not match where it was found', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // Simulate a manifest that was hand-copied from another location: it
    // lives at the repo path but its inner deployLocation says "user".
    const manifestPath = path.join(tmpDir, '.smithy', 'smithy-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.deployLocation = 'user';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = spawnSync(
      'node',
      [CLI, 'update', '-y', '--reset-permissions'],
      { encoding: 'utf-8', cwd: tmpDir },
    );
    const output = result.stdout + result.stderr;
    expect(output).toContain('manifest declares deployLocation="user"');
    expect(output).toContain('refusing to update');
    expect(output).not.toContain('Reset permissions to Smithy baseline');
    expect(output).not.toContain('Upgrade complete');
  });

  it('--reset-permissions is a no-op when manifest does not manage permissions', () => {
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y', '--no-permissions'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const output = execFileSync(
      'node',
      [CLI, 'update', '-y', '--reset-permissions'],
      { encoding: 'utf-8', cwd: tmpDir },
    );
    expect(output).toContain('does not manage Claude permissions');
    expect(output).not.toContain('Reset permissions to Smithy baseline');
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

  it('does not write issueTemplates into the manifest', () => {
    execFileSync('node', [CLI, 'init', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const manifestPath = path.join(tmpDir, '.smithy', 'smithy-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest).not.toHaveProperty('issueTemplates');
  });

  it('uninit preserves user-authored files under .smithy/', () => {
    execFileSync('node', [CLI, 'init', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // User drops a file alongside the manifest; uninit must leave it alone.
    const customFile = path.join(tmpDir, '.smithy', 'custom-template.md');
    fs.writeFileSync(customFile, '---\nname: Custom\n---\nCustom template');

    execFileSync('node', [CLI, 'uninit', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    expect(fs.existsSync(customFile)).toBe(true);
  });

  it('uninit sweeps legacy YAML issue-template files left by pre-rework installs', () => {
    execFileSync('node', [CLI, 'init', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // Simulate a pre-rework install: drop the five filenames that older
    // smithy versions deployed flat under .smithy/ (never tracked in
    // manifest.files). Also drop one in .github/ISSUE_TEMPLATE/ to cover the
    // even-older deployment path.
    const smithyDir = path.join(tmpDir, '.smithy');
    const legacyFiles = [
      'config.yml',
      'smithy_bug_report.md',
      'smithy_implementation_task.md',
      'smithy_task_stub.md',
      'smithy_tech_debt.md',
    ];
    for (const f of legacyFiles) {
      fs.writeFileSync(path.join(smithyDir, f), 'legacy');
    }
    const ghDir = path.join(tmpDir, '.github', 'ISSUE_TEMPLATE');
    fs.mkdirSync(ghDir, { recursive: true });
    fs.writeFileSync(path.join(ghDir, 'smithy_bug_report.md'), 'legacy');

    execFileSync('node', [CLI, 'uninit', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    for (const f of legacyFiles) {
      expect(fs.existsSync(path.join(smithyDir, f))).toBe(false);
    }
    expect(fs.existsSync(path.join(ghDir, 'smithy_bug_report.md'))).toBe(false);
  });
});

describe('CLI init orders-template provisioning', () => {
  // Covers User Story 1 acceptance scenarios AS 1–5 from
  // specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.spec.md.
  //
  // AS 1 (fresh --location repo writes the four canonical files) is already
  // covered by the wiring test
  //   'init --yes provisions the four orders templates and emits a counts line'
  // in describe('CLI init --yes (non-interactive)') above. The cases below
  // lock in AS 2 through AS 5 with durable filesystem-state assertions.
  //
  // AS 5 (overwrite accepted replaces only the four canonical files) is
  // exercised here via a direct call to provisionOrdersTemplates({ overwrite: true })
  // because the CLI's non-interactive (-y) path always declines the overwrite
  // prompt (preserves user edits under automation, per FR-003). The function
  // is the same code path init invokes when the user answers "yes" to the
  // overwrite prompt, so the assertion is faithful to the contract. The
  // function-level overwrite=true / overwrite=false paths are additionally
  // covered by unit tests in src/orders-templates.test.ts.

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-orders-cli-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('AS 2: --location user writes templates under stubbed HOME and leaves the repo .smithy/ untouched', () => {
    // Two isolated tmp dirs: one for the target repo (cwd) and one to stand
    // in for the user's home directory.
    //
    // Overrides HOME (POSIX) and USERPROFILE (Windows) so os.homedir() — and
    // therefore resolveManifestDir(_, 'user') in src/manifest.ts — resolves
    // to tmpHome on both platforms. On Linux/macOS this is sufficient because
    // Node honors HOME unconditionally; on Windows USERPROFILE is the primary
    // source. Cross-platform CI on Windows is out of scope for this test
    // suite, but the env override is set defensively so the test would still
    // isolate correctly there.
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-orders-home-'));
    try {
      execFileSync('node', [CLI, 'init', '-a', 'claude', '-l', 'user', '-y'], {
        encoding: 'utf-8',
        cwd: tmpDir,
        env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
      });

      // All four canonical files exist under the stubbed home with default
      // content, never under the target repo.
      const homeOrdersDir = path.join(tmpHome, '.smithy', 'templates', 'orders');
      for (const type of ['rfc', 'features', 'spec', 'tasks'] as const) {
        const dest = path.join(homeOrdersDir, `${type}.md`);
        expect(fs.existsSync(dest)).toBe(true);
        expect(fs.readFileSync(dest, 'utf8')).toBe(ORDERS_DEFAULT_TEMPLATES[type]);
      }

      // Provisioning must not create the target repo's own .smithy/. With
      // --location user, the manifest also lands under tmpHome/.smithy/, so
      // the repo dir should have nothing under .smithy/.
      expect(fs.existsSync(path.join(tmpDir, '.smithy'))).toBe(false);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it('AS 3: provisioning does not modify the manifest across re-runs', () => {
    // First init writes the manifest and the four templates.
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    const manifestPath = path.join(tmpDir, '.smithy', 'smithy-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const firstManifest = fs.readFileSync(manifestPath, 'utf8');

    // Second init re-runs provisioning under decline-overwrite (-y always
    // declines per FR-003). The manifest must be byte-identical: provisioning
    // never touches it (the spec assertion), and re-running init with the
    // same flags should regenerate an identical manifest since nothing else
    // changed.
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    const secondManifest = fs.readFileSync(manifestPath, 'utf8');
    expect(secondManifest).toBe(firstManifest);
  });

  it('AS 4: re-init with overwrite declined preserves user edits and still writes missing templates', () => {
    // First init creates the canonical four with default content.
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    const ordersDir = path.join(tmpDir, '.smithy', 'templates', 'orders');
    const specPath = path.join(ordersDir, 'spec.md');

    // User edits one template by hand.
    const customSpec = 'CUSTOM USER SPEC';
    fs.writeFileSync(specPath, customSpec);

    // Re-running init with -y declines the overwrite prompt: the edited
    // spec.md is preserved verbatim, and the other three remain the
    // unchanged defaults.
    const rerunOutput = execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    expect(fs.readFileSync(specPath, 'utf8')).toBe(customSpec);
    for (const type of ['rfc', 'features', 'tasks'] as const) {
      const dest = path.join(ordersDir, `${type}.md`);
      expect(fs.readFileSync(dest, 'utf8')).toBe(ORDERS_DEFAULT_TEMPLATES[type]);
    }

    // The user-visible counts line reflects the decline: nothing written,
    // all four preserved.
    expect(rerunOutput).toContain('Orders templates: 0 templates written, 4 preserved');
  });

  it('AS 4: missing canonical templates are written even when one pre-exists outside init', () => {
    // Pre-create only spec.md without ever running init. The other three
    // canonical files do not exist yet.
    const ordersDir = path.join(tmpDir, '.smithy', 'templates', 'orders');
    fs.mkdirSync(ordersDir, { recursive: true });
    const specPath = path.join(ordersDir, 'spec.md');
    const customSpec = 'PRE-EXISTING SPEC';
    fs.writeFileSync(specPath, customSpec);

    // Init under -y: overwrite is declined, but the three missing canonical
    // files are still written with defaults (FR-003).
    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    expect(fs.readFileSync(specPath, 'utf8')).toBe(customSpec);
    for (const type of ['rfc', 'features', 'tasks'] as const) {
      const dest = path.join(ordersDir, `${type}.md`);
      expect(fs.existsSync(dest)).toBe(true);
      expect(fs.readFileSync(dest, 'utf8')).toBe(ORDERS_DEFAULT_TEMPLATES[type]);
    }
  });

  it('AS 5: overwrite accepted replaces only canonical <type>.md files; manifest, peer families, and user extras are preserved', async () => {
    // The CLI's non-interactive (-y) path always declines the prompt to
    // preserve user content under automation (FR-003). To exercise the
    // overwrite=true branch — which is what AS 5 specifies — we invoke
    // provisionOrdersTemplates directly. See src/orders-templates.test.ts
    // for the function-level unit coverage that mirrors this.
    const { provisionOrdersTemplates } = await import('./orders-templates.js');

    const manifestDir = path.join(tmpDir, '.smithy');
    const ordersDir = path.join(manifestDir, 'templates', 'orders');
    const artifactsDir = path.join(manifestDir, 'templates', 'artifacts');
    fs.mkdirSync(ordersDir, { recursive: true });
    fs.mkdirSync(artifactsDir, { recursive: true });

    // Seed a manifest file, a user extra alongside the canonical files, a
    // peer-family file under a sibling templates/<family>/ subtree, and a
    // customized canonical spec.md. AS 5 requires that all of these be
    // preserved EXCEPT the four canonical <type>.md files.
    const manifestPath = path.join(manifestDir, 'smithy-manifest.json');
    const manifestSentinel = '{"sentinel":true}';
    fs.writeFileSync(manifestPath, manifestSentinel);

    const readmePath = path.join(ordersDir, 'README.md');
    const readmeBody = 'user README — not a canonical template';
    fs.writeFileSync(readmePath, readmeBody);

    const peerPath = path.join(artifactsDir, 'foo.md');
    const peerBody = 'peer family file — orders provisioning must not touch this';
    fs.writeFileSync(peerPath, peerBody);

    const customSpec = 'CUSTOM SPEC — about to be overwritten';
    fs.writeFileSync(path.join(ordersDir, 'spec.md'), customSpec);

    const result = provisionOrdersTemplates({
      targetDir: tmpDir,
      location: 'repo',
      overwrite: true,
    });

    // All four canonical files now hold the defaults.
    for (const type of ['rfc', 'features', 'spec', 'tasks'] as const) {
      const dest = path.join(ordersDir, `${type}.md`);
      expect(fs.readFileSync(dest, 'utf8')).toBe(ORDERS_DEFAULT_TEMPLATES[type]);
    }
    expect(result.templatesWritten).toHaveLength(4);
    expect(result.templatesPreserved).toHaveLength(0);

    // The manifest, the user extra under templates/orders/, and the
    // peer-family file are untouched.
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestSentinel);
    expect(fs.readFileSync(readmePath, 'utf8')).toBe(readmeBody);
    expect(fs.readFileSync(peerPath, 'utf8')).toBe(peerBody);
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

  it('emits contract-shaped JSON with records, summary, graph, and full per-type counts (AS 7.2)', () => {
    // Fixture stitches one record of every artifact type — rfc,
    // features, spec, tasks — through the canonical lineage so every
    // `counts[type][status]` slot in `payload.summary.counts` is
    // observable. AS 7.2 guards the JSON `summary` key: this slice
    // does not change its shape, only locks it down with a full
    // per-type regression assertion.
    write(
      'docs/rfcs/example.rfc.md',
      `# RFC: Example\n\n## Dependency Order\n\n${TABLE_HEADER}\n| M1 | Milestone One | — | docs/rfcs/01-milestone-one.features.md |\n`,
    );
    write(
      'docs/rfcs/01-milestone-one.features.md',
      `# Feature Map\n\n## Dependency Order\n\n${TABLE_HEADER}\n| F1 | Feature A | — | specs/feature-a |\n`,
    );
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
        counts: Record<
          'rfc' | 'features' | 'spec' | 'tasks',
          Record<'done' | 'in-progress' | 'not-started' | 'unknown', number>
        >;
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
        next_action?: {
          command: string;
          arguments: string[];
          reason: string;
          suppressed_by_ancestor?: boolean;
        } | null;
      }>;
      tree?: unknown;
      graph: { nodes: unknown; layers: unknown[]; cycles: unknown[]; dangling_refs: unknown[] };
    };

    // Top-level shape matches the contracts. `tree` was dropped from
    // the JSON payload — consumers reconstruct it locally from
    // `records.parent_path`.
    expect(payload).toHaveProperty('summary');
    expect(payload).toHaveProperty('records');
    expect(payload).toHaveProperty('graph');
    expect(payload).not.toHaveProperty('tree');

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

    // AS 7.2: `summary.counts` exposes every artifact type key, and
    // each per-type object carries the four status fields defined on
    // the data-model `ScanSummary` entity (done, in-progress,
    // not-started, unknown). Every record of the fixture rolls up to
    // `done`, so the other slots assert zero — locking down the
    // shape, not just the two types spot-checked previously.
    const STATUS_KEYS: Array<'done' | 'in-progress' | 'not-started' | 'unknown'> = [
      'done',
      'in-progress',
      'not-started',
      'unknown',
    ];
    for (const type of ['rfc', 'features', 'spec', 'tasks'] as const) {
      expect(payload.summary.counts).toHaveProperty(type);
      for (const status of STATUS_KEYS) {
        expect(payload.summary.counts[type]).toHaveProperty(status);
        expect(typeof payload.summary.counts[type][status]).toBe('number');
      }
    }
    expect(payload.summary.counts.rfc.done).toBe(1);
    expect(payload.summary.counts.features.done).toBe(1);
    expect(payload.summary.counts.spec.done).toBe(1);
    expect(payload.summary.counts.tasks.done).toBe(1);
    expect(payload.summary.parse_error_count).toBe(0);

    // US4 Slice 1 Task 2: JSON consumers see the populated
    // next_action outcome on every classified record. Every record in
    // this fixture rolls up to `done`, so each one must serialize
    // `next_action: null` (evaluated, no action) rather than omit the
    // field entirely (never evaluated).
    expect(tasksRecord?.next_action).toBeNull();
    expect(specRecord?.next_action).toBeNull();
    const featuresRecord = payload.records.find((r) => r.type === 'features');
    const rfcRecord = payload.records.find((r) => r.type === 'rfc');
    expect(featuresRecord?.next_action).toBeNull();
    expect(rfcRecord?.next_action).toBeNull();
  });

  it('text mode prints a per-type summary header above the flat listing (AS 7.1)', () => {
    // Fixture exercises multiple artifact types so the header has real
    // counts to render: one RFC, one features file, one spec, and one
    // tasks file stitched through the canonical lineage. AS 7.1 is the
    // header-format acceptance scenario from US7 of the spec.
    write(
      'docs/rfcs/example.rfc.md',
      `# RFC: Example\n\n## Dependency Order\n\n${TABLE_HEADER}\n| M1 | Milestone One | — | docs/rfcs/01-milestone-one.features.md |\n`,
    );
    write(
      'docs/rfcs/01-milestone-one.features.md',
      `# Feature Map\n\n## Dependency Order\n\n${TABLE_HEADER}\n| F1 | Feature A | — | specs/feature-a |\n`,
    );
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Feature Specification: Feature A\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Story One | — | specs/feature-a/01-first.tasks.md |\n`,
    );
    write(
      'specs/feature-a/01-first.tasks.md',
      `# Tasks\n\n## Slice 1: First\n\n- [x] Task one\n- [x] Task two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | First | — | — |\n`,
    );

    // Pass `--all` so the fully-done fixture does not collapse under
    // US3 — AS 7.1 only asserts the header appears above the tree
    // body and says nothing about collapse, so bypassing collapse
    // here keeps the body rich enough to observe "Feature A" as a
    // child row.
    const output = execFileSync('node', [CLI, 'status', '--root', tmpDir, '--all'], {
      encoding: 'utf-8',
    });

    const lines = output.split('\n');
    // The vitest-style summary block opens with ` Smithy Status` as
    // line 0, followed by a blank line, then per-type count rows.
    expect(lines[0]).toBe(' Smithy Status');
    // Every surviving type label (plural form) appears in the header
    // block. With every type populated, RFCs/Features/Specs/Tasks all
    // render their own row.
    // `findIndex` returns -1 when the substring is missing, and -1 is
    // truthy — so a `|| lines.length` fallback would miss the case
    // entirely and silently drop the last line via `slice(0, -1)`. Use
    // an explicit `-1` check instead.
    const bodyStartIdx = lines.findIndex((l) => l.includes('Example'));
    const headerBlock = lines
      .slice(0, bodyStartIdx === -1 ? lines.length : bodyStartIdx)
      .join('\n');
    expect(headerBlock).toContain('RFCs');
    expect(headerBlock).toContain('Features');
    expect(headerBlock).toContain('Specs');
    expect(headerBlock).toContain('Tasks');
    // Header precedes the tree body. The first rendered title (from
    // US2 Slice 2 `renderTree`) comes after the header block (AS 7.1:
    // header "above" the body).
    const firstTreeLineIndex = lines.findIndex((l) =>
      l.includes('Feature A'),
    );
    expect(firstTreeLineIndex).toBeGreaterThan(0);
    // Header segments use the icon-driven format: `<n> ✓   <n> ◐   <n> ○`.
    // Only done / in-progress / not-started appear — `unknown` is
    // intentionally omitted per FR-016 / SD-012.
    expect(headerBlock).not.toMatch(/unknown/);
    expect(headerBlock).toContain('\u2713');
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

  it('renders a hierarchical tree with box-drawing connectors and titles (AS 2.4)', () => {
    // US2 Slice 2: the default text mode is a hierarchical tree built
    // by `renderTree` over the same records the JSON payload uses.
    // This test asserts the three observable properties of AS 2.4:
    // tree-connector characters appear, artifact titles (not paths)
    // are the primary label, and the deepest descendant is visibly
    // nested under its ancestor. Group headings and broken-link
    // formatting are covered in more depth by `render.test.ts`.
    write(
      'docs/rfcs/example.rfc.md',
      `# RFC: Example\n\n## Dependency Order\n\n${TABLE_HEADER}\n| M1 | Milestone One | — | docs/rfcs/01-milestone-one.features.md |\n`,
    );
    write(
      'docs/rfcs/01-milestone-one.features.md',
      `# Feature Map\n\n## Dependency Order\n\n${TABLE_HEADER}\n| F1 | Feature A | — | specs/feature-a |\n`,
    );
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Feature Specification: Feature A\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Story One | — | specs/feature-a/01-first.tasks.md |\n`,
    );
    // Distinct H1 title on the tasks file so the rendered line is
    // unambiguous — the parser extracts the first H1 as the record
    // title, and a generic `# Tasks` would collide with the word
    // "Tasks" in the summary-header column label.
    write(
      'specs/feature-a/01-first.tasks.md',
      `# Story One\n\n## Slice 1: First\n\n- [x] Task one\n- [x] Task two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | First | — | — |\n`,
    );

    // Pass `--all` so the fully-done fixture does not collapse under
    // US3 — AS 2.4 asserts tree-connector rendering across a
    // multi-level chain, which requires descendants to remain
    // visible. The default (collapsed) path is covered by the US3
    // collapse-behavior test below.
    const output = execFileSync('node', [CLI, 'status', '--root', tmpDir, '--all'], {
      encoding: 'utf-8',
    });

    // Body (everything below the US7 summary header) contains at
    // least one tree-connector character.
    expect(output).toMatch(/[├└]/);

    // Titles are the primary label — file paths do not appear in the
    // body. `docs/rfcs/example.rfc.md` and
    // `specs/feature-a/01-first.tasks.md` must not leak into the
    // rendered tree at all.
    expect(output).not.toContain('docs/rfcs/example.rfc.md');
    expect(output).not.toContain('specs/feature-a/01-first.tasks.md');
    expect(output).toContain('Example');
    expect(output).toContain('Feature A');
    expect(output).toContain('Story One');

    // The rendered tree nests Story One below Feature A via a `└─`
    // connector. Locate the Story One line and assert it carries a
    // connector prefix (i.e., it is not a top-level root).
    const storyLine = output
      .split('\n')
      .find((l) => l.includes('Story One'));
    expect(storyLine).toBeDefined();
    expect(storyLine!).toMatch(/└─/);

    // The done icon (✓) appears at least once — the fully-completed
    // tasks record rolls up to done on every ancestor. Because this
    // test passes `--all`, collapsing is bypassed and every level
    // shows the marker inline (the default collapsed path is covered
    // by the US3 collapse-behavior test below).
    expect(output).toContain('\u2713');
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
      graph: { nodes: unknown; layers: unknown[] };
      tree?: unknown;
    };
    expect(payload.records).toEqual([]);
    expect(payload.summary.parse_error_count).toBe(0);
    expect(payload.graph.layers).toEqual([]);
    // `tree` was removed from the JSON payload — consumers reconstruct
    // it locally from `records.parent_path`.
    expect(payload.tree).toBeUndefined();
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

  it('accepts a comma-separated --status set and filters as the union of statuses', () => {
    write(
      'docs/rfcs/demo.rfc.md',
      `# Demo\n\n## Dependency Order\n\n${TABLE_HEADER}\n| M1 | First Milestone | — | docs/rfcs/demo.features.md |\n`,
    );
    write(
      'docs/rfcs/demo.features.md',
      `# Demo Features\n\n## Dependency Order\n\n${TABLE_HEADER}\n| F1 | A | — | specs/a-spec/ |\n`,
    );
    write(
      'specs/done-spec/done-spec.spec.md',
      `# Feature Specification: Done\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Done Story | — | specs/done-spec/01-done.tasks.md |\n`,
    );
    write(
      'specs/done-spec/01-done.tasks.md',
      `# Done\n\n## Slice 1\n\n- [x] Done\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Slice One | — | — |\n`,
    );
    write(
      'specs/a-spec/a-spec.spec.md',
      `# Feature Specification: A\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Pending Story | — | — |\n`,
    );

    const result = spawnSync(
      'node',
      [
        CLI,
        'status',
        '--root',
        tmpDir,
        '--format',
        'json',
        '--status',
        'in-progress,not-started',
      ],
      { encoding: 'utf-8' },
    );
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      records: Array<{ path: string; status: string }>;
    };
    const statuses = payload.records.map((r) => r.status);
    // No done records survive as direct matches; done parents may
    // appear only as ancestors of pending descendants.
    expect(statuses).not.toContain('done');
    // Multi-value matched: both in-progress and not-started reach
    // the wire.
    const pendingPaths = payload.records
      .filter((r) => r.status !== 'done')
      .map((r) => r.path);
    expect(pendingPaths.length).toBeGreaterThan(0);
  });

  it('rejects --status with a mix of valid and invalid tokens (exits 2 on the invalid one)', () => {
    const result = spawnSync(
      'node',
      [
        CLI,
        'status',
        '--root',
        tmpDir,
        '--status',
        'in-progress,bogus',
      ],
      { encoding: 'utf-8' },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('invalid --status');
    expect(result.stderr).toContain('bogus');
  });

  it('rejects --status with empty tokens (e.g., ",,in-progress")', () => {
    const result = spawnSync(
      'node',
      [CLI, 'status', '--root', tmpDir, '--status', ',,in-progress'],
      { encoding: 'utf-8' },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('invalid --status');
  });

  it('--pending is exactly equivalent to --status in-progress,not-started', () => {
    write(
      'specs/wip-spec/wip-spec.spec.md',
      `# Feature Specification: WIP\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | WIP | — | — |\n`,
    );
    write(
      'specs/done-spec/done-spec.spec.md',
      `# Feature Specification: Done\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Done | — | specs/done-spec/01.tasks.md |\n`,
    );
    write(
      'specs/done-spec/01.tasks.md',
      `# Done\n\n## Slice 1\n\n- [x] Done\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | First | — | — |\n`,
    );

    const pending = spawnSync(
      'node',
      [CLI, 'status', '--root', tmpDir, '--format', 'json', '--pending'],
      { encoding: 'utf-8' },
    );
    const statusMulti = spawnSync(
      'node',
      [
        CLI,
        'status',
        '--root',
        tmpDir,
        '--format',
        'json',
        '--status',
        'in-progress,not-started',
      ],
      { encoding: 'utf-8' },
    );
    expect(pending.status).toBe(0);
    expect(statusMulti.status).toBe(0);
    // Byte-for-byte identical payloads — `--pending` is pure sugar.
    expect(pending.stdout).toBe(statusMulti.stdout);
  });

  it('rejects combining --pending with --status (the user has specified two intents)', () => {
    const result = spawnSync(
      'node',
      [
        CLI,
        'status',
        '--root',
        tmpDir,
        '--pending',
        '--status',
        'in-progress',
      ],
      { encoding: 'utf-8' },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--pending cannot be combined with --status');
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

  it('emits records covering a full-chain + orphan + broken-link fixture, and tree-able via buildTree from records alone', async () => {
    // US2 Slice 1 (post-tree-drop): the JSON payload no longer carries
    // a `tree` field, but `records` still includes every artifact with
    // its `parent_path`, so a consumer can reconstruct the same tree
    // locally by calling `buildTree(payload.records)`. This test
    // asserts both: (a) the records cover the full-chain + orphan +
    // broken-link shape, and (b) re-running `buildTree` against the
    // emitted records produces a tree whose roots include the
    // sentinel groups and the chain's RFC. Fixture intentionally
    // mixes three shapes: one full RFC→features→spec→tasks chain, one
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
      records: Array<{
        type: string;
        path: string;
        status: string;
        next_action?: {
          command: string;
          arguments: string[];
          reason: string;
          suppressed_by_ancestor?: boolean;
        } | null;
      }>;
      tree?: unknown;
    };

    // The payload no longer carries a `tree` field — sanity-check
    // that explicitly so a future reintroduction is loud.
    expect(payload.tree).toBeUndefined();

    // Reconstruct the tree locally from `records` and assert the
    // expected structural shape. `buildTree` is the same projector
    // the CLI used to inline; running it on `payload.records` proves
    // the records are sufficient to recover the hierarchical view
    // without paying for it on the wire.
    const { buildTree } = await import('./status/tree.js');
    const tree = buildTree(payload.records as Parameters<typeof buildTree>[0]);

    // Structural sanity: the tree should contain the Orphaned Specs
    // group, the Broken Links group, and a real chain root.
    const rootPaths = tree.roots.map((r) => r.record.path);
    expect(rootPaths).toContain('__orphaned_specs__');
    expect(rootPaths).toContain('__broken_links__');

    // The Orphaned Specs group has exactly one child (our orphan spec).
    const orphanGroup = tree.roots.find(
      (r) => r.record.path === '__orphaned_specs__',
    );
    expect(orphanGroup).toBeDefined();
    expect(orphanGroup?.children).toHaveLength(1);

    // The Broken Links group has exactly one child (our dangling tasks).
    const brokenGroup = tree.roots.find(
      (r) => r.record.path === '__broken_links__',
    );
    expect(brokenGroup).toBeDefined();
    expect(brokenGroup?.children).toHaveLength(1);

    // A full-chain root (the RFC) also lives in roots, somewhere
    // below the group sentinels.
    const realRoots = tree.roots.filter(
      (r) => !r.record.path.startsWith('__'),
    );
    expect(realRoots.length).toBeGreaterThanOrEqual(1);
    // Walk from the RFC down four levels to confirm the tasks record
    // is reachable at the deepest position (AS 2.1).
    const rfcRoot = realRoots.find((r) => r.record.path.endsWith('.rfc.md'));
    expect(rfcRoot).toBeDefined();
    expect(rfcRoot?.children[0]?.record.path).toBe(
      'docs/rfcs/0001-demo.features.md',
    );
    expect(rfcRoot?.children[0]?.children[0]?.record.path).toBe(
      'specs/chain-feature/chain-feature.spec.md',
    );
    expect(
      rfcRoot?.children[0]?.children[0]?.children[0]?.record.path,
    ).toBe('specs/chain-feature/01-chain-story.tasks.md');

    // US4 Slice 1 Task 2: at least one non-done record in this fixture
    // carries a populated `next_action` with a valid smithy command.
    // The chain's tasks file has an unchecked checkbox, so it is
    // not-started, and the scanner's Phase 4 must have populated its
    // next_action with smithy.forge pointing at the tasks path.
    const chainTasks = payload.records.find(
      (r) => r.path === 'specs/chain-feature/01-chain-story.tasks.md',
    );
    expect(chainTasks).toBeDefined();
    expect(chainTasks?.status).toBe('not-started');
    expect(chainTasks?.next_action).not.toBeNull();
    expect(chainTasks?.next_action?.command).toMatch(
      /^smithy\.(mark|cut|forge|render|ignite|strike)$/,
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

  it('collapses fully-done subtrees in default text mode, expands under --all, and leaves JSON untouched (AS 3.1, 3.3, 3.4, 3.5)', () => {
    // US3 Slice 1: a fully-done RFC → features → spec → tasks chain
    // collapses at the top-most `done` node (the RFC rolls up to `done`
    // because its only descendant is done), so the default text output
    // should render the RFC title on a single `DONE` line with no
    // descendants below it. Passing `--all` must restore every artifact
    // the pre-collapse US2 pipeline surfaced. The JSON payload must be
    // identical regardless of `--all` because collapsing is a
    // text-mode-only transform.
    write(
      'docs/rfcs/example.rfc.md',
      `# RFC: Example\n\n## Dependency Order\n\n${TABLE_HEADER}\n| M1 | Milestone One | — | docs/rfcs/01-milestone-one.features.md |\n`,
    );
    write(
      'docs/rfcs/01-milestone-one.features.md',
      `# Feature Map\n\n## Dependency Order\n\n${TABLE_HEADER}\n| F1 | Feature A | — | specs/feature-a |\n`,
    );
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Feature Specification: Feature A\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Story One | — | specs/feature-a/01-first.tasks.md |\n`,
    );
    write(
      'specs/feature-a/01-first.tasks.md',
      `# Story One\n\n## Slice 1: First\n\n- [x] Task one\n- [x] Task two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | First | — | — |\n`,
    );

    // Default: the top-level `done` node collapses — no descendants
    // appear. The only record title that should appear in the tree
    // body is the RFC's `Example`. The H1 `Feature Map` for the
    // features file, the spec title `Feature A`, and the tasks title
    // `Story One` must all be hidden by collapse.
    const defaultOut = execFileSync('node', [CLI, 'status', '--root', tmpDir], {
      encoding: 'utf-8',
    });
    // Split off the multi-line summary header from the tree body so
    // the summary counts (which mention every type) do not leak into
    // the body assertions. The tree body starts at the first line
    // containing the RFC title `Example`.
    const defaultLines = defaultOut.split('\n');
    const bodyStart = defaultLines.findIndex((l) => l.includes('Example'));
    const defaultBody = defaultLines.slice(bodyStart).join('\n');
    expect(defaultBody).toContain('Example');
    expect(defaultBody).toContain('\u2713');
    // Descendant titles of the done RFC must not appear under it.
    expect(defaultBody).not.toContain('Feature Map');
    expect(defaultBody).not.toContain('Feature A');
    expect(defaultBody).not.toContain('Story One');
    // No tree connectors in the body: a single collapsed root has no
    // child rows to connect.
    expect(defaultBody).not.toMatch(/[├└]/);

    // --all: every artifact title surfaces just as US2's uncollapsed
    // pipeline showed.
    const allOut = execFileSync(
      'node',
      [CLI, 'status', '--root', tmpDir, '--all'],
      { encoding: 'utf-8' },
    );
    expect(allOut).toContain('Example');
    expect(allOut).toContain('Feature Map');
    expect(allOut).toContain('Feature A');
    expect(allOut).toContain('Story One');
    // Tree connectors reappear once the descendants surface.
    expect(allOut).toMatch(/[├└]/);

    // JSON mode: `--all` is a no-op for the `records` and `summary`
    // fields. `tree` is no longer emitted in JSON at all (consumers
    // reconstruct it from `records.parent_path` locally), so the
    // collapsing behavior is purely a text-mode concern. `--all`
    // *does* affect the `graph` field: default mode hides done nodes
    // and surfaces a `complete_count` per layer; `--all` mode emits
    // the full graph with partition indexes. We compare the non-graph
    // fields for structural equality and verify the graph field
    // flips modes.
    const jsonDefault = execFileSync(
      'node',
      [CLI, 'status', '--format', 'json', '--root', tmpDir],
      { encoding: 'utf-8' },
    );
    const jsonAll = execFileSync(
      'node',
      [CLI, 'status', '--format', 'json', '--root', tmpDir, '--all'],
      { encoding: 'utf-8' },
    );
    const jsonDefaultPayload = JSON.parse(jsonDefault) as {
      summary: unknown;
      records: unknown;
      tree?: unknown;
      graph: { mode: string };
    };
    const jsonAllPayload = JSON.parse(jsonAll) as {
      summary: unknown;
      records: unknown;
      tree?: unknown;
      graph: { mode: string };
    };
    expect(jsonDefaultPayload.summary).toEqual(jsonAllPayload.summary);
    expect(jsonDefaultPayload.records).toEqual(jsonAllPayload.records);
    expect(jsonDefaultPayload.tree).toBeUndefined();
    expect(jsonAllPayload.tree).toBeUndefined();
    expect(jsonDefaultPayload.graph.mode).toBe('pending-only');
    expect(jsonAllPayload.graph.mode).toBe('all');
  });

  it('text mode renders next-action hints beneath actionable records only (US4 Slice 2, AS 4.1–4.5)', () => {
    // Fixture stitches two independent subtrees so every hint-line
    // branch of the renderer is exercised in one invocation:
    //
    // 1. A not-started RFC with a virtual features child. The RFC is a
    //    root (no ancestors) → un-suppressed → its hint line is
    //    emitted. The virtual features record below it carries
    //    `suppressed_by_ancestor: true` on its `next_action` (the RFC
    //    parent is not-started), but the renderer no longer treats
    //    that flag as a gate, so its hint line is also emitted —
    //    every actionable row stays self-describing in the text view.
    //    The flag still rides along on the JSON payload for machine
    //    consumers. Because the features map does not exist on disk yet,
    //    the virtual record redirects to `smithy.render` (the command
    //    that would create it from the RFC milestone) rather than
    //    `smithy.mark` (which would fail on a missing file) — so both
    //    the RFC and its virtual features child surface a render hint.
    //
    // 2. An independent spec whose only tasks child is fully checked
    //    off → both records classify as `done` → neither emits a hint
    //    line (`next_action` is null for done records). Under the
    //    default US3 collapse pass, the done subtree collapses to a
    //    single `DONE` line on the spec — pass `--all` so every
    //    record surfaces and the "done records emit no hint"
    //    assertion has the tasks line to test against.
    write(
      'docs/rfcs/active.rfc.md',
      `# RFC: Active Work\n\n## Dependency Order\n\n${TABLE_HEADER}\n| M1 | Milestone One | — | docs/rfcs/active.features.md |\n`,
    );
    write(
      'specs/finished/finished.spec.md',
      `# Feature Specification: Finished\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Finished Story | — | specs/finished/01-finished.tasks.md |\n`,
    );
    write(
      'specs/finished/01-finished.tasks.md',
      `# Tasks: Finished\n\n## Slice 1: Done\n\n- [x] Task one\n- [x] Task two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Done | — | — |\n`,
    );

    // Sanity-check the JSON payload first: the RFC is not-started and
    // un-suppressed, the virtual features record IS suppressed, and
    // the finished subtree rolls up to done with null next_actions.
    const jsonOutput = execFileSync(
      'node',
      [CLI, 'status', '--format', 'json', '--root', tmpDir],
      { encoding: 'utf-8' },
    );
    const payload = JSON.parse(jsonOutput) as {
      records: Array<{
        type: string;
        path: string;
        status: string;
        next_action?: {
          command: string;
          arguments: string[];
          reason: string;
          suppressed_by_ancestor?: boolean;
        } | null;
      }>;
    };
    const rfcRecord = payload.records.find((r) => r.type === 'rfc');
    const virtualFeatures = payload.records.find(
      (r) => r.type === 'features' && r.path === 'docs/rfcs/active.features.md',
    );
    const finishedTasks = payload.records.find(
      (r) => r.path === 'specs/finished/01-finished.tasks.md',
    );
    expect(rfcRecord?.status).toBe('not-started');
    expect(rfcRecord?.next_action?.command).toBe('smithy.render');
    expect(rfcRecord?.next_action?.suppressed_by_ancestor).toBeUndefined();
    expect(virtualFeatures?.status).toBe('not-started');
    // The features map has no file on disk, so the virtual record
    // redirects to `smithy.render` (against the parent RFC) rather than
    // `smithy.mark` against the missing file.
    expect(virtualFeatures?.next_action?.command).toBe('smithy.render');
    expect(virtualFeatures?.next_action?.arguments).toEqual([
      'docs/rfcs/active.rfc.md',
      '1',
    ]);
    expect(virtualFeatures?.next_action?.suppressed_by_ancestor).toBe(true);
    expect(finishedTasks?.status).toBe('done');
    expect(finishedTasks?.next_action).toBeNull();

    // Text mode with `--all` so the done subtree is not collapsed:
    // the hint lines surface exactly where expected, and the done
    // tasks record is present in the rendered output so we can assert
    // that no hint line attaches to it.
    const textOutput = execFileSync(
      'node',
      [CLI, 'status', '--root', tmpDir, '--all'],
      { encoding: 'utf-8' },
    );
    const lines = textOutput.split('\n');

    // AS 4.4: the actionable RFC emits a hint line containing
    // `smithy.render` and its rfc path. The suppressed-by-ancestor
    // virtual features record below it ALSO surfaces a render hint \u2014
    // every actionable row must be self-describing even when its parent
    // is `not-started`, and a feature map with no file on disk redirects
    // to the `smithy.render` that would create it (not `smithy.mark`,
    // which would fail on a missing file). Both render hints therefore
    // point at the RFC path.
    const renderHintLines = lines.filter(
      (l) => l.includes('\u2192') && l.includes('smithy.render'),
    );
    expect(renderHintLines).toHaveLength(2);
    for (const line of renderHintLines) {
      expect(line).toContain('docs/rfcs/active.rfc.md');
    }

    // No `smithy.mark` hint is emitted: the only features record in this
    // fixture is virtual (its `.features.md` does not exist), so it
    // redirects to `smithy.render` rather than suggesting a mark against
    // a file that isn't there.
    const markHintLines = lines.filter(
      (l) => l.includes('→') && l.includes('smithy.mark'),
    );
    expect(markHintLines).toHaveLength(0);

    // Done records emit no hint line: the finished tasks file is done
    // and must not have an arrow beneath its rendered line.
    const finishedLineIndex = lines.findIndex((l) =>
      l.includes('Finished') && l.includes('\u2713'),
    );
    expect(finishedLineIndex).toBeGreaterThanOrEqual(0);
    // The very next non-empty line must NOT be a hint line for the
    // finished tasks record.
    for (let i = finishedLineIndex + 1; i < lines.length; i++) {
      const next = lines[i]!;
      if (next.length === 0) continue;
      expect(next).not.toMatch(/^\s*\u2192\s*smithy\.forge/);
      break;
    }

    // Two hint lines total: the un-suppressed RFC's and the
    // suppressed-by-ancestor features map's. The done tasks record
    // emits nothing.
    const allHintLines = lines.filter((l) => l.includes('\u2192'));
    expect(allHintLines).toHaveLength(2);
  });

  describe('US6 filters (--status, --type, --root)', () => {
    // Shared fixture for the US6 filter tests: two sibling features
    // under one RFC. Feature A is entirely in-progress (its spec has
    // an in-progress tasks file), feature B is entirely not-started
    // (its spec's only story row has `Artifact: —`, so the scanner
    // emits a virtual not-started tasks record for it). This gives
    // the filter something to discriminate in both dimensions
    // (status and type) without needing four independent fixtures.
    function writeFilterFixture(): void {
      write(
        'docs/rfcs/demo.rfc.md',
        `# RFC: Demo\n\n## Dependency Order\n\n${TABLE_HEADER}\n| M1 | Milestone | — | docs/rfcs/demo.features.md |\n`,
      );
      write(
        'docs/rfcs/demo.features.md',
        `# Feature Map\n\n## Dependency Order\n\n${TABLE_HEADER}\n| F1 | Feature A | — | specs/feature-a |\n| F2 | Feature B | — | specs/feature-b |\n`,
      );
      // Feature A: spec → tasks with 1/2 ticked → in-progress.
      write(
        'specs/feature-a/feature-a.spec.md',
        `# Feature Specification: Feature A\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Story A | — | specs/feature-a/01-story-a.tasks.md |\n`,
      );
      // Master's a3fa215 counts completed slices, not individual
      // checkboxes, so feature A's tasks file supplies one fully-
      // checked slice plus one open slice — yielding 1/2 slices done
      // → in-progress at rollup.
      write(
        'specs/feature-a/01-story-a.tasks.md',
        `# Story A Tasks\n\n## Slice 1: Done Slice\n\n- [x] Done task A\n- [x] Done task B\n\n## Slice 2: Open Slice\n\n- [ ] Open task\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Done Slice | — | — |\n| S2 | Open Slice | — | — |\n`,
      );
      // Feature B: spec with an Artifact-— row → virtual
      // not-started tasks record is synthesized by the scanner.
      write(
        'specs/feature-b/feature-b.spec.md',
        `# Feature Specification: Feature B\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Story B | — | — |\n`,
      );
    }

    function runStatusJson(args: string[]): {
      status: number;
      payload: {
        summary: {
          counts: Record<string, Record<string, number>>;
          parse_error_count: number;
        };
        records: Array<{
          type: string;
          path: string;
          status: string;
          virtual?: boolean;
          parent_path?: string | null;
        }>;
      };
      raw: string;
    } {
      const result = spawnSync(
        'node',
        [CLI, 'status', '--format', 'json', '--root', tmpDir, ...args],
        { encoding: 'utf-8' },
      );
      return {
        status: result.status ?? 0,
        payload: JSON.parse(result.stdout) as ReturnType<
          typeof runStatusJson
        >['payload'],
        raw: result.stdout,
      };
    }

    it('--status in-progress keeps in-progress records and their ancestors (AS 6.1)', () => {
      writeFilterFixture();
      const { status, payload } = runStatusJson(['--status', 'in-progress']);
      expect(status).toBe(0);

      const paths = payload.records.map((r) => r.path).sort();
      // Chain A survives (tasks match + ancestors). Nothing from
      // chain B survives — feature B's spec and virtual tasks are
      // not-started, and the shared features/rfc are retained only
      // because chain A's records walked through them.
      expect(paths).toEqual(
        [
          'docs/rfcs/demo.rfc.md',
          'docs/rfcs/demo.features.md',
          'specs/feature-a/feature-a.spec.md',
          'specs/feature-a/01-story-a.tasks.md',
        ].sort(),
      );
      // Feature B artifacts are dropped.
      expect(paths).not.toContain('specs/feature-b/feature-b.spec.md');
    });

    it('--type spec retains only specs plus their ancestors (AS 6.3)', () => {
      writeFilterFixture();
      const { status, payload } = runStatusJson(['--type', 'spec']);
      expect(status).toBe(0);

      const types = payload.records.map((r) => r.type).sort();
      // Only rfc, features, spec, spec remain — no tasks records,
      // because tasks are descendants of a spec, not ancestors.
      expect(types).toEqual(['features', 'rfc', 'spec', 'spec']);
      // Both specs made it in as direct matches.
      const specPaths = payload.records
        .filter((r) => r.type === 'spec')
        .map((r) => r.path)
        .sort();
      expect(specPaths).toEqual([
        'specs/feature-a/feature-a.spec.md',
        'specs/feature-b/feature-b.spec.md',
      ]);
    });

    it('--root <path> narrows the scan to artifacts under that root (AS 6.2)', () => {
      // AS 6.2 is about narrowing the scan root. The scanner walks
      // `specs/`, `docs/rfcs/`, `specs/strikes/` under the supplied
      // root, so to exercise narrowing we lay down two independent
      // sub-repos inside the temp dir and verify `--root subrepoA`
      // surfaces only sub-repo A's artifacts. This exercises the
      // US1-Slice-3 `--root` wire-up end-to-end under US6.
      write(
        'subrepoA/specs/feature-a/feature-a.spec.md',
        `# Feature Specification: Feature A\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Story A | — | — |\n`,
      );
      write(
        'subrepoB/specs/feature-b/feature-b.spec.md',
        `# Feature Specification: Feature B\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Story B | — | — |\n`,
      );

      const subrepoA = path.join(tmpDir, 'subrepoA');
      const result = spawnSync(
        'node',
        [CLI, 'status', '--format', 'json', '--root', subrepoA],
        { encoding: 'utf-8' },
      );
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        records: Array<{ path: string; title: string }>;
      };
      const titles = payload.records.map((r) => r.title).sort();
      // Feature A is in scope; Feature B is not discoverable from
      // subrepoA's root.
      expect(titles).toContain('Feature A');
      expect(titles).not.toContain('Feature B');
    });

    it('--status in-progress --type spec yields the intersection (matches both predicates + shared ancestors)', () => {
      writeFilterFixture();
      const { status, payload } = runStatusJson([
        '--status',
        'in-progress',
        '--type',
        'spec',
      ]);
      expect(status).toBe(0);

      const paths = payload.records.map((r) => r.path).sort();
      // Only Feature A's spec is BOTH a spec AND in-progress. Its
      // ancestors (rfc, features) are retained; Feature B's spec is
      // dropped because it is not in-progress; tasks records are
      // dropped because they are not specs.
      expect(paths).toEqual(
        [
          'docs/rfcs/demo.rfc.md',
          'docs/rfcs/demo.features.md',
          'specs/feature-a/feature-a.spec.md',
        ].sort(),
      );
    });

    it('--format json emits only filtered records (no hierarchical tree on the wire)', () => {
      writeFilterFixture();
      const { payload } = runStatusJson(['--status', 'in-progress']);
      // The JSON payload no longer carries `tree` — consumers
      // reconstruct it locally from `records.parent_path`. The
      // filter's correctness is therefore expressed entirely against
      // `records`: Feature B's records must be dropped and Feature
      // A's tasks records must survive.
      expect(payload).not.toHaveProperty('tree');
      const paths = payload.records.map((r) => r.path);
      expect(paths).not.toContain('specs/feature-b/feature-b.spec.md');
      expect(paths).toContain('specs/feature-a/01-story-a.tasks.md');
    });

    it('summary counts are byte-identical with and without filter flags against the same fixture (SD-010)', () => {
      writeFilterFixture();
      const unfiltered = runStatusJson([]);
      const filtered = runStatusJson(['--status', 'in-progress']);
      // Summary is aggregate over the full scan regardless of
      // filters — locked in by SD-010 to preserve the JSON
      // contract's aggregate-summary framing.
      expect(JSON.stringify(filtered.payload.summary)).toBe(
        JSON.stringify(unfiltered.payload.summary),
      );
    });

    it('prints a friendly no-match hint (not the pathological fallback warning) when filters retain zero records', () => {
      writeFilterFixture();
      // No artifact in the fixture has `status: done`, so this
      // filter matches nothing. The exit should be 0 and the output
      // should carry the summary header + a no-match line — not the
      // "tree rendering produced no output" warning (which is
      // reserved for real cycle/rendering bugs where the filter
      // retained records but the tree came back empty).
      const result = spawnSync(
        'node',
        [CLI, 'status', '--root', tmpDir, '--status', 'done'],
        { encoding: 'utf-8' },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('No artifacts match the current filter');
      expect(result.stdout).not.toContain(
        'tree rendering produced no output',
      );
      // The aggregate summary header still prints above the hint
      // (SD-010).
      expect(result.stdout).toContain(' Smithy Status');
    });

    it('text-mode summary count rows are byte-identical with and without filter flags', () => {
      writeFilterFixture();
      const unfiltered = execFileSync(
        'node',
        [CLI, 'status', '--root', tmpDir],
        { encoding: 'utf-8' },
      );
      const filtered = execFileSync(
        'node',
        [CLI, 'status', '--root', tmpDir, '--status', 'in-progress'],
        { encoding: 'utf-8' },
      );
      // Extract just the count rows (the lines between ` Smithy
      // Status` and the first blank-line separator that follows). The
      // `Next:` line can legitimately differ between filtered and
      // unfiltered runs because it reads off the filtered tree, while
      // the count rows are computed pre-filter per SD-010 and must be
      // byte-identical.
      const extractRows = (output: string): string => {
        const lines = output.split('\n');
        const start = lines.findIndex((l) => l === ' Smithy Status');
        expect(start).toBeGreaterThanOrEqual(0);
        // Skip the blank line right after the title, then collect
        // contiguous non-blank rows.
        const rows: string[] = [];
        for (let i = start + 2; i < lines.length; i++) {
          if (lines[i]!.length === 0) break;
          rows.push(lines[i]!);
        }
        return rows.join('\n');
      };
      expect(extractRows(filtered)).toBe(extractRows(unfiltered));
      // Sanity: the unfiltered count rows carry at least one type
      // label.
      expect(extractRows(unfiltered)).toMatch(/(RFCs|Features|Specs|Tasks)/);
    });
  });
});

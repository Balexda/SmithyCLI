import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildClaudeAllowList, buildClaudeDenyList, deploy, remove, writePermissions } from './claude.js';

describe('deploy', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-claude-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes stale smithy artifacts from prompts on deploy', () => {
    const promptsDir = path.join(tmpDir, '.claude', 'prompts');
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, 'smithy.patch.md'), '# old template');

    deploy(tmpDir, false);

    expect(fs.existsSync(path.join(promptsDir, 'smithy.patch.md'))).toBe(false);
    expect(fs.existsSync(path.join(promptsDir, 'smithy.fix.md'))).toBe(true);
  });

  it('removes stale smithy artifacts from commands on deploy', () => {
    const commandsDir = path.join(tmpDir, '.claude', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    fs.writeFileSync(path.join(commandsDir, 'smithy.patch.md'), '# old command');

    deploy(tmpDir, false);

    expect(fs.existsSync(path.join(commandsDir, 'smithy.patch.md'))).toBe(false);
  });
});

describe('remove', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-claude-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes stale smithy artifacts during remove', () => {
    const promptsDir = path.join(tmpDir, '.claude', 'prompts');
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, 'smithy.patch.md'), '# stale');

    const removedCount = remove(tmpDir);
    expect(removedCount).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(path.join(promptsDir, 'smithy.patch.md'))).toBe(false);
  });
});

describe('buildClaudeAllowList', () => {
  it('wraps all commands in Bash()', () => {
    const list = buildClaudeAllowList();
    const bashEntries = list.filter(e => e.startsWith('Bash('));
    // Every entry is either Bash(...) or a Claude tool permission
    for (const entry of list) {
      expect(
        entry.startsWith('Bash(') || ['WebSearch', 'WebFetch'].includes(entry) || entry.startsWith('Skill(') || entry.startsWith('Write(')
      ).toBe(true);
    }
    // Should have many Bash entries
    expect(bashEntries.length).toBeGreaterThan(20);
  });

  it('includes Claude-specific tool permissions', () => {
    const list = buildClaudeAllowList();
    expect(list).toContain('WebSearch');
    expect(list).toContain('WebFetch');
    expect(list.some(e => e.startsWith('Skill(smithy.'))).toBe(true);
  });

  it('includes git commands wrapped in Bash()', () => {
    const list = buildClaudeAllowList();
    expect(list).toContain('Bash(git status)');
    expect(list).toContain('Bash(git add *)');
    expect(list).toContain('Bash(git commit *)');
    expect(list).toContain('Bash(git diff *)');
    expect(list).toContain('Bash(git log *)');
    expect(list).toContain('Bash(git push -u origin feature/*)');
  });

  it('includes multi-language build tool commands', () => {
    const list = buildClaudeAllowList();
    // npm
    expect(list).toContain('Bash(npm run build)');
    expect(list).toContain('Bash(npm run typecheck)');
    expect(list).toContain('Bash(npm test *)');
    // gradle
    expect(list).toContain('Bash(gradle build)');
    expect(list).toContain('Bash(gradle test)');
    expect(list).toContain('Bash(./gradlew build)');
    // cargo
    expect(list).toContain('Bash(cargo build *)');
    expect(list).toContain('Bash(cargo test *)');
    expect(list).toContain('Bash(cargo clippy *)');
  });

  it('includes filesystem commands', () => {
    const list = buildClaudeAllowList();
    expect(list).toContain('Bash(ls *)');
    expect(list).toContain('Bash(cat *)');
    expect(list).toContain('Bash(mkdir *)');
    expect(list).toContain('Bash(cp *)');
    expect(list).toContain('Bash(mv *)');
    expect(list).toContain('Bash(grep *)');
  });

  it('does not include destructive commands', () => {
    const list = buildClaudeAllowList();
    const joined = list.join('\n');
    expect(joined).not.toMatch(/\brm\b/);
    expect(joined).not.toMatch(/--force/);
    expect(joined).not.toMatch(/\bchmod\b/);
    expect(joined).not.toMatch(/\bchown\b/);
    expect(joined).not.toMatch(/\bkill\b/);
    expect(joined).not.toMatch(/branch -[dD]/);
    expect(joined).not.toMatch(/reset --hard/);
    expect(joined).not.toMatch(/\bcurl\b/);
    expect(joined).not.toMatch(/\bxargs\b/);
  });

  it('generates both bare and wildcard gh permissions from ["", "*"] args', () => {
    const list = buildClaudeAllowList();
    // Commands with ["", "*"] should produce both bare and wildcard entries
    expect(list).toContain('Bash(gh pr list)');
    expect(list).toContain('Bash(gh pr list *)');
    expect(list).toContain('Bash(gh pr edit)');
    expect(list).toContain('Bash(gh pr edit *)');
    expect(list).toContain('Bash(gh pr create)');
    expect(list).toContain('Bash(gh pr create *)');
    expect(list).toContain('Bash(gh pr view)');
    expect(list).toContain('Bash(gh pr view *)');
    expect(list).toContain('Bash(gh pr diff)');
    expect(list).toContain('Bash(gh pr diff *)');
    expect(list).toContain('Bash(gh issue list)');
    expect(list).toContain('Bash(gh issue list *)');
    expect(list).toContain('Bash(gh issue view)');
    expect(list).toContain('Bash(gh issue view *)');
    expect(list).toContain('Bash(gh issue create)');
    expect(list).toContain('Bash(gh issue create *)');
  });

  it('restricts git remote to read-only operations', () => {
    const list = buildClaudeAllowList();
    const remoteEntries = list.filter(e => e.includes('git remote'));
    // Should only have read-only remote operations
    expect(remoteEntries).toContain('Bash(git remote -v)');
    expect(remoteEntries).toContain('Bash(git remote show *)');
    // Should NOT have broad wildcard
    expect(remoteEntries).not.toContain('Bash(git remote *)');
    expect(remoteEntries.length).toBe(2);
  });
});

describe('buildClaudeDenyList', () => {
  it('wraps all deny entries in Bash()', () => {
    const list = buildClaudeDenyList();
    for (const entry of list) {
      expect(entry.startsWith('Bash(')).toBe(true);
    }
  });

  it('blocks destructive git branch operations', () => {
    const list = buildClaudeDenyList();
    expect(list).toContain('Bash(git branch -D *)');
    expect(list).toContain('Bash(git branch -d *)');
    expect(list).toContain('Bash(git branch --delete *)');
  });

  it('blocks hard reset but not force push (force push requires approval)', () => {
    const list = buildClaudeDenyList();
    expect(list).toContain('Bash(git reset --hard *)');
    // Force push is no longer denied — it triggers a user approval prompt instead
    expect(list).not.toContain('Bash(git push --force *)');
    expect(list).not.toContain('Bash(git push -f *)');
    expect(list).not.toContain('Bash(git push --force-with-lease *)');
  });

  it('blocks destructive checkout and stash operations', () => {
    const list = buildClaudeDenyList();
    expect(list).toContain('Bash(git checkout -- *)');
    expect(list).toContain('Bash(git checkout .)');
    expect(list).toContain('Bash(git stash drop *)');
    expect(list).toContain('Bash(git stash clear)');
  });
});

describe('writePermissions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-claude-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes to .claude/settings.json (not config.json)', () => {
    writePermissions(tmpDir);

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    const configPath = path.join(tmpDir, '.claude', 'config.json');

    expect(fs.existsSync(settingsPath)).toBe(true);
    expect(fs.existsSync(configPath)).toBe(false);

  });

  it('uses correct schema with permissions.allow array', () => {
    writePermissions(tmpDir);

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    expect(config).toHaveProperty('permissions');
    expect(config.permissions).toHaveProperty('allow');
    expect(config.permissions).toHaveProperty('deny');
    expect(Array.isArray(config.permissions.allow)).toBe(true);
    expect(Array.isArray(config.permissions.deny)).toBe(true);
    // Deny list should contain destructive git operations
    expect(config.permissions.deny).toContain('Bash(git branch -D *)');
    // Should NOT have old format
    expect(config.permissions).not.toHaveProperty('allowed_commands');

  });

  it('entries are Bash()-wrapped or Claude tool names', () => {
    writePermissions(tmpDir);

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    for (const entry of config.permissions.allow) {
      expect(
        entry.startsWith('Bash(') || entry === 'WebSearch' || entry === 'WebFetch' || entry.startsWith('Skill(') || entry.startsWith('Write(')
      ).toBe(true);
    }

  });

  it('merges with existing settings.json without clobbering other keys', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const settingsPath = path.join(claudeDir, 'settings.json');

    // Write pre-existing settings with extra keys
    const existing = {
      model: 'claude-sonnet-4-6',
      permissions: {
        allow: ['Bash(custom-command)'],
        deny: ['Bash(rm *)'],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));

    writePermissions(tmpDir);

    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    // Preserved non-permissions keys
    expect(config.model).toBe('claude-sonnet-4-6');
    // Preserved existing deny entry merged with smithy deny list
    expect(config.permissions.deny).toContain('Bash(rm *)');
    // Merged: existing custom command is still present
    expect(config.permissions.allow).toContain('Bash(custom-command)');
    // Merged: new smithy permissions are present
    expect(config.permissions.allow).toContain('Bash(git status)');
    expect(config.permissions.allow).toContain('WebSearch');

  });

  it('handles malformed existing settings.json gracefully', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), 'not valid json{{{');

    // Should not throw
    writePermissions(tmpDir);

    const config = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
    expect(config.permissions.allow).toContain('Bash(git status)');

  });

  it('creates .claude directory if it does not exist', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const deepDir = path.join(tmpDir, 'nested', 'project');
    fs.mkdirSync(deepDir, { recursive: true });

    writePermissions(deepDir);

    const settingsPath = path.join(deepDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

  });
});

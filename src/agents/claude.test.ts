import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildClaudeAllowList, writePermissions } from './claude.js';

describe('buildClaudeAllowList', () => {
  it('wraps all commands in Bash()', () => {
    const list = buildClaudeAllowList();
    const bashEntries = list.filter(e => e.startsWith('Bash('));
    // Every entry is either Bash(...) or a Claude tool permission
    for (const entry of list) {
      expect(
        entry.startsWith('Bash(') || ['WebSearch', 'WebFetch'].includes(entry) || entry.startsWith('Skill(')
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
    expect(list).toContain('Bash(git push -u origin *)');
  });

  it('includes multi-language build tool commands', () => {
    const list = buildClaudeAllowList();
    // npm
    expect(list).toContain('Bash(npm run build)');
    expect(list).toContain('Bash(npm run typecheck)');
    expect(list).toContain('Bash(npm test)');
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
  });
});

describe('writePermissions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-claude-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes to .claude/settings.json (not config.json)', () => {
    // Suppress console output
    vi.spyOn(console, 'log').mockImplementation(() => {});

    writePermissions(tmpDir);

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    const configPath = path.join(tmpDir, '.claude', 'config.json');

    expect(fs.existsSync(settingsPath)).toBe(true);
    expect(fs.existsSync(configPath)).toBe(false);

    vi.restoreAllMocks();
  });

  it('uses correct schema with permissions.allow array', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    writePermissions(tmpDir);

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    expect(config).toHaveProperty('permissions');
    expect(config.permissions).toHaveProperty('allow');
    expect(Array.isArray(config.permissions.allow)).toBe(true);
    // Should NOT have old format
    expect(config.permissions).not.toHaveProperty('allowed_commands');

    vi.restoreAllMocks();
  });

  it('entries are Bash()-wrapped or Claude tool names', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    writePermissions(tmpDir);

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    for (const entry of config.permissions.allow) {
      expect(
        entry.startsWith('Bash(') || entry === 'WebSearch' || entry === 'WebFetch' || entry.startsWith('Skill(')
      ).toBe(true);
    }

    vi.restoreAllMocks();
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
    // Preserved existing deny list
    expect(config.permissions.deny).toEqual(['Bash(rm *)']);
    // Merged: existing custom command is still present
    expect(config.permissions.allow).toContain('Bash(custom-command)');
    // Merged: new smithy permissions are present
    expect(config.permissions.allow).toContain('Bash(git status)');
    expect(config.permissions.allow).toContain('WebSearch');

    vi.restoreAllMocks();
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

    vi.restoreAllMocks();
  });

  it('creates .claude directory if it does not exist', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const deepDir = path.join(tmpDir, 'nested', 'project');
    fs.mkdirSync(deepDir, { recursive: true });

    writePermissions(deepDir);

    const settingsPath = path.join(deepDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

    vi.restoreAllMocks();
  });
});

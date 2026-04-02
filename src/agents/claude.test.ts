import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildClaudeAllowList, buildClaudeDenyList, deploy, removeLegacy, writePermissions, resolveSettingsPath } from './claude.js';
import { getComposedTemplates, getTemplateFilesByCategory } from '../templates.js';
import { writeManifest, readManifest, removeStaleFiles } from '../manifest.js';

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

  it('creates .claude/prompts/ from scratch on a fresh directory', async () => {
    await deploy(tmpDir, 'none');

    const promptsDir = path.join(tmpDir, '.claude', 'prompts');
    expect(fs.existsSync(promptsDir)).toBe(true);
    const files = fs.readdirSync(promptsDir);
    expect(files.length).toBeGreaterThan(0);
  });

  it('deploys only prompt-category templates to prompts/', async () => {
    await deploy(tmpDir, 'none');

    const promptsDir = path.join(tmpDir, '.claude', 'prompts');
    const deployedFiles = fs.readdirSync(promptsDir).sort();
    const templates = await getComposedTemplates();
    const expectedPrompts = [...templates.prompts.keys()].sort();

    expect(deployedFiles).toEqual(expectedPrompts);
  });

  it('deploys commands only to commands/ and not to prompts/', async () => {
    await deploy(tmpDir, 'none');

    const commandsDir = path.join(tmpDir, '.claude', 'commands');
    const promptsDir = path.join(tmpDir, '.claude', 'prompts');

    expect(fs.existsSync(commandsDir)).toBe(true);

    const commandFiles = fs.readdirSync(commandsDir).sort();
    const templates = await getComposedTemplates();
    const expectedCommands = [...templates.commands.keys()].sort();

    expect(commandFiles).toEqual(expectedCommands);

    // Commands should NOT appear in prompts/
    const promptFiles = fs.readdirSync(promptsDir);
    for (const file of commandFiles) {
      expect(promptFiles).not.toContain(file);
    }
  });

  it('deploys prompts only to prompts/ and not to commands/', async () => {
    await deploy(tmpDir, 'none');

    const commandsDir = path.join(tmpDir, '.claude', 'commands');
    const promptsDir = path.join(tmpDir, '.claude', 'prompts');

    const promptFiles = fs.readdirSync(promptsDir);
    const commandFiles = fs.readdirSync(commandsDir);

    // Prompt files should NOT appear in commands/
    for (const file of promptFiles) {
      expect(commandFiles).not.toContain(file);
    }
  });

  it('writes agent templates to agents/ with frontmatter intact', async () => {
    await deploy(tmpDir, 'none');

    const agentsDir = path.join(tmpDir, '.claude', 'agents');
    const templates = await getComposedTemplates();
    const expectedAgents = [...templates.agents.keys()].sort();

    if (expectedAgents.length > 0) {
      expect(fs.existsSync(agentsDir)).toBe(true);
      const agentFiles = fs.readdirSync(agentsDir).sort();
      expect(agentFiles).toEqual(expectedAgents);

      // Agent files should keep frontmatter
      for (const file of agentFiles) {
        const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
        expect(content).toMatch(/^---\s*\n/);
      }
    }
  });

  it('does not deploy non-agent templates to agents/', async () => {
    await deploy(tmpDir, 'none');

    const agentsDir = path.join(tmpDir, '.claude', 'agents');
    if (fs.existsSync(agentsDir)) {
      const agentFiles = fs.readdirSync(agentsDir);
      const templates = await getComposedTemplates();
      for (const file of agentFiles) {
        expect(templates.agents.has(file)).toBe(true);
      }
    }
  });

  it('strips frontmatter from deployed prompt files', async () => {
    await deploy(tmpDir, 'none');

    const promptsDir = path.join(tmpDir, '.claude', 'prompts');
    const files = fs.readdirSync(promptsDir);

    for (const file of files) {
      const content = fs.readFileSync(path.join(promptsDir, file), 'utf8');
      expect(content).not.toMatch(/^---\s*\n/);
    }
  });

  it('strips frontmatter from deployed command files', async () => {
    await deploy(tmpDir, 'none');

    const commandsDir = path.join(tmpDir, '.claude', 'commands');
    const files = fs.readdirSync(commandsDir);

    for (const file of files) {
      const content = fs.readFileSync(path.join(commandsDir, file), 'utf8');
      expect(content).not.toMatch(/^---\s*\n/);
    }
  });

  it('returns deployed file paths', async () => {
    const files = await deploy(tmpDir, 'none');
    expect(files.length).toBeGreaterThan(0);
    // All paths should be relative
    for (const file of files) {
      expect(path.isAbsolute(file)).toBe(false);
    }
  });

  it('deploys to homedir when location is "user"', async () => {
    const fakeHome = path.join(tmpDir, 'fakehome');
    fs.mkdirSync(fakeHome, { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);

    await deploy(tmpDir, 'none', 'user');

    // Files should exist under fakeHome/.claude/
    const promptsDir = path.join(fakeHome, '.claude', 'prompts');
    expect(fs.existsSync(promptsDir)).toBe(true);
    expect(fs.readdirSync(promptsDir).length).toBeGreaterThan(0);

    // Files should NOT exist under tmpDir/.claude/
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts'))).toBe(false);
  });

  it('returns paths relative to homedir when location is "user"', async () => {
    const fakeHome = path.join(tmpDir, 'fakehome');
    fs.mkdirSync(fakeHome, { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);

    const files = await deploy(tmpDir, 'none', 'user');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(path.isAbsolute(file)).toBe(false);
      // Each file should resolve to fakeHome, not tmpDir
      expect(fs.existsSync(path.join(fakeHome, file))).toBe(true);
    }
  });

  it('creates settings.json when permissionLevel is "repo"', async () => {
    await deploy(tmpDir, 'repo');

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.permissions.allow).toContain('Bash(git status)');
  });

  it('does not create settings.json when permissionLevel is "none"', async () => {
    await deploy(tmpDir, 'none');

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(false);
  });

});


describe('removeLegacy', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-claude-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes deployed files by known template filenames', async () => {
    await deploy(tmpDir, 'none');

    const removedCount = removeLegacy(tmpDir);
    expect(removedCount).toBeGreaterThan(0);

    const categories = getTemplateFilesByCategory();
    for (const file of categories.commands) {
      expect(fs.existsSync(path.join(tmpDir, '.claude', 'commands', file))).toBe(false);
    }
    for (const file of categories.prompts) {
      expect(fs.existsSync(path.join(tmpDir, '.claude', 'prompts', file))).toBe(false);
    }
    for (const file of categories.agents) {
      expect(fs.existsSync(path.join(tmpDir, '.claude', 'agents', file))).toBe(false);
    }
  });

  it('returns 0 on empty/nonexistent directory without throwing', () => {
    const emptyDir = path.join(tmpDir, 'nonexistent');
    expect(removeLegacy(emptyDir)).toBe(0);
  });

  it('preserves non-smithy files in prompts/', async () => {
    await deploy(tmpDir, 'none');

    const userFile = path.join(tmpDir, '.claude', 'prompts', 'my-custom-prompt.md');
    fs.writeFileSync(userFile, '# Custom');

    removeLegacy(tmpDir);

    expect(fs.existsSync(userFile)).toBe(true);
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

  it('includes claude/* branch push patterns', () => {
    const list = buildClaudeAllowList();
    expect(list).toContain('Bash(git push -u origin claude/*)');
    expect(list).toContain('Bash(git push origin claude/*)');
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
    expect(list).toContain('Bash(gh repo view)');
    expect(list).toContain('Bash(gh repo view *)');
  });

  it('allows gh --version', () => {
    const list = buildClaudeAllowList();
    expect(list).toContain('Bash(gh --version)');
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

describe('resolveSettingsPath', () => {
  it('returns repo-level path for "repo" level', () => {
    const result = resolveSettingsPath('/my/project', 'repo');
    expect(result).toBe(path.join('/my/project', '.claude', 'settings.json'));
  });

  it('returns user-level path for "user" level', () => {
    const result = resolveSettingsPath('/my/project', 'user');
    expect(result).toBe(path.join(os.homedir(), '.claude', 'settings.json'));
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

  it('writes to .claude/settings.json for repo level', () => {
    writePermissions(tmpDir, 'repo');

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);
  });

  it('uses correct schema with permissions.allow and permissions.deny arrays', () => {
    writePermissions(tmpDir, 'repo');

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
    writePermissions(tmpDir, 'repo');

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    for (const entry of config.permissions.allow) {
      expect(
        entry.startsWith('Bash(') || entry === 'WebSearch' || entry === 'WebFetch' || entry.startsWith('Skill(') || entry.startsWith('Write(')
      ).toBe(true);
    }
  });

  it('merges with existing settings.json without clobbering other keys', () => {
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

    writePermissions(tmpDir, 'repo');

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
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), 'not valid json{{{');

    // Should not throw
    writePermissions(tmpDir, 'repo');

    const config = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
    expect(config.permissions.allow).toContain('Bash(git status)');
  });

  it('creates .claude directory if it does not exist', () => {
    const deepDir = path.join(tmpDir, 'nested', 'project');
    fs.mkdirSync(deepDir, { recursive: true });

    writePermissions(deepDir, 'repo');

    const settingsPath = path.join(deepDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);
  });

  it('writes to user-level path for "user" level', () => {
    // Use tmpDir as a fake home directory
    const fakeHome = path.join(tmpDir, 'fakehome');
    fs.mkdirSync(fakeHome, { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);

    writePermissions(tmpDir, 'user');

    const settingsPath = path.join(fakeHome, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.permissions.allow).toContain('Bash(git status)');

    // Should NOT have written to the repo-level path
    const repoSettingsPath = path.join(tmpDir, '.claude', 'settings.json');
    expect(fs.existsSync(repoSettingsPath)).toBe(false);
  });

  it('produces no duplicates when called twice (idempotency)', () => {
    writePermissions(tmpDir, 'repo');
    writePermissions(tmpDir, 'repo');

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    // Check that allow list has no duplicates
    const allowSet = new Set(config.permissions.allow);
    expect(config.permissions.allow.length).toBe(allowSet.size);

    // Check that deny list has no duplicates
    const denySet = new Set(config.permissions.deny);
    expect(config.permissions.deny.length).toBe(denySet.size);
  });

  it('handles existing permissions object with no allow/deny keys', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ permissions: { someCustomFlag: true } }),
    );

    writePermissions(tmpDir, 'repo');

    const config = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
    expect(config.permissions.allow).toContain('Bash(git status)');
    expect(config.permissions.deny).toContain('Bash(git branch -D *)');
    // Custom key should be preserved
    expect(config.permissions.someCustomFlag).toBe(true);
  });
});

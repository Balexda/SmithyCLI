import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { deploy, removeLegacy } from './codex.js';
import { getComposedTemplates, getTemplateFilesByCategory, parseFrontmatterName } from '../templates.js';

describe('deploy', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-codex-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates prompts directory and deploys only prompt-category template files', async () => {
    await deploy(tmpDir, false);

    const promptsDir = path.join(tmpDir, 'tools', 'codex', 'prompts');
    expect(fs.existsSync(promptsDir)).toBe(true);

    const files = fs.readdirSync(promptsDir);
    const categories = getTemplateFilesByCategory();
    expect(files.length).toBe(categories.prompts.length);
    for (const file of files) {
      expect(file.endsWith('.md')).toBe(true);
    }
  });

  it('strips frontmatter from deployed prompt files', async () => {
    await deploy(tmpDir, false);

    const promptsDir = path.join(tmpDir, 'tools', 'codex', 'prompts');
    const files = fs.readdirSync(promptsDir);

    for (const file of files) {
      const content = fs.readFileSync(path.join(promptsDir, file), 'utf8');
      // Should not start with frontmatter delimiter
      expect(content).not.toMatch(/^---\s*\n/);
    }
  });

  it('writes permissions when initPermissions is true', async () => {
    await deploy(tmpDir, true);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    expect(fs.existsSync(configPath)).toBe(true);

    const content = fs.readFileSync(configPath, 'utf8');
    expect(content).toContain('[approvals]');
    expect(content).toContain('policy = "auto"');
  });

  it('does not write permissions when initPermissions is false', async () => {
    await deploy(tmpDir, false);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it('returns deployed file paths', async () => {
    const files = await deploy(tmpDir, false);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(path.isAbsolute(file)).toBe(false);
    }
  });

  it('deploys command-flagged templates as skills to .agents/skills/', async () => {
    await deploy(tmpDir, false);

    const skillsDir = path.join(tmpDir, '.agents', 'skills');
    expect(fs.existsSync(skillsDir)).toBe(true);

    const skillDirs = fs.readdirSync(skillsDir);
    expect(skillDirs.length).toBeGreaterThan(0);

    // Verify only command-category templates with names become skills
    const templates = await getComposedTemplates();
    const expectedSkills = [...templates.commands.entries()]
      .map(([, content]) => parseFrontmatterName(content)!)
      .filter(Boolean);

    expect(skillDirs.sort()).toEqual(expectedSkills.sort());

    // Verify each skill directory contains a SKILL.md with frontmatter preserved
    for (const dir of skillDirs) {
      const skillFile = path.join(skillsDir, dir, 'SKILL.md');
      expect(fs.existsSync(skillFile)).toBe(true);
      const content = fs.readFileSync(skillFile, 'utf8');
      expect(content).toMatch(/^---\s*\n/);
    }
  });

  it('is idempotent — deploying twice does not duplicate content', async () => {
    await deploy(tmpDir, false);
    const promptsDir = path.join(tmpDir, 'tools', 'codex', 'prompts');
    const firstFiles = fs.readdirSync(promptsDir);
    const firstContents = firstFiles.map(f =>
      fs.readFileSync(path.join(promptsDir, f), 'utf8')
    );

    await deploy(tmpDir, false);
    const secondFiles = fs.readdirSync(promptsDir);
    const secondContents = secondFiles.map(f =>
      fs.readFileSync(path.join(promptsDir, f), 'utf8')
    );

    expect(secondFiles).toEqual(firstFiles);
    expect(secondContents).toEqual(firstContents);
  });
});

describe('removeLegacy', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-codex-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes deployed prompt files and skill directories', async () => {
    await deploy(tmpDir, false);

    const removedCount = removeLegacy(tmpDir);
    expect(removedCount).toBeGreaterThan(0);

    const promptsDir = path.join(tmpDir, 'tools', 'codex', 'prompts');
    const filesAfter = fs.readdirSync(promptsDir);
    expect(filesAfter.length).toBe(0);
  });

  it('removes smithy-prefixed skill directories', () => {
    const skillsDir = path.join(tmpDir, '.agents', 'skills');
    const staleSkillDir = path.join(skillsDir, 'smithy-patch');
    fs.mkdirSync(staleSkillDir, { recursive: true });
    fs.writeFileSync(path.join(staleSkillDir, 'SKILL.md'), '# stale');

    const removedCount = removeLegacy(tmpDir);
    expect(removedCount).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(staleSkillDir)).toBe(false);
  });

  it('returns 0 when no files exist to remove', () => {
    const removedCount = removeLegacy(tmpDir);
    expect(removedCount).toBe(0);
  });
});

describe('writePermissions (via deploy)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-codex-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .codex directory if it does not exist', async () => {
    await deploy(tmpDir, true);

    const codexDir = path.join(tmpDir, '.codex');
    expect(fs.existsSync(codexDir)).toBe(true);
  });

  it('generates valid TOML with approvals rules', async () => {
    await deploy(tmpDir, true);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('[approvals]');
    expect(content).toContain('policy = "auto"');
    expect(content).toContain('[[approvals.rules]]');
    expect(content).toContain('command = "git"');
  });

  it('includes filesystem commands in rules', async () => {
    await deploy(tmpDir, true);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('command = "ls"');
    expect(content).toContain('command = "cat"');
    expect(content).toContain('command = "cp"');
    expect(content).toContain('command = "mkdir"');
  });

  it('uses args_startswith for wildcard entries', async () => {
    await deploy(tmpDir, true);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    const content = fs.readFileSync(configPath, 'utf8');

    // Wildcard entries should produce args_startswith
    expect(content).toContain('args_startswith');
  });

  it('uses args for non-wildcard entries', async () => {
    await deploy(tmpDir, true);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    const content = fs.readFileSync(configPath, 'utf8');

    // Non-wildcard entries like "git status" (no args) should produce args = []
    expect(content).toContain('args = []');
  });

  it('uses empty args_startswith for commands with bare wildcard and flag variants', async () => {
    await deploy(tmpDir, true);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    const content = fs.readFileSync(configPath, 'utf8');

    // mkdir: ["*", "-p *"] should produce args_startswith = [], not ["-p "]
    const mkdirRule = content.match(
      /\[\[approvals\.rules\]\]\ncommand = "mkdir"\n(args\S* = [^\n]+)/
    );
    expect(mkdirRule).not.toBeNull();
    expect(mkdirRule![1]).toBe('args_startswith = []');
  });

  it('does not overwrite existing config with approvals section', async () => {
    const codexDir = path.join(tmpDir, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    const configPath = path.join(codexDir, 'config.toml');

    const existing = '[approvals]\npolicy = "suggest"\n';
    fs.writeFileSync(configPath, existing);

    await deploy(tmpDir, true);

    const content = fs.readFileSync(configPath, 'utf8');
    // Should not have appended a second [approvals] section
    expect(content).toBe(existing);
  });

  it('appends to existing config without approvals section', async () => {
    const codexDir = path.join(tmpDir, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    const configPath = path.join(codexDir, 'config.toml');

    const existing = '[model]\nname = "gpt-4"\n';
    fs.writeFileSync(configPath, existing);

    await deploy(tmpDir, true);

    const content = fs.readFileSync(configPath, 'utf8');
    // Should preserve existing content
    expect(content).toContain('[model]');
    expect(content).toContain('name = "gpt-4"');
    // Should have appended approvals
    expect(content).toContain('[approvals]');
    expect(content).toContain('policy = "auto"');
  });
});

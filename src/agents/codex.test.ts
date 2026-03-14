import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { deploy, remove } from './codex.js';

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

  it('creates prompts directory and deploys template files', () => {
    deploy(tmpDir, false);

    const promptsDir = path.join(tmpDir, 'tools', 'codex', 'prompts');
    expect(fs.existsSync(promptsDir)).toBe(true);

    const files = fs.readdirSync(promptsDir);
    expect(files.length).toBe(999);
    for (const file of files) {
      expect(file.endsWith('.md')).toBe(true);
    }
  });

  it('strips frontmatter from deployed files', () => {
    deploy(tmpDir, false);

    const promptsDir = path.join(tmpDir, 'tools', 'codex', 'prompts');
    const files = fs.readdirSync(promptsDir);

    for (const file of files) {
      const content = fs.readFileSync(path.join(promptsDir, file), 'utf8');
      // Should not start with frontmatter delimiter
      expect(content).not.toMatch(/^---\s*\n/);
    }
  });

  it('writes permissions when initPermissions is true', () => {
    deploy(tmpDir, true);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    expect(fs.existsSync(configPath)).toBe(true);

    const content = fs.readFileSync(configPath, 'utf8');
    expect(content).toContain('[approvals]');
    expect(content).toContain('policy = "auto"');
  });

  it('does not write permissions when initPermissions is false', () => {
    deploy(tmpDir, false);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it('is idempotent — deploying twice does not duplicate content', () => {
    deploy(tmpDir, false);
    const promptsDir = path.join(tmpDir, 'tools', 'codex', 'prompts');
    const firstFiles = fs.readdirSync(promptsDir);
    const firstContents = firstFiles.map(f =>
      fs.readFileSync(path.join(promptsDir, f), 'utf8')
    );

    deploy(tmpDir, false);
    const secondFiles = fs.readdirSync(promptsDir);
    const secondContents = secondFiles.map(f =>
      fs.readFileSync(path.join(promptsDir, f), 'utf8')
    );

    expect(secondFiles).toEqual(firstFiles);
    expect(secondContents).toEqual(firstContents);
  });
});

describe('remove', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-codex-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes deployed prompt files and returns count', () => {
    deploy(tmpDir, false);

    const promptsDir = path.join(tmpDir, 'tools', 'codex', 'prompts');
    const filesBefore = fs.readdirSync(promptsDir);
    expect(filesBefore.length).toBeGreaterThan(0);

    const removedCount = remove(tmpDir);
    expect(removedCount).toBe(filesBefore.length);

    const filesAfter = fs.readdirSync(promptsDir);
    expect(filesAfter.length).toBe(0);
  });

  it('returns 0 when no files exist to remove', () => {
    const removedCount = remove(tmpDir);
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

  it('creates .codex directory if it does not exist', () => {
    deploy(tmpDir, true);

    const codexDir = path.join(tmpDir, '.codex');
    expect(fs.existsSync(codexDir)).toBe(true);
  });

  it('generates valid TOML with approvals rules', () => {
    deploy(tmpDir, true);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('[approvals]');
    expect(content).toContain('policy = "auto"');
    expect(content).toContain('[[approvals.rules]]');
    expect(content).toContain('command = "git"');
  });

  it('includes filesystem commands in rules', () => {
    deploy(tmpDir, true);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('command = "ls"');
    expect(content).toContain('command = "cat"');
    expect(content).toContain('command = "cp"');
    expect(content).toContain('command = "mkdir"');
  });

  it('uses args_startswith for wildcard entries', () => {
    deploy(tmpDir, true);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    const content = fs.readFileSync(configPath, 'utf8');

    // Wildcard entries should produce args_startswith
    expect(content).toContain('args_startswith');
  });

  it('uses args for non-wildcard entries', () => {
    deploy(tmpDir, true);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    const content = fs.readFileSync(configPath, 'utf8');

    // Non-wildcard entries like "git status" (no args) should produce args = []
    expect(content).toContain('args = []');
  });

  it('does not overwrite existing config with approvals section', () => {
    const codexDir = path.join(tmpDir, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    const configPath = path.join(codexDir, 'config.toml');

    const existing = '[approvals]\npolicy = "suggest"\n';
    fs.writeFileSync(configPath, existing);

    deploy(tmpDir, true);

    const content = fs.readFileSync(configPath, 'utf8');
    // Should not have appended a second [approvals] section
    expect(content).toBe(existing);
  });

  it('appends to existing config without approvals section', () => {
    const codexDir = path.join(tmpDir, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    const configPath = path.join(codexDir, 'config.toml');

    const existing = '[model]\nname = "gpt-4"\n';
    fs.writeFileSync(configPath, existing);

    deploy(tmpDir, true);

    const content = fs.readFileSync(configPath, 'utf8');
    // Should preserve existing content
    expect(content).toContain('[model]');
    expect(content).toContain('name = "gpt-4"');
    // Should have appended approvals
    expect(content).toContain('[approvals]');
    expect(content).toContain('policy = "auto"');
  });
});

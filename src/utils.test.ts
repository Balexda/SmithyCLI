import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { copyDirSync, addToGitignore, removeIfExists, removeStaleSmithyArtifacts } from './utils.js';

describe('copyDirSync', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-utils-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copies files from source to destination', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'a.txt'), 'hello');
    fs.writeFileSync(path.join(src, 'b.txt'), 'world');

    copyDirSync(src, dest);

    expect(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8')).toBe('hello');
    expect(fs.readFileSync(path.join(dest, 'b.txt'), 'utf8')).toBe('world');
  });

  it('copies nested directories recursively', () => {
    const src = path.join(tmpDir, 'src');
    fs.mkdirSync(path.join(src, 'sub', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(src, 'top.txt'), 'top');
    fs.writeFileSync(path.join(src, 'sub', 'mid.txt'), 'mid');
    fs.writeFileSync(path.join(src, 'sub', 'deep', 'bottom.txt'), 'bottom');

    const dest = path.join(tmpDir, 'dest');
    copyDirSync(src, dest);

    expect(fs.readFileSync(path.join(dest, 'top.txt'), 'utf8')).toBe('top');
    expect(fs.readFileSync(path.join(dest, 'sub', 'mid.txt'), 'utf8')).toBe('mid');
    expect(fs.readFileSync(path.join(dest, 'sub', 'deep', 'bottom.txt'), 'utf8')).toBe('bottom');
  });

  it('creates destination directory if it does not exist', () => {
    const src = path.join(tmpDir, 'src');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'file.txt'), 'data');

    const dest = path.join(tmpDir, 'nested', 'dest');
    copyDirSync(src, dest);

    expect(fs.existsSync(path.join(dest, 'file.txt'))).toBe(true);
  });

  it('overwrites existing files at destination', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, 'file.txt'), 'old');
    fs.writeFileSync(path.join(src, 'file.txt'), 'new');

    copyDirSync(src, dest);

    expect(fs.readFileSync(path.join(dest, 'file.txt'), 'utf8')).toBe('new');
  });
});

describe('addToGitignore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-utils-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .gitignore from scratch when none exists', () => {
    const added = addToGitignore(tmpDir, ['.claude/']);
    expect(added).toBe(1);

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('# Smithy agent directories');
    expect(content).toContain('.claude/');
  });

  it('appends entries to existing .gitignore', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules/\n');
    const added = addToGitignore(tmpDir, ['.claude/']);
    expect(added).toBe(1);

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.claude/');
  });

  it('deduplicates entries that already exist', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.claude/\n');
    const added = addToGitignore(tmpDir, ['.claude/']);
    expect(added).toBe(0);
  });

  it('adds only new entries when some already exist', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.claude/\n');
    const added = addToGitignore(tmpDir, ['.claude/', '.gemini/']);
    expect(added).toBe(1);

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('.gemini/');
  });

  it('does not duplicate header on repeated calls', () => {
    addToGitignore(tmpDir, ['.claude/']);
    addToGitignore(tmpDir, ['.gemini/']);

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    const headerCount = content.split('# Smithy agent directories').length - 1;
    expect(headerCount).toBe(1);
  });

  it('handles existing file not ending with newline', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules/');
    addToGitignore(tmpDir, ['.claude/']);

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    // Should not run entries together on same line
    expect(content).not.toMatch(/node_modules\/.claude\//);
  });
});

describe('removeIfExists', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-utils-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes a file and returns true', () => {
    const filePath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(filePath, 'data');

    expect(removeIfExists(filePath)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('removes a directory recursively and returns true', () => {
    const dirPath = path.join(tmpDir, 'subdir');
    fs.mkdirSync(dirPath);
    fs.writeFileSync(path.join(dirPath, 'inner.txt'), 'data');

    expect(removeIfExists(dirPath)).toBe(true);
    expect(fs.existsSync(dirPath)).toBe(false);
  });

  it('returns false for nonexistent path', () => {
    expect(removeIfExists(path.join(tmpDir, 'nope'))).toBe(false);
  });
});

describe('removeStaleSmithyArtifacts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-utils-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes entries matching prefix that are not in currentNames', () => {
    fs.writeFileSync(path.join(tmpDir, 'smithy.old.md'), 'stale');
    fs.writeFileSync(path.join(tmpDir, 'smithy.current.md'), 'keep');

    const removed = removeStaleSmithyArtifacts(
      tmpDir, 'smithy.', new Set(['smithy.current.md']),
    );

    expect(removed).toBe(1);
    expect(fs.existsSync(path.join(tmpDir, 'smithy.old.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'smithy.current.md'))).toBe(true);
  });

  it('returns 0 when directory does not exist', () => {
    expect(removeStaleSmithyArtifacts(path.join(tmpDir, 'does-not-exist'), 'smithy.', new Set())).toBe(0);
  });

  it('does not remove entries that do not match prefix', () => {
    fs.writeFileSync(path.join(tmpDir, 'other.md'), 'keep');
    fs.writeFileSync(path.join(tmpDir, 'smithy.old.md'), 'stale');

    removeStaleSmithyArtifacts(tmpDir, 'smithy.', new Set());

    expect(fs.existsSync(path.join(tmpDir, 'other.md'))).toBe(true);
  });

  it('respects isArtifact predicate -- skips directories matching prefix', () => {
    // Create a directory that matches the prefix (should be skipped by isMdFile predicate)
    fs.mkdirSync(path.join(tmpDir, 'smithy.somedir'));
    fs.writeFileSync(path.join(tmpDir, 'smithy.old.md'), 'stale');

    const isMdFile = (p: string) => p.endsWith('.md') && fs.statSync(p).isFile();
    const removed = removeStaleSmithyArtifacts(tmpDir, 'smithy.', new Set(), isMdFile);

    expect(removed).toBe(1);
    // Directory should survive because predicate rejects it
    expect(fs.existsSync(path.join(tmpDir, 'smithy.somedir'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'smithy.old.md'))).toBe(false);
  });

  it('removes all stale entries when currentNames is empty', () => {
    fs.writeFileSync(path.join(tmpDir, 'smithy.a.md'), 'a');
    fs.writeFileSync(path.join(tmpDir, 'smithy.b.md'), 'b');

    const removed = removeStaleSmithyArtifacts(tmpDir, 'smithy.', new Set());
    expect(removed).toBe(2);
  });
});

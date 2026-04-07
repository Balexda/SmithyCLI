import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectLanguages } from './language-detect.js';

describe('detectLanguages', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-detect-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when no marker files exist', () => {
    expect(detectLanguages(tmpDir)).toEqual([]);
  });

  it('detects Node.js via package.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    expect(detectLanguages(tmpDir)).toEqual(['node']);
  });

  it('detects Java via build.gradle', () => {
    fs.writeFileSync(path.join(tmpDir, 'build.gradle'), '');
    expect(detectLanguages(tmpDir)).toEqual(['java']);
  });

  it('detects Java via build.gradle.kts', () => {
    fs.writeFileSync(path.join(tmpDir, 'build.gradle.kts'), '');
    expect(detectLanguages(tmpDir)).toEqual(['java']);
  });

  it('detects Java via gradlew', () => {
    fs.writeFileSync(path.join(tmpDir, 'gradlew'), '');
    expect(detectLanguages(tmpDir)).toEqual(['java']);
  });

  it('detects Rust via Cargo.toml', () => {
    fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '');
    expect(detectLanguages(tmpDir)).toEqual(['rust']);
  });

  it('detects Python via requirements.txt', () => {
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), '');
    expect(detectLanguages(tmpDir)).toEqual(['python']);
  });

  it('detects Python via pyproject.toml', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '');
    expect(detectLanguages(tmpDir)).toEqual(['python']);
  });

  it('detects Python via setup.py', () => {
    fs.writeFileSync(path.join(tmpDir, 'setup.py'), '');
    expect(detectLanguages(tmpDir)).toEqual(['python']);
  });

  it('detects Python via Pipfile', () => {
    fs.writeFileSync(path.join(tmpDir, 'Pipfile'), '');
    expect(detectLanguages(tmpDir)).toEqual(['python']);
  });

  it('detects multiple languages simultaneously', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '');
    const result = detectLanguages(tmpDir);
    expect(result).toContain('node');
    expect(result).toContain('rust');
    expect(result).toHaveLength(2);
  });

  it('detects all four languages when all markers are present', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'build.gradle'), '');
    fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '');
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '');
    const result = detectLanguages(tmpDir);
    expect(result).toEqual(['node', 'java', 'rust', 'python']);
  });

  it('returns empty array for non-existent directory', () => {
    expect(detectLanguages(path.join(tmpDir, 'nonexistent'))).toEqual([]);
  });
});

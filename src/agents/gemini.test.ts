import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { deploy, remove } from './gemini.js';

describe('deploy', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-gemini-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates skill directories and deploys SKILL.md files', () => {
    deploy(tmpDir, false);

    const skillsDir = path.join(tmpDir, '.gemini', 'skills');
    expect(fs.existsSync(skillsDir)).toBe(true);

    const skills = fs.readdirSync(skillsDir);
    expect(skills.length).toBeGreaterThan(0);

    // Each skill dir should contain a SKILL.md
    for (const skill of skills) {
      const skillMd = path.join(skillsDir, skill, 'SKILL.md');
      expect(fs.existsSync(skillMd)).toBe(true);
    }
  });

  it('removes stale smithy skill directories on deploy', () => {
    const skillsDir = path.join(tmpDir, '.gemini', 'skills');
    const staleSkillDir = path.join(skillsDir, 'smithy-patch');
    fs.mkdirSync(staleSkillDir, { recursive: true });
    fs.writeFileSync(path.join(staleSkillDir, 'SKILL.md'), '# old skill');

    deploy(tmpDir, false);

    // The stale skill should be removed
    expect(fs.existsSync(staleSkillDir)).toBe(false);
    // The current skill should exist
    expect(fs.existsSync(path.join(skillsDir, 'smithy-fix', 'SKILL.md'))).toBe(true);
  });

  it('does not remove non-skill directories that share the prefix', () => {
    const skillsDir = path.join(tmpDir, '.gemini', 'skills');
    const userDir = path.join(skillsDir, 'smithy-custom');
    fs.mkdirSync(userDir, { recursive: true });
    // No SKILL.md — this is a user-created directory
    fs.writeFileSync(path.join(userDir, 'notes.txt'), 'user notes');

    deploy(tmpDir, false);

    // User-created dir without SKILL.md should be preserved
    expect(fs.existsSync(userDir)).toBe(true);
  });
});

describe('remove', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-gemini-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes deployed skills and stale skills', () => {
    deploy(tmpDir, false);

    // Plant a stale skill
    const skillsDir = path.join(tmpDir, '.gemini', 'skills');
    const staleDir = path.join(skillsDir, 'smithy-patch');
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(path.join(staleDir, 'SKILL.md'), '# stale');

    const removedCount = remove(tmpDir);
    expect(removedCount).toBeGreaterThan(0);
    expect(fs.existsSync(staleDir)).toBe(false);
  });

  it('returns 0 when no skills exist to remove', () => {
    const removedCount = remove(tmpDir);
    expect(removedCount).toBe(0);
  });
});

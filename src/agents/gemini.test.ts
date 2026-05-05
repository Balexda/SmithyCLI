import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildGeminiAllowList, deploy, removeLegacy } from './gemini.js';

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

  it('creates skill directories and deploys SKILL.md files', async () => {
    await deploy(tmpDir, false);

    const skillsDir = path.join(tmpDir, '.gemini', 'skills');
    expect(fs.existsSync(skillsDir)).toBe(true);

    const skills = fs.readdirSync(skillsDir);
    expect(skills.length).toBeGreaterThan(0);

    for (const skill of skills) {
      const skillMd = path.join(skillsDir, skill, 'SKILL.md');
      expect(fs.existsSync(skillMd)).toBe(true);
    }
  });

  it('returns deployed file paths', async () => {
    const files = await deploy(tmpDir, false);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(path.isAbsolute(file)).toBe(false);
    }
  });

  it('does not deploy agent-only templates as Gemini skills', async () => {
    await deploy(tmpDir, false);

    const skillsDir = path.join(tmpDir, '.gemini', 'skills');
    const skills = fs.readdirSync(skillsDir);

    expect(skills).not.toContain('smithy-clarify');
    expect(skills).not.toContain('smithy-implement');
    expect(skills).not.toContain('smithy-implementation-review');
    expect(skills).not.toContain('smithy-plan-review');
  });

  it('does not remove non-skill directories that share the prefix', async () => {
    const skillsDir = path.join(tmpDir, '.gemini', 'skills');
    const userDir = path.join(skillsDir, 'smithy-custom');
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, 'notes.txt'), 'user notes');

    await deploy(tmpDir, false);

    expect(fs.existsSync(userDir)).toBe(true);
  });
});

describe('removeLegacy', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-gemini-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes smithy-prefixed skill directories with SKILL.md', async () => {
    await deploy(tmpDir, false);

    // Plant a stale legacy skill
    const skillsDir = path.join(tmpDir, '.gemini', 'skills');
    const staleDir = path.join(skillsDir, 'smithy-patch');
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(path.join(staleDir, 'SKILL.md'), '# stale');

    const removedCount = removeLegacy(tmpDir);
    expect(removedCount).toBeGreaterThan(0);
    expect(fs.existsSync(staleDir)).toBe(false);
  });

  it('returns 0 when no skills exist to remove', () => {
    const removedCount = removeLegacy(tmpDir);
    expect(removedCount).toBe(0);
  });
});

describe('buildGeminiAllowList', () => {
  it('wraps every entry in run_shell_command(...)', () => {
    const list = buildGeminiAllowList();
    for (const entry of list) {
      expect(entry.startsWith('run_shell_command(')).toBe(true);
      expect(entry.endsWith(')')).toBe(true);
    }
  });

  it('does not leak Claude-only extraPermissions (smithy.pr-review script paths)', () => {
    // Regression guard for PR #290 review feedback. The pr-review skill is
    // Claude-only, and its `:*` argument-suffix patterns are Claude syntax.
    // Gemini's allowlist must remain free of them.
    const list = buildGeminiAllowList();
    const joined = list.join('\n');
    expect(joined).not.toContain('smithy.pr-review/scripts/find-pr.sh');
    expect(joined).not.toContain('smithy.pr-review/scripts/get-comments.sh');
    expect(joined).not.toContain('smithy.pr-review/scripts/reply-comment.sh');
    expect(joined).not.toContain('.claude/skills/');
    expect(list.some(e => e.includes(':*'))).toBe(false);
  });
});

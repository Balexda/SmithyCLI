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

    const rulesPath = path.join(tmpDir, '.codex', 'rules', 'default.rules');
    expect(fs.existsSync(rulesPath)).toBe(true);

    const content = fs.readFileSync(rulesPath, 'utf8');
    expect(content).toContain('# BEGIN SMITHY CODEX RULES');
    expect(content).toContain('prefix_rule(pattern=["git","status"], decision="allow")');
  });

  it('does not write permissions when initPermissions is false', async () => {
    await deploy(tmpDir, false);

    const rulesPath = path.join(tmpDir, '.codex', 'rules', 'default.rules');
    expect(fs.existsSync(rulesPath)).toBe(false);
  });

  it('returns deployed file paths', async () => {
    const files = await deploy(tmpDir, false);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(path.isAbsolute(file)).toBe(false);
    }
  });

  it('deploys commands, prompts, and operational skills to .agents/skills/', async () => {
    await deploy(tmpDir, false);

    const skillsDir = path.join(tmpDir, '.agents', 'skills');
    expect(fs.existsSync(skillsDir)).toBe(true);

    const skillDirs = fs.readdirSync(skillsDir);
    expect(skillDirs.length).toBeGreaterThan(0);

    const templates = await getComposedTemplates('codex');
    const expectedSkills = [
      ...templates.commands.entries(),
      ...templates.prompts.entries(),
    ]
      .map(([, content]) => parseFrontmatterName(content)!)
      .filter(Boolean)
      .concat([...templates.skills.keys()]);

    expect(skillDirs.sort()).toEqual(expectedSkills.sort());

    // Verify each skill directory contains a SKILL.md with frontmatter preserved
    for (const dir of skillDirs) {
      const skillFile = path.join(skillsDir, dir, 'SKILL.md');
      expect(fs.existsSync(skillFile)).toBe(true);
      const content = fs.readFileSync(skillFile, 'utf8');
      expect(content).toMatch(/^---\s*\n/);
    }
  });

  it('deploys operational skill scripts for Codex', async () => {
    await deploy(tmpDir, false);

    const prReviewDir = path.join(tmpDir, '.agents', 'skills', 'smithy.pr-review');
    expect(fs.existsSync(path.join(prReviewDir, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(prReviewDir, 'scripts', 'find-pr.sh'))).toBe(true);
    expect(fs.existsSync(path.join(prReviewDir, 'scripts', 'get-comments.sh'))).toBe(true);
    expect(fs.existsSync(path.join(prReviewDir, 'scripts', 'reply-comment.sh'))).toBe(true);

    const skillMd = fs.readFileSync(path.join(prReviewDir, 'SKILL.md'), 'utf8');
    expect(skillMd).toContain('_list_pull_request_review_threads');
    expect(skillMd).toContain('_reply_to_review_comment');
    expect(skillMd).toContain('./.agents/skills/smithy.pr-review/scripts/find-pr.sh');
    expect(skillMd).not.toContain('${CLAUDE_SKILL_DIR}');
    expect(skillMd).not.toContain('./.gemini/skills/smithy.pr-review');
  });

  it('renders forge for direct Codex execution instead of sub-agent orchestration', async () => {
    await deploy(tmpDir, false);

    const forgeSkill = path.join(tmpDir, '.agents', 'skills', 'smithy-forge', 'SKILL.md');
    const content = fs.readFileSync(forgeSkill, 'utf8');
    expect(content).toContain('Use test-driven development for each task');
    expect(content).not.toContain('Dispatch a sub-agent for each task');
    expect(content).not.toContain('smithy-implement sub-agent');
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
    const staleDottedSkillDir = path.join(skillsDir, 'smithy.pr-review');
    fs.mkdirSync(staleSkillDir, { recursive: true });
    fs.mkdirSync(staleDottedSkillDir, { recursive: true });
    fs.writeFileSync(path.join(staleSkillDir, 'SKILL.md'), '# stale');
    fs.writeFileSync(path.join(staleDottedSkillDir, 'SKILL.md'), '# stale');

    const removedCount = removeLegacy(tmpDir);
    expect(removedCount).toBeGreaterThanOrEqual(2);
    expect(fs.existsSync(staleSkillDir)).toBe(false);
    expect(fs.existsSync(staleDottedSkillDir)).toBe(false);
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

  it('creates .codex rules directory if it does not exist', async () => {
    await deploy(tmpDir, true);

    const rulesDir = path.join(tmpDir, '.codex', 'rules');
    expect(fs.existsSync(rulesDir)).toBe(true);
  });

  it('writes Codex Auto-review defaults to config.toml', async () => {
    await deploy(tmpDir, true);

    const configPath = path.join(tmpDir, '.codex', 'config.toml');
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('# BEGIN SMITHY CODEX CONFIG');
    expect(content).toContain('approval_policy = "on-request"');
    expect(content).toContain('sandbox_mode = "workspace-write"');
    expect(content).toContain('approvals_reviewer = "auto_review"');
    expect(content).toContain('web_search = "cached"');
    expect(content).toContain('# END SMITHY CODEX CONFIG');
  });

  it('places managed Codex config before TOML tables', async () => {
    const codexDir = path.join(tmpDir, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    const configPath = path.join(codexDir, 'config.toml');
    fs.writeFileSync(
      configPath,
      ['notify = ["custom"]', '', '[plugins."github@openai-curated"]', 'enabled = true', ''].join('\n')
    );

    await deploy(tmpDir, true);

    const content = fs.readFileSync(configPath, 'utf8');
    expect(content.indexOf('approvals_reviewer = "auto_review"')).toBeLessThan(
      content.indexOf('[plugins."github@openai-curated"]')
    );
    expect(content).toContain('notify = ["custom"]');
    expect(content).toContain('[plugins."github@openai-curated"]');
  });

  it('updates managed Codex config idempotently', async () => {
    const codexDir = path.join(tmpDir, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    const configPath = path.join(codexDir, 'config.toml');
    fs.writeFileSync(
      configPath,
      [
        '# BEGIN SMITHY CODEX CONFIG',
        'approval_policy = "never"',
        '# END SMITHY CODEX CONFIG',
        '',
        '[profiles.custom]',
        'sandbox_mode = "read-only"',
        '',
      ].join('\n')
    );

    await deploy(tmpDir, true);
    const firstContent = fs.readFileSync(configPath, 'utf8');
    await deploy(tmpDir, true);

    const secondContent = fs.readFileSync(configPath, 'utf8');
    expect(secondContent).toBe(firstContent);
    expect(secondContent).toContain('approval_policy = "on-request"');
    expect(secondContent).not.toContain('approval_policy = "never"');
    expect(secondContent.match(/# BEGIN SMITHY CODEX CONFIG/g)).toHaveLength(1);
  });

  it('generates Codex prefix rules', async () => {
    await deploy(tmpDir, true);

    const rulesPath = path.join(tmpDir, '.codex', 'rules', 'default.rules');
    const content = fs.readFileSync(rulesPath, 'utf8');

    expect(content).toContain('# BEGIN SMITHY CODEX RULES');
    expect(content).toContain('# END SMITHY CODEX RULES');
    expect(content).toContain('prefix_rule(pattern=["git","status"], decision="allow")');
  });

  it('includes filesystem commands in rules', async () => {
    await deploy(tmpDir, true);

    const rulesPath = path.join(tmpDir, '.codex', 'rules', 'default.rules');
    const content = fs.readFileSync(rulesPath, 'utf8');

    expect(content).toContain('prefix_rule(pattern=["ls"], decision="allow")');
    expect(content).toContain('prefix_rule(pattern=["cat"], decision="allow")');
    expect(content).toContain('prefix_rule(pattern=["cp"], decision="allow")');
    expect(content).toContain('prefix_rule(pattern=["mkdir"], decision="allow")');
  });

  it('trims wildcard entries into prefix patterns', async () => {
    await deploy(tmpDir, true);

    const rulesPath = path.join(tmpDir, '.codex', 'rules', 'default.rules');
    const content = fs.readFileSync(rulesPath, 'utf8');

    expect(content).toContain('prefix_rule(pattern=["git","fetch"], decision="allow")');
    expect(content).toContain('prefix_rule(pattern=["mkdir","-p"], decision="allow")');
  });

  it('includes non-wildcard arguments in prefix patterns', async () => {
    await deploy(tmpDir, true);

    const rulesPath = path.join(tmpDir, '.codex', 'rules', 'default.rules');
    const content = fs.readFileSync(rulesPath, 'utf8');

    expect(content).toContain('prefix_rule(pattern=["git","status"], decision="allow")');
    expect(content).toContain('prefix_rule(pattern=["git","push","--force-with-lease"], decision="allow")');
  });

  it('does not emit duplicate prefix patterns for bare wildcard and flag variants', async () => {
    await deploy(tmpDir, true);

    const rulesPath = path.join(tmpDir, '.codex', 'rules', 'default.rules');
    const content = fs.readFileSync(rulesPath, 'utf8');

    const bareMkdirRules = content.match(/prefix_rule\(pattern=\["mkdir"\], decision="allow"\)/g);
    expect(bareMkdirRules).toHaveLength(1);
    expect(content).toContain('prefix_rule(pattern=["mkdir","-p"], decision="allow")');
  });

  it('allows Smithy skill helper scripts used by Codex skills', async () => {
    await deploy(tmpDir, true);

    const rulesPath = path.join(tmpDir, '.codex', 'rules', 'default.rules');
    const content = fs.readFileSync(rulesPath, 'utf8');

    expect(content).toContain(
      'prefix_rule(pattern=["./.agents/skills/smithy.pr-review/scripts/find-pr.sh"], decision="allow")'
    );
    expect(content).toContain(
      'prefix_rule(pattern=["./.agents/skills/smithy.pr-review/scripts/get-comments.sh"], decision="allow")'
    );
    expect(content).toContain(
      'prefix_rule(pattern=["./.agents/skills/smithy.pr-review/scripts/reply-comment.sh"], decision="allow")'
    );
    expect(content).toContain(
      'prefix_rule(pattern=["./.agents/skills/smithy.gh-issue/scripts/check-env.sh"], decision="allow")'
    );
  });

  it('preserves existing user rules and appends Smithy rules', async () => {
    const rulesDir = path.join(tmpDir, '.codex', 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    const rulesPath = path.join(rulesDir, 'default.rules');

    const existing = 'prefix_rule(pattern=["custom"], decision="allow")\n';
    fs.writeFileSync(rulesPath, existing);

    await deploy(tmpDir, true);

    const content = fs.readFileSync(rulesPath, 'utf8');
    expect(content).toContain(existing.trim());
    expect(content).toContain('# BEGIN SMITHY CODEX RULES');
    expect(content).toContain('prefix_rule(pattern=["git","status"], decision="allow")');
  });

  it('updates the managed Smithy rules block idempotently', async () => {
    const rulesDir = path.join(tmpDir, '.codex', 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    const rulesPath = path.join(rulesDir, 'default.rules');

    const existing = [
      'prefix_rule(pattern=["custom"], decision="allow")',
      '',
      '# BEGIN SMITHY CODEX RULES',
      'prefix_rule(pattern=["old"], decision="allow")',
      '# END SMITHY CODEX RULES',
      '',
    ].join('\n');
    fs.writeFileSync(rulesPath, existing);

    await deploy(tmpDir, true);
    const firstContent = fs.readFileSync(rulesPath, 'utf8');
    await deploy(tmpDir, true);

    const secondContent = fs.readFileSync(rulesPath, 'utf8');
    expect(secondContent).toBe(firstContent);
    expect(secondContent).not.toContain('prefix_rule(pattern=["old"], decision="allow")');
    expect(secondContent.match(/# BEGIN SMITHY CODEX RULES/g)).toHaveLength(1);
  });
});

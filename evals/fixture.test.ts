import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve('dist/cli.js');
const FIXTURE_DIR = path.resolve('evals/fixture');
const JVM_FIXTURE_DIR = path.join(FIXTURE_DIR, 'jvm');
const CASES_DIR = path.resolve('evals/cases');
const JS_FIXTURE_PLANTS = [
  'README.md',
  'package.json',
  'src/index.ts',
  'src/types.ts',
  'src/routes/users.ts',
  'issues/fix-from-issue-health-check.md',
  'ci-logs/fix-from-issue-health-check.log',
  'specs/audit-eval/audit-eval-flawed.spec.md',
  'specs/audit-voice/audit-voice-tagged.spec.md',
  'specs/cut-eval/cut-eval.spec.md',
  'specs/cut-eval/cut-eval.data-model.md',
  'specs/cut-eval/cut-eval.contracts.md',
  'prds/ignite-eval/ignite-eval.prd.md',
  'rfcs/mark-eval/mark-eval.rfc.md',
  'rfcs/mark-eval/01-core.features.md',
  'rfcs/render-eval/render-eval.rfc.md',
] as const;
const CURRENT_SCENARIO_FILES = [
  'audit-flawed-spec.yaml',
  'audit-voice-lint.yaml',
  'cut-from-spec.yaml',
  'fix-from-issue.yaml',
  'ignite-from-prd.yaml',
  'mark-from-features.yaml',
  'render-from-rfc.yaml',
  'spark-from-idea.yaml',
  'strike-health-check.yaml',
] as const;

function hashDirectory(dirPath: string): string {
  const hash = crypto.createHash('sha256');
  const entries: string[] = [];

  function collectFiles(dir: string, prefix: string): void {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) {
        collectFiles(path.join(dir, item.name), rel);
      } else {
        entries.push(rel);
      }
    }
  }

  collectFiles(dirPath, '');
  entries.sort();

  for (const rel of entries) {
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(dirPath, rel)));
  }

  return hash.digest('hex');
}

describe('evals/fixture deployment', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('smithy init deploys skills into the fixture copy', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-fixture-'));
    fs.cpSync(FIXTURE_DIR, tmpDir, { recursive: true });

    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    // .claude directories exist
    const commandsDir = path.join(tmpDir, '.claude', 'commands');
    const promptsDir = path.join(tmpDir, '.claude', 'prompts');
    const agentsDir = path.join(tmpDir, '.claude', 'agents');

    expect(fs.existsSync(commandsDir)).toBe(true);
    expect(fs.existsSync(promptsDir)).toBe(true);
    expect(fs.existsSync(agentsDir)).toBe(true);

    // Each contains at least one .md file
    const commandFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
    const promptFiles = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
    const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

    expect(commandFiles.length).toBeGreaterThan(0);
    expect(promptFiles.length).toBeGreaterThan(0);
    expect(agentFiles.length).toBeGreaterThan(0);

    // Key skills present for strike and scout evals
    expect(commandFiles).toContain('smithy.strike.md');
    expect(agentFiles).toContain('smithy.plan.md');
  });

  it('source fixture directory is not modified by deployment (FR-011)', () => {
    const hashBefore = hashDirectory(FIXTURE_DIR);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-fixture-'));
    fs.cpSync(FIXTURE_DIR, tmpDir, { recursive: true });

    execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    const hashAfter = hashDirectory(FIXTURE_DIR);

    expect(hashAfter).toBe(hashBefore);
  });

  it('keeps documented JavaScript fixture plants in their committed locations', () => {
    const readme = fs.readFileSync(path.join(FIXTURE_DIR, 'README.md'), 'utf-8');

    expect(readme).toContain('## Planted Inconsistencies');
    expect(readme).toContain('## Planted Parent Artifacts');
    for (const fixturePath of JS_FIXTURE_PLANTS) {
      expect(fs.existsSync(path.join(FIXTURE_DIR, fixturePath))).toBe(true);
    }
    expect(readme).toContain('`evals/fixture/src/routes/users.ts`');
    expect(readme).toContain('`evals/fixture/specs/audit-eval/audit-eval-flawed.spec.md`');
    expect(readme).toContain('`evals/fixture/specs/cut-eval/`');
    expect(readme).toContain('`evals/fixture/prds/ignite-eval/`');
    expect(readme).toContain('`evals/fixture/rfcs/mark-eval/`');
    expect(readme).toContain('`evals/fixture/rfcs/render-eval/`');

    const usersRoute = fs.readFileSync(
      path.join(FIXTURE_DIR, 'src/routes/users.ts'),
      'utf-8',
    );
    expect(usersRoute).toContain('get user by email address');
    expect(usersRoute).toContain('TODO: add request validation');
  });

  it('keeps existing scenario YAML files fixture-less', () => {
    const yamlFiles = fs.readdirSync(CASES_DIR)
      .filter((file) => file.endsWith('.yaml'))
      .sort();

    expect(yamlFiles).toEqual([...CURRENT_SCENARIO_FILES]);
    for (const file of CURRENT_SCENARIO_FILES) {
      const yaml = fs.readFileSync(path.join(CASES_DIR, file), 'utf-8');
      expect(yaml).not.toMatch(/^fixture:/m);
    }
  });

  it('commits a minimal JVM Gradle fixture shape (FR-009 through FR-014)', () => {
    const expectedFiles = [
      '.gitignore',
      'README.md',
      'settings.gradle',
      'build.gradle',
      'src/main/java/dev/smithy/fixture/GreetingService.java',
      'src/test/java/dev/smithy/fixture/GreetingServiceTest.java',
    ];

    for (const file of expectedFiles) {
      expect(fs.existsSync(path.join(JVM_FIXTURE_DIR, file))).toBe(true);
    }

    // Assert on committed (git-tracked) contents rather than the working
    // tree: running `gradle` locally creates the ignored build/ and .gradle/
    // directories, which must not make this test fail for contributors.
    const trackedFiles = execFileSync('git', ['ls-files'], {
      cwd: JVM_FIXTURE_DIR,
      encoding: 'utf-8',
    })
      .split('\n')
      .filter(Boolean);

    // No Gradle wrapper is committed (system Gradle is documented instead).
    expect(trackedFiles).not.toContain('gradlew');
    expect(trackedFiles).not.toContain('gradlew.bat');
    // No generated Gradle output is committed.
    expect(trackedFiles.some((file) => file.startsWith('build/'))).toBe(false);
    expect(trackedFiles.some((file) => file.startsWith('.gradle/'))).toBe(false);

    const buildFile = fs.readFileSync(path.join(JVM_FIXTURE_DIR, 'build.gradle'), 'utf-8');
    expect(buildFile).toContain("id 'java'");
    expect(buildFile).toContain("tasks.register('fixtureTest', JavaExec)");
    expect(buildFile).toContain('dependsOn fixtureTest');

    const readme = fs.readFileSync(path.join(JVM_FIXTURE_DIR, 'README.md'), 'utf-8');
    expect(readme).toContain('does not commit a Gradle wrapper');
    expect(readme).toContain('gradle compileJava');
    expect(readme).toContain('gradle check');
    expect(readme).toContain('fails by design');

    const source = fs.readFileSync(
      path.join(JVM_FIXTURE_DIR, 'src/main/java/dev/smithy/fixture/GreetingService.java'),
      'utf-8',
    );
    const test = fs.readFileSync(
      path.join(JVM_FIXTURE_DIR, 'src/test/java/dev/smithy/fixture/GreetingServiceTest.java'),
      'utf-8',
    );
    expect(source).toContain('return value;');
    expect(test).toContain('assertEquals("yhtimS", service.reverse("Smithy"))');
  });

  it('keeps generated JVM build output absent or fixture-locally ignored', () => {
    const ignoreRules = fs.readFileSync(path.join(JVM_FIXTURE_DIR, '.gitignore'), 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    expect(ignoreRules).toEqual(expect.arrayContaining(['build/', '.gradle/', 'out/']));

    const trackedFiles = execFileSync('git', ['ls-files', 'evals/fixture/jvm'], {
      encoding: 'utf-8',
    })
      .split('\n')
      .filter(Boolean);

    expect(trackedFiles).toEqual(expect.arrayContaining([
      'evals/fixture/jvm/settings.gradle',
      'evals/fixture/jvm/build.gradle',
      'evals/fixture/jvm/src/main/java/dev/smithy/fixture/GreetingService.java',
      'evals/fixture/jvm/src/test/java/dev/smithy/fixture/GreetingServiceTest.java',
    ]));
    expect(trackedFiles.some((file) => file.includes('/build/'))).toBe(false);
    expect(trackedFiles.some((file) => file.includes('/.gradle/'))).toBe(false);
    expect(trackedFiles.some((file) => file.includes('/out/'))).toBe(false);
  });
});

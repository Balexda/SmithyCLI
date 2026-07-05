import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve('dist/cli.js');
const FIXTURE_DIR = path.resolve('evals/fixture');
const JVM_FIXTURE_DIR = path.join(FIXTURE_DIR, 'jvm');

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

    expect(fs.existsSync(path.join(JVM_FIXTURE_DIR, 'gradlew'))).toBe(false);
    expect(fs.existsSync(path.join(JVM_FIXTURE_DIR, 'gradlew.bat'))).toBe(false);
    expect(fs.existsSync(path.join(JVM_FIXTURE_DIR, 'build'))).toBe(false);
    expect(fs.existsSync(path.join(JVM_FIXTURE_DIR, '.gradle'))).toBe(false);

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
});

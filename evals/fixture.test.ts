import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve('dist/cli.js');
const FIXTURE_DIR = path.resolve('evals/fixture');

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

    // Key skills for strike evals are present
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
});

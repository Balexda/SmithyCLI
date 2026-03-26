import { describe, it, expect } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

describe('CLI --version', () => {
  it('reports the version from package.json', () => {
    const output = execFileSync('node', ['dist/cli.js', '--version'], {
      encoding: 'utf-8',
    }).trim();
    expect(output).toBe(pkg.version);
  });

});

describe('CLI init', () => {
  it('triggers the init process and shows welcome message', () => {
    // init requires interactive input, so it will exit when stdin closes.
    // We verify it starts correctly by checking for the welcome banner.
    const output = execSync('timeout 2 node dist/cli.js init 2>&1 || true', {
      encoding: 'utf-8',
    });
    expect(output).toContain('Welcome to Smithy CLI');
    expect(output).toContain('Which AI assistant CLI');
  });
});

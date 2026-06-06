import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flowLintAction } from './flow-lint.js';

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'flow-lint',
  '__fixtures__',
);

describe('flowLintAction', () => {
  let logSpy: MockInstance;
  let errSpy: MockInstance;
  let exitCodeBefore: typeof process.exitCode;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitCodeBefore = process.exitCode;
    process.exitCode = 0;
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.exitCode = exitCodeBefore;
  });

  const stdout = () => logSpy.mock.calls.map((c) => c[0]).join('\n');
  const stderr = () => errSpy.mock.calls.map((c) => c[0]).join('\n');

  it('exits 0 and prints a pass on the passing tree', () => {
    flowLintAction({ root: join(FIXTURES, 'passing'), color: false });
    expect(process.exitCode).toBe(0);
    expect(stdout()).toContain('flow-lint passed');
  });

  it('exits 1 and names severed paths on the dangling tree', () => {
    flowLintAction({ root: join(FIXTURES, 'dangling'), color: false });
    expect(process.exitCode).toBe(1);
    const out = stdout();
    expect(out).toContain('flow-lint failed');
    expect(out).toContain('design/screens/AddTitle.design.md');
    expect(out).toContain('maestro/flows/ReadTitle.yaml');
    expect(out).toContain('Orphan.yaml');
  });

  it('emits machine-readable JSON with --format json', () => {
    flowLintAction({ root: join(FIXTURES, 'dangling'), format: 'json' });
    expect(process.exitCode).toBe(1);
    const payload = JSON.parse(stdout());
    expect(payload.errorCount).toBe(3);
    expect(payload.warningCount).toBe(1);
    expect(payload.findings.map((f: { code: string }) => f.code)).toContain('flow-screen-missing');
  });

  it('passes through --strict to the result verdict', () => {
    flowLintAction({ root: join(FIXTURES, 'dangling'), strict: true, format: 'json' });
    const payload = JSON.parse(stdout());
    expect(payload.strict).toBe(true);
    expect(payload.ok).toBe(false);
  });

  it('exits 2 on a non-existent --root', () => {
    flowLintAction({ root: join(FIXTURES, 'does-not-exist') });
    expect(process.exitCode).toBe(2);
    expect(stderr()).toContain('--root path does not exist');
  });

  it('exits 2 on an invalid --format', () => {
    flowLintAction({ root: join(FIXTURES, 'passing'), format: 'xml' });
    expect(process.exitCode).toBe(2);
    expect(stderr()).toContain('invalid --format');
  });
});

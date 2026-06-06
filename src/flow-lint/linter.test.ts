import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { lintFlows } from './linter.js';
import type { FindingCode } from './types.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function codes(root: string, strict = false): FindingCode[] {
  return lintFlows({ root, strict }).findings.map((f) => f.code);
}

describe('lintFlows — committed fixtures', () => {
  it('passes cleanly on the passing tree', () => {
    const result = lintFlows({ root: join(FIXTURES, 'passing') });
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result).toMatchObject({ flowsScanned: 2, screensScanned: 3, maestroScanned: 2 });
  });

  it('reports every planted dangling reference on the dangling tree', () => {
    const result = lintFlows({ root: join(FIXTURES, 'dangling') });
    expect(result.ok).toBe(false);
    expect(result.errorCount).toBe(3);
    expect(result.warningCount).toBe(1);

    const byCode = new Map(result.findings.map((f) => [f.code, f]));
    expect(byCode.get('flow-screen-missing')?.ref).toBe('design/screens/AddTitle.design.md');
    expect(byCode.get('flow-maestro-missing')?.ref).toBe('maestro/flows/ReadTitle.yaml');
    expect(byCode.get('maestro-orphan')?.path).toBe('maestro/flows/Orphan.yaml');
    expect(byCode.get('screen-composable-missing')?.severity).toBe('warning');
  });

  it('names the severed path in the dangling messages', () => {
    const { findings } = lintFlows({ root: join(FIXTURES, 'dangling') });
    const screenMiss = findings.find((f) => f.code === 'flow-screen-missing');
    expect(screenMiss?.message).toContain('design/flows/AddTitle.flow.md');
    expect(screenMiss?.message).toContain('design/screens/AddTitle.design.md');
  });

  it('promotes the composable warning to a failure under --strict', () => {
    const lenient = lintFlows({ root: join(FIXTURES, 'dangling') });
    const strict = lintFlows({ root: join(FIXTURES, 'dangling'), strict: true });
    expect(lenient.ok).toBe(false); // already failing on errors
    expect(strict.ok).toBe(false);
    expect(strict.strict).toBe(true);
    // The warning count is unchanged; only the verdict (ok) is affected.
    expect(strict.warningCount).toBe(1);
  });
});

describe('lintFlows — synthetic edge cases', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'flow-lint-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(rel: string, content: string): void {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }

  function flow(stem: string, fm: string): void {
    write(`design/flows/${stem}.flow.md`, `---\n${fm}\n---\n# ${stem}\n`);
  }
  function screen(stem: string, fm: string): void {
    write(`design/screens/${stem}.design.md`, `---\n${fm}\n---\n# ${stem}\n`);
  }

  it('lints an empty repo (no design/maestro dirs) cleanly', () => {
    const result = lintFlows({ root });
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('flags a flow id that does not match its filename stem', () => {
    flow('AddTitle', 'id: AddTitleX\nscreens: []\nmaestro: maestro/flows/AddTitle.yaml');
    write('maestro/flows/AddTitle.yaml', 'appId: x\n---\n- launchApp\n');
    expect(codes(root)).toContain('flow-id-mismatch');
  });

  it('flags missing required flow front-matter keys', () => {
    write('design/flows/Bare.flow.md', '---\nid: Bare\n---\n# Bare\n');
    const found = lintFlows({ root }).findings.filter((f) => f.code === 'flow-frontmatter-missing');
    expect(found.map((f) => f.ref).sort()).toEqual(['maestro', 'screens']);
  });

  it('flags invalid flow front-matter', () => {
    write('design/flows/Bad.flow.md', '# no front matter at all\n');
    expect(codes(root)).toContain('flow-frontmatter-invalid');
  });

  it('flags duplicate FlowIds across files', () => {
    flow('AddTitle', 'id: Dup\nscreens: []\nmaestro: maestro/flows/AddTitle.yaml');
    flow('AddTitle2', 'id: Dup\nscreens: []\nmaestro: maestro/flows/AddTitle2.yaml');
    write('maestro/flows/AddTitle.yaml', 'appId: x\n---\n- launchApp\n');
    write('maestro/flows/AddTitle2.yaml', 'appId: x\n---\n- launchApp\n');
    const dup = lintFlows({ root }).findings.find((f) => f.code === 'flow-id-duplicate');
    expect(dup?.message).toContain('design/flows/AddTitle.flow.md');
    expect(dup?.message).toContain('design/flows/AddTitle2.flow.md');
  });

  it('flags duplicate ScreenIds across files', () => {
    screen('Library', 'id: Dup\ncomposable: x.kt');
    screen('Library2', 'id: Dup\ncomposable: y.kt');
    expect(codes(root)).toContain('screen-id-duplicate');
  });

  it('warns (does not error) on a non-conventional but resolving maestro path', () => {
    flow('AddTitle', 'id: AddTitle\nscreens: []\nmaestro: tests/maestro/add.yaml');
    write('tests/maestro/add.yaml', 'appId: x\n---\n- launchApp\n');
    const result = lintFlows({ root });
    const nonconv = result.findings.find((f) => f.code === 'flow-maestro-nonconventional');
    expect(nonconv?.severity).toBe('warning');
    expect(result.errorCount).toBe(0);
    expect(result.ok).toBe(true);
  });

  it('resolves screens by declared id, not filename guess', () => {
    flow('AddTitle', 'id: AddTitle\nscreens: [Library]\nmaestro: maestro/flows/AddTitle.yaml');
    screen('Library', 'id: Library\ncomposable: app/Library.kt');
    write('app/Library.kt', '// stub\n');
    write('maestro/flows/AddTitle.yaml', 'appId: x\n---\n- launchApp\n');
    const result = lintFlows({ root });
    expect(result.ok).toBe(true);
  });

  it('honors custom designDir / maestroDir', () => {
    write('ui/flows/AddTitle.flow.md', '---\nid: AddTitle\nscreens: []\nmaestro: e2e/AddTitle.yaml\n---\n# x\n');
    write('e2e/AddTitle.yaml', 'appId: x\n---\n- launchApp\n');
    const result = lintFlows({ root, designDir: 'ui', maestroDir: 'e2e' });
    expect(result.ok).toBe(true);
    expect(result.flowsScanned).toBe(1);
    expect(result.maestroScanned).toBe(1);
  });

  it('flips a warning-only tree from ok to failing under --strict', () => {
    // Library's composable path is missing → a lone warning, no errors.
    flow('AddTitle', 'id: AddTitle\nscreens: [Library]\nmaestro: maestro/flows/AddTitle.yaml');
    screen('Library', 'id: Library\ncomposable: app/Missing.kt');
    write('maestro/flows/AddTitle.yaml', 'appId: x\n---\n- launchApp\n');

    const lenient = lintFlows({ root });
    expect(lenient.errorCount).toBe(0);
    expect(lenient.warningCount).toBe(1);
    expect(lenient.ok).toBe(true);

    const strict = lintFlows({ root, strict: true });
    expect(strict.ok).toBe(false);
  });

  it('produces stable, sorted finding order', () => {
    flow('Zeta', 'id: Zeta\nscreens: [Missing]\nmaestro: maestro/flows/Zeta.yaml');
    flow('Alpha', 'id: Alpha\nscreens: [Missing]\nmaestro: maestro/flows/Alpha.yaml');
    write('maestro/flows/Zeta.yaml', 'appId: x\n---\n- launchApp\n');
    write('maestro/flows/Alpha.yaml', 'appId: x\n---\n- launchApp\n');
    const paths = lintFlows({ root }).findings.map((f) => f.path);
    expect(paths).toEqual([...paths].sort());
  });
});

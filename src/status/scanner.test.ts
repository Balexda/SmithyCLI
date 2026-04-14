import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { scan } from './index.js';
import type { ArtifactRecord } from './index.js';

/**
 * Integration tests for `scan(root)`. Each test builds a fresh synthetic
 * repository layout under `os.tmpdir()`, invokes the scanner, and asserts
 * on the returned `ArtifactRecord[]`. Per SD-003 resolution, real on-disk
 * temp directories are used (not an in-memory filesystem mock) to exercise
 * the recursive-walk path.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'smithy-scan-'));
});

afterEach(() => {
  if (root) {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(relPath: string, contents: string): void {
  const abs = join(root, relPath);
  mkdirSync(abs.substring(0, abs.lastIndexOf('/')), { recursive: true });
  writeFileSync(abs, contents);
}

function byPath(records: ArtifactRecord[], path: string): ArtifactRecord | undefined {
  return records.find((r) => r.path === path);
}

const TABLE_HEADER =
  '| ID | Title | Depends On | Artifact |\n|----|-------|------------|----------|';

describe('scan', () => {
  it('returns an empty array for a completely empty root', () => {
    const records = scan(root);
    expect(records).toEqual([]);
  });

  it('tolerates missing top-level scan directories', () => {
    // Only specs/ exists; docs/rfcs/ and specs/strikes/ are absent.
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Story | — | specs/feature-a/01-first.tasks.md |\n`,
    );
    write(
      'specs/feature-a/01-first.tasks.md',
      `# Tasks\n\n## Slice 1: First\n\n- [x] Task one\n- [x] Task two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | First | — | — |\n`,
    );
    const records = scan(root);
    expect(records.length).toBeGreaterThan(0);
    expect(records.some((r) => r.type === 'spec')).toBe(true);
    expect(records.some((r) => r.type === 'tasks')).toBe(true);
  });

  it('discovers artifacts across specs/, docs/rfcs/, and specs/strikes/', () => {
    write(
      'docs/rfcs/demo.rfc.md',
      `# RFC\n\n## Dependency Order\n\n${TABLE_HEADER}\n| M1 | First milestone | — | — |\n`,
    );
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Story | — | — |\n`,
    );
    write(
      'specs/strikes/2026-04-12-001-demo/demo.tasks.md',
      `# Strike Tasks\n\n## Slice 1: Only\n\n- [ ] Task\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    const records = scan(root);
    expect(records.some((r) => r.path === 'docs/rfcs/demo.rfc.md')).toBe(true);
    expect(
      records.some((r) => r.path === 'specs/feature-a/feature-a.spec.md'),
    ).toBe(true);
    expect(
      records.some(
        (r) => r.path === 'specs/strikes/2026-04-12-001-demo/demo.tasks.md',
      ),
    ).toBe(true);
  });

  it('ignores unrelated .md files like README.md and notes.md', () => {
    write('specs/README.md', '# Readme\nnot an artifact');
    write('specs/feature-a/notes.md', 'just notes');
    write('docs/rfcs/README.md', '# Readme');
    const records = scan(root);
    expect(records).toEqual([]);
  });

  it('AS 1.1: spec with two done tasks children and one — row', () => {
    // Spec references two existing tasks files (both fully checked)
    // and one — row which must emit a virtual not-started tasks record.
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Feature Specification: Feature A

## Dependency Order

${TABLE_HEADER}
| US1 | First story  | — | specs/feature-a/01-first.tasks.md  |
| US2 | Second story | — | specs/feature-a/02-second.tasks.md |
| US3 | Third story  | — | —                                   |
`,
    );
    write(
      'specs/feature-a/01-first.tasks.md',
      `# Tasks\n\n## Slice 1: Only\n\n- [x] One\n- [x] Two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    write(
      'specs/feature-a/02-second.tasks.md',
      `# Tasks\n\n## Slice 1: Only\n\n- [x] One\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );

    const records = scan(root);

    const spec = byPath(records, 'specs/feature-a/feature-a.spec.md');
    expect(spec).toBeDefined();
    expect(spec?.status).toBe('in-progress');

    const t1 = byPath(records, 'specs/feature-a/01-first.tasks.md');
    const t2 = byPath(records, 'specs/feature-a/02-second.tasks.md');
    expect(t1?.status).toBe('done');
    expect(t2?.status).toBe('done');
    expect(t1?.virtual).toBeUndefined();
    expect(t2?.virtual).toBeUndefined();
    expect(t1?.parent_path).toBe('specs/feature-a/feature-a.spec.md');
    expect(t2?.parent_path).toBe('specs/feature-a/feature-a.spec.md');

    // Exactly one virtual tasks record for the US3 — row.
    const virtualTasks = records.filter(
      (r) => r.type === 'tasks' && r.virtual === true,
    );
    expect(virtualTasks).toHaveLength(1);
    expect(virtualTasks[0]?.status).toBe('not-started');
    expect(virtualTasks[0]?.parent_path).toBe(
      'specs/feature-a/feature-a.spec.md',
    );
  });

  it('AS 1.4: spec row points at a tasks file not on disk → virtual record', () => {
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Missing | — | specs/feature-a/01-foo.tasks.md |\n`,
    );
    const records = scan(root);
    const virt = byPath(records, 'specs/feature-a/01-foo.tasks.md');
    expect(virt).toBeDefined();
    expect(virt?.virtual).toBe(true);
    expect(virt?.type).toBe('tasks');
    expect(virt?.status).toBe('not-started');
    expect(virt?.parent_path).toBe('specs/feature-a/feature-a.spec.md');
  });

  it('AS 1.5: feature-map row with — yields a virtual spec record at the slug placeholder path', () => {
    write(
      'specs/feature-a/feature-a.features.md',
      `# Feature Map\n\n## Dependency Order\n\n${TABLE_HEADER}\n| F3 | Webhooks | — | — |\n`,
    );
    const records = scan(root);
    const virt = records.find(
      (r) => r.type === 'spec' && r.virtual === true && r.title === 'Webhooks',
    );
    expect(virt).toBeDefined();
    // SD-001 placeholder: `specs/<slug>/`
    expect(virt?.path).toBe('specs/webhooks/');
    expect(virt?.status).toBe('not-started');
    expect(virt?.parent_path).toBe('specs/feature-a/feature-a.features.md');
  });

  it('AS 1.6: a malformed artifact (no Dependency Order section in a spec) classifies as unknown without aborting', () => {
    // No Dependency Order section at all — for a parent type this
    // resolves to 'unknown' via the classifier.
    write(
      'specs/feature-a/feature-a.spec.md',
      '# Spec\n\nJust prose, no dep order section.\n',
    );
    // Well-formed tasks file elsewhere to confirm the scan continues.
    write(
      'specs/feature-b/feature-b.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | OK | — | — |\n`,
    );
    const records = scan(root);
    const bad = byPath(records, 'specs/feature-a/feature-a.spec.md');
    expect(bad).toBeDefined();
    expect(bad?.status).toBe('unknown');
    const good = byPath(records, 'specs/feature-b/feature-b.spec.md');
    expect(good).toBeDefined();
    expect(good?.status).not.toBe('unknown');
  });

  it('terminates on a symlink directory cycle inside root', () => {
    // A symlink that points back at one of its ancestors inside `root`
    // would cause an unbounded recursive walk if the walker did not
    // track visited canonical directories. The scan must terminate
    // and still discover the real artifact alongside the cycle.
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | One | — | — |\n`,
    );
    try {
      // `specs/feature-a/loop` -> `specs/feature-a` (parent dir).
      symlinkSync(
        join(root, 'specs', 'feature-a'),
        join(root, 'specs', 'feature-a', 'loop'),
        'dir',
      );
    } catch {
      return; // Platform without symlink support — skip.
    }
    const records = scan(root);
    expect(
      records.some((r) => r.path === 'specs/feature-a/feature-a.spec.md'),
    ).toBe(true);
    // No record should be discovered under the looping symlink path.
    expect(
      records.some((r) => r.path.startsWith('specs/feature-a/loop/')),
    ).toBe(false);
  });

  it('does not follow symlinks whose real path escapes root', () => {
    // Create an external directory with an artifact and symlink it
    // inside root. The symlink target is outside root, so the walker
    // must skip it.
    const outside = mkdtempSync(join(tmpdir(), 'smithy-scan-outside-'));
    try {
      write(
        'specs/feature-a/feature-a.spec.md',
        `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Here | — | — |\n`,
      );
      mkdirSync(join(outside, 'hidden'), { recursive: true });
      writeFileSync(
        join(outside, 'hidden', 'escaped.spec.md'),
        `# Escaped\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Escaped | — | — |\n`,
      );
      try {
        symlinkSync(outside, join(root, 'specs', 'linkout'), 'dir');
      } catch {
        // Platforms that do not allow symlink creation skip the assertion.
        return;
      }
      const records = scan(root);
      // The in-root spec must be found.
      expect(
        records.some((r) => r.path === 'specs/feature-a/feature-a.spec.md'),
      ).toBe(true);
      // The escaped file must NOT be discovered.
      expect(
        records.some((r) => r.path.includes('escaped.spec.md')),
      ).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('leaf-to-root classification: fully-done chain rolls up to done at the rfc', () => {
    write(
      'docs/rfcs/demo.rfc.md',
      `# RFC\n\n## Dependency Order\n\n${TABLE_HEADER}\n| M1 | Only | — | specs/feature-a/feature-a.features.md |\n`,
    );
    write(
      'specs/feature-a/feature-a.features.md',
      `# Feature Map\n\n## Dependency Order\n\n${TABLE_HEADER}\n| F1 | Only | — | specs/feature-a/ |\n`,
    );
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Only | — | specs/feature-a/01-only.tasks.md |\n`,
    );
    write(
      'specs/feature-a/01-only.tasks.md',
      `# Tasks\n\n## Slice 1: Only\n\n- [x] Done one\n- [x] Done two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    const records = scan(root);
    expect(byPath(records, 'docs/rfcs/demo.rfc.md')?.status).toBe('done');
    expect(
      byPath(records, 'specs/feature-a/feature-a.features.md')?.status,
    ).toBe('done');
    expect(
      byPath(records, 'specs/feature-a/feature-a.spec.md')?.status,
    ).toBe('done');
    expect(
      byPath(records, 'specs/feature-a/01-only.tasks.md')?.status,
    ).toBe('done');
  });

  it('leaf-to-root classification: in-progress chain rolls up as in-progress', () => {
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | One | — | specs/feature-a/01-a.tasks.md |\n| US2 | Two | — | specs/feature-a/02-b.tasks.md |\n`,
    );
    write(
      'specs/feature-a/01-a.tasks.md',
      `# Tasks\n\n## Slice 1: Only\n\n- [x] Done\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    write(
      'specs/feature-a/02-b.tasks.md',
      `# Tasks\n\n## Slice 1: Only\n\n- [ ] Pending\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    const records = scan(root);
    expect(
      byPath(records, 'specs/feature-a/feature-a.spec.md')?.status,
    ).toBe('in-progress');
  });

  it('leaf-to-root classification: not-started chain rolls up as not-started', () => {
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | One | — | — |\n`,
    );
    const records = scan(root);
    expect(
      byPath(records, 'specs/feature-a/feature-a.spec.md')?.status,
    ).toBe('not-started');
  });

  it('virtual/real collision: a real file at the expected virtual path wins', () => {
    // A spec row declares an artifact path that resolves to a real
    // tasks file — the scanner must NOT also emit a virtual duplicate.
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Only | — | specs/feature-a/01-only.tasks.md |\n`,
    );
    write(
      'specs/feature-a/01-only.tasks.md',
      `# Tasks\n\n## Slice 1: Only\n\n- [x] Done\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    const records = scan(root);
    const withThatPath = records.filter(
      (r) => r.path === 'specs/feature-a/01-only.tasks.md',
    );
    expect(withThatPath).toHaveLength(1);
    expect(withThatPath[0]?.virtual).toBeUndefined();
    expect(withThatPath[0]?.status).toBe('done');
  });

  it('legacy-format artifact yields a spec record with status=unknown', () => {
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n- [x] US1: First story\n- [ ] US2: Second story\n`,
    );
    const records = scan(root);
    const spec = byPath(records, 'specs/feature-a/feature-a.spec.md');
    expect(spec).toBeDefined();
    expect(spec?.status).toBe('unknown');
    expect(spec?.dependency_order.format).toBe('legacy');
  });
});

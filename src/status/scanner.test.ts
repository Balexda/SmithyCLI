import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
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
  mkdirSync(dirname(abs), { recursive: true });
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
    //
    // The Artifact cells use the canonical backtick-wrapped form that
    // real specs and `src/templates/agent-skills/README.md` emit, so
    // the parent-linking assertions below also guard against regression
    // of the backtick-stripping behaviour exercised in parser.test.ts.
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Feature Specification: Feature A

## Dependency Order

${TABLE_HEADER}
| US1 | First story  | — | \`specs/feature-a/01-first.tasks.md\`  |
| US2 | Second story | — | \`specs/feature-a/02-second.tasks.md\` |
| US3 | Third story  | — | —                                     |
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

  it('spec — row virtual placeholder uses zero-padded NN-<slug>.tasks.md convention', () => {
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US3 | Third story | — | — |\n`,
    );
    const records = scan(root);
    const virt = records.find(
      (r) => r.type === 'tasks' && r.virtual === true,
    );
    expect(virt).toBeDefined();
    expect(virt?.path).toBe('specs/feature-a/03-third-story.tasks.md');
  });

  it('rfc — row virtual placeholder uses zero-padded NN-<slug>.features.md convention', () => {
    write(
      'docs/rfcs/demo.rfc.md',
      `# RFC\n\n## Dependency Order\n\n${TABLE_HEADER}\n| M2 | Second milestone | — | — |\n`,
    );
    const records = scan(root);
    const virt = records.find(
      (r) => r.type === 'features' && r.virtual === true,
    );
    expect(virt).toBeDefined();
    expect(virt?.path).toBe('docs/rfcs/02-second-milestone.features.md');
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

  it('feature-map folder match requires the canonical <leaf>.spec.md filename', () => {
    // The feature map points at `specs/feature-a/`. Inside that folder
    // there is a non-canonical `notes.spec.md`. The scanner must NOT
    // bind the feature row to it (binding would depend on readdirSync
    // order). Instead it emits a virtual record at the folder path.
    write(
      'specs/feature-a/feature-a.features.md',
      `# Feature Map\n\n## Dependency Order\n\n${TABLE_HEADER}\n| F1 | First | — | specs/feature-a/ |\n`,
    );
    write(
      'specs/feature-a/notes.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | One | — | — |\n`,
    );
    const records = scan(root);
    const notes = byPath(records, 'specs/feature-a/notes.spec.md');
    expect(notes).toBeDefined();
    // notes.spec.md was discovered as a real record but NOT linked to
    // the feature map (its parent_path stays unset).
    expect(notes?.parent_path).toBeUndefined();
    // A virtual spec record for the folder placeholder is emitted.
    const virt = records.find(
      (r) => r.type === 'spec' && r.virtual === true && r.path === 'specs/feature-a/',
    );
    expect(virt).toBeDefined();
    expect(virt?.parent_path).toBe('specs/feature-a/feature-a.features.md');
  });

  it('parent_path collision: a child claimed by two parents keeps the first and warns', () => {
    // Two specs both list the same tasks file in their dep-order
    // tables. The child must keep the first parent_path and append a
    // warning naming the second parent.
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec A\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | One | — | specs/shared/01-only.tasks.md |\n`,
    );
    write(
      'specs/feature-b/feature-b.spec.md',
      `# Spec B\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | One | — | specs/shared/01-only.tasks.md |\n`,
    );
    write(
      'specs/shared/01-only.tasks.md',
      `# Tasks\n\n## Slice 1: Only\n\n- [x] Done\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    const records = scan(root);
    const child = byPath(records, 'specs/shared/01-only.tasks.md');
    expect(child).toBeDefined();
    // Whichever spec was iterated first wins; both specs are valid
    // first-parents so accept either.
    expect(child?.parent_path === 'specs/feature-a/feature-a.spec.md' ||
      child?.parent_path === 'specs/feature-b/feature-b.spec.md').toBe(true);
    const collisionWarnings = child?.warnings.filter((w) =>
      w.startsWith('parent_collision:'),
    );
    expect(collisionWarnings).toHaveLength(1);
  });

  it('AS 9.1: spec row with a populated Artifact pointing at an existing tasks file rolls up from that tasks file\'s slice-body state', () => {
    // Single-hop spec → tasks rollup. The spec's `## Dependency Order`
    // section contains a 4-column table with exactly one data row whose
    // `Artifact` cell points at a real tasks file. The tasks file's
    // classification is driven purely by its `## Slice N:` body
    // checkboxes (one checked, one unchecked → in-progress), and the
    // spec must roll up to that same in-progress status. No checkbox
    // lines appear inside the `## Dependency Order` section of either
    // fixture file.
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Only story | — | specs/feature-a/01-only-story.tasks.md |\n`,
    );
    write(
      'specs/feature-a/01-only-story.tasks.md',
      `# Tasks\n\n## Slice 1: Only\n\n- [x] Done task\n- [ ] Pending task\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );

    const records = scan(root);

    const tasks = byPath(records, 'specs/feature-a/01-only-story.tasks.md');
    expect(tasks).toBeDefined();
    expect(tasks?.virtual).toBeUndefined();
    expect(tasks?.status).toBe('in-progress');

    const spec = byPath(records, 'specs/feature-a/feature-a.spec.md');
    expect(spec).toBeDefined();
    expect(spec?.status).toBe(tasks?.status);
    expect(spec?.status).toBe('in-progress');
  });

  it('AS 9.2: spec row with — in its Artifact column emits exactly one virtual not-started tasks record at a naming-convention path', () => {
    // Single-hop spec → virtual tasks. The spec's `## Dependency Order`
    // has exactly one row whose `Artifact` cell is `—`. No real tasks
    // file is written. The scanner must emit exactly one virtual tasks
    // record with `virtual: true`, `status: 'not-started'`, and a path
    // derived from the naming convention (zero-padded row NN + slugified
    // title → `NN-<slug>.tasks.md` under the spec's folder). No
    // checkbox lines appear inside the `## Dependency Order` section.
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US2 | Second story | — | — |\n`,
    );

    const records = scan(root);

    const virtualTasks = records.filter(
      (r) => r.type === 'tasks' && r.virtual === true,
    );
    expect(virtualTasks).toHaveLength(1);
    expect(virtualTasks[0]?.virtual).toBe(true);
    expect(virtualTasks[0]?.status).toBe('not-started');
    expect(virtualTasks[0]?.path).toBe(
      'specs/feature-a/02-second-story.tasks.md',
    );
    expect(virtualTasks[0]?.parent_path).toBe(
      'specs/feature-a/feature-a.spec.md',
    );
  });

  it('AS 9.3: feature-map row pointing at a real spec folder rolls up from that spec\'s status', () => {
    // Single-hop feature-map → spec rollup. The feature map's
    // `## Dependency Order` has exactly one row whose `Artifact` cell
    // points at an on-disk spec folder containing a canonical
    // `<leaf>.spec.md`. The spec's own `## Dependency Order` has a
    // single `—` row, which deterministically rolls up to
    // `not-started` via a virtual tasks record — no tasks file is
    // written on disk, isolating this fixture to the feature→spec
    // hop only. The feature-map record's status must equal the
    // spec's rolled-up status. No checkbox lines appear inside any
    // `## Dependency Order` section of either fixture file.
    write(
      'specs/feature-a/feature-a.features.md',
      `# Feature Map\n\n## Dependency Order\n\n${TABLE_HEADER}\n| F1 | Only feature | — | specs/feature-a/ |\n`,
    );
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Only story | — | — |\n`,
    );

    const records = scan(root);

    const spec = byPath(records, 'specs/feature-a/feature-a.spec.md');
    expect(spec).toBeDefined();
    expect(spec?.virtual).toBeUndefined();
    expect(spec?.status).toBe('not-started');
    // Linkage assertion: prove the feature row resolved to the real
    // spec, not a virtual placeholder. Without this, a regression in
    // folder→spec resolution could leave the feature row bound to a
    // virtual `specs/feature-a/` placeholder while both records still
    // independently classify as `not-started`, masking the failure.
    expect(spec?.parent_path).toBe(
      'specs/feature-a/feature-a.features.md',
    );
    const virtualSpecs = records.filter(
      (r) => r.type === 'spec' && r.virtual === true,
    );
    expect(virtualSpecs).toHaveLength(0);

    const features = byPath(
      records,
      'specs/feature-a/feature-a.features.md',
    );
    expect(features).toBeDefined();
    expect(features?.status).toBe(spec?.status);
    expect(features?.status).toBe('not-started');
  });

  it('AS 9.4: RFC row pointing at a real .features.md rolls up from that feature map\'s status', () => {
    // Single-hop RFC → feature-map rollup. The RFC's
    // `## Dependency Order` has exactly one row whose `Artifact` cell
    // points at an on-disk `.features.md`. The feature map's own
    // `## Dependency Order` has a single `—` row, which
    // deterministically rolls up to `not-started` via a virtual spec
    // record — no spec folder is written on disk, isolating this
    // fixture to the RFC→features hop only. The RFC record's status
    // must equal the feature map's rolled-up status. No checkbox
    // lines appear inside any `## Dependency Order` section of
    // either fixture file.
    write(
      'docs/rfcs/demo.rfc.md',
      `# RFC\n\n## Dependency Order\n\n${TABLE_HEADER}\n| M1 | Only milestone | — | specs/feature-a/feature-a.features.md |\n`,
    );
    write(
      'specs/feature-a/feature-a.features.md',
      `# Feature Map\n\n## Dependency Order\n\n${TABLE_HEADER}\n| F1 | Only feature | — | — |\n`,
    );

    const records = scan(root);

    const features = byPath(
      records,
      'specs/feature-a/feature-a.features.md',
    );
    expect(features).toBeDefined();
    expect(features?.virtual).toBeUndefined();
    expect(features?.status).toBe('not-started');
    // Linkage assertion: prove the RFC row resolved to the real
    // features file, not a virtual placeholder. Without this, a
    // regression in path→features resolution could leave the RFC row
    // bound to a virtual placeholder while both records still
    // independently classify as `not-started`, masking the failure.
    expect(features?.parent_path).toBe('docs/rfcs/demo.rfc.md');
    const virtualFeatures = records.filter(
      (r) => r.type === 'features' && r.virtual === true,
    );
    expect(virtualFeatures).toHaveLength(0);

    const rfc = byPath(records, 'docs/rfcs/demo.rfc.md');
    expect(rfc).toBeDefined();
    expect(rfc?.status).toBe(features?.status);
    expect(rfc?.status).toBe('not-started');
  });

  it('AS 9.5: legacy-format artifact yields a spec record with status=unknown and migration-pointer warning', () => {
    // AS 9.5 — the scanner surfaces the parser's `format_legacy`
    // warning verbatim on the record's `warnings` list, carries
    // `status: 'unknown'`, and keeps `rows` empty (no tolerant
    // parsing per FR-028). The warning body points at the canonical
    // 4-column schema documentation.
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n- [x] US1: First story\n- [ ] US2: Second story\n`,
    );
    const records = scan(root);
    const spec = byPath(records, 'specs/feature-a/feature-a.spec.md');
    expect(spec).toBeDefined();
    expect(spec?.status).toBe('unknown');
    expect(spec?.dependency_order.format).toBe('legacy');
    expect(spec?.dependency_order.rows).toEqual([]);
    const legacyWarnings = spec?.warnings.filter((w) =>
      w.startsWith('format_legacy:'),
    );
    expect(legacyWarnings).toHaveLength(1);
    expect(legacyWarnings?.[0]).toContain(
      'src/templates/agent-skills/README.md',
    );
  });

  it('broken-link detection: tasks **Source** header points at a missing spec → parent_missing=true, parent_path=declared path', () => {
    // A tasks file declares a `**Source**:` header referencing a spec
    // file that does not exist on disk, and no parent spec claims it
    // via a dep-order row. The scanner must flag it as a broken link.
    write(
      'specs/feature-a/01-orphan.tasks.md',
      `# Tasks\n\n**Source**: \`specs/feature-a/missing.spec.md\` — User Story 4\n\n## Slice 1: Only\n\n- [ ] Task one\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    const records = scan(root);
    const tasks = byPath(records, 'specs/feature-a/01-orphan.tasks.md');
    expect(tasks).toBeDefined();
    expect(tasks?.virtual).toBeUndefined();
    expect(tasks?.parent_missing).toBe(true);
    expect(tasks?.parent_path).toBe('specs/feature-a/missing.spec.md');
  });

  it('broken-link detection: tasks **Source** header points at an existing spec (no dep-order row, no NN match) → orphan with parent_path=null', () => {
    // The declared source exists on disk but does not reference this
    // tasks file from its dep-order table, and the tasks filename's
    // NN prefix (99) does not match any US row in the spec, so the
    // convention-based fallback also finds no link. Per AC, the probe
    // leaves the record alone; the final orphan normalization sets
    // parent_path to `null` and parent_missing stays unset.
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Other | — | — |\n`,
    );
    write(
      'specs/feature-a/99-declared.tasks.md',
      `# Tasks\n\n**Source**: \`specs/feature-a/feature-a.spec.md\` — User Story 99\n\n## Slice 1: Only\n\n- [ ] Task one\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    const records = scan(root);
    const tasks = byPath(records, 'specs/feature-a/99-declared.tasks.md');
    expect(tasks).toBeDefined();
    expect(tasks?.parent_missing).toBeUndefined();
    expect(tasks?.parent_path).toBeNull();
  });

  it('NN-prefix fallback: tasks file under a spec folder links to the US row with the matching story number even when the Artifact cell is `—`', () => {
    // A spec `—` row whose on-disk tasks file uses a slug that differs
    // from the row title must still be picked up via the filename
    // convention `<NN>-*.tasks.md`, where NN is derived from the US id.
    // Without this fallback, the scanner would emit a virtual
    // placeholder at a slug-based path and the real tasks record
    // would float as an orphan.
    write(
      'specs/feature-a/feature-a.spec.md',
      `# Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n| US1 | Ignite: Workshop Broad Idea into RFC | — | — |\n`,
    );
    write(
      'specs/feature-a/01-workshop-idea-into-rfc.tasks.md',
      `# Tasks\n\n## Slice 1: Only\n\n- [x] Task one\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    const records = scan(root);
    const tasks = byPath(
      records,
      'specs/feature-a/01-workshop-idea-into-rfc.tasks.md',
    );
    expect(tasks).toBeDefined();
    expect(tasks?.parent_path).toBe('specs/feature-a/feature-a.spec.md');
    // The scanner should NOT emit a slug-based virtual placeholder
    // when the convention-based fallback finds a real file.
    const virtuals = records.filter(
      (r) => r.type === 'tasks' && r.virtual === true,
    );
    expect(virtuals).toHaveLength(0);
  });

  it('broken-link detection: tasks file without a **Source** header and no resolved parent → orphan with parent_path=null', () => {
    // No `**Source**:` header to parse and no parent dep-order row
    // that references this file. The record must stay a plain orphan
    // with parent_path explicitly set to `null`, not omitted, and no
    // parent_missing flag.
    write(
      'specs/strikes/2026-04-12-999-loose/loose.tasks.md',
      `# Loose tasks\n\n## Slice 1: Only\n\n- [ ] Task one\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    const records = scan(root);
    const tasks = byPath(
      records,
      'specs/strikes/2026-04-12-999-loose/loose.tasks.md',
    );
    expect(tasks).toBeDefined();
    expect(tasks?.parent_missing).toBeUndefined();
    expect(tasks?.parent_path).toBeNull();
  });

  it('broken-link detection: absolute **Source** path is rejected as malformed and falls through to orphan', () => {
    // A malicious or malformed `**Source**:` header declaring an
    // absolute path (`/etc/passwd`, `C:\\Windows\\...`) must not
    // cause the probe to call `statSync` outside the repo root. The
    // scanner rejects the header up front and the record falls
    // through to the orphan-normalization branch with
    // `parent_path: null` and no `parent_missing` flag.
    write(
      'specs/feature-a/01-abs.tasks.md',
      `# Tasks\n\n**Source**: \`/etc/passwd\` — User Story 1\n\n## Slice 1: Only\n\n- [ ] Task\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    const records = scan(root);
    const tasks = byPath(records, 'specs/feature-a/01-abs.tasks.md');
    expect(tasks).toBeDefined();
    expect(tasks?.parent_missing).toBeUndefined();
    expect(tasks?.parent_path).toBeNull();
  });

  it('broken-link detection: **Source** path that resolves outside the repo root is rejected', () => {
    // A `..`-traversal `**Source**:` header that would escape the
    // scan root must be rejected, even if the traversal target is a
    // real file. The scanner treats the header as unparseable and
    // falls through to orphan normalization rather than recording
    // an out-of-repo `parent_path`.
    write(
      'specs/feature-a/01-escape.tasks.md',
      `# Tasks\n\n**Source**: \`../../../../etc/passwd\` — User Story 1\n\n## Slice 1: Only\n\n- [ ] Task\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    const records = scan(root);
    const tasks = byPath(records, 'specs/feature-a/01-escape.tasks.md');
    expect(tasks).toBeDefined();
    expect(tasks?.parent_missing).toBeUndefined();
    expect(tasks?.parent_path).toBeNull();
  });

  it('broken-link detection: tasks record with a read_error preserves unknown parent state (parent_path omitted)', () => {
    // A tasks file that could not be read in Phase 1 carries a
    // `read_error:` warning. We cannot inspect its `**Source**:`
    // header, so Phase 2b/2c must leave `parent_path` omitted
    // (= "unknown") rather than collapsing it to `null` (which
    // would misrepresent a transient I/O failure as "definitely
    // no parent"). Simulate the read error by creating a file
    // and stripping read permission — `readFileSync` raises
    // EACCES, which the scanner surfaces as a `read_error:`
    // warning. Skipped on platforms where chmod cannot produce
    // an unreadable file (Windows, running as root).
    const abs = join(root, 'specs', 'feature-a', '01-broken.tasks.md');
    write(
      'specs/feature-a/01-broken.tasks.md',
      `# Tasks\n\n## Slice 1: Only\n\n- [ ] Task\n`,
    );
    try {
      chmodSync(abs, 0o000);
    } catch {
      return; // Platform without chmod — skip.
    }
    let records: ReturnType<typeof scan>;
    try {
      records = scan(root);
    } finally {
      // Restore permission so rmSync in afterEach can clean up.
      try {
        chmodSync(abs, 0o644);
      } catch {
        /* ignore */
      }
    }
    const tasks = byPath(records, 'specs/feature-a/01-broken.tasks.md');
    if (tasks === undefined) {
      return; // Running as root — chmod 000 did not block the read.
    }
    if (!tasks.warnings.some((w) => w.startsWith('read_error:'))) {
      return; // Same — chmod did not produce a read error on this host.
    }
    expect(tasks.parent_path).toBeUndefined();
    expect(tasks.parent_missing).toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { scan } from './index.js';
import type { ArtifactRecord, NextAction } from './index.js';

/**
 * End-to-end next-action coverage matrix for `smithy status`.
 *
 * The `status` command is the authoritative tracker of what work is done
 * and what remains, so the next-action hint it prints for each artifact
 * must be runnable: it has to name the command whose on-disk
 * prerequisites are actually satisfied. The class of bug this suite
 * guards against is a parent artifact suggesting an "operate-on-self"
 * command (`smithy.mark` / `smithy.cut` / `smithy.forge`) against a child
 * file that does not exist yet — the child must instead redirect to the
 * "create-me" command one level up (`smithy.render` → `smithy.mark` →
 * `smithy.cut`).
 *
 * These tests run the full `scan()` pipeline (walk → parse → virtual
 * emission → classify → suggest) against real temp-dir fixtures so the
 * scanner's virtual-record emission and the suggester's redirect rules
 * are exercised together — the seam where the bug actually lived.
 *
 * Organized parent → child level, each with the on-disk-child axis the
 * hierarchy shares:
 *   - NONE   children exist  → every child is virtual → redirects up;
 *                              parent points at the first child.
 *   - SOME   children exist  → real children keep their own command,
 *                              virtual children redirect; parent points
 *                              at the first *virtual* child.
 *   - ALL    children exist  → no redirects; parent emits null (features
 *                              / spec) or the single-arg fallback (rfc).
 * plus status nuances (done/in-progress), `—`-cell convention paths,
 * first-virtual ordering, ancestor suppression, and fully-done rollup.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'smithy-nextaction-'));
});

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function write(relPath: string, contents: string): void {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

function byPath(records: ArtifactRecord[], path: string): ArtifactRecord | undefined {
  return records.find((r) => r.path === path);
}

/** Fetch the next_action for a record by path (asserting it exists). */
function actionAt(records: ArtifactRecord[], path: string): NextAction | null {
  const rec = byPath(records, path);
  expect(rec, `expected a record at ${path}`).toBeDefined();
  return rec!.next_action ?? null;
}

function expectAction(
  action: NextAction | null,
  command: string,
  args: string[],
): void {
  expect(action).not.toBeNull();
  expect(action!.command).toBe(command);
  expect(action!.arguments).toEqual(args);
}

const TABLE_HEADER =
  '| ID | Title | Depends On | Artifact |\n|----|-------|------------|----------|';

/** Build an RFC body from milestone rows `[id, title, artifactCell]`. */
function rfcBody(rows: Array<[string, string, string]>): string {
  const body = rows
    .map(([id, title, cell]) => `| ${id} | ${title} | — | ${cell} |`)
    .join('\n');
  return `# RFC: Demo\n\n## Dependency Order\n\n${TABLE_HEADER}\n${body}\n`;
}

/** Build a feature-map body from feature rows `[id, title, artifactCell]`. */
function featuresBody(rows: Array<[string, string, string]>): string {
  const body = rows
    .map(([id, title, cell]) => `| ${id} | ${title} | — | ${cell} |`)
    .join('\n');
  return `# Feature Map: Demo\n\n## Dependency Order\n\n${TABLE_HEADER}\n${body}\n`;
}

/** Build a spec body from user-story rows `[id, title, artifactCell]`. */
function specBody(rows: Array<[string, string, string]>): string {
  const body = rows
    .map(([id, title, cell]) => `| ${id} | ${title} | — | ${cell} |`)
    .join('\n');
  return `# Feature Specification: Demo\n\n## Dependency Order\n\n${TABLE_HEADER}\n${body}\n`;
}

/**
 * Build a tasks body. `slices` is a list of `[id, title, taskMarks]`
 * where `taskMarks` is the array of checkbox markers (`' '` or `'x'`)
 * for that slice's task list. The dep-order table mirrors the slice ids.
 */
function tasksBody(slices: Array<[number, string, string[]]>): string {
  const sliceSections = slices
    .map(([n, title, marks]) => {
      const checks = marks.map((m) => `- [${m}] Task`).join('\n');
      return `## Slice ${n}: ${title}\n\n${checks}`;
    })
    .join('\n\n');
  const tableRows = slices
    .map(([n, title]) => `| S${n} | ${title} | — | — |`)
    .join('\n');
  return `# Tasks: Demo\n\n${sliceSections}\n\n## Dependency Order\n\n${TABLE_HEADER}\n${tableRows}\n`;
}

// ===========================================================================
// LEVEL 1 — RFC → feature maps  (smithy.render is the create-child command)
// ===========================================================================

describe('next-action matrix — RFC → feature maps', () => {
  const RFC = 'docs/rfcs/demo/demo.rfc.md';

  it('NONE rendered: every milestone redirects to smithy.render; RFC points at the first', () => {
    write(
      RFC,
      rfcBody([
        ['M1', 'Milestone One', 'docs/rfcs/demo/01-one.features.md'],
        ['M2', 'Milestone Two', 'docs/rfcs/demo/02-two.features.md'],
      ]),
    );
    const records = scan(root);

    // RFC itself is the root and points at the first un-rendered milestone.
    expect(byPath(records, RFC)!.status).toBe('not-started');
    expectAction(actionAt(records, RFC), 'smithy.render', [RFC, '1']);
    expect(byPath(records, RFC)!.next_action!.suppressed_by_ancestor).toBeUndefined();

    // Each milestone's feature map is virtual and redirects to render.
    const m1 = byPath(records, 'docs/rfcs/demo/01-one.features.md')!;
    const m2 = byPath(records, 'docs/rfcs/demo/02-two.features.md')!;
    expect(m1.virtual).toBe(true);
    expect(m2.virtual).toBe(true);
    expectAction(m1.next_action ?? null, 'smithy.render', [RFC, '1']);
    expectAction(m2.next_action ?? null, 'smithy.render', [RFC, '2']);
    // Descendants of a not-started actionable RFC carry the suppression flag.
    expect(m1.next_action!.suppressed_by_ancestor).toBe(true);
    expect(m2.next_action!.suppressed_by_ancestor).toBe(true);
  });

  it('SOME rendered: RFC points at the first virtual milestone, real one keeps smithy.mark', () => {
    write(
      RFC,
      rfcBody([
        ['M1', 'Milestone One', 'docs/rfcs/demo/01-one.features.md'],
        ['M2', 'Milestone Two', 'docs/rfcs/demo/02-two.features.md'],
      ]),
    );
    // M1's feature map exists (with one unspecced feature); M2's does not.
    write('docs/rfcs/demo/01-one.features.md', featuresBody([['F1', 'Feature One', '—']]));
    const records = scan(root);

    // RFC skips the rendered M1 and points at the virtual M2.
    expectAction(actionAt(records, RFC), 'smithy.render', [RFC, '2']);

    const m1 = byPath(records, 'docs/rfcs/demo/01-one.features.md')!;
    expect(m1.virtual).not.toBe(true);
    // A real feature map drives its own work — mark, never render.
    expect(m1.next_action!.command).toBe('smithy.mark');

    const m2 = byPath(records, 'docs/rfcs/demo/02-two.features.md')!;
    expect(m2.virtual).toBe(true);
    expectAction(m2.next_action ?? null, 'smithy.render', [RFC, '2']);
  });

  it('ALL rendered: no virtual feature maps; RFC degrades to the single-arg render fallback', () => {
    write(
      RFC,
      rfcBody([
        ['M1', 'Milestone One', 'docs/rfcs/demo/01-one.features.md'],
        ['M2', 'Milestone Two', 'docs/rfcs/demo/02-two.features.md'],
      ]),
    );
    write('docs/rfcs/demo/01-one.features.md', featuresBody([['F1', 'Feature One', '—']]));
    write('docs/rfcs/demo/02-two.features.md', featuresBody([['F1', 'Feature Two', '—']]));
    const records = scan(root);

    // No virtual milestone digit to surface → bare RFC-path render hint.
    expectAction(actionAt(records, RFC), 'smithy.render', [RFC]);

    // Both feature maps are real and drive their own work (mark, not render).
    expect(byPath(records, 'docs/rfcs/demo/01-one.features.md')!.virtual).not.toBe(true);
    expect(byPath(records, 'docs/rfcs/demo/02-two.features.md')!.virtual).not.toBe(true);
    expect(byPath(records, 'docs/rfcs/demo/01-one.features.md')!.next_action!.command).toBe('smithy.mark');
    expect(byPath(records, 'docs/rfcs/demo/02-two.features.md')!.next_action!.command).toBe('smithy.mark');
  });

  it('`—` artifact cell: virtual feature map lands on the convention path and redirects to render', () => {
    write(RFC, rfcBody([['M1', 'Spawn Backend', '—']]));
    const records = scan(root);

    const conventional = 'docs/rfcs/demo/01-spawn-backend.features.md';
    const m1 = byPath(records, conventional);
    expect(m1, 'virtual feature map should use <NN>-<slug>.features.md convention').toBeDefined();
    expect(m1!.virtual).toBe(true);
    expectAction(m1!.next_action ?? null, 'smithy.render', [RFC, '1']);
  });

  it('first-virtual selection: a rendered M1 followed by virtual M2, M3 → RFC points at M2', () => {
    write(
      RFC,
      rfcBody([
        ['M1', 'One', 'docs/rfcs/demo/01-one.features.md'],
        ['M2', 'Two', 'docs/rfcs/demo/02-two.features.md'],
        ['M3', 'Three', 'docs/rfcs/demo/03-three.features.md'],
      ]),
    );
    write('docs/rfcs/demo/01-one.features.md', featuresBody([['F1', 'Feature One', '—']]));
    const records = scan(root);
    expectAction(actionAt(records, RFC), 'smithy.render', [RFC, '2']);
  });
});

// ===========================================================================
// LEVEL 2 — feature map → specs  (smithy.mark is the create-child command)
// ===========================================================================

describe('next-action matrix — feature map → specs', () => {
  const FMAP = 'docs/rfcs/demo/demo.features.md';

  it('NONE specced: every feature redirects to smithy.mark; map points at the first', () => {
    write(
      FMAP,
      featuresBody([
        ['F1', 'Feature One', 'specs/one/'],
        ['F2', 'Feature Two', 'specs/two/'],
      ]),
    );
    const records = scan(root);

    expect(byPath(records, FMAP)!.status).toBe('not-started');
    expectAction(actionAt(records, FMAP), 'smithy.mark', [FMAP, '1']);

    const f1 = byPath(records, 'specs/one/')!;
    const f2 = byPath(records, 'specs/two/')!;
    expect(f1.virtual).toBe(true);
    expect(f2.virtual).toBe(true);
    expectAction(f1.next_action ?? null, 'smithy.mark', [FMAP, '1']);
    expectAction(f2.next_action ?? null, 'smithy.mark', [FMAP, '2']);
    expect(f1.next_action!.suppressed_by_ancestor).toBe(true);
    expect(f2.next_action!.suppressed_by_ancestor).toBe(true);
  });

  it('SOME specced: map points at the first virtual feature, real spec keeps smithy.cut', () => {
    write(
      FMAP,
      featuresBody([
        ['F1', 'Feature One', 'specs/one/'],
        ['F2', 'Feature Two', 'specs/two/'],
      ]),
    );
    // F1's spec exists (with one uncut story); F2's does not.
    write('specs/one/one.spec.md', specBody([['US1', 'Story One', '—']]));
    const records = scan(root);

    expectAction(actionAt(records, FMAP), 'smithy.mark', [FMAP, '2']);

    const f1 = byPath(records, 'specs/one/one.spec.md')!;
    expect(f1.virtual).not.toBe(true);
    // A real spec drives its own work — cut, never mark.
    expect(f1.next_action!.command).toBe('smithy.cut');

    const f2 = byPath(records, 'specs/two/')!;
    expect(f2.virtual).toBe(true);
    expectAction(f2.next_action ?? null, 'smithy.mark', [FMAP, '2']);
  });

  it('ALL specced: no virtual specs; the feature map emits no hint of its own (null)', () => {
    write(
      FMAP,
      featuresBody([
        ['F1', 'Feature One', 'specs/one/'],
        ['F2', 'Feature Two', 'specs/two/'],
      ]),
    );
    write('specs/one/one.spec.md', specBody([['US1', 'Story One', '—']]));
    write('specs/two/two.spec.md', specBody([['US1', 'Story Two', '—']]));
    const records = scan(root);

    // Every feature has a spec on disk → per-spec hints cover the work.
    expect(actionAt(records, FMAP)).toBeNull();
    expect(byPath(records, 'specs/one/one.spec.md')!.virtual).not.toBe(true);
    expect(byPath(records, 'specs/two/two.spec.md')!.virtual).not.toBe(true);
  });

  it('`—` artifact cell: virtual spec lands on specs/<slug>/ and redirects to mark', () => {
    write(FMAP, featuresBody([['F1', 'Webhooks Support', '—']]));
    const records = scan(root);

    const conventional = 'specs/webhooks-support/';
    const f1 = byPath(records, conventional);
    expect(f1, 'virtual spec should use specs/<slug>/ convention').toBeDefined();
    expect(f1!.virtual).toBe(true);
    expectAction(f1!.next_action ?? null, 'smithy.mark', [FMAP, '1']);
  });

  it('first-virtual selection: a real but uncut F1 spec precedes virtual F2 → map points at F2', () => {
    write(
      FMAP,
      featuresBody([
        ['F1', 'Feature One', 'specs/one/'],
        ['F2', 'Feature Two', 'specs/two/'],
      ]),
    );
    // F1's spec exists but is not-started; the map must still skip it
    // (its own cut hint covers it) and point mark at the virtual F2.
    write('specs/one/one.spec.md', specBody([['US1', 'Story One', '—']]));
    const records = scan(root);
    expectAction(actionAt(records, FMAP), 'smithy.mark', [FMAP, '2']);
  });
});

// ===========================================================================
// LEVEL 3 — spec → tasks  (smithy.cut is the create-child command)
// ===========================================================================

describe('next-action matrix — spec → tasks', () => {
  const SPEC = 'specs/demo/demo.spec.md';
  const FOLDER = 'specs/demo';

  it('NONE cut: every story redirects to smithy.cut; spec points at the first', () => {
    write(
      SPEC,
      specBody([
        ['US1', 'Story One', 'specs/demo/01-one.tasks.md'],
        ['US2', 'Story Two', 'specs/demo/02-two.tasks.md'],
      ]),
    );
    const records = scan(root);

    expect(byPath(records, SPEC)!.status).toBe('not-started');
    expectAction(actionAt(records, SPEC), 'smithy.cut', [FOLDER, '1']);

    const us1 = byPath(records, 'specs/demo/01-one.tasks.md')!;
    const us2 = byPath(records, 'specs/demo/02-two.tasks.md')!;
    expect(us1.virtual).toBe(true);
    expect(us2.virtual).toBe(true);
    expectAction(us1.next_action ?? null, 'smithy.cut', [FOLDER, '1']);
    expectAction(us2.next_action ?? null, 'smithy.cut', [FOLDER, '2']);
    expect(us1.next_action!.suppressed_by_ancestor).toBe(true);
    expect(us2.next_action!.suppressed_by_ancestor).toBe(true);
  });

  it('SOME cut: spec points at the first virtual story, real tasks file keeps smithy.forge', () => {
    write(
      SPEC,
      specBody([
        ['US1', 'Story One', 'specs/demo/01-one.tasks.md'],
        ['US2', 'Story Two', 'specs/demo/02-two.tasks.md'],
      ]),
    );
    write('specs/demo/01-one.tasks.md', tasksBody([[1, 'One', [' ']]]));
    const records = scan(root);

    expectAction(actionAt(records, SPEC), 'smithy.cut', [FOLDER, '2']);

    const us1 = byPath(records, 'specs/demo/01-one.tasks.md')!;
    expect(us1.virtual).not.toBe(true);
    expectAction(us1.next_action ?? null, 'smithy.forge', ['specs/demo/01-one.tasks.md', '1']);

    const us2 = byPath(records, 'specs/demo/02-two.tasks.md')!;
    expect(us2.virtual).toBe(true);
    expectAction(us2.next_action ?? null, 'smithy.cut', [FOLDER, '2']);
  });

  it('ALL cut: no virtual tasks; the spec emits no hint of its own (null)', () => {
    write(
      SPEC,
      specBody([
        ['US1', 'Story One', 'specs/demo/01-one.tasks.md'],
        ['US2', 'Story Two', 'specs/demo/02-two.tasks.md'],
      ]),
    );
    write('specs/demo/01-one.tasks.md', tasksBody([[1, 'One', [' ']]]));
    write('specs/demo/02-two.tasks.md', tasksBody([[1, 'Two', [' ']]]));
    const records = scan(root);

    expect(actionAt(records, SPEC)).toBeNull();
    expect(byPath(records, 'specs/demo/01-one.tasks.md')!.virtual).not.toBe(true);
    expect(byPath(records, 'specs/demo/02-two.tasks.md')!.virtual).not.toBe(true);
  });

  it('`—` artifact cell: virtual tasks file lands on the convention path and redirects to cut', () => {
    write(SPEC, specBody([['US1', 'First Story', '—']]));
    const records = scan(root);

    const conventional = 'specs/demo/01-first-story.tasks.md';
    const us1 = byPath(records, conventional);
    expect(us1, 'virtual tasks file should use <NN>-<slug>.tasks.md convention').toBeDefined();
    expect(us1!.virtual).toBe(true);
    expectAction(us1!.next_action ?? null, 'smithy.cut', [FOLDER, '1']);
  });

  it('first-virtual selection: a real but unstarted US1 tasks file precedes virtual US2 → spec points at US2', () => {
    write(
      SPEC,
      specBody([
        ['US1', 'Story One', 'specs/demo/01-one.tasks.md'],
        ['US2', 'Story Two', 'specs/demo/02-two.tasks.md'],
      ]),
    );
    write('specs/demo/01-one.tasks.md', tasksBody([[1, 'One', [' ']]]));
    const records = scan(root);
    expectAction(actionAt(records, SPEC), 'smithy.cut', [FOLDER, '2']);
  });
});

// ===========================================================================
// LEVEL 4 — tasks → slices  (smithy.forge is the implement command)
// ===========================================================================

describe('next-action matrix — tasks → slices', () => {
  const TASKS = 'specs/demo/01-task.tasks.md';

  it('NONE done: forge points at the first slice; record is not-started', () => {
    write(TASKS, tasksBody([[1, 'One', [' ', ' ']], [2, 'Two', [' ']]]));
    const records = scan(root);
    expect(byPath(records, TASKS)!.status).toBe('not-started');
    expectAction(actionAt(records, TASKS), 'smithy.forge', [TASKS, '1']);
  });

  it('SOME done: forge skips the finished slice and points at the next; record is in-progress', () => {
    write(TASKS, tasksBody([[1, 'One', ['x', 'x']], [2, 'Two', [' ']]]));
    const records = scan(root);
    expect(byPath(records, TASKS)!.status).toBe('in-progress');
    expectAction(actionAt(records, TASKS), 'smithy.forge', [TASKS, '2']);
  });

  it('ALL done: record is done and emits no next action (null)', () => {
    write(TASKS, tasksBody([[1, 'One', ['x']], [2, 'Two', ['x']]]));
    const records = scan(root);
    expect(byPath(records, TASKS)!.status).toBe('done');
    expect(actionAt(records, TASKS)).toBeNull();
  });

  it('partially-checked slice: forge still points at that slice (first non-done)', () => {
    // Slice 1 has one of two tasks checked → the slice is in-progress and
    // is the first non-done slice, so forge resumes there.
    write(TASKS, tasksBody([[1, 'One', ['x', ' ']], [2, 'Two', [' ']]]));
    const records = scan(root);
    expectAction(actionAt(records, TASKS), 'smithy.forge', [TASKS, '1']);
    expect(byPath(records, TASKS)!.slices?.[0]?.status).toBe('in-progress');
  });

  it('no slice bodies: forge degrades to the single-arg fallback (no digit)', () => {
    // A tasks file with a dep-order table but no `## Slice N:` bodies has
    // no parsed slices, so the suggester cannot name a slice digit.
    write(
      TASKS,
      `# Tasks: Demo\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | One | — | — |\n`,
    );
    const records = scan(root);
    expectAction(actionAt(records, TASKS), 'smithy.forge', [TASKS]);
  });
});

// ===========================================================================
// CROSS-LEVEL — lineage suppression and fully-done rollup
// ===========================================================================

describe('next-action matrix — lineage suppression and rollup', () => {
  // A real four-level chain where every file exists but no work has
  // started. Each parent's own next_action is null (its single child is
  // real, so per-child hints cover the work) EXCEPT the root RFC, which
  // falls back to the single-arg render hint.
  function writeChain(taskMarks: string[]): void {
    write('docs/rfcs/demo/demo.rfc.md', rfcBody([['M1', 'Milestone', 'docs/rfcs/demo/01.features.md']]));
    write('docs/rfcs/demo/01.features.md', featuresBody([['F1', 'Feature', 'specs/one/']]));
    write('specs/one/one.spec.md', specBody([['US1', 'Story', 'specs/one/01-story.tasks.md']]));
    write('specs/one/01-story.tasks.md', tasksBody([[1, 'Slice', taskMarks]]));
  }

  it('suppresses a deep descendant hint under a not-started actionable RFC, skipping null-action intermediates', () => {
    writeChain([' ']); // not started
    const records = scan(root);

    const RFC = 'docs/rfcs/demo/demo.rfc.md';
    const TASKS = 'specs/one/01-story.tasks.md';

    // Root RFC: actionable, not suppressed.
    expect(byPath(records, RFC)!.status).toBe('not-started');
    expect(byPath(records, RFC)!.next_action!.command).toBe('smithy.render');
    expect(byPath(records, RFC)!.next_action!.suppressed_by_ancestor).toBeUndefined();

    // Intermediate parents have nothing of their own to suggest.
    expect(byPath(records, 'docs/rfcs/demo/01.features.md')!.next_action).toBeNull();
    expect(byPath(records, 'specs/one/one.spec.md')!.next_action).toBeNull();

    // The leaf tasks file is the only actionable descendant. Its hint is
    // emitted (every actionable row is self-describing) but flagged as
    // suppressed because an actionable not-started ancestor (the RFC)
    // exists — even though the spec/features intermediates carry no hint.
    const tasks = byPath(records, TASKS)!;
    expect(tasks.next_action!.command).toBe('smithy.forge');
    expect(tasks.next_action!.suppressed_by_ancestor).toBe(true);
  });

  it('fully-done chain: every level rolls up to done with a null next action', () => {
    writeChain(['x']); // the single slice is complete
    const records = scan(root);

    for (const path of [
      'docs/rfcs/demo/demo.rfc.md',
      'docs/rfcs/demo/01.features.md',
      'specs/one/one.spec.md',
      'specs/one/01-story.tasks.md',
    ]) {
      expect(byPath(records, path)!.status, `${path} status`).toBe('done');
      expect(actionAt(records, path), `${path} next_action`).toBeNull();
    }
  });
});

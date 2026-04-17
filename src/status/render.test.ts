import { describe, expect, it } from 'vitest';

// Import through the `./index.js` barrel so these tests also assert
// that `renderTree` is re-exported on the stable public surface.
import {
  buildTree,
  BROKEN_LINKS_PATH,
  ORPHANED_SPECS_PATH,
  ORPHANED_TASKS_PATH,
  renderTree,
  type ArtifactRecord,
  type ArtifactType,
  type DependencyOrderTable,
  type StatusTree,
} from './index.js';

/**
 * Minimal `ArtifactRecord` factory for renderer tests. Only the fields
 * `renderTree` actually reads (`type`, `path`, `title`, `status`,
 * `completed`, `total`, `parent_path`, `parent_missing`, `warnings`)
 * carry semantic weight — the rest are padded with sensible defaults
 * so the test bodies stay small.
 */
function makeRecord(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  const type: ArtifactType = overrides.type ?? 'spec';
  const idPrefix: DependencyOrderTable['id_prefix'] =
    type === 'rfc'
      ? 'M'
      : type === 'features'
        ? 'F'
        : type === 'spec'
          ? 'US'
          : 'S';
  const dependency_order: DependencyOrderTable = overrides.dependency_order ?? {
    rows: [],
    id_prefix: idPrefix,
    format: 'table',
  };
  return {
    type,
    path: overrides.path ?? `specs/sample.${type === 'tasks' ? 'tasks' : type}.md`,
    title: overrides.title ?? 'Sample',
    status: overrides.status ?? 'not-started',
    dependency_order,
    warnings: overrides.warnings ?? [],
    ...overrides,
  };
}

describe('renderTree — empty and trivial trees', () => {
  it('returns the empty string for an empty tree', () => {
    const tree: StatusTree = { roots: [] };
    expect(renderTree(tree)).toBe('');
  });

  it('renders a single-root tree with no connectors and a status marker', () => {
    const tree = buildTree([
      makeRecord({
        type: 'rfc',
        path: 'docs/rfcs/0001.rfc.md',
        title: 'Demo RFC',
        status: 'done',
        parent_path: null,
      }),
    ]);
    const output = renderTree(tree);
    // Exactly one line; no connectors on the root; DONE marker.
    const lines = output.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/[├└]/);
    expect(lines[0]).toContain('Demo RFC');
    expect(lines[0]).toContain('DONE');
  });

  it('is a pure function: same input produces identical output on repeat calls', () => {
    const records: ArtifactRecord[] = [
      makeRecord({ type: 'rfc', path: 'docs/rfcs/0001.rfc.md', parent_path: null }),
      makeRecord({
        type: 'features',
        path: 'docs/rfcs/0001.features.md',
        parent_path: 'docs/rfcs/0001.rfc.md',
      }),
    ];
    const tree = buildTree(records);
    expect(renderTree(tree)).toBe(renderTree(tree));
  });
});

describe('renderTree — full RFC → features → spec → tasks chain', () => {
  const rfc = makeRecord({
    type: 'rfc',
    path: 'docs/rfcs/0001-demo.rfc.md',
    title: 'Demo RFC',
    status: 'in-progress',
    parent_path: null,
  });
  const features = makeRecord({
    type: 'features',
    path: 'docs/rfcs/0001-demo.features.md',
    title: 'Demo Features',
    status: 'in-progress',
    parent_path: 'docs/rfcs/0001-demo.rfc.md',
  });
  const spec = makeRecord({
    type: 'spec',
    path: 'specs/feature-a/feature-a.spec.md',
    title: 'Feature A',
    status: 'in-progress',
    parent_path: 'docs/rfcs/0001-demo.features.md',
  });
  const tasks = makeRecord({
    type: 'tasks',
    path: 'specs/feature-a/01-story.tasks.md',
    title: 'Story One',
    status: 'in-progress',
    completed: 2,
    total: 5,
    parent_path: 'specs/feature-a/feature-a.spec.md',
  });

  it('nests descendants under ancestors using └─ connectors on only-child branches', () => {
    const tree = buildTree([rfc, features, spec, tasks]);
    const output = renderTree(tree);
    const lines = output.split('\n');
    expect(lines).toHaveLength(4);

    // Root line — no connector.
    expect(lines[0]).toBe('Demo RFC  in progress');
    // Each subsequent line has exactly one └─ (last sibling) at the
    // correct indentation level. Only-child chains add blank spacers,
    // not vertical bars.
    expect(lines[1]).toBe('└─ Demo Features  in progress');
    expect(lines[2]).toBe('   └─ Feature A  in progress');
    expect(lines[3]).toBe('      └─ Story One  2/5');
  });

  it('uses titles, not file paths, as the primary label (AS 2.4)', () => {
    const tree = buildTree([rfc, features, spec, tasks]);
    const output = renderTree(tree);
    expect(output).not.toContain('docs/rfcs/0001-demo.rfc.md');
    expect(output).not.toContain('specs/feature-a/feature-a.spec.md');
    expect(output).toContain('Demo RFC');
    expect(output).toContain('Feature A');
    expect(output).toContain('Story One');
  });

  it('renders every ArtifactRecord exactly once (no silent drops, no duplicates)', () => {
    const tree = buildTree([rfc, features, spec, tasks]);
    const output = renderTree(tree);
    for (const record of [rfc, features, spec, tasks]) {
      const occurrences = output.split('\n').filter((l) => l.includes(record.title)).length;
      expect(occurrences).toBe(1);
    }
  });
});

describe('renderTree — sibling connectors', () => {
  it('uses ├─ for non-last siblings and └─ for the last sibling, with │ spacers inherited by non-last subtrees', () => {
    // RFC with two features, the first of which has a spec child.
    const rfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/0001.rfc.md',
      title: 'Demo',
      status: 'in-progress',
      parent_path: null,
    });
    const featuresA = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001-a.features.md',
      title: 'Features A',
      status: 'in-progress',
      parent_path: 'docs/rfcs/0001.rfc.md',
    });
    const featuresB = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001-b.features.md',
      title: 'Features B',
      status: 'not-started',
      parent_path: 'docs/rfcs/0001.rfc.md',
    });
    const specA = makeRecord({
      type: 'spec',
      path: 'specs/feature-a/feature-a.spec.md',
      title: 'Spec A',
      status: 'in-progress',
      parent_path: 'docs/rfcs/0001-a.features.md',
    });

    const tree = buildTree([rfc, featuresA, specA, featuresB]);
    const lines = renderTree(tree).split('\n');

    expect(lines[0]).toBe('Demo  in progress');
    // Features A is a non-last sibling, so its connector is ├─ and
    // its own child's prefix inherits a │ spacer.
    expect(lines[1]).toBe('├─ Features A  in progress');
    expect(lines[2]).toBe('│  └─ Spec A  in progress');
    // Features B is the last sibling under the RFC.
    expect(lines[3]).toBe('└─ Features B  not started');
  });
});

describe('renderTree — status markers', () => {
  it('renders DONE for done records regardless of type', () => {
    const tree = buildTree([
      makeRecord({
        type: 'rfc',
        path: 'docs/rfcs/0001.rfc.md',
        title: 'Done RFC',
        status: 'done',
        parent_path: null,
      }),
    ]);
    expect(renderTree(tree)).toContain('DONE');
  });

  it('renders the completed/total counter for in-progress tasks records', () => {
    const parent = makeRecord({
      type: 'spec',
      path: 'specs/f/f.spec.md',
      title: 'F',
      status: 'in-progress',
      parent_path: null,
    });
    const tasks = makeRecord({
      type: 'tasks',
      path: 'specs/f/01-story.tasks.md',
      title: 'Story',
      status: 'in-progress',
      completed: 3,
      total: 7,
      parent_path: 'specs/f/f.spec.md',
    });
    // Orphan parent falls through to a real root (features/rfc/tasks
    // with parent_path=null go to roots, not Orphaned Specs — that's
    // a spec-only group). This one IS a spec with null parent, so it
    // lands under the Orphaned Specs group. Walk that group's child
    // to reach the spec node.
    const tree = buildTree([parent, tasks]);
    const output = renderTree(tree);
    // Exactly the `3/7` counter surfaces for the tasks record.
    expect(output).toContain('Story  3/7');
  });

  it('renders an unambiguous "in progress" marker distinct from DONE for non-tasks in-progress records', () => {
    const tree = buildTree([
      makeRecord({
        type: 'features',
        path: 'docs/rfcs/0001.features.md',
        title: 'Features',
        status: 'in-progress',
        parent_path: null,
      }),
    ]);
    const output = renderTree(tree);
    expect(output).toContain('in progress');
    expect(output).not.toContain('DONE');
  });

  it('renders "not started" for not-started records (real and virtual)', () => {
    const tree = buildTree([
      makeRecord({
        type: 'rfc',
        path: 'docs/rfcs/real.rfc.md',
        title: 'Real RFC',
        status: 'not-started',
        parent_path: null,
      }),
      makeRecord({
        type: 'features',
        path: 'docs/rfcs/virtual.features.md',
        title: 'Virtual Features',
        status: 'not-started',
        virtual: true,
        parent_path: 'docs/rfcs/real.rfc.md',
      }),
    ]);
    const output = renderTree(tree);
    // Both the real root and the virtual child carry the marker.
    const lines = output.split('\n');
    expect(lines.filter((l) => l.includes('not started'))).toHaveLength(2);
  });

  it('surfaces at least one warning for unknown records', () => {
    const tree = buildTree([
      makeRecord({
        type: 'spec',
        path: 'specs/broken/broken.spec.md',
        title: 'Broken',
        status: 'unknown',
        warnings: ['parser: legacy checkbox format detected'],
        parent_path: null,
      }),
    ]);
    const output = renderTree(tree);
    // Spec with parent_path=null routes to Orphaned Specs. The child
    // line carries the warning content.
    expect(output).toContain('unknown');
    expect(output).toContain('legacy checkbox format detected');
  });
});

describe('renderTree — synthetic groups', () => {
  it('renders an "Orphaned Specs" top-level heading above its members', () => {
    const orphan = makeRecord({
      type: 'spec',
      path: 'specs/orphan/orphan.spec.md',
      title: 'Orphan Story',
      status: 'not-started',
      parent_path: null,
    });
    const tree = buildTree([orphan]);
    const lines = renderTree(tree).split('\n');

    expect(lines[0]).toBe('Orphaned Specs');
    // The group heading carries no status marker of its own.
    expect(lines[0]).not.toContain('DONE');
    expect(lines[0]).not.toContain('not started');
    // Its sole member is nested beneath with a └─ connector.
    expect(lines[1]).toBe('└─ Orphan Story  not started');
  });

  it('renders a "Broken Links" top-level heading and surfaces the dangling parent path on each child', () => {
    const broken = makeRecord({
      type: 'tasks',
      path: 'specs/lost/01-dangling.tasks.md',
      title: 'Dangling Story',
      status: 'not-started',
      completed: 0,
      total: 2,
      parent_path: 'specs/deleted/deleted.spec.md',
      parent_missing: true,
    });
    const tree = buildTree([broken]);
    const lines = renderTree(tree).split('\n');

    expect(lines[0]).toBe('Broken Links');
    // Broken-link line surfaces the dangling parent reference inline
    // alongside the title, and still ends with its status marker.
    expect(lines[1]).toContain('Dangling Story');
    expect(lines[1]).toContain('specs/deleted/deleted.spec.md');
    expect(lines[1]).toMatch(/└─ /);
    expect(lines[1]).toMatch(/not started$/);
  });

  it('orders Orphaned Specs before Broken Links when both groups are populated', () => {
    const orphan = makeRecord({
      type: 'spec',
      path: 'specs/orphan/orphan.spec.md',
      title: 'Orphan',
      parent_path: null,
    });
    const broken = makeRecord({
      type: 'tasks',
      path: 'specs/lost/01-dangling.tasks.md',
      title: 'Dangling',
      parent_path: 'specs/deleted/deleted.spec.md',
      parent_missing: true,
    });
    const output = renderTree(buildTree([orphan, broken]));
    const lines = output.split('\n');
    const orphanIndex = lines.findIndex((l) => l === 'Orphaned Specs');
    const brokenIndex = lines.findIndex((l) => l === 'Broken Links');
    expect(orphanIndex).toBeGreaterThanOrEqual(0);
    expect(brokenIndex).toBeGreaterThan(orphanIndex);
  });
});

describe('renderTree — group sentinel detection', () => {
  it('detects group sentinels by reserved path (not title) so a real record titled "Orphaned Specs" still renders as an ordinary node', () => {
    // Regression guard: a real record whose title happens to match a
    // group heading must NOT be mistaken for the group itself. The
    // path is what identifies the sentinel.
    const tree: StatusTree = {
      roots: [
        {
          record: makeRecord({
            type: 'rfc',
            path: 'docs/rfcs/0001.rfc.md',
            title: 'Orphaned Specs',
            status: 'done',
            parent_path: null,
          }),
          children: [],
        },
      ],
    };
    const output = renderTree(tree);
    // The real record still carries its status marker.
    expect(output).toBe('Orphaned Specs  DONE');
    // And is NOT misrouted via the sentinel constants.
    expect(output).not.toContain(ORPHANED_SPECS_PATH);
    expect(output).not.toContain(BROKEN_LINKS_PATH);
  });
});

describe('renderTree — story number prefix', () => {
  it('injects zero-padded story number after a leading `Tasks: ` prefix', () => {
    // Real tasks file: H1 is `# Tasks: <title>`, so the record's title
    // carries the `Tasks: ` prefix verbatim. The scanner's Phase 2
    // populates `parent_row_id` from the owning spec row (e.g. US3),
    // and the renderer must slot `03` in after the `Tasks: ` prefix —
    // not before it — so the type prefix stays visible.
    const tasks = makeRecord({
      type: 'tasks',
      path: 'specs/feature-a/03-suggest-next.tasks.md',
      title: 'Tasks: Suggest the Next Command',
      status: 'not-started',
      parent_path: 'specs/feature-a/feature-a.spec.md',
      parent_row_id: 'US3',
    });
    const output = renderTree({
      roots: [{ record: tasks, children: [] }],
    });
    expect(output).toBe('Tasks: 03 Suggest the Next Command  not started');
  });

  it('prefixes virtual records (from `—` spec rows) with their US number', () => {
    // Virtual records carry the parent row's title verbatim (no
    // `Tasks: ` prefix). The renderer must prepend the zero-padded
    // number directly to the title.
    const virt = makeRecord({
      type: 'tasks',
      path: 'specs/feature-a/07-collapse.tasks.md',
      title: 'Collapse Completed Items',
      status: 'not-started',
      virtual: true,
      parent_path: 'specs/feature-a/feature-a.spec.md',
      parent_row_id: 'US7',
    });
    const output = renderTree({
      roots: [{ record: virt, children: [] }],
    });
    expect(output).toBe('07 Collapse Completed Items  not started');
  });

  it('zero-pads single-digit US numbers and preserves multi-digit numbers', () => {
    const us1 = makeRecord({
      type: 'tasks',
      path: 'specs/a/01-one.tasks.md',
      title: 'Tasks: One',
      status: 'done',
      parent_path: 'specs/a/a.spec.md',
      parent_row_id: 'US1',
    });
    const us12 = makeRecord({
      type: 'tasks',
      path: 'specs/a/12-twelve.tasks.md',
      title: 'Tasks: Twelve',
      status: 'done',
      parent_path: 'specs/a/a.spec.md',
      parent_row_id: 'US12',
    });
    const output = renderTree({
      roots: [
        { record: us1, children: [] },
        { record: us12, children: [] },
      ],
    });
    expect(output.split('\n')).toEqual([
      'Tasks: 01 One  DONE',
      'Tasks: 12 Twelve  DONE',
    ]);
  });

  it('leaves records without parent_row_id unchanged', () => {
    // Top-level RFCs and orphan tasks have no parent row and must not
    // gain a spurious number prefix.
    const rfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/demo.rfc.md',
      title: 'Demo RFC',
      status: 'done',
      parent_path: null,
    });
    const output = renderTree({ roots: [{ record: rfc, children: [] }] });
    expect(output).toBe('Demo RFC  DONE');
  });
});

describe('renderTree — renderHints option (US4 Slice 2)', () => {
  it('default (no renderHints) emits no hint line even when records carry next_action', () => {
    // Backwards-compatibility guard: the renderHints flag defaults to
    // false, so legacy callers (and legacy render.test.ts snapshots)
    // continue to see a pure tree with no hint annotations.
    const record = makeRecord({
      type: 'tasks',
      path: 'specs/f/01-story.tasks.md',
      title: 'Story',
      status: 'not-started',
      parent_path: 'specs/f/f.spec.md',
      next_action: {
        command: 'smithy.forge',
        arguments: ['specs/f/01-story.tasks.md'],
        reason: 'because',
      },
    });
    const output = renderTree({
      roots: [{ record, children: [] }],
    });
    expect(output).not.toContain('\u2192');
    expect(output).not.toContain('smithy.forge');
  });

  it('default (no renderHints) is identical to explicit renderHints: false', () => {
    const record = makeRecord({
      type: 'tasks',
      path: 'specs/f/01-story.tasks.md',
      title: 'Story',
      status: 'not-started',
      parent_path: 'specs/f/f.spec.md',
      next_action: {
        command: 'smithy.forge',
        arguments: ['specs/f/01-story.tasks.md'],
        reason: 'because',
      },
    });
    const tree = { roots: [{ record, children: [] }] };
    expect(renderTree(tree)).toBe(renderTree(tree, { renderHints: false }));
  });

  it('renderHints: true emits an indented hint line beneath an actionable record', () => {
    const rfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/demo.rfc.md',
      title: 'Demo RFC',
      status: 'in-progress',
      parent_path: null,
      next_action: {
        command: 'smithy.render',
        arguments: ['docs/rfcs/demo.rfc.md'],
        reason: 'because',
      },
    });
    const output = renderTree(
      { roots: [{ record: rfc, children: [] }] },
      { renderHints: true },
    );
    const lines = output.split('\n');
    // First line is the record line; second line is the hint.
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Demo RFC  in progress');
    // Two-space pad + arrow + command + args.
    expect(lines[1]).toBe('  \u2192 smithy.render docs/rfcs/demo.rfc.md');
  });

  it('renderHints: true emits no hint line for a done record', () => {
    const rfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/demo.rfc.md',
      title: 'Demo RFC',
      status: 'done',
      parent_path: null,
      next_action: null,
    });
    const output = renderTree(
      { roots: [{ record: rfc, children: [] }] },
      { renderHints: true },
    );
    const lines = output.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('DONE');
    expect(output).not.toContain('\u2192');
  });

  it('renderHints: true emits no hint line for a suppressed record', () => {
    const record = makeRecord({
      type: 'tasks',
      path: 'specs/f/01-story.tasks.md',
      title: 'Story',
      status: 'not-started',
      parent_path: 'specs/f/f.spec.md',
      next_action: {
        command: 'smithy.forge',
        arguments: ['specs/f/01-story.tasks.md'],
        reason: 'because',
        suppressed_by_ancestor: true,
      },
    });
    const output = renderTree(
      { roots: [{ record, children: [] }] },
      { renderHints: true },
    );
    // No hint line; only the record line.
    expect(output.split('\n')).toHaveLength(1);
    expect(output).not.toContain('\u2192');
    expect(output).not.toContain('smithy.forge');
  });

  it('renderHints: true emits a hint line beneath a nested record with the correct tree-prefix inheritance', () => {
    // RFC → features → spec → tasks chain; the tasks record is the
    // last descendant. The hint should inherit the same indentation
    // as the descendants of the tasks record would (all blank spacers
    // because every intermediate node is a last-sibling).
    const rfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/demo.rfc.md',
      title: 'Demo RFC',
      status: 'in-progress',
      parent_path: null,
      next_action: null,
    });
    const features = makeRecord({
      type: 'features',
      path: 'docs/rfcs/demo.features.md',
      title: 'Demo Features',
      status: 'in-progress',
      parent_path: 'docs/rfcs/demo.rfc.md',
      next_action: null,
    });
    const spec = makeRecord({
      type: 'spec',
      path: 'specs/a/a.spec.md',
      title: 'Spec A',
      status: 'in-progress',
      parent_path: 'docs/rfcs/demo.features.md',
      next_action: null,
    });
    const tasks = makeRecord({
      type: 'tasks',
      path: 'specs/a/01-story.tasks.md',
      title: 'Story One',
      status: 'in-progress',
      completed: 1,
      total: 3,
      parent_path: 'specs/a/a.spec.md',
      next_action: {
        command: 'smithy.forge',
        arguments: ['specs/a/01-story.tasks.md'],
        reason: 'because',
      },
    });
    const tree = buildTree([rfc, features, spec, tasks]);
    const output = renderTree(tree, { renderHints: true });
    const lines = output.split('\n');
    // Five lines: RFC, features, spec, tasks, hint.
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('Demo RFC  in progress');
    expect(lines[1]).toBe('└─ Demo Features  in progress');
    expect(lines[2]).toBe('   └─ Spec A  in progress');
    expect(lines[3]).toBe('      └─ Story One  1/3');
    // The hint line lives beneath the tasks record. It uses the
    // two-space hint pad, anchored at the deepest child-spacer column
    // (nine leading spaces for this last-sibling-only chain).
    expect(lines[4]).toContain('\u2192 smithy.forge specs/a/01-story.tasks.md');
    expect(lines[4]!.startsWith(' ')).toBe(true);
  });

  it('renderHints: true does not emit a hint for group sentinel nodes', () => {
    // An orphaned spec surfaces under the "Orphaned Specs" group; the
    // group sentinel itself has no next_action and must not emit a
    // hint line. The spec child may or may not emit a hint depending
    // on its own next_action.
    const orphan = makeRecord({
      type: 'spec',
      path: 'specs/orphan/orphan.spec.md',
      title: 'Orphan',
      status: 'not-started',
      parent_path: null,
      next_action: null,
    });
    const tree = buildTree([orphan]);
    const output = renderTree(tree, { renderHints: true });
    const lines = output.split('\n');
    // Group heading first; no arrow follows it.
    expect(lines[0]).toBe('Orphaned Specs');
    // The very next line must not be a hint (no arrow under a group heading).
    expect(lines[1]).not.toMatch(/^\s*\u2192/);
  });

  it('renderHints: true emits a hint line only for records whose next_action is non-null and not suppressed', () => {
    // Mixed tree: one actionable record + one suppressed + one done.
    const rfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/demo.rfc.md',
      title: 'Demo RFC',
      status: 'not-started',
      parent_path: null,
      next_action: {
        command: 'smithy.render',
        arguments: ['docs/rfcs/demo.rfc.md'],
        reason: 'because',
      },
    });
    const features = makeRecord({
      type: 'features',
      path: 'docs/rfcs/demo.features.md',
      title: 'Demo Features',
      status: 'not-started',
      parent_path: 'docs/rfcs/demo.rfc.md',
      next_action: {
        command: 'smithy.mark',
        arguments: ['docs/rfcs/demo.features.md', '1'],
        reason: 'because',
        suppressed_by_ancestor: true,
      },
    });
    const tree = buildTree([rfc, features]);
    const output = renderTree(tree, { renderHints: true });
    // Exactly ONE arrow line — the un-suppressed RFC root.
    const arrowLines = output.split('\n').filter((l) => l.includes('\u2192'));
    expect(arrowLines).toHaveLength(1);
    expect(arrowLines[0]).toContain('smithy.render');
    // The suppressed features record has no hint line.
    expect(output).not.toContain('smithy.mark');
  });
});

describe('renderTree — orphaned tasks error output', () => {
  it('renders real tasks with no parent as flat ERROR lines (not nested tree rows)', () => {
    // A real on-disk `.tasks.md` that could not be linked to a spec is
    // always an error condition. The renderer must surface it as an
    // `ERROR:` line per orphan — no tree connectors, no "Orphaned
    // Tasks" heading — so the diagnostic is visible in log scrapes and
    // CI output and is clearly distinguishable from regular rows.
    const tree = buildTree([
      makeRecord({
        type: 'tasks',
        path: 'specs/lost/01-lost.tasks.md',
        title: 'Lost Tasks',
        parent_path: null,
      }),
      makeRecord({
        type: 'tasks',
        path: 'specs/abandoned/02-abandoned.tasks.md',
        title: 'Abandoned Tasks',
        parent_path: null,
      }),
    ]);

    const output = renderTree(tree);
    const lines = output.split('\n');
    expect(lines).toEqual([
      'ERROR: Orphaned task file specs/lost/01-lost.tasks.md could not be linked to a spec',
      'ERROR: Orphaned task file specs/abandoned/02-abandoned.tasks.md could not be linked to a spec',
    ]);
    // The sentinel path must never leak into the rendered output.
    expect(output).not.toContain(ORPHANED_TASKS_PATH);
    // No tree connectors or status markers on ERROR lines.
    expect(output).not.toContain('├─');
    expect(output).not.toContain('└─');
    expect(output).not.toContain('not started');
  });
});

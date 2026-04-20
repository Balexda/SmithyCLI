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
import { createTheme, type Theme } from './theme.js';

/**
 * Deterministic themes for assertions. Colors are disabled so snapshots
 * stay ANSI-free; encoding toggles between UTF-8 (default contract) and
 * ASCII (fallback for non-UTF-8 terminals).
 */
const utf8Theme: Theme = createTheme({ color: false, encoding: 'utf8' });
const asciiTheme: Theme = createTheme({ color: false, encoding: 'ascii' });
/**
 * Color-on UTF-8 theme used by the per-segment coloring tests. The
 * production paint helpers use `picocolors.createColors(true)` so
 * ANSI escapes emit regardless of whether the test runner inherits a
 * TTY — assertions interpolate the same helpers to avoid hardcoding
 * escape sequences.
 */
const colorTheme: Theme = createTheme({ color: true, encoding: 'utf8' });

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
    expect(renderTree(tree, { theme: utf8Theme })).toBe('');
  });

  it('renders a single-root tree with no connectors and a done icon', () => {
    const tree = buildTree([
      makeRecord({
        type: 'rfc',
        path: 'docs/rfcs/0001.rfc.md',
        title: 'Demo RFC',
        status: 'done',
        parent_path: null,
      }),
    ]);
    const output = renderTree(tree, { theme: utf8Theme });
    const lines = output.split('\n');
    expect(lines).toHaveLength(1);
    // No connectors on the root.
    expect(lines[0]).not.toMatch(/[├└]/);
    expect(lines[0]).toContain('Demo RFC');
    // Done icon (`✓`) replaces the legacy `DONE` marker.
    expect(lines[0]).toContain('\u2713');
    expect(lines[0]).not.toContain('DONE');
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
    expect(renderTree(tree, { theme: utf8Theme })).toBe(
      renderTree(tree, { theme: utf8Theme }),
    );
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
    const output = renderTree(tree, { theme: utf8Theme });
    const lines = output.split('\n');
    expect(lines).toHaveLength(4);

    // Each line carries the in-progress icon. In-progress parents also
    // render a `done/wip/not-started (total)` counter derived from their
    // direct children.
    expect(lines[0]).toBe('Demo RFC  \u25D0  0/1/0 (1)');
    expect(lines[1]).toBe('└─ Demo Features  \u25D0  0/1/0 (1)');
    expect(lines[2]).toBe('   └─ Feature A  \u25D0  0/1/0 (1)');
    // In-progress tasks row keeps the compact completed/total counter.
    expect(lines[3]).toBe('      └─ Story One  \u25D0 2/5');
  });

  it('uses titles, not file paths, as the primary label (AS 2.4)', () => {
    const tree = buildTree([rfc, features, spec, tasks]);
    const output = renderTree(tree, { theme: utf8Theme });
    expect(output).not.toContain('docs/rfcs/0001-demo.rfc.md');
    expect(output).not.toContain('specs/feature-a/feature-a.spec.md');
    expect(output).toContain('Demo RFC');
    expect(output).toContain('Feature A');
    expect(output).toContain('Story One');
  });

  it('renders every ArtifactRecord exactly once (no silent drops, no duplicates)', () => {
    const tree = buildTree([rfc, features, spec, tasks]);
    const output = renderTree(tree, { theme: utf8Theme });
    for (const record of [rfc, features, spec, tasks]) {
      const occurrences = output
        .split('\n')
        .filter((l) => l.includes(record.title)).length;
      expect(occurrences).toBe(1);
    }
  });
});

describe('renderTree — sibling connectors', () => {
  it('uses ├─ for non-last siblings and └─ for the last sibling, with │ spacers inherited by non-last subtrees', () => {
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
    const lines = renderTree(tree, { theme: utf8Theme }).split('\n');

    // RFC has two direct children (Features A + B): 0 done, 1 wip, 1 not-started.
    expect(lines[0]).toBe('Demo  \u25D0  0/1/1 (2)');
    // Features A is a non-last sibling, so its connector is ├─ and
    // its own child's prefix inherits a │ spacer. Features A has one
    // in-progress child, so its counter is 0/1/0 (1).
    expect(lines[1]).toBe('├─ Features A  \u25D0  0/1/0 (1)');
    expect(lines[2]).toBe('│  └─ Spec A  \u25D0');
    // Features B has no children (leaf not-started features row).
    expect(lines[3]).toBe('└─ Features B  \u25CB');
  });
});

describe('renderTree — status markers', () => {
  it('renders the done icon (✓) for done records regardless of type', () => {
    const tree = buildTree([
      makeRecord({
        type: 'rfc',
        path: 'docs/rfcs/0001.rfc.md',
        title: 'Done RFC',
        status: 'done',
        parent_path: null,
      }),
    ]);
    expect(renderTree(tree, { theme: utf8Theme })).toContain('\u2713');
  });

  it('renders the completed/total counter beside the in-progress icon for tasks records', () => {
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
    const tree = buildTree([parent, tasks]);
    const output = renderTree(tree, { theme: utf8Theme });
    // Tasks row carries `◐ 3/7`.
    expect(output).toContain('Story  \u25D0 3/7');
  });

  it('renders the in-progress icon (◐) with a done/wip/not-started counter on parent records', () => {
    const parent = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001.features.md',
      title: 'Features',
      status: 'in-progress',
      parent_path: null,
    });
    const done = makeRecord({
      type: 'spec',
      path: 'specs/a/a.spec.md',
      title: 'A',
      status: 'done',
      parent_path: 'docs/rfcs/0001.features.md',
    });
    const wip = makeRecord({
      type: 'spec',
      path: 'specs/b/b.spec.md',
      title: 'B',
      status: 'in-progress',
      parent_path: 'docs/rfcs/0001.features.md',
    });
    const notStarted = makeRecord({
      type: 'spec',
      path: 'specs/c/c.spec.md',
      title: 'C',
      status: 'not-started',
      parent_path: 'docs/rfcs/0001.features.md',
    });
    const tree = buildTree([parent, done, wip, notStarted]);
    const output = renderTree(tree, { theme: utf8Theme });
    const firstLine = output.split('\n')[0]!;
    expect(firstLine).toBe('Features  \u25D0  1/1/1 (3)');
    expect(firstLine).not.toContain('in progress');
    expect(firstLine).not.toContain('DONE');
  });

  it('renders the in-progress icon with no counter when the parent has no direct children', () => {
    const tree = buildTree([
      makeRecord({
        type: 'features',
        path: 'docs/rfcs/0001.features.md',
        title: 'Childless',
        status: 'in-progress',
        parent_path: null,
      }),
    ]);
    const lines = renderTree(tree, { theme: utf8Theme }).split('\n');
    expect(lines[0]).toBe('Childless  \u25D0');
  });

  it('excludes unknown direct children from the parent counter total so displayed segments always sum to (total)', () => {
    // Parent with 1 done + 1 in-progress + 1 unknown. The counter
    // should display `1/1/0 (2)` — the unknown child is skipped in
    // both the segment counts AND the (total) so the displayed
    // segments always sum to the total. The unknown child still
    // renders beneath the parent with its own ⚠ marker.
    const parent = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001.features.md',
      title: 'Parent',
      status: 'in-progress',
      parent_path: null,
    });
    const done = makeRecord({
      type: 'spec',
      path: 'specs/d/d.spec.md',
      title: 'Done Spec',
      status: 'done',
      parent_path: 'docs/rfcs/0001.features.md',
    });
    const wip = makeRecord({
      type: 'spec',
      path: 'specs/w/w.spec.md',
      title: 'WIP Spec',
      status: 'in-progress',
      parent_path: 'docs/rfcs/0001.features.md',
    });
    const broken = makeRecord({
      type: 'spec',
      path: 'specs/u/u.spec.md',
      title: 'Broken Spec',
      status: 'unknown',
      warnings: ['parser: legacy checkbox format detected'],
      parent_path: 'docs/rfcs/0001.features.md',
    });
    const output = renderTree(buildTree([parent, done, wip, broken]), {
      theme: utf8Theme,
    });
    const lines = output.split('\n');
    // Counter renders 1/1/0 (2) — displayed segments (1+1+0) sum to 2.
    expect(lines[0]).toBe('Parent  \u25D0  1/1/0 (2)');
    // Unknown child still surfaces as its own ⚠ row beneath the
    // parent, so nothing is hidden.
    expect(output).toContain('Broken Spec');
    expect(output).toContain('\u26A0');
  });

  it('renders the not-started icon (○) for not-started records (real and virtual)', () => {
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
    const output = renderTree(tree, { theme: utf8Theme });
    // Both the real root and the virtual child carry the marker.
    const lines = output.split('\n');
    expect(lines.filter((l) => l.includes('\u25CB'))).toHaveLength(2);
    expect(output).not.toContain('not started');
  });

  it('surfaces at least one warning for unknown records alongside the unknown icon (⚠)', () => {
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
    const output = renderTree(tree, { theme: utf8Theme });
    expect(output).toContain('\u26A0');
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
    const lines = renderTree(tree, { theme: utf8Theme }).split('\n');

    expect(lines[0]).toBe('Orphaned Specs');
    // The group heading carries no icon of its own.
    expect(lines[0]).not.toContain('\u2713');
    expect(lines[0]).not.toContain('\u25CB');
    // Its sole member is nested beneath with a └─ connector.
    expect(lines[1]).toBe('└─ Orphan Story  \u25CB');
  });

  it('renders a "Broken Links" heading and prefixes each child with a ✗ plus the dangling parent path', () => {
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
    const lines = renderTree(tree, { theme: utf8Theme }).split('\n');

    expect(lines[0]).toBe('Broken Links');
    // Broken-link line carries the red error icon (✗), the dangling
    // parent reference inline, and its status icon at the end.
    expect(lines[1]).toContain('\u2717');
    expect(lines[1]).toContain('Dangling Story');
    expect(lines[1]).toContain('specs/deleted/deleted.spec.md');
    expect(lines[1]).toMatch(/└─ /);
    expect(lines[1]!.endsWith('\u25CB')).toBe(true);
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
    const output = renderTree(buildTree([orphan, broken]), { theme: utf8Theme });
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
    const output = renderTree(tree, { theme: utf8Theme });
    // The real record still carries its status icon.
    expect(output).toBe('Orphaned Specs  \u2713');
    // And is NOT misrouted via the sentinel constants.
    expect(output).not.toContain(ORPHANED_SPECS_PATH);
    expect(output).not.toContain(BROKEN_LINKS_PATH);
  });
});

describe('renderTree — story number prefix', () => {
  it('strips the legacy `Tasks: ` H1 prefix and injects the zero-padded story number', () => {
    // Real tasks file: H1 is `# Tasks: <title>`, so the record's title
    // carries the `Tasks: ` prefix verbatim. The new renderer drops the
    // prefix entirely (every task row already renders beneath a tasks
    // context) and prepends the zero-padded US<N> digits so the tree
    // mirrors the parent's dep-order numbering.
    const tasks = makeRecord({
      type: 'tasks',
      path: 'specs/feature-a/03-suggest-next.tasks.md',
      title: 'Tasks: Suggest the Next Command',
      status: 'not-started',
      parent_path: 'specs/feature-a/feature-a.spec.md',
      parent_row_id: 'US3',
    });
    const output = renderTree(
      { roots: [{ record: tasks, children: [] }] },
      { theme: utf8Theme },
    );
    expect(output).toBe('03 Suggest the Next Command  \u25CB');
  });

  it('prefixes virtual records (from `—` spec rows) with their US number', () => {
    const virt = makeRecord({
      type: 'tasks',
      path: 'specs/feature-a/07-collapse.tasks.md',
      title: 'Collapse Completed Items',
      status: 'not-started',
      virtual: true,
      parent_path: 'specs/feature-a/feature-a.spec.md',
      parent_row_id: 'US7',
    });
    const output = renderTree(
      { roots: [{ record: virt, children: [] }] },
      { theme: utf8Theme },
    );
    expect(output).toBe('07 Collapse Completed Items  \u25CB');
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
    const output = renderTree(
      {
        roots: [
          { record: us1, children: [] },
          { record: us12, children: [] },
        ],
      },
      { theme: utf8Theme },
    );
    expect(output.split('\n')).toEqual([
      '01 One  \u2713',
      '12 Twelve  \u2713',
    ]);
  });

  it('leaves records without parent_row_id unchanged aside from the `Tasks: ` strip', () => {
    // Top-level RFCs have no parent row, carry no `Tasks: ` prefix, and
    // must not gain a spurious number prefix.
    const rfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/demo.rfc.md',
      title: 'Demo RFC',
      status: 'done',
      parent_path: null,
    });
    const output = renderTree(
      { roots: [{ record: rfc, children: [] }] },
      { theme: utf8Theme },
    );
    expect(output).toBe('Demo RFC  \u2713');
  });

  it('strips a leading `Tasks: ` prefix even when parent_row_id is missing', () => {
    // Defensive: an orphan real tasks file has a `Tasks: <title>` H1 but
    // the scanner never populated `parent_row_id` (no parent row owns
    // it). The renderer must still drop the prefix so the row reads
    // cleanly rather than shouting `Tasks:` at every orphan.
    const orphanTasks = makeRecord({
      type: 'tasks',
      path: 'specs/unlinked/01-ghost.tasks.md',
      title: 'Tasks: Ghost Work',
      status: 'not-started',
      parent_path: 'specs/unlinked/unlinked.spec.md',
      parent_missing: true,
    });
    // Broken-link row: the renderer prefixes with ✗ and appends the
    // dangling parent reference, but the title itself must have the
    // `Tasks: ` prefix stripped.
    const output = renderTree(
      { roots: [{ record: orphanTasks, children: [] }] },
      { theme: utf8Theme },
    );
    expect(output).toContain('Ghost Work');
    expect(output).not.toContain('Tasks: Ghost');
  });
});

describe('renderTree — renderHints option (US4 Slice 2)', () => {
  it('default (no renderHints) emits no hint line even when records carry next_action', () => {
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
    const output = renderTree(
      { roots: [{ record, children: [] }] },
      { theme: utf8Theme },
    );
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
    expect(renderTree(tree, { theme: utf8Theme })).toBe(
      renderTree(tree, { theme: utf8Theme, renderHints: false }),
    );
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
      { theme: utf8Theme, renderHints: true },
    );
    const lines = output.split('\n');
    expect(lines).toHaveLength(2);
    // Root has no children, so the in-progress icon renders without a
    // counter.
    expect(lines[0]).toBe('Demo RFC  \u25D0');
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
      { theme: utf8Theme, renderHints: true },
    );
    const lines = output.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('\u2713');
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
      { theme: utf8Theme, renderHints: true },
    );
    expect(output.split('\n')).toHaveLength(1);
    expect(output).not.toContain('\u2192');
    expect(output).not.toContain('smithy.forge');
  });

  it('renderHints: true emits a hint line beneath a nested record with the correct tree-prefix inheritance', () => {
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
    const output = renderTree(tree, { theme: utf8Theme, renderHints: true });
    const lines = output.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('Demo RFC  \u25D0  0/1/0 (1)');
    expect(lines[1]).toBe('└─ Demo Features  \u25D0  0/1/0 (1)');
    expect(lines[2]).toBe('   └─ Spec A  \u25D0  0/1/0 (1)');
    expect(lines[3]).toBe('      └─ Story One  \u25D0 1/3');
    // The hint line lives beneath the tasks record. It uses the
    // two-space hint pad, anchored at the deepest child-spacer column
    // (nine leading spaces for this last-sibling-only chain).
    expect(lines[4]).toContain('\u2192 smithy.forge specs/a/01-story.tasks.md');
    expect(lines[4]!.startsWith(' ')).toBe(true);
  });

  it('renderHints: true does not emit a hint for group sentinel nodes', () => {
    const orphan = makeRecord({
      type: 'spec',
      path: 'specs/orphan/orphan.spec.md',
      title: 'Orphan',
      status: 'not-started',
      parent_path: null,
      next_action: null,
    });
    const tree = buildTree([orphan]);
    const output = renderTree(tree, { theme: utf8Theme, renderHints: true });
    const lines = output.split('\n');
    expect(lines[0]).toBe('Orphaned Specs');
    expect(lines[1]).not.toMatch(/^\s*\u2192/);
  });

  it('renderHints: true emits a hint line only for records whose next_action is non-null and not suppressed', () => {
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
    const output = renderTree(tree, { theme: utf8Theme, renderHints: true });
    const arrowLines = output.split('\n').filter((l) => l.includes('\u2192'));
    expect(arrowLines).toHaveLength(1);
    expect(arrowLines[0]).toContain('smithy.render');
    expect(output).not.toContain('smithy.mark');
  });
});

describe('renderTree — orphaned tasks error output', () => {
  it('renders real tasks with no parent as flat ERROR lines (not nested tree rows)', () => {
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

    const output = renderTree(tree, { theme: utf8Theme });
    const lines = output.split('\n');
    expect(lines).toEqual([
      'ERROR: Orphaned task file specs/lost/01-lost.tasks.md could not be linked to a spec',
      'ERROR: Orphaned task file specs/abandoned/02-abandoned.tasks.md could not be linked to a spec',
    ]);
    // The sentinel path must never leak into the rendered output.
    expect(output).not.toContain(ORPHANED_TASKS_PATH);
    // No tree connectors on ERROR lines.
    expect(output).not.toContain('├─');
    expect(output).not.toContain('└─');
  });
});

describe('renderTree — ASCII fallback theme', () => {
  it('swaps UTF-8 box-drawing connectors for ASCII equivalents and icons for bracketed sigils', () => {
    const rfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/0001.rfc.md',
      title: 'Demo',
      status: 'in-progress',
      parent_path: null,
    });
    const specA = makeRecord({
      type: 'spec',
      path: 'specs/a/a.spec.md',
      title: 'A',
      status: 'done',
      parent_path: 'docs/rfcs/0001.rfc.md',
    });
    const specB = makeRecord({
      type: 'spec',
      path: 'specs/b/b.spec.md',
      title: 'B',
      status: 'not-started',
      parent_path: 'docs/rfcs/0001.rfc.md',
    });
    const tree = buildTree([rfc, specA, specB]);
    const output = renderTree(tree, { theme: asciiTheme });
    const lines = output.split('\n');
    expect(lines[0]).toBe('Demo  [~]  1/0/1 (2)');
    expect(lines[1]).toBe('+- A  [x]');
    expect(lines[2]).toBe('`- B  [ ]');
    // No UTF-8 characters leaked through.
    expect(output).not.toMatch(/[├└│─◐✓○⚠✗]/);
  });

  it('uses the ASCII arrow (->) for hint lines', () => {
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
      { theme: asciiTheme, renderHints: true },
    );
    const lines = output.split('\n');
    expect(lines[1]).toBe('  -> smithy.render docs/rfcs/demo.rfc.md');
    expect(output).not.toContain('\u2192');
  });

  it('prefixes broken-link rows with [!] under the ASCII theme', () => {
    const broken = makeRecord({
      type: 'tasks',
      path: 'specs/lost/01-dangling.tasks.md',
      title: 'Dangling',
      status: 'not-started',
      parent_path: 'specs/deleted/deleted.spec.md',
      parent_missing: true,
    });
    const tree = buildTree([broken]);
    const output = renderTree(tree, { theme: asciiTheme });
    expect(output).toContain('[!]');
    expect(output).not.toContain('\u2717');
  });
});

describe('renderTree — per-segment counter coloring (color on)', () => {
  // Interpolate the same paint helpers the production code uses so
  // assertions don't encode raw ANSI escape sequences. Tests still
  // verify the paint KIND — e.g., the done count goes through
  // `paint.done` (green), the wip count through `paint.inProgress`
  // (yellow), etc. — by comparing against `colorTheme.paint.*`-wrapped
  // fragments.
  const { paint } = colorTheme;

  it('parent counter paints each nonzero segment with its status color and leaves zeros dim', () => {
    // Parent with 2 done / 0 wip / 1 not-started children → counter
    // should be `2[green]/[dim]0[dim]/[dim]1[white] (3)[dim]` beside a
    // yellow `◐`.
    const rfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/demo.rfc.md',
      title: 'Demo',
      status: 'in-progress',
      parent_path: null,
    });
    const childA = makeRecord({
      type: 'features',
      path: 'docs/rfcs/a.features.md',
      title: 'A',
      status: 'done',
      parent_path: 'docs/rfcs/demo.rfc.md',
    });
    const childB = makeRecord({
      type: 'features',
      path: 'docs/rfcs/b.features.md',
      title: 'B',
      status: 'done',
      parent_path: 'docs/rfcs/demo.rfc.md',
    });
    const childC = makeRecord({
      type: 'features',
      path: 'docs/rfcs/c.features.md',
      title: 'C',
      status: 'not-started',
      parent_path: 'docs/rfcs/demo.rfc.md',
    });
    const tree = buildTree([rfc, childA, childB, childC]);
    const output = renderTree(tree, { theme: colorTheme });
    const rootLine = output.split('\n')[0]!;

    // Nonzero done count → green, via paint.done.
    expect(rootLine).toContain(paint.done('2'));
    // Zero wip count → dim.
    expect(rootLine).toContain(paint.dim('0'));
    // Nonzero not-started count → white.
    expect(rootLine).toContain(paint.white('1'));
    // Separators and total are dim.
    expect(rootLine).toContain(paint.dim('/'));
    expect(rootLine).toContain(paint.dim('(3)'));
    // In-progress icon stays yellow.
    expect(rootLine).toContain(paint.inProgress(colorTheme.icons.inProgress));
  });

  it('parent counter nonzero wip segment paints yellow via paint.inProgress', () => {
    const rfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/demo.rfc.md',
      title: 'Demo',
      status: 'in-progress',
      parent_path: null,
    });
    const wipChild = makeRecord({
      type: 'features',
      path: 'docs/rfcs/wip.features.md',
      title: 'WIP',
      status: 'in-progress',
      parent_path: 'docs/rfcs/demo.rfc.md',
    });
    const tree = buildTree([rfc, wipChild]);
    const output = renderTree(tree, { theme: colorTheme });
    const rootLine = output.split('\n')[0]!;

    // `0/1/0 (1)` → the middle `1` is the wip segment and should be
    // yellow.
    expect(rootLine).toContain(paint.inProgress('1'));
    // The done and not-started zero segments stay dim.
    expect(rootLine).toContain(paint.dim('0'));
  });

  it('task counter paints the completed segment green and keeps the total dim', () => {
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
    const output = renderTree(buildTree([parent, tasks]), {
      theme: colorTheme,
    });
    // Completed count `3` is green.
    expect(output).toContain(paint.done('3'));
    // `/7` is dim (including the leading slash so the pair reads as
    // muted structural chrome behind the bright completed count).
    expect(output).toContain(paint.dim('/7'));
  });

  it('task counter fades the completed segment to dim when zero tasks are done', () => {
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
      completed: 0,
      total: 4,
      parent_path: 'specs/f/f.spec.md',
    });
    const output = renderTree(buildTree([parent, tasks]), {
      theme: colorTheme,
    });
    // Zero completed → dim, not green (nothing done yet).
    expect(output).toContain(paint.dim('0'));
    // Note: `/4` is also dim, so we only assert the count itself to
    // avoid false matches on the adjacent `/4` substring.
    expect(output).not.toContain(paint.done('0'));
  });

  it('unknown records paint the warning parenthetical dim while keeping the ⚠ icon colored', () => {
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
    const output = renderTree(tree, { theme: colorTheme });
    // Icon is yellow.
    expect(output).toContain(paint.unknown(colorTheme.icons.unknown));
    // Parenthetical (including the `unknown` word) is dim so the ⚠
    // carries the alarm and the detail fades.
    expect(output).toContain(
      paint.dim('unknown (parser: legacy checkbox format detected)'),
    );
  });

  it('broken-link rows dim the `[missing parent: …]` suffix while keeping the ✗ red', () => {
    const broken = makeRecord({
      type: 'tasks',
      path: 'specs/lost/01-dangling.tasks.md',
      title: 'Dangling',
      status: 'not-started',
      parent_path: 'specs/deleted/deleted.spec.md',
      parent_missing: true,
    });
    const tree = buildTree([broken]);
    const output = renderTree(tree, { theme: colorTheme });
    // ✗ prefix is red via paint.error.
    expect(output).toContain(paint.error(colorTheme.icons.error));
    // `[missing parent: ...]` is dim.
    expect(output).toContain(
      paint.dim('[missing parent: specs/deleted/deleted.spec.md]'),
    );
  });
});

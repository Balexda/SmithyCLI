import { describe, expect, it } from 'vitest';
// Import through the `./index.js` barrel so these tests also assert
// that `buildTree` and its supporting types are re-exported on the
// stable public surface.
import {
  buildTree,
  BROKEN_LINKS_PATH,
  ORPHANED_SPECS_PATH,
  ORPHANED_TASKS_PATH,
  type ArtifactRecord,
  type ArtifactType,
  type DependencyOrderTable,
  type StatusTree,
  type TreeNode,
} from './index.js';

/**
 * Build a minimal `ArtifactRecord` for tree tests. Only the fields
 * `buildTree` actually consults (`type`, `path`, `parent_path`,
 * `parent_missing`, `virtual`) carry semantic weight; the rest are
 * padded with sensible defaults so the tests read clearly at call
 * sites.
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

/**
 * Walk a `StatusTree` and collect every node's wrapped record path,
 * including the synthesized group sentinels. Used for "every real
 * record appears exactly once" assertions.
 */
function collectPaths(tree: StatusTree): string[] {
  const out: string[] = [];
  const visit = (node: TreeNode): void => {
    out.push(node.record.path);
    for (const child of node.children) visit(child);
  };
  for (const root of tree.roots) visit(root);
  return out;
}

describe('buildTree — empty input', () => {
  it('returns an empty roots array without throwing', () => {
    const tree = buildTree([]);
    expect(tree).toEqual({ roots: [] });
  });
});

describe('buildTree — full RFC → features → spec → tasks chain', () => {
  const rfc = makeRecord({
    type: 'rfc',
    path: 'docs/rfcs/0001-demo.rfc.md',
    title: 'Demo RFC',
    parent_path: null,
  });
  const features = makeRecord({
    type: 'features',
    path: 'docs/rfcs/0001-demo.features.md',
    title: 'Demo Features',
    parent_path: 'docs/rfcs/0001-demo.rfc.md',
  });
  const spec = makeRecord({
    type: 'spec',
    path: 'specs/feature-a/feature-a.spec.md',
    title: 'Feature A',
    parent_path: 'docs/rfcs/0001-demo.features.md',
  });
  const tasks = makeRecord({
    type: 'tasks',
    path: 'specs/feature-a/01-story.tasks.md',
    title: 'Story',
    parent_path: 'specs/feature-a/feature-a.spec.md',
  });

  it('nests every record under its ancestor so the deepest tasks node is reachable by walking children four levels deep', () => {
    const tree = buildTree([rfc, features, spec, tasks]);

    expect(tree.roots).toHaveLength(1);
    const rfcNode = tree.roots[0]!;
    expect(rfcNode.record.path).toBe(rfc.path);
    expect(rfcNode.children).toHaveLength(1);

    const featuresNode = rfcNode.children[0]!;
    expect(featuresNode.record.path).toBe(features.path);
    expect(featuresNode.children).toHaveLength(1);

    const specNode = featuresNode.children[0]!;
    expect(specNode.record.path).toBe(spec.path);
    expect(specNode.children).toHaveLength(1);

    const tasksNode = specNode.children[0]!;
    expect(tasksNode.record.path).toBe(tasks.path);
    expect(tasksNode.children).toHaveLength(0);
  });

  it('attaches children correctly even when they appear before their parent in the input array', () => {
    // Reverse order — children first — should still yield the same tree.
    const tree = buildTree([tasks, spec, features, rfc]);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]!.record.path).toBe(rfc.path);
    expect(
      tree.roots[0]!.children[0]!.children[0]!.children[0]!.record.path,
    ).toBe(tasks.path);
  });

  it('visits every real record exactly once across the whole tree', () => {
    const tree = buildTree([rfc, features, spec, tasks]);
    const paths = collectPaths(tree);
    expect(paths).toEqual([rfc.path, features.path, spec.path, tasks.path]);
  });
});

describe('buildTree — orphaned specs', () => {
  it('surfaces a spec with parent_path=null under a synthetic Orphaned Specs group at the top of roots', () => {
    const rfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/0001-demo.rfc.md',
      parent_path: null,
    });
    const orphanSpec = makeRecord({
      type: 'spec',
      path: 'specs/orphan/orphan.spec.md',
      title: 'Orphan',
      parent_path: null,
    });

    const tree = buildTree([rfc, orphanSpec]);

    // Group node comes first so it visually floats to the top of roots.
    expect(tree.roots[0]!.record.path).toBe(ORPHANED_SPECS_PATH);
    expect(tree.roots[0]!.record.title).toBe('Orphaned Specs');
    expect(tree.roots[0]!.children).toHaveLength(1);
    expect(tree.roots[0]!.children[0]!.record.path).toBe(orphanSpec.path);

    // The real RFC still makes it onto roots below the group.
    const realRoots = tree.roots.filter(
      (n) => n.record.path !== ORPHANED_SPECS_PATH,
    );
    expect(realRoots).toHaveLength(1);
    expect(realRoots[0]!.record.path).toBe(rfc.path);
  });

  it('also groups a spec whose parent_path field is entirely omitted (undefined) under Orphaned Specs', () => {
    const orphanSpec = makeRecord({
      type: 'spec',
      path: 'specs/orphan/orphan.spec.md',
      title: 'Orphan',
      // No parent_path key at all.
    });
    delete orphanSpec.parent_path;

    const tree = buildTree([orphanSpec]);

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]!.record.path).toBe(ORPHANED_SPECS_PATH);
    expect(tree.roots[0]!.children[0]!.record.path).toBe(orphanSpec.path);
  });

  it('does NOT group virtual spec records under Orphaned Specs (they always have a parent by scanner construction)', () => {
    // Guard against a regression where virtual specs (which by
    // construction always have a non-null parent_path) leak into the
    // orphan bucket.
    const parent = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001-demo.features.md',
      parent_path: null,
    });
    const virtualSpec = makeRecord({
      type: 'spec',
      path: 'specs/virtual/virtual.spec.md',
      parent_path: 'docs/rfcs/0001-demo.features.md',
      virtual: true,
    });

    const tree = buildTree([parent, virtualSpec]);

    // No Orphaned Specs group should appear.
    expect(tree.roots.find((n) => n.record.path === ORPHANED_SPECS_PATH)).toBeUndefined();
    // Virtual spec is a child of its parent features record.
    expect(tree.roots[0]!.children[0]!.record.path).toBe(virtualSpec.path);
  });

  it('does NOT group non-spec records (e.g. orphan tasks without parent_missing) under Orphaned Specs', () => {
    // Only specs belong in the Orphaned Specs bucket per AS 2.2.
    // Real orphan tasks are routed to the dedicated "Orphaned Tasks"
    // error group instead — rendering them as top-level roots would
    // hide an error condition (every `.tasks.md` on disk is expected
    // to link to a spec).
    const orphanTasks = makeRecord({
      type: 'tasks',
      path: 'specs/lost/01-lost.tasks.md',
      parent_path: null,
    });

    const tree = buildTree([orphanTasks]);

    // Not routed to Orphaned Specs (that group is spec-only).
    expect(tree.roots.find((n) => n.record.path === ORPHANED_SPECS_PATH)).toBeUndefined();
    // Not routed to Broken Links either (parent_missing is not set).
    expect(tree.roots.find((n) => n.record.path === BROKEN_LINKS_PATH)).toBeUndefined();
    // Routed to the Orphaned Tasks error group.
    const orphanTasksGroup = tree.roots.find(
      (n) => n.record.path === ORPHANED_TASKS_PATH,
    );
    expect(orphanTasksGroup).toBeDefined();
    expect(orphanTasksGroup?.children).toHaveLength(1);
    expect(orphanTasksGroup?.children[0]?.record.path).toBe(orphanTasks.path);
    expect(tree.roots).toHaveLength(1);
  });

  it('does NOT route a tasks record with parent_path omitted (undefined) to Orphaned Tasks', () => {
    // The scanner deliberately leaves `parent_path` undefined (rather
    // than setting it to `null`) for tasks files it could not read —
    // those records carry a `read_error:` warning and represent
    // genuinely unknown parent state, not "definitively no parent".
    // Classifying them as orphans would surface transient I/O or
    // permission failures as ERROR output, which is wrong. They must
    // fall through to top-level roots.
    const unknownParentTasks = makeRecord({
      type: 'tasks',
      path: 'specs/unreadable/01-blocked.tasks.md',
      // parent_path deliberately omitted — defaults to undefined.
      warnings: ['read_error: EACCES: permission denied'],
      status: 'unknown',
    });

    const tree = buildTree([unknownParentTasks]);

    expect(
      tree.roots.find((n) => n.record.path === ORPHANED_TASKS_PATH),
    ).toBeUndefined();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.record.path).toBe(unknownParentTasks.path);
  });
});

describe('buildTree — broken links', () => {
  it('surfaces a tasks record with parent_missing=true under a synthetic Broken Links group', () => {
    const broken = makeRecord({
      type: 'tasks',
      path: 'specs/lost/01-dangling.tasks.md',
      title: 'Dangling',
      parent_path: 'specs/deleted/deleted.spec.md',
      parent_missing: true,
    });

    const tree = buildTree([broken]);

    expect(tree.roots).toHaveLength(1);
    const group = tree.roots[0]!;
    expect(group.record.path).toBe(BROKEN_LINKS_PATH);
    expect(group.record.title).toBe('Broken Links');
    expect(group.children).toHaveLength(1);

    const brokenNode = group.children[0]!;
    expect(brokenNode.record.path).toBe(broken.path);
    // The dangling parent path is still recoverable directly from the
    // wrapped record — downstream renderers will print it alongside
    // the node's title.
    expect(brokenNode.record.parent_path).toBe('specs/deleted/deleted.spec.md');
    expect(brokenNode.record.parent_missing).toBe(true);
  });

  it('orders Orphaned Specs before Broken Links when both groups are populated', () => {
    const orphanSpec = makeRecord({
      type: 'spec',
      path: 'specs/orphan/orphan.spec.md',
      parent_path: null,
    });
    const brokenTasks = makeRecord({
      type: 'tasks',
      path: 'specs/lost/01-dangling.tasks.md',
      parent_path: 'specs/deleted/deleted.spec.md',
      parent_missing: true,
    });

    const tree = buildTree([orphanSpec, brokenTasks]);

    const groupPaths = tree.roots
      .filter((n) => n.record.path.startsWith('__'))
      .map((n) => n.record.path);
    expect(groupPaths).toEqual([ORPHANED_SPECS_PATH, BROKEN_LINKS_PATH]);
  });
});

describe('buildTree — purity and ordering', () => {
  it('is a pure function: same input produces deeply-equal output on repeat calls', () => {
    const records: ArtifactRecord[] = [
      makeRecord({ type: 'rfc', path: 'docs/rfcs/0001.rfc.md', parent_path: null }),
      makeRecord({
        type: 'features',
        path: 'docs/rfcs/0001.features.md',
        parent_path: 'docs/rfcs/0001.rfc.md',
      }),
    ];
    const first = buildTree(records);
    const second = buildTree(records);
    expect(second).toEqual(first);
  });

  it('does not mutate its input records', () => {
    const records: ArtifactRecord[] = [
      makeRecord({
        type: 'spec',
        path: 'specs/orphan/orphan.spec.md',
        parent_path: null,
      }),
      makeRecord({
        type: 'tasks',
        path: 'specs/lost/01-dangling.tasks.md',
        parent_path: 'specs/deleted/deleted.spec.md',
        parent_missing: true,
      }),
    ];
    const snapshot = JSON.parse(JSON.stringify(records)) as ArtifactRecord[];
    buildTree(records);
    expect(records).toEqual(snapshot);
  });

  it('preserves input order across sibling children', () => {
    const parent = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/0001.rfc.md',
      parent_path: null,
    });
    const childA = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001-a.features.md',
      title: 'A',
      parent_path: 'docs/rfcs/0001.rfc.md',
    });
    const childB = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001-b.features.md',
      title: 'B',
      parent_path: 'docs/rfcs/0001.rfc.md',
    });

    const tree = buildTree([parent, childA, childB]);
    expect(tree.roots[0]!.children.map((n) => n.record.title)).toEqual(['A', 'B']);

    // Flip the sibling order and verify the output flips too.
    const flipped = buildTree([parent, childB, childA]);
    expect(flipped.roots[0]!.children.map((n) => n.record.title)).toEqual(['B', 'A']);
  });

  it('places every real record exactly once even in a mixed-shape input', () => {
    const rfc = makeRecord({ type: 'rfc', path: 'docs/rfcs/0001.rfc.md', parent_path: null });
    const features = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001.features.md',
      parent_path: 'docs/rfcs/0001.rfc.md',
    });
    const spec = makeRecord({
      type: 'spec',
      path: 'specs/feature-a/feature-a.spec.md',
      parent_path: 'docs/rfcs/0001.features.md',
    });
    const tasks = makeRecord({
      type: 'tasks',
      path: 'specs/feature-a/01-story.tasks.md',
      parent_path: 'specs/feature-a/feature-a.spec.md',
    });
    const orphanSpec = makeRecord({
      type: 'spec',
      path: 'specs/orphan/orphan.spec.md',
      parent_path: null,
    });
    const broken = makeRecord({
      type: 'tasks',
      path: 'specs/lost/01-dangling.tasks.md',
      parent_path: 'specs/deleted/deleted.spec.md',
      parent_missing: true,
    });

    const input = [rfc, features, spec, tasks, orphanSpec, broken];
    const tree = buildTree(input);
    const paths = collectPaths(tree);

    // Every real record path is present exactly once.
    for (const rec of input) {
      const occurrences = paths.filter((p) => p === rec.path).length;
      expect(occurrences).toBe(1);
    }

    // Group sentinels appear once each.
    expect(paths.filter((p) => p === ORPHANED_SPECS_PATH)).toHaveLength(1);
    expect(paths.filter((p) => p === BROKEN_LINKS_PATH)).toHaveLength(1);
  });
});

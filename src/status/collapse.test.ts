import { describe, expect, it } from 'vitest';
// Import through the `./index.js` barrel so these tests also assert
// that `collapseTree` is re-exported on the stable public surface.
import {
  BROKEN_LINKS_PATH,
  ORPHANED_SPECS_PATH,
  ORPHANED_TASKS_PATH,
  collapseTree,
  type ArtifactRecord,
  type ArtifactType,
  type DependencyOrderTable,
  type Status,
  type StatusTree,
  type TreeNode,
} from './index.js';

/**
 * Build a minimal `ArtifactRecord` for collapse tests. Mirrors the
 * helper in `tree.test.ts` — only the fields `collapseTree` actually
 * consults (`path`, `status`) carry semantic weight; the rest are
 * padded with sensible defaults so call sites stay readable.
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

/** Wrap a record in a leaf `TreeNode` with no children. */
function leaf(record: ArtifactRecord): TreeNode {
  return { record, children: [] };
}

/** Wrap a record in a `TreeNode` with the supplied children. */
function node(record: ArtifactRecord, children: TreeNode[]): TreeNode {
  return { record, children };
}

/** Walk a `StatusTree` and collect every node's wrapped record path. */
function collectPaths(tree: StatusTree): string[] {
  const out: string[] = [];
  const visit = (n: TreeNode): void => {
    out.push(n.record.path);
    for (const child of n.children) visit(child);
  };
  for (const root of tree.roots) visit(root);
  return out;
}

/**
 * Build a synthetic group sentinel `TreeNode` analogous to what
 * `buildTree` prepends to `roots`. Used to verify collapse passes
 * group nodes through regardless of their synthesized
 * `status: 'unknown'`.
 */
function groupNode(
  path: string,
  title: string,
  type: ArtifactType,
  status: Status,
  children: TreeNode[],
): TreeNode {
  const record: ArtifactRecord = {
    type,
    path,
    title,
    status,
    virtual: true,
    dependency_order: {
      rows: [],
      id_prefix: type === 'spec' ? 'US' : 'S',
      format: 'missing',
    },
    warnings: [],
  };
  return { record, children };
}

describe('collapseTree — empty input', () => {
  it('returns an empty roots array without throwing', () => {
    const tree: StatusTree = { roots: [] };
    const collapsed = collapseTree(tree);
    expect(collapsed).toEqual({ roots: [] });
  });

  it('honors --all on an empty tree', () => {
    const tree: StatusTree = { roots: [] };
    const collapsed = collapseTree(tree, { all: true });
    expect(collapsed).toEqual({ roots: [] });
  });
});

describe('collapseTree — done-node collapse', () => {
  it('collapses a done leaf to a node with the same record and an empty children array', () => {
    const doneRecord = makeRecord({
      type: 'tasks',
      path: 'specs/feature-a/01-story.tasks.md',
      status: 'done',
    });
    const tree: StatusTree = { roots: [leaf(doneRecord)] };

    const collapsed = collapseTree(tree);

    expect(collapsed.roots).toHaveLength(1);
    expect(collapsed.roots[0]!.record).toEqual(doneRecord);
    expect(collapsed.roots[0]!.children).toEqual([]);
  });

  it('collapses a done parent so none of its descendants are emitted', () => {
    const doneFeatures = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001.features.md',
      status: 'done',
    });
    const childSpec = makeRecord({
      type: 'spec',
      path: 'specs/feature-a/feature-a.spec.md',
      status: 'done',
    });
    const grandchildTasks = makeRecord({
      type: 'tasks',
      path: 'specs/feature-a/01-story.tasks.md',
      status: 'done',
    });
    const tree: StatusTree = {
      roots: [node(doneFeatures, [node(childSpec, [leaf(grandchildTasks)])])],
    };

    const collapsed = collapseTree(tree);

    expect(collapsed.roots).toHaveLength(1);
    expect(collapsed.roots[0]!.record.path).toBe(doneFeatures.path);
    expect(collapsed.roots[0]!.children).toEqual([]);
    // The descendants are not reachable anywhere in the output.
    const paths = collectPaths(collapsed);
    expect(paths).not.toContain(childSpec.path);
    expect(paths).not.toContain(grandchildTasks.path);
  });

  it('collapses a done subtree even when its descendants are not themselves done', () => {
    // Per AS 3.1/3.3/3.4, the rule is "if the node is done, its
    // subtree disappears" — we do not look at descendant status.
    const doneParent = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001.features.md',
      status: 'done',
    });
    const inProgressChild = makeRecord({
      type: 'spec',
      path: 'specs/feature-a/feature-a.spec.md',
      status: 'in-progress',
    });
    const tree: StatusTree = {
      roots: [node(doneParent, [leaf(inProgressChild)])],
    };

    const collapsed = collapseTree(tree);

    expect(collapsed.roots[0]!.children).toEqual([]);
    expect(collectPaths(collapsed)).toEqual([doneParent.path]);
  });
});

describe('collapseTree — partial subtree preservation', () => {
  it('keeps descendants under a non-done parent and recurses into its children', () => {
    const parent = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/0001.rfc.md',
      status: 'in-progress',
    });
    const doneChild = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001.features.md',
      status: 'done',
    });
    const doneChildDescendant = makeRecord({
      type: 'spec',
      path: 'specs/feature-a/feature-a.spec.md',
      status: 'done',
    });
    const liveChild = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001-other.features.md',
      status: 'in-progress',
    });
    const liveChildDescendant = makeRecord({
      type: 'spec',
      path: 'specs/other/other.spec.md',
      status: 'not-started',
    });
    const tree: StatusTree = {
      roots: [
        node(parent, [
          node(doneChild, [leaf(doneChildDescendant)]),
          node(liveChild, [leaf(liveChildDescendant)]),
        ]),
      ],
    };

    const collapsed = collapseTree(tree);

    expect(collapsed.roots).toHaveLength(1);
    const collapsedParent = collapsed.roots[0]!;
    expect(collapsedParent.record.path).toBe(parent.path);
    // Both direct children still appear under the live parent.
    expect(collapsedParent.children.map((c) => c.record.path)).toEqual([
      doneChild.path,
      liveChild.path,
    ]);
    // Done child: subtree pruned.
    const collapsedDoneChild = collapsedParent.children[0]!;
    expect(collapsedDoneChild.children).toEqual([]);
    // Live child: descendant preserved (recursion into live branch).
    const collapsedLiveChild = collapsedParent.children[1]!;
    expect(collapsedLiveChild.children.map((c) => c.record.path)).toEqual([
      liveChildDescendant.path,
    ]);
  });

  it('preserves descendants under a non-done record whose status is unknown or not-started', () => {
    const statuses: Status[] = ['not-started', 'in-progress', 'unknown'];
    for (const status of statuses) {
      const parent = makeRecord({
        type: 'rfc',
        path: `docs/rfcs/${status}.rfc.md`,
        status,
      });
      const child = makeRecord({
        type: 'features',
        path: `docs/rfcs/${status}.features.md`,
        status: 'not-started',
      });
      const tree: StatusTree = { roots: [node(parent, [leaf(child)])] };

      const collapsed = collapseTree(tree);
      expect(collapsed.roots[0]!.children).toHaveLength(1);
      expect(collapsed.roots[0]!.children[0]!.record.path).toBe(child.path);
    }
  });
});

describe('collapseTree — --all bypass', () => {
  it('returns a tree where every record from the input remains reachable when options.all === true', () => {
    const rfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/0001.rfc.md',
      status: 'done',
    });
    const features = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001.features.md',
      status: 'done',
    });
    const spec = makeRecord({
      type: 'spec',
      path: 'specs/feature-a/feature-a.spec.md',
      status: 'done',
    });
    const tasks = makeRecord({
      type: 'tasks',
      path: 'specs/feature-a/01-story.tasks.md',
      status: 'done',
    });
    const tree: StatusTree = {
      roots: [node(rfc, [node(features, [node(spec, [leaf(tasks)])])])],
    };

    const collapsed = collapseTree(tree, { all: true });

    const paths = collectPaths(collapsed);
    expect(paths).toEqual([rfc.path, features.path, spec.path, tasks.path]);
  });

  it('treats options.all === false the same as the default (still collapses done subtrees)', () => {
    const doneRfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/0001.rfc.md',
      status: 'done',
    });
    const child = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001.features.md',
      status: 'done',
    });
    const tree: StatusTree = { roots: [node(doneRfc, [leaf(child)])] };

    const collapsed = collapseTree(tree, { all: false });

    expect(collapsed.roots[0]!.children).toEqual([]);
  });

  it('treats options undefined the same as no options bag', () => {
    const doneRfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/0001.rfc.md',
      status: 'done',
    });
    const child = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001.features.md',
      status: 'done',
    });
    const tree: StatusTree = { roots: [node(doneRfc, [leaf(child)])] };

    const defaultCollapsed = collapseTree(tree);
    const undefinedCollapsed = collapseTree(tree, undefined);
    expect(undefinedCollapsed).toEqual(defaultCollapsed);
  });
});

describe('collapseTree — group sentinel passthrough', () => {
  it('does not collapse Orphaned Specs, Broken Links, or Orphaned Tasks groups even though they have synthesized status', () => {
    const orphanSpec = makeRecord({
      type: 'spec',
      path: 'specs/orphan/orphan.spec.md',
      status: 'not-started',
    });
    const brokenTasks = makeRecord({
      type: 'tasks',
      path: 'specs/lost/01-dangling.tasks.md',
      status: 'unknown',
      parent_missing: true,
    });
    const orphanTasks = makeRecord({
      type: 'tasks',
      path: 'specs/lost/01-lost.tasks.md',
      status: 'not-started',
    });

    // Simulate a buildTree output where group sentinels carry
    // `status: 'unknown'` (the current synthesis). Use a few status
    // values to verify none of them trigger the done-collapse rule
    // and, more importantly, to confirm path-based detection wins
    // over status-based detection.
    const tree: StatusTree = {
      roots: [
        groupNode(ORPHANED_SPECS_PATH, 'Orphaned Specs', 'spec', 'unknown', [
          leaf(orphanSpec),
        ]),
        groupNode(BROKEN_LINKS_PATH, 'Broken Links', 'tasks', 'done', [
          leaf(brokenTasks),
        ]),
        groupNode(ORPHANED_TASKS_PATH, 'Orphaned Tasks', 'tasks', 'done', [
          leaf(orphanTasks),
        ]),
      ],
    };

    const collapsed = collapseTree(tree);

    expect(collapsed.roots).toHaveLength(3);
    expect(collapsed.roots[0]!.children.map((c) => c.record.path)).toEqual([
      orphanSpec.path,
    ]);
    expect(collapsed.roots[1]!.children.map((c) => c.record.path)).toEqual([
      brokenTasks.path,
    ]);
    expect(collapsed.roots[2]!.children.map((c) => c.record.path)).toEqual([
      orphanTasks.path,
    ]);
  });

  it('still collapses a done descendant of a group sentinel node', () => {
    // Group sentinels pass through, but the collapse rule still
    // applies to their children's children — i.e. a done subtree
    // below an Orphaned Specs heading should collapse normally.
    const doneChild = makeRecord({
      type: 'spec',
      path: 'specs/orphan/orphan.spec.md',
      status: 'done',
    });
    const grandchild = makeRecord({
      type: 'tasks',
      path: 'specs/orphan/01-story.tasks.md',
      status: 'not-started',
    });
    const tree: StatusTree = {
      roots: [
        groupNode(ORPHANED_SPECS_PATH, 'Orphaned Specs', 'spec', 'unknown', [
          node(doneChild, [leaf(grandchild)]),
        ]),
      ],
    };

    const collapsed = collapseTree(tree);

    const group = collapsed.roots[0]!;
    expect(group.record.path).toBe(ORPHANED_SPECS_PATH);
    expect(group.children).toHaveLength(1);
    expect(group.children[0]!.record.path).toBe(doneChild.path);
    // The done spec's descendants vanish even though it lives under a sentinel.
    expect(group.children[0]!.children).toEqual([]);
  });
});

describe('collapseTree — purity and stability', () => {
  it('does not mutate its input tree, nodes, or records', () => {
    const doneParent = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001.features.md',
      status: 'done',
    });
    const child = makeRecord({
      type: 'spec',
      path: 'specs/feature-a/feature-a.spec.md',
      status: 'in-progress',
    });
    const liveParent = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/0002.rfc.md',
      status: 'in-progress',
    });
    const liveChild = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0002.features.md',
      status: 'not-started',
    });
    const tree: StatusTree = {
      roots: [
        node(doneParent, [leaf(child)]),
        node(liveParent, [leaf(liveChild)]),
      ],
    };
    const snapshot = JSON.parse(JSON.stringify(tree));

    collapseTree(tree);
    collapseTree(tree, { all: true });

    expect(JSON.parse(JSON.stringify(tree))).toEqual(snapshot);
  });

  it('returns a new tree object and new node objects (does not alias the input)', () => {
    const doneParent = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001.features.md',
      status: 'done',
    });
    const child = makeRecord({
      type: 'spec',
      path: 'specs/feature-a/feature-a.spec.md',
      status: 'in-progress',
    });
    const tree: StatusTree = { roots: [node(doneParent, [leaf(child)])] };

    const collapsed = collapseTree(tree);

    expect(collapsed).not.toBe(tree);
    expect(collapsed.roots).not.toBe(tree.roots);
    // The collapsed done node must be a fresh object — we strip its
    // children, so it cannot safely alias the input.
    expect(collapsed.roots[0]).not.toBe(tree.roots[0]);
  });

  it('is stable on a second pass: collapseTree(collapseTree(x)) deep-equals collapseTree(x)', () => {
    const rfc = makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/0001.rfc.md',
      status: 'in-progress',
    });
    const doneFeatures = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001.features.md',
      status: 'done',
    });
    const droppedSpec = makeRecord({
      type: 'spec',
      path: 'specs/feature-a/feature-a.spec.md',
      status: 'in-progress',
    });
    const liveFeatures = makeRecord({
      type: 'features',
      path: 'docs/rfcs/0001-other.features.md',
      status: 'not-started',
    });
    const tree: StatusTree = {
      roots: [
        node(rfc, [
          node(doneFeatures, [leaf(droppedSpec)]),
          leaf(liveFeatures),
        ]),
      ],
    };

    const once = collapseTree(tree);
    const twice = collapseTree(once);
    expect(twice).toEqual(once);
  });

  it('produces deep-equal output on repeat calls from the same input', () => {
    const tree: StatusTree = {
      roots: [
        node(
          makeRecord({
            type: 'rfc',
            path: 'docs/rfcs/0001.rfc.md',
            status: 'done',
          }),
          [
            leaf(
              makeRecord({
                type: 'features',
                path: 'docs/rfcs/0001.features.md',
                status: 'in-progress',
              }),
            ),
          ],
        ),
      ],
    };

    expect(collapseTree(tree)).toEqual(collapseTree(tree));
  });
});

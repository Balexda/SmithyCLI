/**
 * Pure tree projection over the flat `ArtifactRecord[]` produced by
 * {@link scan}. Turns a scan result into the hierarchical
 * {@link StatusTree} described in §7 of `smithy-status-skill.data-model.md`:
 * nested parent/child nodes plus two implicit top-level group nodes,
 * "Orphaned Specs" and "Broken Links", that are emitted only when they
 * have members.
 *
 * This module is deliberately side-effect-free. `buildTree` performs no
 * I/O, never mutates its input, and returns the same tree for the same
 * input — the tree is a pure projection of the records supplied to it.
 *
 * ## Grouping rules
 *
 * For each record, in input order:
 *
 * 1. If `parent_missing === true`, the record goes under the synthetic
 *    "Broken Links" group. The record retains its declared
 *    (now-dangling) `parent_path`, so renderers can surface the missing
 *    reference alongside the node's title.
 *
 * 2. Otherwise, if the record is a real `spec` whose `parent_path` is
 *    `null` or absent, it goes under the synthetic "Orphaned Specs"
 *    group. Per AS 2.2, this corresponds to specs created directly
 *    without a feature map pointing at them; virtual records always have
 *    a non-null `parent_path` set by the scanner, so they never land in
 *    this bucket. Non-spec orphans (an `rfc`, `features`, or `tasks`
 *    record with no parent and not flagged `parent_missing`) simply
 *    become top-level roots — narrowing the "Orphaned Specs" heading to
 *    specs matches the data-model wording.
 *
 * 3. Otherwise, if the record has a `parent_path` that resolves to
 *    another record in the same input set, the new node is attached as
 *    a child of its parent's node.
 *
 * 4. Otherwise (no parent, and not falling under any synthetic group —
 *    e.g., a top-level RFC, or a non-spec whose parent could not be
 *    resolved), the node is attached directly to `roots`.
 *
 * Input order is preserved at every level: siblings appear in the order
 * their records appeared in the input array, and the group nodes are
 * prepended to `roots` in a fixed order (Orphaned Specs first, then
 * Broken Links) when populated, so the same input always yields the
 * same tree.
 *
 * ## Synthetic group nodes
 *
 * `TreeNode` "carries no additional data" (see `types.ts`), so group
 * nodes are modelled as real `TreeNode` values whose wrapped
 * `ArtifactRecord` is a synthesized sentinel rather than a real file
 * record. The sentinels use reserved `path` values (`__orphaned_specs__`
 * and `__broken_links__`) and set `virtual: true` so consumers can
 * cheaply detect them via `record.path.startsWith('__')`. This choice
 * keeps the `TreeNode` shape aligned with the data model while giving
 * the Slice 2 renderer (`renderTree`) a clear, documented contract for
 * locating the group headings. See SD-010 for the narrowed Broken
 * Links scope.
 *
 * Every real record appears in the tree exactly once. An empty input
 * yields `{ roots: [] }`.
 */

import type {
  ArtifactRecord,
  ArtifactType,
  StatusTree,
  TreeNode,
} from './types.js';

/**
 * Reserved `path` value on the synthetic "Orphaned Specs" group node.
 * Renderers MUST detect group nodes by this exact value (or the
 * analogous {@link BROKEN_LINKS_PATH}), not by title equality.
 */
export const ORPHANED_SPECS_PATH = '__orphaned_specs__';

/**
 * Reserved `path` value on the synthetic "Broken Links" group node.
 * See {@link ORPHANED_SPECS_PATH} for the detection convention.
 */
export const BROKEN_LINKS_PATH = '__broken_links__';

/**
 * Reserved `path` value on the synthetic "Orphaned Tasks" group node.
 * Real tasks records whose `parent_path` is `null` (no parent-dep-order
 * row and no resolvable `**Source**:` header) land here. They are
 * always an error condition — every on-disk tasks file is expected to
 * be linked to a spec — so renderers surface them with an explicit
 * ERROR prefix instead of a normal tree row.
 */
export const ORPHANED_TASKS_PATH = '__orphaned_tasks__';

const ORPHANED_SPECS_TITLE = 'Orphaned Specs';
const BROKEN_LINKS_TITLE = 'Broken Links';
const ORPHANED_TASKS_TITLE = 'Orphaned Tasks';

/**
 * Project a flat `ArtifactRecord[]` into a {@link StatusTree}. Pure
 * function — does no I/O and does not mutate its input. See the
 * module-level JSDoc for the grouping rules.
 */
export function buildTree(records: ArtifactRecord[]): StatusTree {
  if (records.length === 0) {
    return { roots: [] };
  }

  // One node per real record, keyed by repo-relative path. We create
  // the nodes up front so that children can be attached to their
  // parents regardless of input order — a child whose parent appears
  // later in the array still finds a node to attach to.
  const nodesByPath = new Map<string, TreeNode>();
  for (const record of records) {
    // Defensive: if two records share a path, the first one wins. The
    // scanner already reports this as a collision warning; buildTree
    // does not need to re-flag it.
    if (nodesByPath.has(record.path)) continue;
    nodesByPath.set(record.path, { record, children: [] });
  }

  const roots: TreeNode[] = [];
  const orphanedSpecs: TreeNode[] = [];
  const brokenLinks: TreeNode[] = [];
  const orphanedTasks: TreeNode[] = [];

  for (const record of records) {
    const node = nodesByPath.get(record.path);
    // `node` is only undefined when this record lost a path collision
    // above — skip it so it is never placed in the tree twice.
    if (node === undefined || node.record !== record) continue;

    if (record.parent_missing === true) {
      brokenLinks.push(node);
      continue;
    }

    const hasParent =
      record.parent_path !== undefined && record.parent_path !== null;

    if (!hasParent) {
      if (record.type === 'spec' && record.virtual !== true) {
        orphanedSpecs.push(node);
      } else if (record.type === 'tasks' && record.virtual !== true) {
        // Real tasks files should always be claimed by a spec row or
        // declare a `**Source**:` header. An on-disk tasks file with
        // no parent is an error condition — surface it through the
        // dedicated "Orphaned Tasks" group so renderers can flag it
        // rather than hiding it among top-level roots.
        orphanedTasks.push(node);
      } else {
        roots.push(node);
      }
      continue;
    }

    // Attach to the parent node if we can find one in the input set.
    // `hasParent` guarantees `parent_path` is a non-null string here.
    const parentPath = record.parent_path as string;
    const parentNode = nodesByPath.get(parentPath);
    if (parentNode !== undefined) {
      parentNode.children.push(node);
    } else if (record.type === 'tasks' && record.virtual !== true) {
      // Real tasks record declares a parent that is not present in
      // the input set. Treat it as orphaned rather than dropping it
      // silently as a top-level root.
      orphanedTasks.push(node);
    } else {
      // Parent referenced but not present in the record set. This
      // shouldn't happen for well-formed scanner output — tasks with
      // missing parents are caught by `parent_missing` above, and
      // other types don't currently carry a declared parent path that
      // could dangle. If it does happen, fall through to top-level
      // roots so the record is not silently dropped.
      roots.push(node);
    }
  }

  // Prepend the populated group nodes in a fixed order so the output
  // is deterministic and the two groups sit "at the top of `roots`" as
  // the data model specifies.
  const finalRoots: TreeNode[] = [];
  if (orphanedSpecs.length > 0) {
    finalRoots.push(makeGroupNode(ORPHANED_SPECS_PATH, ORPHANED_SPECS_TITLE, 'spec', orphanedSpecs));
  }
  if (brokenLinks.length > 0) {
    finalRoots.push(makeGroupNode(BROKEN_LINKS_PATH, BROKEN_LINKS_TITLE, 'tasks', brokenLinks));
  }
  if (orphanedTasks.length > 0) {
    finalRoots.push(makeGroupNode(ORPHANED_TASKS_PATH, ORPHANED_TASKS_TITLE, 'tasks', orphanedTasks));
  }
  for (const node of roots) {
    finalRoots.push(node);
  }

  return { roots: finalRoots };
}

/**
 * Build a synthetic group `TreeNode` wrapping a sentinel
 * `ArtifactRecord`. The sentinel uses a reserved `path` (detectable via
 * the `__` prefix), `virtual: true`, and `status: 'unknown'` because
 * groups are not real lifecycle entities. The wrapped `type` matches
 * the grouping category (`'spec'` for Orphaned Specs, `'tasks'` for
 * Broken Links) purely so the type field stays within the existing
 * `ArtifactType` union — it carries no semantic meaning for group rows.
 */
function makeGroupNode(
  path: string,
  title: string,
  type: ArtifactType,
  children: TreeNode[],
): TreeNode {
  const record: ArtifactRecord = {
    type,
    path,
    title,
    status: 'unknown',
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

/**
 * Pure tree transform that prunes the descendants of any `TreeNode`
 * whose wrapped record is marked `status: 'done'`. Sits between
 * {@link buildTree} and {@link renderTree} in the text-mode status
 * pipeline so the default view collapses fully-finished subtrees to a
 * single row with its `DONE` marker, while `--all` restores the full
 * listing and JSON mode keeps emitting the uncollapsed `buildTree`
 * output unchanged.
 *
 * This module is deliberately side-effect-free. `collapseTree` performs
 * no I/O, never mutates its input tree or any `TreeNode` / record
 * reachable from it, and returns the same output shape for the same
 * input — a second pass on its own output is a stable no-op. Callers
 * can safely keep a reference to the original tree (for JSON mode)
 * while rendering the collapsed copy.
 *
 * ## Collapse rule
 *
 * For each node visited in depth-first input order:
 *
 * 1. Synthetic group sentinels — the Orphaned Specs, Broken Links, and
 *    Orphaned Tasks wrappers emitted by `buildTree` — are always
 *    passed through with their children recursed. `buildTree`
 *    synthesizes them with `status: 'unknown'`, but they are not
 *    lifecycle entities and must never collapse regardless of the
 *    status on their sentinel record. Detection mirrors `render.ts`:
 *    the node's `record.path` equals one of the reserved constants
 *    ({@link ORPHANED_SPECS_PATH}, {@link BROKEN_LINKS_PATH}, or
 *    {@link ORPHANED_TASKS_PATH}).
 *
 * 2. A node whose `record.status === 'done'` is replaced by a fresh
 *    copy carrying the same record reference and an empty `children`
 *    array. The original descendants are not visited or emitted —
 *    callers see one row where the subtree used to be, satisfying
 *    AS 3.1, AS 3.3, and AS 3.4.
 *
 * 3. A node with any other status (`in-progress`, `not-started`,
 *    `unknown`) keeps its descendants; the transform recurses into
 *    each child and collects the recursed results into a fresh
 *    `children` array on the returned node. The original child
 *    references are not reused so mutating the output never touches
 *    the input.
 *
 * ## `--all` bypass
 *
 * When `options.all === true` the transform returns a structurally
 * equivalent tree in which every record reachable in the input
 * remains reachable in the output (AS 3.5). The output is a fresh
 * {@link StatusTree} / `TreeNode` graph — callers get the same
 * immutability guarantees as the default path so the two branches can
 * share a render pipeline without a special case. Any other value
 * (including `undefined` or `false`) takes the default collapsing
 * path; the strict-boolean check matches the `boolean`-typed
 * {@link CollapseTreeOptions.all} field and the CLI caller's
 * `opts.all === true` normalization.
 *
 * An empty input (`{ roots: [] }`) returns `{ roots: [] }` in both
 * modes without throwing.
 */

import {
  BROKEN_LINKS_PATH,
  ORPHANED_SPECS_PATH,
  ORPHANED_TASKS_PATH,
} from './tree.js';
import type { ArtifactRecord, StatusTree, TreeNode } from './types.js';

/**
 * Options accepted by {@link collapseTree}. The single `all` flag is
 * plumbed through from the CLI's `--all` option to bypass collapsing
 * and surface every artifact regardless of status.
 */
export interface CollapseTreeOptions {
  /**
   * When set to `true`, disable done-subtree collapsing and return a
   * tree in which every `ArtifactRecord` reachable in the input
   * remains reachable in the output (AS 3.5). The check is strict
   * (`=== true`) to match the `boolean`-typed field — `undefined` and
   * `false` both take the default collapsing path. The transform
   * still returns a fresh tree so callers retain the purity
   * guarantees.
   */
  all?: boolean;
}

/**
 * Collapse `done` subtrees of `tree` instead of applying a non-pure
 * side-effectful filter. See the module-level JSDoc for the full
 * ruleset and the `--all` bypass contract. Pure function — does no I/O
 * and does not mutate its input.
 */
export function collapseTree(
  tree: StatusTree,
  options: CollapseTreeOptions = {},
): StatusTree {
  const all = options.all === true;
  const roots = tree.roots.map((root) => collapseNode(root, all));
  return { roots };
}

/**
 * Recursive worker. Returns a fresh `TreeNode` for `node`, preserving
 * the wrapped `ArtifactRecord` reference while rebuilding the
 * `children` array. The record itself is never cloned or mutated —
 * downstream consumers (renderers, JSON serializers) get the same
 * record instance they would see in the pre-collapse tree.
 */
function collapseNode(node: TreeNode, all: boolean): TreeNode {
  // Group sentinels (Orphaned Specs, Broken Links, Orphaned Tasks)
  // always pass through with their children recursed. buildTree
  // assigns them `status: 'unknown'`, so the path check must run
  // before the done-collapse rule — otherwise a future change to the
  // synthesized status could accidentally collapse a whole group.
  if (isGroupSentinel(node.record)) {
    return {
      record: node.record,
      children: node.children.map((child) => collapseNode(child, all)),
    };
  }

  // `--all` bypass: retain every descendant while still returning a
  // fresh node so the caller cannot mutate shared structure.
  if (all) {
    return {
      record: node.record,
      children: node.children.map((child) => collapseNode(child, all)),
    };
  }

  // Done node: prune the subtree. The record reference is carried
  // over unchanged so renderers can still read the title / status /
  // marker from the same object they would see in the uncollapsed
  // tree.
  if (node.record.status === 'done') {
    return { record: node.record, children: [] };
  }

  // Non-done node: recurse into its children.
  return {
    record: node.record,
    children: node.children.map((child) => collapseNode(child, all)),
  };
}

/**
 * Detect the synthetic group wrappers emitted by `buildTree`. Matches
 * on the reserved `path` constants rather than title equality so the
 * check is cheap and precise, mirroring `render.ts`'s sentinel
 * detection.
 */
function isGroupSentinel(record: ArtifactRecord): boolean {
  return (
    record.path === ORPHANED_SPECS_PATH ||
    record.path === BROKEN_LINKS_PATH ||
    record.path === ORPHANED_TASKS_PATH
  );
}

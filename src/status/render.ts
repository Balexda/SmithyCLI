/**
 * Pure text rendering over the {@link StatusTree} produced by
 * {@link buildTree}. Walks the tree in depth-first, input-order and
 * emits a block of lines suitable for writing to stdout in text mode.
 *
 * This module is deliberately side-effect-free. `renderTree` performs
 * no I/O, does not touch `process.stdout`, and never mutates its
 * input — the output is a pure function of the tree (and the options
 * bag).
 *
 * ## Layout
 *
 * - Top-level nodes (`tree.roots`) are emitted flush-left, one line
 *   per node, with no connector prefix. The synthetic "Orphaned Specs"
 *   and "Broken Links" group nodes emitted by `buildTree` render as
 *   plain top-level headings here — their members are then nested
 *   beneath them like any other children.
 *
 * - Every non-root node is preceded by a tree connector drawn from the
 *   classic box-drawing set: `├─ ` for non-last siblings, `└─ ` for
 *   the last sibling of each parent. Descendants of a non-last sibling
 *   inherit a `│  ` spacer; descendants of the last sibling inherit a
 *   blank spacer, so vertical bars trail only the branches that still
 *   have siblings below them.
 *
 * - Each rendered line uses the record's `title` as the primary label
 *   — file paths intentionally stay out of the visual field and live
 *   only in the JSON payload. Broken-link records additionally append
 *   their dangling `parent_path` so reviewers can see what the source
 *   file claims without opening it.
 *
 * ## Status markers
 *
 * Every real record (every non-group node) carries a trailing status
 * marker separated from the label by two spaces. The exact mapping is:
 *
 * | Record state | Marker |
 * |--------------|--------|
 * | `status === 'done'` | `DONE` |
 * | `status === 'in-progress'` on a tasks record | `<completed>/<total>` |
 * | `status === 'in-progress'` on a parent record | `in progress` |
 * | `status === 'not-started'` (real or virtual) | `not started` |
 * | `status === 'unknown'` | `unknown (<first warning>)` |
 *
 * The markers are plain ASCII so they survive non-UTF-8 terminals and
 * copy/paste into tickets. SD-011 leaves the exact wording to
 * implementation; the table above is the convention that lands with
 * this slice. SD-012 asks for an unambiguous marker on `in-progress`
 * parents distinct from `DONE` — `in progress` lowercase satisfies
 * that. Collapsing of done subtrees is US3's responsibility, so every
 * record shows its marker inline here.
 *
 * Group sentinel nodes (detected via the reserved
 * `ORPHANED_SPECS_PATH` / `BROKEN_LINKS_PATH` values) are rendered as
 * pure headings with no trailing marker — they are not real lifecycle
 * entities.
 */

import {
  BROKEN_LINKS_PATH,
  ORPHANED_SPECS_PATH,
  ORPHANED_TASKS_PATH,
} from './tree.js';
import type { ArtifactRecord, StatusTree, TreeNode } from './types.js';

/**
 * Options accepted by {@link renderTree}. The `color` flag is reserved
 * so a future ANSI palette (SD-001) can slot in without changing the
 * call sites that already pass `{ color: true }`. It is a no-op today:
 * the renderer emits plain text with UTF-8 box-drawing connectors and
 * no ANSI color.
 */
export interface RenderTreeOptions {
  /** Reserved for ANSI color output (currently a no-op). */
  color?: boolean;
}

/**
 * Render a {@link StatusTree} as a block of indented, tree-connector
 * lines. Pure function — does no I/O and does not mutate its input.
 * Callers are responsible for writing the returned string to stdout.
 *
 * The returned string does NOT include a trailing newline; typical
 * callers pipe it through `console.log`, which adds one. An empty tree
 * yields the empty string.
 */
export function renderTree(
  tree: StatusTree,
  _options: RenderTreeOptions = {},
): string {
  if (tree.roots.length === 0) {
    return '';
  }
  const lines: string[] = [];
  for (const root of tree.roots) {
    renderRoot(root, lines);
  }
  return lines.join('\n');
}

/**
 * Emit a top-level node (a root, or a synthetic group heading). Roots
 * carry no connector prefix — only their descendants do.
 *
 * The "Orphaned Tasks" group is a diagnostic, not part of the normal
 * tree: a real on-disk `.tasks.md` that could not be linked to any
 * spec is always an error. Emit its members as flat `ERROR:` lines so
 * they survive log scrapes and CI output, and skip the heading + tree
 * connectors that normal groups use.
 */
function renderRoot(node: TreeNode, lines: string[]): void {
  if (node.record.path === ORPHANED_TASKS_PATH) {
    for (const child of node.children) {
      lines.push(
        `ERROR: Orphaned task file ${child.record.path} could not be linked to a spec`,
      );
    }
    return;
  }
  lines.push(formatLine(node.record, ''));
  const { children } = node;
  for (let i = 0; i < children.length; i++) {
    renderChild(children[i]!, '', i === children.length - 1, lines);
  }
}

/**
 * Emit a non-root node, recursing into its children. `parentPrefix`
 * contains the accumulated vertical-bar / blank spacers inherited from
 * ancestors; this function appends the node's own connector and then
 * builds the prefix for its own children.
 */
function renderChild(
  node: TreeNode,
  parentPrefix: string,
  isLast: boolean,
  lines: string[],
): void {
  const connector = isLast ? '└─ ' : '├─ ';
  lines.push(formatLine(node.record, parentPrefix + connector));

  // Descendants of a non-last sibling still need a trailing vertical
  // bar so the connector columns line up; the last sibling's subtree
  // gets plain spaces because nothing else sits below it.
  const childSpacer = isLast ? '   ' : '│  ';
  const nextPrefix = parentPrefix + childSpacer;
  const { children } = node;
  for (let i = 0; i < children.length; i++) {
    renderChild(children[i]!, nextPrefix, i === children.length - 1, lines);
  }
}

/**
 * Format a single record into its rendered line. Group sentinels
 * render as bare headings; real records append a status marker and,
 * for broken-link records, their dangling parent reference.
 */
function formatLine(record: ArtifactRecord, prefix: string): string {
  if (isGroupSentinel(record)) {
    return `${prefix}${record.title}`;
  }

  const marker = formatStatusMarker(record);
  const label =
    record.parent_missing === true &&
    typeof record.parent_path === 'string' &&
    record.parent_path.length > 0
      ? `${record.title} [missing parent: ${record.parent_path}]`
      : record.title;

  return `${prefix}${label}  ${marker}`;
}

/**
 * Detect the synthetic group wrappers emitted by {@link buildTree}.
 * These wrap a sentinel `ArtifactRecord` whose `path` is one of two
 * reserved values — matching on `path` is cheaper and more precise
 * than title equality.
 */
function isGroupSentinel(record: ArtifactRecord): boolean {
  return (
    record.path === ORPHANED_SPECS_PATH ||
    record.path === BROKEN_LINKS_PATH ||
    record.path === ORPHANED_TASKS_PATH
  );
}

/**
 * Derive the trailing status marker for a real record. See the module
 * JSDoc for the full mapping.
 */
function formatStatusMarker(record: ArtifactRecord): string {
  switch (record.status) {
    case 'done':
      return 'DONE';
    case 'in-progress':
      if (record.type === 'tasks') {
        const completed = record.completed ?? 0;
        const total = record.total ?? 0;
        return `${completed}/${total}`;
      }
      return 'in progress';
    case 'not-started':
      return 'not started';
    case 'unknown': {
      const first =
        record.warnings.length > 0 ? record.warnings[0] : 'parse error';
      return `unknown (${first})`;
    }
  }
}

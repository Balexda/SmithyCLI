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
 * | `status === 'in-progress'` on a tasks record | `<completed-slices>/<total-slices>` |
 * | `status === 'in-progress'` on a parent record | `in progress` |
 * | `status === 'not-started'` (real or virtual) | `not started` |
 * | `status === 'unknown'` | `unknown (<first warning>)` |
 *
 * The markers are plain ASCII so they survive non-UTF-8 terminals and
 * copy/paste into tickets. SD-011 leaves the exact wording to
 * implementation; the table above is the convention that lands with
 * this slice. SD-012 asks for an unambiguous marker on `in-progress`
 * parents distinct from `DONE` — `in progress` lowercase satisfies
 * that. `renderTree` emits every node it receives verbatim with its
 * marker inline — collapsing of done subtrees is handled upstream by
 * the pure `collapseTree` transform that sits between `buildTree`
 * and `renderTree` in the text-mode pipeline (or bypassed under
 * `--all`), so the input tree is already the view the caller wants
 * rendered.
 *
 * Group sentinel nodes (detected via the reserved
 * `ORPHANED_SPECS_PATH` / `BROKEN_LINKS_PATH` values) are rendered as
 * pure headings with no trailing marker — they are not real lifecycle
 * entities.
 */

import { formatNextAction } from './suggester.js';
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
  /**
   * When `true`, append an indented next-action hint line beneath every
   * real record whose `next_action` is non-null and not suppressed by
   * an ancestor. Defaults to `false` so existing callers (and legacy
   * tests) continue to see a pure tree with no hint annotations.
   *
   * The hint line uses the formatter {@link formatNextAction} and is
   * indented with the same tree-prefix the record's descendants would
   * inherit, plus a two-space pad (SD-016) so the hint visually
   * attaches beneath the record line. Done records (whose `next_action`
   * is `null`) and records carrying `suppressed_by_ancestor: true` emit
   * no hint line. Group sentinel nodes never emit a hint line.
   */
  renderHints?: boolean;
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
  options: RenderTreeOptions = {},
): string {
  if (tree.roots.length === 0) {
    return '';
  }
  const renderHints = options.renderHints === true;
  const lines: string[] = [];
  for (const root of tree.roots) {
    renderRoot(root, lines, renderHints);
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
function renderRoot(
  node: TreeNode,
  lines: string[],
  renderHints: boolean,
): void {
  if (node.record.path === ORPHANED_TASKS_PATH) {
    for (const child of node.children) {
      lines.push(
        `ERROR: Orphaned task file ${child.record.path} could not be linked to a spec`,
      );
    }
    return;
  }
  lines.push(formatLine(node.record, ''));
  // A root's descendants inherit no parent spacer, so the hint line
  // (when enabled) is anchored at column 0 plus the two-space hint pad.
  maybePushHint(node.record, '', lines, renderHints);
  const { children } = node;
  for (let i = 0; i < children.length; i++) {
    renderChild(children[i]!, '', i === children.length - 1, lines, renderHints);
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
  renderHints: boolean,
): void {
  const connector = isLast ? '└─ ' : '├─ ';
  lines.push(formatLine(node.record, parentPrefix + connector));

  // Descendants of a non-last sibling still need a trailing vertical
  // bar so the connector columns line up; the last sibling's subtree
  // gets plain spaces because nothing else sits below it.
  const childSpacer = isLast ? '   ' : '│  ';
  const nextPrefix = parentPrefix + childSpacer;
  // The hint line visually attaches to this record, so it inherits the
  // same prefix the record's own children would use (the `nextPrefix`),
  // keeping the hint anchored beneath the record but out of the way of
  // real descendants below it.
  maybePushHint(node.record, nextPrefix, lines, renderHints);
  const { children } = node;
  for (let i = 0; i < children.length; i++) {
    renderChild(
      children[i]!,
      nextPrefix,
      i === children.length - 1,
      lines,
      renderHints,
    );
  }
}

/**
 * Conditionally push an indented next-action hint line beneath the
 * record's primary line. Does nothing when any of the following holds:
 *
 * - `renderHints` is `false`.
 * - The record is a group sentinel ("Orphaned Specs", "Broken Links",
 *   "Orphaned Tasks") — these have no lifecycle and no next action.
 * - The record's `next_action` is `null` or omitted (done and
 *   read-error records, respectively).
 * - `next_action.suppressed_by_ancestor === true` — suppressed hints
 *   are intentionally hidden so only the topmost actionable ancestor's
 *   hint surfaces (FR-011).
 *
 * Otherwise emit a single line of the form
 * `<recordPrefix>  → <command> [args…]` where `recordPrefix` is the
 * same prefix the record's descendants would inherit, and the two
 * spaces after it are the SD-016 hint pad.
 */
function maybePushHint(
  record: ArtifactRecord,
  recordPrefix: string,
  lines: string[],
  renderHints: boolean,
): void {
  if (!renderHints) return;
  if (isGroupSentinel(record)) return;
  const action = record.next_action;
  if (action === null || action === undefined) return;
  if (action.suppressed_by_ancestor === true) return;
  lines.push(`${recordPrefix}  ${formatNextAction(action)}`);
}

/**
 * Format a single record into its rendered line. Group sentinels
 * render as bare headings; real records append a status marker and,
 * for broken-link records, their dangling parent reference. Records
 * whose scanner populated `parent_row_id` get the zero-padded story
 * number injected into the label so the tree mirrors the parent's
 * canonical dep-order numbering.
 */
function formatLine(record: ArtifactRecord, prefix: string): string {
  if (isGroupSentinel(record)) {
    return `${prefix}${record.title}`;
  }

  const marker = formatStatusMarker(record);
  const titleWithNumber = applyStoryNumber(record.title, record.parent_row_id);
  const label =
    record.parent_missing === true &&
    typeof record.parent_path === 'string' &&
    record.parent_path.length > 0
      ? `${titleWithNumber} [missing parent: ${record.parent_path}]`
      : titleWithNumber;

  return `${prefix}${label}  ${marker}`;
}

/**
 * Inject the parent row's zero-padded numeric prefix into `title`.
 * When the title carries a type prefix like `Tasks: …` (emitted by
 * `smithy.cut` as the H1 of every tasks file), the number slots in
 * after that prefix so the prefix stays visible. Otherwise the number
 * prefixes the title directly. Returns the title unchanged when
 * `rowId` is missing or has no trailing digits.
 */
function applyStoryNumber(title: string, rowId: string | undefined): string {
  if (rowId === undefined) return title;
  const digits = rowId.match(/[0-9]+$/)?.[0];
  if (digits === undefined) return title;
  const nn = digits.padStart(2, '0');
  const tasksPrefix = /^(Tasks:\s+)/;
  const prefixMatch = tasksPrefix.exec(title);
  if (prefixMatch !== null) {
    return `${prefixMatch[1]}${nn} ${title.slice(prefixMatch[0].length)}`;
  }
  return `${nn} ${title}`;
}

/**
 * Detect the synthetic group wrappers emitted by {@link buildTree}.
 * These wrap a sentinel `ArtifactRecord` whose `path` is one of three
 * reserved values (`ORPHANED_SPECS_PATH`, `BROKEN_LINKS_PATH`, or
 * `ORPHANED_TASKS_PATH`) — matching on `path` is cheaper and more
 * precise than title equality.
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

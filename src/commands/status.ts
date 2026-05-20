/**
 * `smithy status` subcommand — thin CLI wiring around the status scanner.
 *
 * This module composes the pieces already built in US1, US2, and US10:
 *
 *   1. Resolve `--root` (defaults to `process.cwd()`).
 *   2. Hard-fail with exit 2 if the resolved path does not exist or is not
 *      a directory, matching the "non-existent `--root`" row of the
 *      contracts error table.
 *   3. Call {@link scan} to build the fully-classified `ArtifactRecord[]`.
 *   4. Derive a {@link ScanSummary} from the records and a
 *      {@link DependencyGraph} via {@link buildDependencyGraph} — both
 *      computed from the pre-filter record set per SD-010 so they
 *      reflect the full scan even when `--status` / `--type` narrow
 *      the rendered tree view.
 *   5. Emit either contract-shaped JSON (`--format json`) or a per-type
 *      roll-up summary header followed by a hierarchical tree with
 *      next-action hints (default, via {@link renderTree} with
 *      `renderHints: true`). The JSON payload carries `summary`,
 *      `records`, and `graph` — no hierarchical `tree`, since
 *      `records` already exposes `parent_path` on every entry and any
 *      consumer can reconstruct the tree locally via {@link buildTree}
 *      without paying for the duplication on the wire. The JSON
 *      `graph` field is populated via {@link buildDependencyGraph}
 *      (US10 Slice 3) and always carries the canonical four keys
 *      (`nodes`, `layers`, `cycles`, `dangling_refs`) so machine
 *      consumers can depend on the top-level shape. `--graph` (US10
 *      Slice 3) routes text mode through {@link renderGraph},
 *      printing topological layers with done-layer collapsing, a
 *      cycle-warning fallback, and dangling-ref diagnostics. The
 *      summary header still prints above the graph view so users keep
 *      the per-type counts and `Next:` hint they get in the default
 *      text path.
 *   6. On an empty repo (no discovered artifacts), print a friendly hint
 *      pointing at `smithy.ignite` / `smithy.mark` and exit 0 — the
 *      contracts treat this as "not an error". The empty-repo hint
 *      wins over `--graph` so users do not see an empty graph block
 *      under it.
 *
 * `--status`, `--type`, and `--root` are wired end-to-end (US6):
 * `--root` is honored by `scan(resolvedRoot)` upstream, and
 * `filterRecords` applies the status / type predicates between the
 * scan and the tree / JSON emission with ancestor retention so AS 6.1
 * and AS 6.3 render correctly. `ScanSummary` and the JSON `graph`
 * are deliberately computed from the pre-filter record set so they
 * keep their aggregate-scan framing (see SD-010). `--all` disables
 * done-subtree collapsing in text mode via the pure `collapseTree`
 * transform inserted between `buildTree` and `renderTree` (US3) and
 * also disables done-layer collapsing inside {@link renderGraph}
 * (US10); JSON mode no longer emits a hierarchical `tree` field, so
 * `--all` affects only `records` (via the `--status` / `--type`
 * filter set the user passed) and `graph` (via
 * {@link serializeGraphForJson}'s `mode` discriminator) on the wire.
 * `--no-color` is honored via {@link buildTheme}'s `noColor` flag
 * (also picked up from the ambient `NO_COLOR` env var) so every
 * painted surface respects it.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  buildDependencyGraph,
  buildTree,
  collapseTree,
  filterRecords,
  formatNextAction,
  renderGraph,
  renderTree,
  scan,
  serializeGraphForJson,
} from '../status/index.js';
import type { FilterRecordsOptions, NextAction } from '../status/index.js';
import { buildTheme, type Theme } from '../status/theme.js';
import type {
  ArtifactRecord,
  ArtifactType,
  DependencyGraph,
  ScanSummary,
  SerializedGraph,
  Status,
  StatusTree,
  TreeNode,
} from '../status/index.js';

/**
 * CLI options accepted by `smithy status`. Fields map 1:1 to the
 * Commander options registered in `src/cli.ts`. Properties are marked
 * optional because this action accepts partially populated option
 * objects; when invoked via Commander, some options may still be
 * present with default values (e.g. `--format` defaults to `'text'`,
 * `--no-color` produces `color: true`) rather than being omitted.
 */
export interface StatusOptions {
  /** Directory to scan. Defaults to `process.cwd()`. */
  root?: string;
  /** Output format. Defaults to `text`. */
  format?: 'text' | 'json';
  /**
   * Filter by status. Accepts either a single {@link Status} or a
   * comma-separated list (e.g., `in-progress,not-started`). Retains
   * matching records and every ancestor by `parent_path` so the
   * renderer keeps context (AS 6.1). At the Commander layer this is a
   * raw string (single value, or comma-joined); {@link statusAction}
   * splits and validates it before handing the parsed `Status[]` to
   * {@link filterRecords}.
   */
  status?: string;
  /**
   * Shorthand for `--status in-progress,not-started` — the set of
   * artifacts that have outstanding work to dispatch. Mutually
   * exclusive with `--status`: combining them is an error so the CLI
   * never has to pick a winner. When set, the effective filter set is
   * `['in-progress', 'not-started']` and the JSON / text emission
   * shrinks accordingly.
   */
  pending?: boolean;
  /**
   * Filter by artifact type. Retains matching records and their
   * ancestors as headers (AS 6.3). Descendants are hidden.
   */
  type?: ArtifactType;
  /**
   * Disable done-subtree collapsing in text mode and disable done-hiding
   * in the JSON `graph` field. When truthy, every artifact surfaces in
   * the rendered tree regardless of status — otherwise any `TreeNode`
   * whose `record.status === 'done'` collapses to a single `DONE` line
   * and its descendants are hidden. The flag also flips the JSON `graph`
   * serialization between its two modes: by default (no `--all`) each
   * layer drops `done` nodes from `node_ids` and reports the omitted
   * count via `complete_count`; under `--all` the layer keeps every
   * member with `pending_node_indexes` / `complete_node_indexes`
   * partitions. Has no effect on the `records` field in `--format
   * json` output, which always reflects the filter set applied above.
   * The JSON payload no longer carries a `tree` field — consumers
   * reconstruct it locally via {@link buildTree} from `records`.
   */
  all?: boolean;
  /**
   * Render the cross-artifact dependency graph as topological layers in
   * text mode. Routes through {@link renderGraph} instead of the default
   * `buildTree` / `collapseTree` / `renderTree` pipeline; the summary
   * header (with the `Next:` hint) still prints above the graph view.
   * Honors `--all` for done-layer collapsing the same way the default
   * text path honors it for done-subtree collapsing. Has no effect on
   * `--format json` output — the JSON payload is already graph-shaped
   * (a populated `graph` field is always emitted), so `--graph` is a
   * no-op there. `--all` is the lever that controls JSON graph
   * filtering.
   */
  graph?: boolean;
  /**
   * Suppress ANSI colors. Set by Commander's `--no-color` flag (produces
   * `color: false`). Honored alongside the ambient `NO_COLOR` env var.
   */
  color?: boolean;
  /**
   * Force ASCII glyphs (tree connectors and status icons). Set by
   * Commander's `--ascii` flag. Also kicks in automatically when the
   * terminal locale does not advertise UTF-8 or on Windows shells that
   * mangle box-drawing characters.
   */
  ascii?: boolean;
}

/**
 * Contract-shaped JSON payload emitted by `--format json`.
 *
 * `records` is the post-filter `ArtifactRecord[]` from
 * {@link filterRecords} — the canonical flat representation every
 * machine consumer reads. `graph` is populated by
 * {@link buildDependencyGraph} (US10 Slice 3) over the *pre-filter*
 * record set per SD-010 so the graph reflects the full scan even when
 * `--status` / `--type` are present, then projected through
 * {@link serializeGraphForJson} into the wire-format
 * {@link SerializedGraph}. The serializer honors the CLI `--all` flag:
 * by default (no `--all`) every layer drops its `done` nodes from
 * `node_ids` and reports the omitted count via `complete_count`, and
 * the top-level `nodes` map is filtered to match; under `--all` the
 * layer keeps every member with `pending_node_indexes` /
 * `complete_node_indexes` partitions, and `nodes` is complete. The
 * `mode` discriminator on the serialized graph and on each layer
 * mirrors which mode produced the payload.
 *
 * Note: the hierarchical `tree` projection is **not** emitted in JSON.
 * The flat `records` array carries `parent_path` on every entry, so
 * any consumer can reconstruct the same tree locally via
 * {@link buildTree} without paying for the duplication on the wire.
 * Dropping it cuts the default payload roughly in half. The in-memory
 * {@link StatusTree} is still computed for text-mode rendering.
 *
 * The top-level shape (`summary`, `records`, `graph` with `mode` /
 * `nodes` / `layers` / `cycles` / `dangling_refs`) is emitted
 * unconditionally, including for an empty repo — so machine consumers
 * can depend on it.
 */
export interface StatusJsonPayload {
  summary: ScanSummary;
  records: ArtifactRecord[];
  graph: SerializedGraph;
}

/**
 * Entry point for the `smithy status` subcommand. Delegates to
 * {@link scan} and emits either JSON (`--format json`) or a per-type
 * roll-up summary header followed by a flat text listing (text mode).
 * Sets `process.exitCode` on error conditions so Commander does not
 * have to know about them.
 */
const VALID_STATUSES: readonly Status[] = [
  'done',
  'in-progress',
  'not-started',
  'unknown',
];

const VALID_TYPES: readonly ArtifactType[] = [
  'rfc',
  'features',
  'spec',
  'tasks',
];

export function statusAction(opts: StatusOptions = {}): void {
  // Error condition: invalid `--status` or `--type` value.
  // Validated here (not via Commander `.choices()`) because the
  // contracts mandate exit code 2 for these errors, while Commander's
  // built-in invalid-choice handler exits with code 1.
  //
  // `--status` accepts either a single value or a comma-separated set
  // (e.g., `in-progress,not-started`). Split on commas, trim, and
  // validate each token; an unknown token aborts the run with the
  // standard exit-2 message. Empty tokens (`--status ,,in-progress`)
  // and an entirely empty value are also rejected so the failure mode
  // is loud.
  let parsedStatuses: Status[] | undefined;
  if (opts.status !== undefined) {
    const tokens = opts.status
      .split(',')
      .map((token) => token.trim());
    if (tokens.length === 0 || tokens.some((token) => token.length === 0)) {
      process.stderr.write(
        `smithy status: invalid --status value '${opts.status}'. Valid values: ${VALID_STATUSES.join(', ')}\n`,
      );
      process.exitCode = 2;
      return;
    }
    for (const token of tokens) {
      if (!VALID_STATUSES.includes(token as Status)) {
        process.stderr.write(
          `smithy status: invalid --status value '${token}'. Valid values: ${VALID_STATUSES.join(', ')}\n`,
        );
        process.exitCode = 2;
        return;
      }
    }
    parsedStatuses = tokens as Status[];
  }

  // `--pending` is a shorthand for `--status in-progress,not-started`.
  // Combining the two is an error: the user has stated two different
  // status intents, and silently honoring one would mask the
  // contradiction.
  if (opts.pending === true) {
    if (parsedStatuses !== undefined) {
      process.stderr.write(
        `smithy status: --pending cannot be combined with --status (--pending is a shorthand for --status in-progress,not-started).\n`,
      );
      process.exitCode = 2;
      return;
    }
    parsedStatuses = ['in-progress', 'not-started'];
  }

  if (opts.type !== undefined && !VALID_TYPES.includes(opts.type)) {
    process.stderr.write(
      `smithy status: invalid --type value '${opts.type}'. Valid values: ${VALID_TYPES.join(', ')}\n`,
    );
    process.exitCode = 2;
    return;
  }

  const rawRoot = opts.root ?? process.cwd();
  const resolvedRoot = path.resolve(rawRoot);

  // Error condition: `--root` cannot be inspected.
  // Hard fail with exit 2 and a stderr message per the contracts.
  // Distinguish ENOENT (the contract's "non-existent path" case) from
  // permission and other I/O failures so the message stays accurate.
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedRoot);
  } catch (error: unknown) {
    const errorCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : undefined;

    const message =
      errorCode === 'ENOENT'
        ? `smithy status: --root path does not exist: ${rawRoot}\n`
        : errorCode === 'EACCES' || errorCode === 'EPERM'
          ? `smithy status: cannot access --root path: ${rawRoot}\n`
          : `smithy status: failed to inspect --root path: ${rawRoot}\n`;

    process.stderr.write(message);
    process.exitCode = 2;
    return;
  }
  if (!stat.isDirectory()) {
    process.stderr.write(
      `smithy status: --root path is not a directory: ${rawRoot}\n`,
    );
    process.exitCode = 2;
    return;
  }

  const records = scan(resolvedRoot);
  // US6: apply the `--status` / `--type` filters to the classified
  // record set before it reaches `buildTree` / the JSON emitter.
  // Ancestor retention inside `filterRecords` preserves AS 6.1 / AS
  // 6.3 context without any renderer change. `--root` is a no-op
  // here (the scan was already narrowed above); we pass it through
  // for signature symmetry. `summarize(records)` stays above the
  // filter call so the `ScanSummary` / header remains aggregate over
  // the full scan per SD-010 — `--status` / `--type` narrow the
  // rendered tree view but never the summary header.
  //
  // The {@link DependencyGraph} is built lazily — only the JSON
  // payload and the `--graph` text branch consume it, and computing
  // it for the default text view (which doesn't reference it) would
  // walk every record's dependency-order rows for nothing. Builds
  // happen on first read via `getGraph()` below; the closure captures
  // the result so the second consumer (if any) reuses the first
  // build. Pre-filter records remain the input per SD-010.
  const summary = summarize(records);
  let cachedGraph: DependencyGraph | null = null;
  const getGraph = (): DependencyGraph => {
    if (cachedGraph === null) cachedGraph = buildDependencyGraph(records);
    return cachedGraph;
  };
  // Build a sparse options object — `exactOptionalPropertyTypes` in
  // tsconfig forbids assigning `undefined` to optional fields, so we
  // only set each key when Commander actually populated it. `status`
  // is the parsed `Status[]` (the validation block above split,
  // trimmed, and validated each comma-separated token); the filter
  // accepts both the array and the legacy single-value forms.
  const filterOpts: FilterRecordsOptions = { root: resolvedRoot };
  if (parsedStatuses !== undefined) filterOpts.status = parsedStatuses;
  if (opts.type !== undefined) filterOpts.type = opts.type;
  const filteredRecords = filterRecords(records, filterOpts);

  // JSON mode: always emit a valid JSON payload, even on an empty
  // repo. Machine consumers (CI, the smithy.status agent skill) parse
  // stdout as JSON unconditionally, so a plain-text empty-repo hint
  // would break them. The `graph` field is populated unconditionally
  // from the pre-filter scan per SD-010 — for an empty repo the
  // builder returns the canonical zero-value shape itself.
  if (opts.format === 'json') {
    // The wire-format `graph` field is projected from the full
    // {@link DependencyGraph} (pre-filter per SD-010) through
    // {@link serializeGraphForJson}, which honors `--all`. Default
    // mode drops `done` nodes from layer `node_ids` / the top-level
    // `nodes` map and reports `complete_count` per layer, matching
    // the text `--graph` renderer's hide-done behavior so the two
    // outputs agree on what is and is not visible.
    const payload: StatusJsonPayload = {
      summary,
      records: filteredRecords,
      graph: serializeGraphForJson(getGraph(), { all: opts.all === true }),
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  // Text mode, empty repo: friendly hint, exit 0. Not an error.
  if (records.length === 0) {
    console.log(
      'No Smithy artifacts found. Run `smithy.ignite` or `smithy.mark` to create one.',
    );
    return;
  }

  const theme = buildTheme({
    noColor: opts.color === false,
    ascii: opts.ascii === true,
  });

  // US10 Slice 3: `--graph` swaps the tree pipeline for the layered
  // view from `renderGraph`. The summary header still prints first so
  // users keep the per-type counts (FR-016). The `Next:` hint is
  // suppressed under `--graph` because the layered view already
  // surfaces actionable next steps inline on every node line — a
  // single `Next:` summary would just duplicate the topmost Layer-0
  // hint and add visual noise. The graph itself is built pre-filter
  // (above), so when `--status` / `--type` retain no records we still
  // print the same friendly "no match" hint as the default path —
  // consistency wins over rendering an unfiltered graph behind a
  // filtered summary.
  //
  // Branch on `opts.graph` BEFORE the default-path tree pipeline so
  // `buildTree` / `collapseTree` / `pickTopNextAction` only run for
  // the default view that actually consumes them. Otherwise large
  // repos would pay for an unused tree build on every `--graph`
  // invocation.
  if (opts.graph === true) {
    console.log(formatSummaryHeader(summary, theme, null));
    if (filteredRecords.length === 0) {
      console.log('No artifacts match the current filter.');
      return;
    }
    const renderedGraph = renderGraph(getGraph(), {
      theme,
      all: opts.all === true,
      // Thread the pre-filter record set so each node line can carry a
      // per-row next-action hint (`→ smithy.<cmd> <args>`) instead of
      // the dim FQ id. Mirrors the `Next:` line in the summary header
      // and the per-record hints under `renderTree`. SD-010 keeps the
      // record set pre-filter so the hints reflect the full scan, in
      // line with the graph itself.
      records,
    });
    if (renderedGraph.length > 0) {
      console.log(renderedGraph);
    }
    return;
  }

  // US2 Slice 2 + US3 Slice 1 + US6 Slice 1: default text output is a
  // hierarchical tree built from the US6-filtered record set (the full
  // scan when `--status` / `--type` are absent), then passed through
  // the pure `collapseTree` transform so any fully-`done` subtree
  // collapses to a single `DONE` line with no descendants (AS 3.1,
  // 3.3, 3.4). Passing `--all` routes through the same transform with
  // `{ all: true }`, which returns a fresh but structurally equivalent
  // tree so every artifact still surfaces (AS 3.5). Group sentinels
  // ("Orphaned Specs", "Broken Links") surface at the top of
  // `tree.roots` and render as their own headings above their grouped
  // children; `collapseTree` never collapses them regardless of
  // `--all`.
  //
  // US4 Slice 2: enable `renderHints` so the tree renderer attaches
  // an indented `→ <command> <args>` hint beneath every actionable,
  // non-suppressed record. Done records (`next_action: null`) and
  // suppressed records (`suppressed_by_ancestor: true`) emit no hint.
  // Collapsed done subtrees cannot leak hints either because
  // `collapseTree` drops their descendants before `renderTree` sees
  // them. The `--format json` branch above is untouched — this flag
  // only affects text-mode output (SD-016).
  const tree = collapseTree(buildTree(filteredRecords), {
    all: opts.all === true,
  });
  const topNextAction = pickTopNextAction(tree);

  console.log(formatSummaryHeader(summary, theme, topNextAction));
  const rendered = renderTree(tree, {
    theme,
    renderHints: true,
  });
  if (rendered.length > 0) {
    console.log(rendered);
    return;
  }

  // US6: the filter retained no records. This is a valid outcome —
  // the scan found artifacts but none match `--status` / `--type` —
  // so print a friendly no-match hint instead of the pathological
  // fallback warning below. The summary header printed above still
  // reflects the full scan per SD-010, so users can see what was
  // scanned even when the filtered view is empty.
  if (filteredRecords.length === 0) {
    console.log('No artifacts match the current filter.');
    return;
  }

  // Defensive fallback: the scanner found records, the filter
  // retained at least one, but `buildTree` still produced an empty
  // `roots` array. The only realistic way this happens today is a
  // pathological cycle where two records claim each other as
  // parents, so neither reaches a root. The slice's acceptance
  // criterion forbids silent drops ("every ArtifactRecord is
  // represented by exactly one line"), so surface every retained
  // record on its own line with a diagnostic header so operators
  // can still see what the scanner found.
  console.log(
    'warning: tree rendering produced no output — listing records flat to avoid silent drops.',
  );
  for (const record of filteredRecords) {
    console.log(
      `${record.type}\t${record.path}\t${record.title}\t${record.status}`,
    );
  }
}

/**
 * Aggregate an `ArtifactRecord[]` into the `ScanSummary` shape expected
 * by the data-model contract. Pure function so it can be unit-tested
 * independently if needed later.
 *
 * Orphan definition per the data model: a record with no parent (`null`
 * or omitted `parent_path`) that is NOT a top-level RFC — RFCs are
 * roots, not orphans. Virtual records are not orphans either: they are
 * always emitted as children of a real parent and therefore always have
 * a non-null `parent_path`.
 */
function summarize(records: ArtifactRecord[]): ScanSummary {
  const counts = emptyCounts();
  let orphan_count = 0;
  let broken_link_count = 0;
  let parse_error_count = 0;

  for (const record of records) {
    counts[record.type][record.status] += 1;
    if (record.status === 'unknown') parse_error_count += 1;
    if (record.parent_missing === true) broken_link_count += 1;

    const hasParent =
      record.parent_path !== undefined && record.parent_path !== null;
    if (!hasParent && record.type !== 'rfc') {
      orphan_count += 1;
    }
  }

  return {
    counts,
    orphan_count,
    broken_link_count,
    parse_error_count,
  };
}

/**
 * Render the vitest-style summary block printed above the tree (US7
 * Slice 1, AS 7.1). Pure function of {@link ScanSummary} and
 * {@link Theme} so it can be moved or wrapped later without touching
 * state.
 *
 * Layout:
 *
 * ```
 *  Smithy Status
 *
 *   Specs      2 ✓   3 ◐   1 ○
 *   Tasks     36 ✓   2 ◐   8 ○
 *
 *   Next: <top-level suggested next action, if any>
 * ```
 *
 * - Type rows whose done/in-progress/not-started counts are all zero
 *   are suppressed so an empty RFCs/Features row doesn't eat a line
 *   of visual budget. If every type has zero counts, the block
 *   collapses to a single dim `No artifacts found.` line.
 * - Label column is left-padded to the longest *surviving* label so
 *   removing RFCs/Features tightens the column (`Specs`/`Tasks` fit
 *   in a 5-char column).
 * - Counts are right-padded to the widest count across surviving rows
 *   so two-digit counters (`36`) align under single-digit ones.
 * - Nonzero counts paint white, zero counts paint dim. Icons are
 *   painted via the theme's status colors.
 * - The `Next:` line is omitted when no actionable next step exists.
 *
 * `unknown` counts and the `orphan_count` / `broken_link_count` /
 * `parse_error_count` summary fields are intentionally omitted —
 * FR-016 enumerates only done / in-progress / not-started.
 */
export function formatSummaryHeader(
  summary: ScanSummary,
  theme: Theme,
  nextAction: NextAction | null,
): string {
  const TYPE_ORDER: Array<{ type: ArtifactType; label: string }> = [
    { type: 'rfc', label: 'RFCs' },
    { type: 'features', label: 'Features' },
    { type: 'spec', label: 'Specs' },
    { type: 'tasks', label: 'Tasks' },
  ];

  type Row = { label: string; done: number; wip: number; not: number };
  const rows: Row[] = [];
  for (const { type, label } of TYPE_ORDER) {
    const c = summary.counts[type];
    const done = c.done;
    const wip = c['in-progress'];
    const not = c['not-started'];
    if (done + wip + not === 0) continue;
    rows.push({ label, done, wip, not });
  }

  const title = theme.paint.bold(' Smithy Status');
  if (rows.length === 0) {
    // No done/in-progress/not-started rows to display. Two reasons this
    // can happen: (a) the scan genuinely found nothing — empty repo —
    // or (b) every record is `unknown` (parse errors). Case (b) must
    // NOT claim "No artifacts found.", because the tree below will
    // render the unknown rows and users would be told something false
    // right above contradicting evidence. Distinguish via
    // `parse_error_count` (which counts unknown records) and point at
    // the tree for detail.
    if (summary.parse_error_count > 0) {
      const noun = summary.parse_error_count === 1 ? 'artifact' : 'artifacts';
      return `${title}\n\n  ${theme.paint.dim(`${summary.parse_error_count} ${noun} with parse errors — see tree below.`)}`;
    }
    return `${title}\n\n  ${theme.paint.dim('No artifacts found.')}`;
  }

  const labelWidth = rows.reduce((w, r) => Math.max(w, r.label.length), 0);
  const countWidth = rows.reduce(
    (w, r) => Math.max(w, String(r.done).length, String(r.wip).length, String(r.not).length),
    1,
  );

  // Per-status count coloring: nonzero done → green, nonzero wip →
  // yellow, nonzero not-started → white. Zero → dim across the board.
  // This matches the rule used by `formatParentCounter` and the tasks
  // counter in the tree renderer, so the summary block and the body
  // share one visual language.
  const paintCount = (n: number, kind: 'done' | 'wip' | 'not'): string => {
    const padded = String(n).padStart(countWidth, ' ');
    if (n === 0) return theme.paint.dim(padded);
    if (kind === 'done') return theme.paint.done(padded);
    if (kind === 'wip') return theme.paint.inProgress(padded);
    return theme.paint.white(padded);
  };

  const rowLines = rows.map((r) => {
    const label = r.label.padEnd(labelWidth, ' ');
    const done = `${paintCount(r.done, 'done')} ${theme.paint.done(theme.icons.done)}`;
    const wip = `${paintCount(r.wip, 'wip')} ${theme.paint.inProgress(theme.icons.inProgress)}`;
    const not = `${paintCount(r.not, 'not')} ${theme.paint.notStarted(theme.icons.notStarted)}`;
    return `  ${label}   ${done}   ${wip}   ${not}`;
  });

  const lines = [title, '', ...rowLines];
  if (nextAction !== null) {
    lines.push('');
    // Split the formatted hint into `<command>` and `<args>` so the
    // command verb can be bolded while args stay in the terminal
    // default. `formatNextAction` returns `<arrow><command> <args…>` —
    // strip the leading arrow glyph, then peel off the command token.
    const hint = formatNextAction(nextAction, theme.glyphs.arrow).slice(
      theme.glyphs.arrow.length,
    );
    const spaceIdx = hint.indexOf(' ');
    const boldHint =
      spaceIdx === -1
        ? theme.paint.bold(hint)
        : `${theme.paint.bold(hint.slice(0, spaceIdx))}${hint.slice(spaceIdx)}`;
    lines.push(`  ${theme.paint.bold('Next:')} ${boldHint}`);
  }
  return lines.join('\n');
}

/**
 * Pick the first actionable, non-suppressed {@link NextAction} from a
 * rendered {@link StatusTree} in render order (depth-first, input
 * order). Group sentinels carry no next action and are skipped. Returns
 * `null` when the tree has no actionable record — either every record
 * is done or every actionable record is suppressed by an ancestor.
 */
export function pickTopNextAction(tree: StatusTree): NextAction | null {
  for (const root of tree.roots) {
    const found = findNextAction(root);
    if (found !== null) return found;
  }
  return null;
}

function findNextAction(node: TreeNode): NextAction | null {
  const action = node.record.next_action;
  if (
    action !== undefined &&
    action !== null &&
    action.suppressed_by_ancestor !== true
  ) {
    return action;
  }
  for (const child of node.children) {
    const found = findNextAction(child);
    if (found !== null) return found;
  }
  return null;
}

function emptyCounts(): ScanSummary['counts'] {
  const emptyStatusCounts = (): Record<Status, number> => ({
    done: 0,
    'in-progress': 0,
    'not-started': 0,
    unknown: 0,
  });
  return {
    rfc: emptyStatusCounts(),
    features: emptyStatusCounts(),
    spec: emptyStatusCounts(),
    tasks: emptyStatusCounts(),
  };
}

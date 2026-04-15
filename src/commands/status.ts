/**
 * `smithy status` subcommand — thin CLI wiring around the status scanner.
 *
 * This module composes the pieces already built in US1 and US2 Slice 1:
 *
 *   1. Resolve `--root` (defaults to `process.cwd()`).
 *   2. Hard-fail with exit 2 if the resolved path does not exist or is not
 *      a directory, matching the "non-existent `--root`" row of the
 *      contracts error table.
 *   3. Call {@link scan} to build the fully-classified `ArtifactRecord[]`.
 *   4. Derive a {@link ScanSummary} from the records.
 *   5. Emit either contract-shaped JSON (`--format json`) or a per-type
 *      roll-up summary header followed by a flat text listing (default).
 *      The JSON `tree` field is populated via {@link buildTree} (US2
 *      Slice 1); the `graph` field is still stubbed and owned by US10.
 *      The top-level JSON shape is stable from US1 onward so consumers
 *      can depend on it today.
 *   6. On an empty repo (no discovered artifacts), print a friendly hint
 *      pointing at `smithy.ignite` / `smithy.mark` and exit 0 — the
 *      contracts treat this as "not an error".
 *
 * Option stubs for `--status`, `--type`, `--all`, `--graph`, and
 * `--no-color` are accepted but intentionally have no behavioral effect
 * yet. Downstream stories (US3, US6) wire the filter flags; US10 wires
 * `--graph`.
 */

import fs from 'node:fs';
import path from 'node:path';

import { buildTree, renderTree, scan } from '../status/index.js';
import type {
  ArtifactRecord,
  ArtifactType,
  ScanSummary,
  Status,
  StatusTree,
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
  /** Stub: filter by status. Parsed but not wired (US6). */
  status?: Status;
  /** Stub: filter by artifact type. Parsed but not wired (US6). */
  type?: ArtifactType;
  /** Stub: disable done-subtree collapsing. Parsed but not wired (US3). */
  all?: boolean;
  /** Stub: render the cross-artifact graph. Parsed but not wired (US2/US10). */
  graph?: boolean;
  /**
   * Stub: suppress ANSI colors. Parsed but not wired — no text rendering
   * in this slice uses color yet.
   */
  color?: boolean;
}

/**
 * Contract-shaped JSON payload emitted by `--format json`. `tree` is
 * now populated by {@link buildTree} (US2 Slice 1); `graph` is still a
 * stub owned by US10. The keys are emitted unconditionally so machine
 * consumers can depend on the top-level shape.
 */
interface StatusJsonPayload {
  summary: ScanSummary;
  records: ArtifactRecord[];
  tree: StatusTree;
  graph: {
    nodes: Record<string, never>;
    layers: [];
    cycles: [];
    dangling_refs: [];
  };
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
  if (opts.status !== undefined && !VALID_STATUSES.includes(opts.status)) {
    process.stderr.write(
      `smithy status: invalid --status value '${opts.status}'. Valid values: ${VALID_STATUSES.join(', ')}\n`,
    );
    process.exitCode = 2;
    return;
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
  const summary = summarize(records);

  // JSON mode: always emit a valid JSON payload, even on an empty
  // repo. Machine consumers (CI, the smithy.status agent skill) parse
  // stdout as JSON unconditionally, so a plain-text empty-repo hint
  // would break them.
  if (opts.format === 'json') {
    const payload: StatusJsonPayload = {
      summary,
      records,
      tree: buildTree(records),
      graph: {
        nodes: {},
        layers: [],
        cycles: [],
        dangling_refs: [],
      },
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

  // US7 Slice 1: per-type roll-up header printed above the tree
  // output whenever the scan finds at least one artifact. Kept pure
  // and derived from the already-computed `ScanSummary` so the tree
  // renderer can keep, move, or wrap the call site without touching
  // the helper.
  console.log(formatSummaryHeader(summary));

  // US2 Slice 2: default text output is a hierarchical tree built
  // from the same `ArtifactRecord[]` the JSON payload uses. Group
  // sentinels ("Orphaned Specs", "Broken Links") surface at the top
  // of `tree.roots` and render as their own headings above their
  // grouped children. `color: !opts.color` reserves a wire into the
  // `--no-color` stub once the palette lands (SD-001) — today the
  // renderer emits plain ASCII unconditionally.
  const tree = buildTree(records);
  const rendered = renderTree(tree, { color: opts.color !== false });
  if (rendered.length > 0) {
    console.log(rendered);
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
 * Render the per-type roll-up header printed above the text-mode flat
 * listing (US7 Slice 1, AS 7.1). A pure function of {@link ScanSummary}
 * so the caller can be moved or wrapped later (e.g., by the US2 tree
 * renderer) without touching this helper.
 *
 * Format (SD-010 / SD-011 / SD-012):
 * - Single line with plural type labels in the canonical order
 *   `RFCs`, `Features`, `Specs`, `Tasks` regardless of count.
 * - Types are joined by ` · ` (U+00B7, one space either side).
 * - Within a type, status segments use ` / ` as the separator and
 *   appear in the fixed order `done`, `in-progress`, `not-started`.
 * - Segments whose count is zero are suppressed when at least one
 *   sibling segment is non-zero, so sparse types stay compact.
 * - A type whose counts are all zero still appears with a stable
 *   `0 done` placeholder to preserve the four-type column structure.
 * - `unknown` counts and the `orphan_count` / `broken_link_count` /
 *   `parse_error_count` summary fields are intentionally omitted —
 *   FR-016 enumerates only done / in-progress / not-started.
 */
function formatSummaryHeader(summary: ScanSummary): string {
  const TYPE_ORDER: Array<{ type: ArtifactType; label: string }> = [
    { type: 'rfc', label: 'RFCs' },
    { type: 'features', label: 'Features' },
    { type: 'spec', label: 'Specs' },
    { type: 'tasks', label: 'Tasks' },
  ];
  const STATUS_ORDER: Array<Exclude<Status, 'unknown'>> = [
    'done',
    'in-progress',
    'not-started',
  ];

  const segments = TYPE_ORDER.map(({ type, label }) => {
    const counts = summary.counts[type];
    const parts = STATUS_ORDER.filter((s) => counts[s] > 0).map(
      (s) => `${counts[s]} ${s}`,
    );
    const body = parts.length > 0 ? parts.join(' / ') : '0 done';
    return `${label}: ${body}`;
  });

  return segments.join(' · ');
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

/**
 * `smithy status` subcommand — thin CLI wiring around the status scanner.
 *
 * This module composes the pieces already built in Slices 1 and 2:
 *
 *   1. Resolve `--root` (defaults to `process.cwd()`).
 *   2. Hard-fail with exit 2 if the resolved path does not exist or is not
 *      a directory, matching the "non-existent `--root`" row of the
 *      contracts error table.
 *   3. Call {@link scan} to build the fully-classified `ArtifactRecord[]`.
 *   4. Derive a {@link ScanSummary} from the records.
 *   5. Emit either contract-shaped JSON (`--format json`) or a minimal
 *      flat text listing (default). Rendering the hierarchical tree and
 *      the graph is owned by downstream stories (US2, US10); this slice
 *      ships stub values (`tree: { roots: [] }`, `graph: { ... }`) in
 *      the JSON payload so consumers can depend on the top-level shape
 *      today.
 *   6. On an empty repo (no discovered artifacts), print a friendly hint
 *      pointing at `smithy.ignite` / `smithy.mark` and exit 0 — the
 *      contracts treat this as "not an error".
 *
 * Option stubs for `--status`, `--type`, `--all`, `--graph`, and
 * `--no-color` are accepted but intentionally have no behavioral effect
 * in this slice. Downstream stories (US2, US3, US6) wire them.
 */

import fs from 'node:fs';
import path from 'node:path';

import { scan } from '../status/index.js';
import type {
  ArtifactRecord,
  ArtifactType,
  ScanSummary,
  Status,
} from '../status/index.js';

/**
 * CLI options accepted by `smithy status`. Fields map 1:1 to the
 * Commander options registered in `src/cli.ts`. All fields are optional
 * because Commander omits unspecified flags entirely.
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
 * Contract-shaped JSON payload emitted by `--format json`. `tree` and
 * `graph` are stubbed with empty containers in this slice; their real
 * population is owned by US2 (tree) and US10 (graph). The stub keys are
 * emitted unconditionally so consumers can depend on the top-level shape
 * from US1 onward.
 */
interface StatusJsonPayload {
  summary: ScanSummary;
  records: ArtifactRecord[];
  tree: { roots: [] };
  graph: {
    nodes: Record<string, never>;
    layers: [];
    cycles: [];
    dangling_refs: [];
  };
}

/**
 * Entry point for the `smithy status` subcommand. Delegates to
 * {@link scan} and emits either JSON (`--format json`) or a minimal flat
 * text listing. Sets `process.exitCode` on error conditions so Commander
 * does not have to know about them.
 */
export function statusAction(opts: StatusOptions = {}): void {
  const rawRoot = opts.root ?? process.cwd();
  const resolvedRoot = path.resolve(rawRoot);

  // Error condition: `--root` points to a nonexistent path.
  // Hard fail with exit 2 and a stderr message per the contracts.
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedRoot);
  } catch {
    process.stderr.write(
      `smithy status: --root path does not exist: ${rawRoot}\n`,
    );
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

  // Empty repo: friendly hint, exit 0. Not an error.
  if (records.length === 0) {
    console.log(
      'No Smithy artifacts found. Run `smithy.ignite` or `smithy.mark` to create one.',
    );
    return;
  }

  const summary = summarize(records);

  if (opts.format === 'json') {
    const payload: StatusJsonPayload = {
      summary,
      records,
      tree: { roots: [] },
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

  // Default text output: minimal flat listing. Hierarchical rendering
  // is owned by US2; this slice ships a placeholder so humans get
  // something legible and CI can parse it line-by-line.
  for (const record of records) {
    console.log(
      `${record.type}\t${record.status}\t${record.path}\t${record.title}`,
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

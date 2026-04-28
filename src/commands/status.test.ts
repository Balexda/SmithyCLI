import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  formatSummaryHeader,
  pickTopNextAction,
  statusAction,
  type StatusJsonPayload,
} from './status.js';
import type {
  ArtifactRecord,
  DependencyGraph,
  NextAction,
  ScanSummary,
  StatusTree,
} from '../status/index.js';
import { createTheme, type Theme } from '../status/theme.js';

const theme: Theme = createTheme({ color: false, encoding: 'utf8' });

function emptyCounts(): ScanSummary['counts'] {
  return {
    rfc: { done: 0, 'in-progress': 0, 'not-started': 0, unknown: 0 },
    features: { done: 0, 'in-progress': 0, 'not-started': 0, unknown: 0 },
    spec: { done: 0, 'in-progress': 0, 'not-started': 0, unknown: 0 },
    tasks: { done: 0, 'in-progress': 0, 'not-started': 0, unknown: 0 },
  };
}

function makeSummary(overrides: {
  rfc?: Partial<ScanSummary['counts']['rfc']>;
  features?: Partial<ScanSummary['counts']['features']>;
  spec?: Partial<ScanSummary['counts']['spec']>;
  tasks?: Partial<ScanSummary['counts']['tasks']>;
} = {}): ScanSummary {
  const counts = emptyCounts();
  Object.assign(counts.rfc, overrides.rfc ?? {});
  Object.assign(counts.features, overrides.features ?? {});
  Object.assign(counts.spec, overrides.spec ?? {});
  Object.assign(counts.tasks, overrides.tasks ?? {});
  return {
    counts,
    orphan_count: 0,
    broken_link_count: 0,
    parse_error_count: 0,
  };
}

describe('formatSummaryHeader', () => {
  it('renders the vitest-style block with the title and a blank separator line', () => {
    const summary = makeSummary({
      spec: { done: 2, 'in-progress': 3, 'not-started': 1 },
      tasks: { done: 36, 'in-progress': 2, 'not-started': 8 },
    });
    const output = formatSummaryHeader(summary, theme, null);
    const lines = output.split('\n');
    expect(lines[0]).toBe(' Smithy Status');
    expect(lines[1]).toBe('');
    // Surviving rows live in the label column sized to the longest
    // surviving label (`Specs`/`Tasks` → 5).
    expect(lines[2]).toBe('  Specs    2 \u2713    3 \u25D0    1 \u25CB');
    expect(lines[3]).toBe('  Tasks   36 \u2713    2 \u25D0    8 \u25CB');
  });

  it('suppresses rows whose done/in-progress/not-started counts are all zero', () => {
    const summary = makeSummary({
      spec: { done: 2, 'in-progress': 3, 'not-started': 1 },
      tasks: { done: 36, 'in-progress': 2, 'not-started': 8 },
    });
    const output = formatSummaryHeader(summary, theme, null);
    expect(output).not.toContain('RFCs');
    expect(output).not.toContain('Features');
    expect(output).toContain('Specs');
    expect(output).toContain('Tasks');
  });

  it('keeps a row when at least one of done/in-progress/not-started is nonzero (mixed zero segments survive)', () => {
    const summary = makeSummary({
      tasks: { done: 36, 'in-progress': 0, 'not-started': 8 },
    });
    const output = formatSummaryHeader(summary, theme, null);
    // Zero-count segment still renders — only all-zero ROWS are dropped.
    expect(output).toContain('0 \u25D0');
    expect(output).toContain('36 \u2713');
    expect(output).toContain('8 \u25CB');
  });

  it('ignores unknown counts so a row with only unknown entries is still dropped', () => {
    const summary = makeSummary({
      rfc: { unknown: 5 },
    });
    const output = formatSummaryHeader(summary, theme, null);
    expect(output).not.toContain('RFCs');
  });

  it('collapses to a single "No artifacts found." line when every row would be suppressed AND no parse errors exist', () => {
    const summary = makeSummary();
    const output = formatSummaryHeader(summary, theme, null);
    expect(output).toContain(' Smithy Status');
    expect(output).toContain('No artifacts found.');
    expect(output).not.toContain('\u2713');
    expect(output).not.toContain('\u25CB');
    expect(output).not.toContain('parse errors');
  });

  it('surfaces a parse-error message instead of "No artifacts found." when unknown-only records exist', () => {
    // Scan discovered artifacts but every one is `unknown` (parse
    // failure). The count columns can't render those since they only
    // enumerate done/in-progress/not-started, but claiming "No
    // artifacts found." above a tree body that then prints the
    // unknown rows would lie to the user. Header should point at the
    // tree instead.
    const summary = makeSummary({
      spec: { unknown: 3 },
    });
    summary.parse_error_count = 3;
    const output = formatSummaryHeader(summary, theme, null);
    expect(output).toContain(' Smithy Status');
    expect(output).not.toContain('No artifacts found.');
    expect(output).toContain('3 artifacts with parse errors');
    expect(output).toContain('see tree below');
  });

  it('uses the singular noun when exactly one parse-error record exists', () => {
    const summary = makeSummary({
      spec: { unknown: 1 },
    });
    summary.parse_error_count = 1;
    const output = formatSummaryHeader(summary, theme, null);
    expect(output).toContain('1 artifact with parse errors');
    expect(output).not.toContain('1 artifacts with parse errors');
  });

  it('right-pads counts to the widest count in surviving rows so two-digit counters align', () => {
    const summary = makeSummary({
      spec: { done: 2, 'in-progress': 3, 'not-started': 1 },
      tasks: { done: 36, 'in-progress': 2, 'not-started': 8 },
    });
    const output = formatSummaryHeader(summary, theme, null);
    const lines = output.split('\n');
    // The leading count of each row sits in a 2-wide column so `2` and
    // `36` line up.
    const specLine = lines.find((l) => l.includes('Specs'))!;
    const tasksLine = lines.find((l) => l.includes('Tasks'))!;
    expect(specLine).toContain(' 2 \u2713');
    expect(tasksLine).toContain('36 \u2713');
    // Both count columns of both rows align at the same column index.
    const specIcon = specLine.indexOf('\u2713');
    const tasksIcon = tasksLine.indexOf('\u2713');
    expect(specIcon).toBe(tasksIcon);
  });

  it('sizes the label column to the longest surviving label so RFCs+Features force an 8-char column', () => {
    const summary = makeSummary({
      rfc: { done: 1 },
      features: { done: 1 },
      spec: { done: 1 },
      tasks: { done: 1 },
    });
    const output = formatSummaryHeader(summary, theme, null);
    const lines = output.split('\n');
    const rfcLine = lines.find((l) => l.includes('RFCs'))!;
    const featuresLine = lines.find((l) => l.includes('Features'))!;
    const specLine = lines.find((l) => l.includes('Specs'))!;
    const tasksLine = lines.find((l) => l.includes('Tasks'))!;
    const rfcCount = rfcLine.indexOf('1');
    const featuresCount = featuresLine.indexOf('1');
    const specCount = specLine.indexOf('1');
    const tasksCount = tasksLine.indexOf('1');
    // All four rows align their count column because labels are padded
    // to `Features` width.
    expect(rfcCount).toBe(featuresCount);
    expect(rfcCount).toBe(specCount);
    expect(rfcCount).toBe(tasksCount);
  });

  it('emits a `Next:` line when a non-null next action is supplied', () => {
    const summary = makeSummary({
      spec: { done: 1 },
    });
    const action: NextAction = {
      command: 'smithy.forge',
      arguments: ['specs/foo/01-story.tasks.md'],
      reason: 'because',
    };
    const output = formatSummaryHeader(summary, theme, action);
    const lines = output.split('\n');
    // Next: line at the end, prefixed with the theme's bold "Next:"
    // label (identity when color is off) and the hint body without the
    // arrow glyph.
    const nextLine = lines[lines.length - 1]!;
    expect(nextLine).toBe(
      '  Next: smithy.forge specs/foo/01-story.tasks.md',
    );
  });

  it('omits the `Next:` line entirely when nextAction is null', () => {
    const summary = makeSummary({
      spec: { done: 1 },
    });
    const output = formatSummaryHeader(summary, theme, null);
    expect(output).not.toContain('Next:');
  });

  it('uses ASCII glyphs when the theme is ASCII-encoded', () => {
    const asciiTheme = createTheme({ color: false, encoding: 'ascii' });
    const summary = makeSummary({
      spec: { done: 2, 'in-progress': 3, 'not-started': 1 },
    });
    const output = formatSummaryHeader(summary, asciiTheme, null);
    expect(output).toContain('[x]');
    expect(output).toContain('[~]');
    expect(output).toContain('[ ]');
    expect(output).not.toContain('\u2713');
    expect(output).not.toContain('\u25D0');
    expect(output).not.toContain('\u25CB');
  });

  it('paints count columns by status kind when color is on (nonzero done green, nonzero wip yellow, nonzero not-started white, zero dim)', () => {
    const colorTheme = createTheme({ color: true, encoding: 'utf8' });
    const summary = makeSummary({
      spec: { done: 2, 'in-progress': 3, 'not-started': 1 },
      tasks: { done: 0, 'in-progress': 5, 'not-started': 0 },
    });
    const output = formatSummaryHeader(summary, colorTheme, null);
    const { paint } = colorTheme;

    // Spec row: all three counts nonzero → each picks up its status
    // color. Counts are right-padded to a 2-char column (`0` / `3` /
    // `5` → max width 1, but Tasks row has `0` only too, so width
    // stays 1). With `3/0/0 (1)` vs `2/3/1 (5)`, max width is 1.
    expect(output).toContain(paint.done('2'));
    expect(output).toContain(paint.inProgress('3'));
    expect(output).toContain(paint.white('1'));

    // Tasks row: the zero done count dims, the nonzero wip paints
    // yellow, the zero not-started dims.
    expect(output).toContain(paint.inProgress('5'));
    // At least two zeros in the tasks row → at least two dim-painted
    // zero counts.
    const dimmedZero = paint.dim('0');
    const dimZeroCount = output.split(dimmedZero).length - 1;
    expect(dimZeroCount).toBeGreaterThanOrEqual(2);
  });

  it('bolds both the `Next:` label and the command verb when color is on', () => {
    const colorTheme = createTheme({ color: true, encoding: 'utf8' });
    const summary = makeSummary({ spec: { done: 1 } });
    const action: NextAction = {
      command: 'smithy.forge',
      arguments: ['specs/foo/01-story.tasks.md'],
      reason: 'because',
    };
    const output = formatSummaryHeader(summary, colorTheme, action);
    const { paint } = colorTheme;
    // Next: label is bold.
    expect(output).toContain(paint.bold('Next:'));
    // Command verb is bold; args stay default (not bold).
    expect(output).toContain(paint.bold('smithy.forge'));
    expect(output).toContain(' specs/foo/01-story.tasks.md');
    // And that the args segment is not itself bold-wrapped.
    expect(output).not.toContain(
      paint.bold('smithy.forge specs/foo/01-story.tasks.md'),
    );
  });
});

function makeRecord(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    type: 'rfc',
    path: 'docs/rfcs/0001.rfc.md',
    title: 'RFC',
    status: 'in-progress',
    dependency_order: { rows: [], id_prefix: 'M', format: 'table' },
    warnings: [],
    ...overrides,
  };
}

describe('pickTopNextAction', () => {
  it('returns null for an empty tree', () => {
    const tree: StatusTree = { roots: [] };
    expect(pickTopNextAction(tree)).toBeNull();
  });

  it('returns null when every record is done (no actionable next step)', () => {
    const tree: StatusTree = {
      roots: [
        {
          record: makeRecord({ status: 'done', next_action: null }),
          children: [],
        },
      ],
    };
    expect(pickTopNextAction(tree)).toBeNull();
  });

  it('returns the first actionable record in render order', () => {
    const action: NextAction = {
      command: 'smithy.render',
      arguments: ['docs/rfcs/0001.rfc.md'],
      reason: 'because',
    };
    const tree: StatusTree = {
      roots: [
        {
          record: makeRecord({ status: 'in-progress', next_action: action }),
          children: [],
        },
      ],
    };
    expect(pickTopNextAction(tree)).toEqual(action);
  });

  it('skips suppressed actions and descends into children to find the first actionable hint', () => {
    const rootAction: NextAction = {
      command: 'smithy.mark',
      arguments: ['docs/rfcs/0001.features.md', '1'],
      reason: 'because',
      suppressed_by_ancestor: true,
    };
    const childAction: NextAction = {
      command: 'smithy.forge',
      arguments: ['specs/foo/01.tasks.md'],
      reason: 'because',
    };
    const tree: StatusTree = {
      roots: [
        {
          record: makeRecord({
            status: 'not-started',
            next_action: rootAction,
          }),
          children: [
            {
              record: makeRecord({
                type: 'tasks',
                path: 'specs/foo/01.tasks.md',
                title: 'Child',
                status: 'not-started',
                next_action: childAction,
              }),
              children: [],
            },
          ],
        },
      ],
    };
    expect(pickTopNextAction(tree)).toEqual(childAction);
  });

  it('walks roots in order and returns the first actionable across the whole forest', () => {
    const secondAction: NextAction = {
      command: 'smithy.render',
      arguments: ['docs/rfcs/0002.rfc.md'],
      reason: 'because',
    };
    const tree: StatusTree = {
      roots: [
        {
          record: makeRecord({
            status: 'done',
            path: 'docs/rfcs/0001.rfc.md',
            next_action: null,
          }),
          children: [],
        },
        {
          record: makeRecord({
            status: 'in-progress',
            path: 'docs/rfcs/0002.rfc.md',
            next_action: secondAction,
          }),
          children: [],
        },
      ],
    };
    expect(pickTopNextAction(tree)).toEqual(secondAction);
  });
});

/**
 * US10 Slice 1: lock in the type wiring between the JSON payload's
 * `graph` field and the canonical {@link DependencyGraph} type. The
 * compile-time assertions below would have failed against the
 * previous inline structural type (`Record<string, never>` / `[]`
 * literal tuples) because a populated `DependencyGraph` is not
 * assignable to that shape. The runtime guard re-checks the
 * zero-value stub still slots into the new type.
 */
describe('StatusJsonPayload.graph type wiring (US10 Slice 1)', () => {
  it('accepts a populated DependencyGraph as the graph field', () => {
    const fqId = 'specs/sample/sample.spec.md#US1';
    const populated: DependencyGraph = {
      nodes: {
        [fqId]: {
          record_path: 'specs/sample/sample.spec.md',
          row: {
            id: 'US1',
            title: 'Sample story',
            depends_on: [],
            artifact_path: null,
          },
          status: 'not-started',
        },
      },
      layers: [{ layer: 0, node_ids: [fqId] }],
      cycles: [],
      dangling_refs: [],
    };
    // Compile-time assertion: assigning a populated DependencyGraph
    // to the `graph` field must typecheck. Under the previous inline
    // type this would have produced TS2322 because `Record<string,
    // DependencyNode>` is not assignable to `Record<string, never>`.
    const payload: StatusJsonPayload = {
      summary: {
        counts: emptyCounts(),
        orphan_count: 0,
        broken_link_count: 0,
        parse_error_count: 0,
      },
      records: [],
      tree: { roots: [] },
      graph: populated,
    };
    expect(payload.graph.nodes[fqId]?.record_path).toBe(
      'specs/sample/sample.spec.md',
    );
    expect(payload.graph.layers[0]?.node_ids).toEqual([fqId]);
  });

  it('still accepts the zero-value runtime stub (Slice 1 emission unchanged)', () => {
    // Mirrors the literal currently emitted by `statusAction` in JSON
    // mode — Slice 3 swaps it for `buildDependencyGraph(records)`.
    const stub: DependencyGraph = {
      nodes: {},
      layers: [],
      cycles: [],
      dangling_refs: [],
    };
    const payload: StatusJsonPayload = {
      summary: {
        counts: emptyCounts(),
        orphan_count: 0,
        broken_link_count: 0,
        parse_error_count: 0,
      },
      records: [],
      tree: { roots: [] },
      graph: stub,
    };
    expect(payload.graph.nodes).toEqual({});
    expect(payload.graph.layers).toEqual([]);
    expect(payload.graph.cycles).toEqual([]);
    expect(payload.graph.dangling_refs).toEqual([]);
  });
});

/**
 * US10 Slice 3 integration tests: assert that `statusAction` wires
 * `buildDependencyGraph` into the JSON payload unconditionally and
 * routes `--graph` text mode through `renderGraph` with summary header
 * preserved, done-layer collapsing honoring `--all`, cycle fallback,
 * and dangling-ref diagnostics. Each test builds a synthetic repo
 * under `os.tmpdir()` (mirroring `scanner.test.ts`'s pattern), invokes
 * `statusAction` with `--root` pointed at it, and captures stdout via
 * `vi.spyOn(console, 'log')`.
 */
describe('statusAction --graph integration (US10 Slice 3)', () => {
  const TABLE_HEADER =
    '| ID | Title | Depends On | Artifact |\n|----|-------|------------|----------|';

  let root: string;
  let logSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'smithy-status-graph-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      /* swallow stdout during tests */
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function write(relPath: string, contents: string): void {
    const abs = join(root, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
  }

  function captured(): string {
    return logSpy.mock.calls.map((args) => args.join(' ')).join('\n');
  }

  /**
   * Write the AS 10.1 fixture: a single spec with four user stories
   * where US1 + US4 are independent, US2 depends on US1, and US3
   * depends on US2. Tasks files are emitted as `done` / `in-progress`
   * / `not-started` so the rolled-up spec status is `in-progress`.
   */
  function writeFourStoryFixture(): void {
    write(
      'specs/sample/sample.spec.md',
      `# Sample Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n` +
        `| US1 | First story | — | specs/sample/01-first.tasks.md |\n` +
        `| US2 | Second story | US1 | specs/sample/02-second.tasks.md |\n` +
        `| US3 | Third story | US2 | specs/sample/03-third.tasks.md |\n` +
        `| US4 | Fourth story | — | specs/sample/04-fourth.tasks.md |\n`,
    );
    // US1 done, US2 in-progress, US3/US4 not-started — gives a mixed
    // spec status (`in-progress`) so the summary header shows
    // multiple counts.
    write(
      'specs/sample/01-first.tasks.md',
      `# US1 Tasks\n\n## Slice 1: Only\n\n- [x] One\n- [x] Two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    write(
      'specs/sample/02-second.tasks.md',
      `# US2 Tasks\n\n## Slice 1: Only\n\n- [x] One\n- [ ] Two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    write(
      'specs/sample/03-third.tasks.md',
      `# US3 Tasks\n\n## Slice 1: Only\n\n- [ ] One\n- [ ] Two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    write(
      'specs/sample/04-fourth.tasks.md',
      `# US4 Tasks\n\n## Slice 1: Only\n\n- [ ] One\n- [ ] Two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
  }

  /**
   * Fixture where every spec row + tasks-file row in the graph rolls
   * up to `done`. Both spec rows have all-checked tasks files, so the
   * spec itself rolls up to `done`, and every node in the graph
   * carries `status: 'done'`. In default mode every layer therefore
   * collapses to `Layer N: DONE (M items)`; under `--all`, every
   * layer expands and every node id surfaces.
   */
  function writeAllDoneFixture(): void {
    write(
      'specs/sample/sample.spec.md',
      `# Sample Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n` +
        `| US1 | First story | — | specs/sample/01-first.tasks.md |\n` +
        `| US2 | Second story | US1 | specs/sample/02-second.tasks.md |\n`,
    );
    write(
      'specs/sample/01-first.tasks.md',
      `# US1 Tasks\n\n## Slice 1: Only\n\n- [x] One\n- [x] Two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    write(
      'specs/sample/02-second.tasks.md',
      `# US2 Tasks\n\n## Slice 1: Only\n\n- [x] One\n- [x] Two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
  }

  // --- AS 10.5: JSON graph populated unconditionally ---

  it('AS 10.5: JSON `graph` is populated from buildDependencyGraph (multi-row spec)', () => {
    writeFourStoryFixture();
    statusAction({ root, format: 'json' });
    const payload = JSON.parse(captured()) as StatusJsonPayload;
    // Nodes contains every fully-qualified row.
    expect(Object.keys(payload.graph.nodes).length).toBeGreaterThan(0);
    expect(payload.graph.nodes['specs/sample/sample.spec.md#US1']).toBeDefined();
    // Layers carry node_ids, not `ids`.
    expect(payload.graph.layers.length).toBeGreaterThan(0);
    const firstLayer = payload.graph.layers[0]!;
    expect(firstLayer.node_ids).toBeDefined();
    expect(Array.isArray(firstLayer.node_ids)).toBe(true);
    expect(firstLayer.node_ids.length).toBeGreaterThan(0);
    // cycles / dangling_refs are arrays even when empty.
    expect(Array.isArray(payload.graph.cycles)).toBe(true);
    expect(Array.isArray(payload.graph.dangling_refs)).toBe(true);
  });

  it('AS 10.5: JSON layer objects use the canonical `node_ids` field name (no `.ids` drift, SD-012)', () => {
    writeFourStoryFixture();
    statusAction({ root, format: 'json' });
    const stdout = captured();
    // None of the emitted layer objects may carry an `ids` key — the
    // canonical name is `node_ids`. The check is a literal substring
    // assertion against the JSON, since `JSON.stringify` quotes object
    // keys.
    expect(stdout).not.toContain('"ids":');
    expect(stdout).toContain('"node_ids":');
  });

  it('AS 10.5: JSON `graph` is the canonical zero-value shape on an empty repo', () => {
    statusAction({ root, format: 'json' });
    const payload = JSON.parse(captured()) as StatusJsonPayload;
    expect(payload.graph).toEqual<DependencyGraph>({
      nodes: {},
      layers: [],
      cycles: [],
      dangling_refs: [],
    });
  });

  it('AS 10.5: JSON `graph` reflects the pre-filter scan even when --status excludes some records (SD-010)', () => {
    writeFourStoryFixture();
    // US1's tasks file is fully checked → US1 rolls up to `done`.
    // Filtering by --status=in-progress would exclude it from the
    // `records` field, but the `graph` is built pre-filter so it must
    // still carry the US1 node.
    statusAction({ root, format: 'json', status: 'in-progress' });
    const payload = JSON.parse(captured()) as StatusJsonPayload;
    // The filter dropped done records from `payload.records`...
    const filteredHasUs1 = payload.records.some(
      (r) => r.path === 'specs/sample/01-first.tasks.md',
    );
    expect(filteredHasUs1).toBe(false);
    // ...but the graph (built from the unfiltered scan) still does.
    expect(payload.graph.nodes['specs/sample/sample.spec.md#US1']).toBeDefined();
  });

  // --- AS 10.1 / AS 10.4: text path renders layered view via renderGraph ---

  it('AS 10.1: --graph --all prints layered headings with US1/US4 in Layer 0 and US2/US3 in later layers', () => {
    writeFourStoryFixture();
    // Use `--all` here so the fixture's `done` US1 row surfaces in
    // the rendered output. Default mode hides done members from the
    // listing (covered separately below) — this assertion is about the
    // builder's layer membership, which we want to read straight off
    // the rendered output without the hide-done filter in play.
    statusAction({ root, graph: true, all: true });
    const stdout = captured();
    // Layer 0 leads with the "ready to work" copy (renderGraph
    // contract). Subsequent layers use the simpler heading form.
    expect(stdout).toContain('Layer 0 — ready to work');
    expect(stdout).toContain('Layer 1');
    expect(stdout).toContain('Layer 2');
    // US1 + US4 belong to layer 0; US2 to layer 1; US3 to layer 2.
    expect(stdout).toContain('specs/sample/sample.spec.md#US1');
    expect(stdout).toContain('specs/sample/sample.spec.md#US4');
    expect(stdout).toContain('specs/sample/sample.spec.md#US2');
    expect(stdout).toContain('specs/sample/sample.spec.md#US3');
    // The summary header still prints above the graph view (FR-016).
    expect(stdout).toContain(' Smithy Status');
  });

  it('--graph default mode hides done members and surfaces a `done hidden` suffix on the affected layer', () => {
    writeFourStoryFixture();
    statusAction({ root, graph: true });
    const stdout = captured();
    // The four-story fixture has US1's tasks file fully checked, so
    // the tasks-file slice node carries `status: done` and is hidden
    // from its layer's listing in default mode. (User-story nodes
    // share the spec record's rolled-up `in-progress` status, so they
    // do not individually trigger the filter — separate from this
    // assertion.) At least one layer must therefore show the
    // `done hidden` suffix.
    expect(stdout).toMatch(/Layer \d+ \(\d+ items, \d+ done hidden\)/);
    // The hidden tasks-file slice's FQ id must NOT appear under the
    // layered view in default mode (the user-story FQ id still does,
    // since user-story nodes are not individually `done` in this
    // fixture).
    expect(stdout).not.toContain('specs/sample/01-first.tasks.md#S1');
  });

  it('--graph --all surfaces every member regardless of status (including done items hidden in default mode)', () => {
    writeFourStoryFixture();
    statusAction({ root, graph: true, all: true });
    const stdout = captured();
    // No layer carries the hide-done suffix under --all.
    expect(stdout).not.toContain('done hidden');
    // The done tasks-file slice that default mode hides surfaces
    // here, proving --all bypasses the hide-done filter.
    expect(stdout).toContain('specs/sample/01-first.tasks.md#S1');
  });

  it('AS 10.4: --graph collapses fully-done layers to `Layer N: DONE (M items)` and drops member IDs in default mode', () => {
    writeAllDoneFixture();
    statusAction({ root, graph: true });
    const stdout = captured();
    // Every node in the fixture rolls up to `done`, so every layer
    // collapses. At least one collapsed layer line must surface, and
    // none of the spec's row IDs can appear (they would only surface
    // as expanded layer-member lines).
    expect(stdout).toMatch(/Layer \d+: DONE \(\d+ items?\)/);
    expect(stdout).not.toContain('specs/sample/sample.spec.md#US1');
    expect(stdout).not.toContain('specs/sample/sample.spec.md#US2');
  });

  it('AS 10.4: --graph --all expands every layer regardless of status', () => {
    writeAllDoneFixture();
    statusAction({ root, graph: true, all: true });
    const stdout = captured();
    // No collapse line — every layer is fully expanded.
    expect(stdout).not.toMatch(/Layer \d+: DONE/);
    // Both spec-row members surface as full node lines now.
    expect(stdout).toContain('specs/sample/sample.spec.md#US1');
    expect(stdout).toContain('specs/sample/sample.spec.md#US2');
  });

  // --- AS 10.3: cycle fallback ---

  it('AS 10.3: --graph emits a cycle warning and Cycle: line when the graph is not a DAG', () => {
    // US1 depends on US2, US2 depends on US1 → mutual cycle.
    write(
      'specs/sample/sample.spec.md',
      `# Sample Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n` +
        `| US1 | First story | US2 | — |\n` +
        `| US2 | Second story | US1 | — |\n`,
    );
    const exitCodeBefore = process.exitCode;
    statusAction({ root, graph: true });
    // No exception thrown above (we'd never reach here otherwise) and
    // process.exitCode is not bumped to a failure value.
    expect(process.exitCode).toBe(exitCodeBefore);
    const stdout = captured();
    expect(stdout).toContain('WARNING: dependency graph contains cycle');
    expect(stdout).toContain('Cycle: ');
    // Both cyclic IDs appear in the Cycle: line.
    expect(stdout).toContain('specs/sample/sample.spec.md#US1');
    expect(stdout).toContain('specs/sample/sample.spec.md#US2');
  });

  // --- AS 10.6: dangling refs ---

  it('AS 10.6: --graph surfaces a Dangling refs: block when a depends_on reference is unresolved', () => {
    // US2 declares a dep on US99 which does not exist in the table.
    // The parser drops the edge and records a structured
    // dangling_refs entry; the graph builder propagates it; the
    // renderer surfaces it.
    write(
      'specs/sample/sample.spec.md',
      `# Sample Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n` +
        `| US1 | First story | — | — |\n` +
        `| US2 | Second story | US1, US99 | — |\n`,
    );
    statusAction({ root, graph: true });
    const stdout = captured();
    expect(stdout).toContain('Dangling refs:');
    // The unresolved pair appears with both ends fully-qualified.
    expect(stdout).toContain('specs/sample/sample.spec.md#US2');
    expect(stdout).toContain('specs/sample/sample.spec.md#US99');
    expect(stdout).toContain('(unresolved)');
  });

  // --- friendly hints: empty repo and no-match-filter under --graph ---

  it('--graph on an empty repo prints the no-artifacts hint, not an empty graph block', () => {
    // Empty `root`: no fixture written. The empty-repo guard must fire
    // before the graph branch so users do not see a stray summary
    // header followed by silence.
    const exitCodeBefore = process.exitCode;
    statusAction({ root, graph: true });
    expect(process.exitCode).toBe(exitCodeBefore);
    const stdout = captured();
    expect(stdout).toContain('No Smithy artifacts found');
    expect(stdout).not.toContain('Layer ');
    expect(stdout).not.toContain('Smithy Status');
  });

  it('--graph with --status filter that matches nothing prints the no-match hint, not an empty graph block', () => {
    writeAllDoneFixture();
    // Every record rolls up to `done`, so `--status in-progress`
    // retains zero records. The summary header still surfaces (full
    // scan, SD-010), but the graph branch must defer to the no-match
    // hint rather than rendering against the unfiltered graph.
    statusAction({ root, graph: true, status: 'in-progress' });
    const stdout = captured();
    expect(stdout).toContain(' Smithy Status');
    expect(stdout).toContain('No artifacts match the current filter.');
    expect(stdout).not.toContain('Layer ');
  });

  // --- regression: default text path unchanged ---

  it('default text path (no --graph) still routes through renderTree, not renderGraph', () => {
    writeFourStoryFixture();
    statusAction({ root });
    const stdout = captured();
    // Summary header prints as before.
    expect(stdout).toContain(' Smithy Status');
    // No layer headings — proves we did not silently route through
    // renderGraph. (`Layer ` is the unique prefix renderGraph emits
    // and renderTree never produces.)
    expect(stdout).not.toContain('Layer 0 — ready to work');
    expect(stdout).not.toMatch(/Layer \d+ \(/);
    // The tree renderer surfaces the spec title (with rolled-up
    // status icon) and per-task next-action hints — both are unique
    // to the tree path. `renderGraph` would emit fully-qualified
    // node IDs (`specs/sample/sample.spec.md#US1`) instead.
    expect(stdout).toContain('Sample Spec');
    expect(stdout).toContain('smithy.forge specs/sample/');
    expect(stdout).not.toContain('specs/sample/sample.spec.md#US');
  });
});

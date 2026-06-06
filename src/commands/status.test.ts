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
  SerializedGraph,
  StatusTree,
} from '../status/index.js';
import { serializeGraphForJson } from '../status/index.js';
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
 * Lock in the type wiring between the JSON payload's `graph` field and
 * the canonical {@link SerializedGraph} type. `StatusJsonPayload.graph`
 * used to be a raw {@link DependencyGraph}; now it is a
 * {@link SerializedGraph} produced by {@link serializeGraphForJson}, so
 * a hand-constructed `SerializedGraph` (matching either `mode`) must
 * satisfy the payload's compile-time shape.
 */
describe('StatusJsonPayload.graph type wiring', () => {
  it('accepts a populated SerializedGraph (pending-only mode) as the graph field', () => {
    const fqId = 'specs/sample/sample.spec.md#US1';
    const populated: SerializedGraph = {
      mode: 'pending-only',
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
      layers: [
        { mode: 'pending-only', layer: 0, node_ids: [fqId], complete_count: 0 },
      ],
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
      graph: populated,
    };
    expect(payload.graph.nodes[fqId]?.record_path).toBe(
      'specs/sample/sample.spec.md',
    );
    expect(payload.graph.layers[0]?.node_ids).toEqual([fqId]);
  });

  it('accepts a populated SerializedGraph (all mode) as the graph field', () => {
    const fqId = 'specs/sample/sample.spec.md#US1';
    const populated: SerializedGraph = {
      mode: 'all',
      nodes: {
        [fqId]: {
          record_path: 'specs/sample/sample.spec.md',
          row: {
            id: 'US1',
            title: 'Sample story',
            depends_on: [],
            artifact_path: null,
          },
          status: 'done',
        },
      },
      layers: [
        {
          mode: 'all',
          layer: 0,
          node_ids: [fqId],
          pending_node_indexes: [],
          complete_node_indexes: [0],
        },
      ],
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
      graph: populated,
    };
    const firstLayer = payload.graph.layers[0]!;
    expect(firstLayer.mode).toBe('all');
    if (firstLayer.mode === 'all') {
      expect(firstLayer.complete_node_indexes).toEqual([0]);
    }
  });

  it('still accepts the zero-value runtime stub', () => {
    // Mirrors the canonical empty-repo emission from `statusAction`
    // after the JSON branch was rewired through `serializeGraphForJson`.
    const stub: SerializedGraph = {
      mode: 'pending-only',
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
      graph: stub,
    };
    expect(payload.graph.mode).toBe('pending-only');
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
   * carries `status: 'done'`. In default mode fully-done layers are
   * omitted entirely; under `--all`, every layer is shown and every
   * node id surfaces.
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

  /**
   * Identical-shape fixture to {@link writeFourStoryFixture} but with
   * NO done items — every tasks file has at least one unchecked
   * checkbox. Used by tests that need the AS 10.1 static-topology
   * layering (`US1+US4` in Layer 0, `US2` in Layer 1, `US3` in
   * Layer 2) without the "done predecessors don't block" rule
   * promoting blocked rows forward.
   */
  function writeNoDoneFourStoryFixture(): void {
    write(
      'specs/sample/sample.spec.md',
      `# Sample Spec\n\n## Dependency Order\n\n${TABLE_HEADER}\n` +
        `| US1 | First story | — | specs/sample/01-first.tasks.md |\n` +
        `| US2 | Second story | US1 | specs/sample/02-second.tasks.md |\n` +
        `| US3 | Third story | US2 | specs/sample/03-third.tasks.md |\n` +
        `| US4 | Fourth story | — | specs/sample/04-fourth.tasks.md |\n`,
    );
    write(
      'specs/sample/01-first.tasks.md',
      `# US1 Tasks\n\n## Slice 1: Only\n\n- [ ] One\n- [ ] Two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
    );
    write(
      'specs/sample/02-second.tasks.md',
      `# US2 Tasks\n\n## Slice 1: Only\n\n- [ ] One\n- [ ] Two\n\n## Dependency Order\n\n${TABLE_HEADER}\n| S1 | Only | — | — |\n`,
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

  // --- AS 10.5: JSON graph populated unconditionally ---

  it('AS 10.5: JSON `graph` is populated from buildDependencyGraph (multi-row spec, --all reveals done nodes)', () => {
    writeFourStoryFixture();
    // Pass `--all` so done nodes (US1 + its tasks file) survive the
    // serializer's default hide-done filter — this test pins the
    // builder wiring, not the filter.
    statusAction({ root, format: 'json', all: true });
    const payload = JSON.parse(captured()) as StatusJsonPayload;
    // Nodes contains every fully-qualified row, including the done
    // US1 row, because we asked for the full graph.
    expect(payload.graph.mode).toBe('all');
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
    expect(payload.graph).toEqual<SerializedGraph>({
      mode: 'pending-only',
      nodes: {},
      layers: [],
      cycles: [],
      dangling_refs: [],
    });
  });

  it('JSON `graph` empty-repo shape under `--all` reports mode `all`', () => {
    statusAction({ root, format: 'json', all: true });
    const payload = JSON.parse(captured()) as StatusJsonPayload;
    expect(payload.graph).toEqual<SerializedGraph>({
      mode: 'all',
      nodes: {},
      layers: [],
      cycles: [],
      dangling_refs: [],
    });
  });

  it('default JSON `graph` hides done nodes and reports them via complete_count (matches text --graph)', () => {
    // writeFourStoryFixture sets US1 (and its tasks file) to done; US2
    // is in-progress; US3/US4 not-started. Without `--all` the
    // serializer should drop US1 from layer node_ids and from the
    // top-level nodes map, and surface the omission via complete_count.
    writeFourStoryFixture();
    statusAction({ root, format: 'json' });
    const payload = JSON.parse(captured()) as StatusJsonPayload;
    expect(payload.graph.mode).toBe('pending-only');
    // US1 (done) is hidden from the top-level nodes map.
    expect(payload.graph.nodes['specs/sample/sample.spec.md#US1']).toBeUndefined();
    // US2/US3/US4 (pending) remain in the graph.
    expect(payload.graph.nodes['specs/sample/sample.spec.md#US2']).toBeDefined();
    expect(payload.graph.nodes['specs/sample/sample.spec.md#US3']).toBeDefined();
    expect(payload.graph.nodes['specs/sample/sample.spec.md#US4']).toBeDefined();
    // Every layer's node_ids excludes the done US1 node, and the
    // complete_count across all layers covers the dropped done items
    // (US1 spec row + US1 tasks-file rows).
    const totalComplete = payload.graph.layers.reduce((sum, layer) => {
      if (layer.mode === 'pending-only') return sum + layer.complete_count;
      return sum;
    }, 0);
    expect(totalComplete).toBeGreaterThan(0);
    for (const layer of payload.graph.layers) {
      expect(layer.node_ids).not.toContain('specs/sample/sample.spec.md#US1');
    }
  });

  it('default JSON `graph` omits fully-done layers entirely (matches text --graph)', () => {
    // writeAllDoneFixture: every row in every artifact rolls up to done.
    // Default mode should drop every layer; the all-mode JSON should
    // keep them (proving that the omission is the serializer's choice,
    // not the builder's).
    writeAllDoneFixture();

    statusAction({ root, format: 'json' });
    const defaultPayload = JSON.parse(captured()) as StatusJsonPayload;
    expect(defaultPayload.graph.layers).toEqual([]);
    expect(defaultPayload.graph.nodes).toEqual({});

    logSpy.mockClear();
    statusAction({ root, format: 'json', all: true });
    const allPayload = JSON.parse(captured()) as StatusJsonPayload;
    expect(allPayload.graph.mode).toBe('all');
    expect(allPayload.graph.layers.length).toBeGreaterThan(0);
    expect(Object.keys(allPayload.graph.nodes).length).toBeGreaterThan(0);
  });

  it('AS 10.5: JSON `graph` reflects the pre-filter scan even when --status excludes some records (SD-010, with --all)', () => {
    writeFourStoryFixture();
    // US1's tasks file is fully checked → US1 rolls up to `done`.
    // Filtering by --status=in-progress would exclude it from the
    // `records` field, but the `graph` is built pre-filter so it must
    // still carry the US1 node when the consumer asks for the full
    // graph (`--all`). The default serializer hides done nodes on its
    // own axis — that's covered by a separate test below; SD-010 here
    // is about the `--status`/`--type` filters not leaking into the
    // graph projection.
    statusAction({ root, format: 'json', status: 'in-progress', all: true });
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

  it('AS 10.1: --graph prints layered headings with US1/US4 in Layer 0 and US2/US3 in later layers', () => {
    // AS 10.1 describes the static topology: US1+US4 in Layer 0, US2
    // in Layer 1, US3 in Layer 2. Under the "done predecessors don't
    // block" layering rule, those layer assignments only hold when no
    // upstream node is `done` (otherwise blocked work promotes
    // forward). The four-story fixture sets US1's tasks file to done,
    // which would promote US2 to Layer 0; use a fresh no-done fixture
    // here so the test asserts AS 10.1 as-written.
    writeNoDoneFourStoryFixture();
    statusAction({ root, graph: true });
    const stdout = captured();
    // Layer 0 leads with the "ready to work" copy (renderGraph
    // contract). Subsequent layers use the simpler heading form.
    expect(stdout).toContain('Layer 0 — ready to work');
    expect(stdout).toContain('Layer 1');
    expect(stdout).toContain('Layer 2');
    // Each layer's stories surface by their row title (the new
    // title-first layout). Layer assignment proven by the relative
    // ordering of titles in the rendered output: US1 + US4 in Layer 0,
    // US2 in Layer 1, US3 in Layer 2.
    const us1Pos = stdout.indexOf('First story');
    const us4Pos = stdout.indexOf('Fourth story');
    const us2Pos = stdout.indexOf('Second story');
    const us3Pos = stdout.indexOf('Third story');
    expect(us1Pos).toBeGreaterThanOrEqual(0);
    expect(us4Pos).toBeGreaterThan(us1Pos); // both in Layer 0
    expect(us2Pos).toBeGreaterThan(us4Pos); // Layer 0 < Layer 1
    expect(us3Pos).toBeGreaterThan(us2Pos); // Layer 1 < Layer 2
    // The summary header still prints above the graph view (FR-016).
    expect(stdout).toContain(' Smithy Status');
  });

  it('AS 10.5: JSON `graph` carries the canonical fully-qualified node IDs regardless of text-mode formatting', () => {
    // The text-mode renderer now substitutes a per-row `→ smithy.<cmd>`
    // hint for the dim FQ id suffix when records are supplied. Lock
    // the FQ ids to the JSON payload so machine consumers still have
    // the canonical reference for every node, decoupled from text-mode
    // styling decisions. Pass `--all` so done nodes (US1) survive the
    // default hide-done filter.
    writeFourStoryFixture();
    statusAction({ root, format: 'json', all: true });
    const payload = JSON.parse(captured()) as StatusJsonPayload;
    expect(payload.graph.nodes['specs/sample/sample.spec.md#US1']).toBeDefined();
    expect(payload.graph.nodes['specs/sample/sample.spec.md#US2']).toBeDefined();
    expect(payload.graph.nodes['specs/sample/sample.spec.md#US3']).toBeDefined();
    expect(payload.graph.nodes['specs/sample/sample.spec.md#US4']).toBeDefined();
  });

  it('--graph suppresses the `Next:` line in the summary header (the layered view already surfaces actions)', () => {
    writeFourStoryFixture();
    statusAction({ root, graph: true });
    const stdout = captured();
    // Summary header still prints (per-type counts).
    expect(stdout).toContain(' Smithy Status');
    expect(stdout).toContain('Specs');
    expect(stdout).toContain('Tasks');
    // `Next:` line is intentionally absent — the graph view's own
    // Layer 0 hints replace it.
    expect(stdout).not.toContain('Next:');
  });

  it('default text mode (no --graph) still prints the `Next:` line in the summary header', () => {
    // Regression guard: removing `Next:` under `--graph` must not
    // remove it from the default text path. The default path only
    // shows one consolidated next action, so the summary's `Next:`
    // line is the user's primary cue there.
    writeFourStoryFixture();
    statusAction({ root });
    const stdout = captured();
    expect(stdout).toContain('Next:');
  });

  it('--graph node lines surface a `→ smithy.<cmd>` per-row action hint instead of the dim FQ id', () => {
    writeFourStoryFixture();
    statusAction({ root, graph: true, all: true });
    const stdout = captured();
    // Per-row hints derive from the row's downstream record's
    // next_action (real or virtual). For US4 (whose tasks file is
    // not-started) the hint is `smithy.forge specs/sample/04-fourth.tasks.md`
    // — the downstream tasks file's own next_action.
    expect(stdout).toContain('→ smithy.forge specs/sample/04-fourth.tasks.md');
    // Slice rows synthesise per-slice forge hints with the slice
    // number as the second arg, mirroring `smithy.forge <tasks> <N>`.
    expect(stdout).toContain('→ smithy.forge specs/sample/04-fourth.tasks.md 1');
  });

  it('--graph default mode hides done members and surfaces a `done hidden` suffix on the affected layer', () => {
    writeFourStoryFixture();
    statusAction({ root, graph: true });
    const stdout = captured();
    // The four-story fixture carries done items: US1's tasks file is
    // fully checked, US1's user-story node rolls up to done from its
    // downstream, and the tasks-file slice for US1 is also done. With
    // the "done predecessors don't block" layering rule, those done
    // items end up in Layer 0 (no remaining blockers) and get hidden
    // by the default-mode filter — surfacing as `, N done hidden` in
    // the Layer 0 heading.
    expect(stdout).toContain('done hidden');
    // The hidden user-story FQ id and tasks-file slice FQ id must NOT
    // appear in the rendered output; they're filtered out.
    expect(stdout).not.toContain('specs/sample/01-first.tasks.md#S1');
    expect(stdout).not.toContain('specs/sample/sample.spec.md#US1');
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

  it('AS 10.4: --graph omits fully-done layers entirely from default mode (no heading, no members)', () => {
    writeAllDoneFixture();
    statusAction({ root, graph: true });
    const stdout = captured();
    // Every node in the fixture rolls up to `done`. The previous
    // collapse line (`Layer N: DONE (M items)`) added no actionable
    // signal, so the whole graph block now drops out of default
    // mode — no `Layer ` heading, no `DONE (` collapse line, no
    // member IDs.
    expect(stdout).not.toContain('Layer ');
    expect(stdout).not.toContain('DONE (');
    expect(stdout).not.toContain('specs/sample/sample.spec.md#US1');
    expect(stdout).not.toContain('specs/sample/sample.spec.md#US2');
    // Summary header still surfaces so users see the per-type counts.
    expect(stdout).toContain(' Smithy Status');
  });

  it('AS 10.4: --graph --all expands every layer regardless of status', () => {
    writeAllDoneFixture();
    statusAction({ root, graph: true, all: true });
    const stdout = captured();
    // No collapse line under --all either — every layer is fully
    // expanded with its members surfaced.
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

/**
 * Direct coverage for `serializeGraphForJson`. Hand-built
 * {@link DependencyGraph}s exercise the partition logic without going
 * through the scanner pipeline, so the assertions stay focused on the
 * serializer's two modes and on the asymmetries between them.
 */
describe('serializeGraphForJson', () => {
  const SPEC = 'specs/x/x.spec.md';
  const id = (row: string): string => `${SPEC}#${row}`;

  function makeGraph(rows: Array<{ id: string; status: ArtifactRecord['status'] }>): DependencyGraph {
    const nodes: DependencyGraph['nodes'] = {};
    for (const r of rows) {
      nodes[id(r.id)] = {
        record_path: SPEC,
        row: { id: r.id, title: r.id, depends_on: [], artifact_path: null },
        status: r.status,
      };
    }
    return {
      nodes,
      layers: [{ layer: 0, node_ids: rows.map((r) => id(r.id)) }],
      cycles: [],
      dangling_refs: [],
    };
  }

  it('default mode (all=false) drops done nodes from node_ids and reports complete_count', () => {
    const graph = makeGraph([
      { id: 'US1', status: 'done' },
      { id: 'US2', status: 'in-progress' },
      { id: 'US3', status: 'done' },
      { id: 'US4', status: 'not-started' },
    ]);
    const serialized = serializeGraphForJson(graph, { all: false });
    expect(serialized.mode).toBe('pending-only');
    expect(serialized.layers).toHaveLength(1);
    const layer = serialized.layers[0]!;
    expect(layer.mode).toBe('pending-only');
    if (layer.mode === 'pending-only') {
      expect(layer.node_ids).toEqual([id('US2'), id('US4')]);
      expect(layer.complete_count).toBe(2);
    }
  });

  it('default mode keeps every non-done node in graph.nodes (not just IDs in layers)', () => {
    const graph = makeGraph([
      { id: 'US1', status: 'done' },
      { id: 'US2', status: 'in-progress' },
    ]);
    const serialized = serializeGraphForJson(graph, { all: false });
    expect(Object.keys(serialized.nodes)).toEqual([id('US2')]);
    expect(serialized.nodes[id('US1')]).toBeUndefined();
  });

  it('default mode preserves pending cycle participants that Kahn omitted from layers', () => {
    // Simulates a repo with a 2-node cycle: US1 ↔ US2. Kahn's algorithm
    // cannot place either in `layers`, so they only appear in `cycles`.
    // The pending-only `nodes` map must still carry their metadata so
    // the skill's "missing from graph.nodes ⇒ done" rule stays valid.
    const graph: DependencyGraph = {
      nodes: {
        [id('US1')]: {
          record_path: SPEC,
          row: { id: 'US1', title: 'US1', depends_on: ['US2'], artifact_path: null },
          status: 'in-progress',
        },
        [id('US2')]: {
          record_path: SPEC,
          row: { id: 'US2', title: 'US2', depends_on: ['US1'], artifact_path: null },
          status: 'not-started',
        },
      },
      layers: [],
      cycles: [[id('US1'), id('US2')]],
      dangling_refs: [],
    };
    const serialized = serializeGraphForJson(graph, { all: false });
    expect(serialized.layers).toEqual([]);
    expect(Object.keys(serialized.nodes).sort()).toEqual([id('US1'), id('US2')]);
    expect(serialized.cycles).toEqual([[id('US1'), id('US2')]]);
  });

  it('default mode still drops done nodes even when they appear in graph.cycles', () => {
    // A done node referenced by `cycles` should not be revived into the
    // pending-only `nodes` map — pending-only's only purpose is dropping
    // done. Skill rule: missing ⇒ done. Done nodes in cycles are still
    // missing from `nodes`, and that is correct.
    const graph: DependencyGraph = {
      nodes: {
        [id('US1')]: {
          record_path: SPEC,
          row: { id: 'US1', title: 'US1', depends_on: ['US2'], artifact_path: null },
          status: 'done',
        },
        [id('US2')]: {
          record_path: SPEC,
          row: { id: 'US2', title: 'US2', depends_on: ['US1'], artifact_path: null },
          status: 'in-progress',
        },
      },
      layers: [],
      cycles: [[id('US1'), id('US2')]],
      dangling_refs: [],
    };
    const serialized = serializeGraphForJson(graph, { all: false });
    expect(Object.keys(serialized.nodes)).toEqual([id('US2')]);
    expect(serialized.nodes[id('US1')]).toBeUndefined();
  });

  it('default mode omits a layer composed entirely of done nodes', () => {
    const graph: DependencyGraph = {
      nodes: {
        [id('US1')]: {
          record_path: SPEC,
          row: { id: 'US1', title: 'US1', depends_on: [], artifact_path: null },
          status: 'done',
        },
        [id('US2')]: {
          record_path: SPEC,
          row: { id: 'US2', title: 'US2', depends_on: [], artifact_path: null },
          status: 'in-progress',
        },
      },
      layers: [
        { layer: 0, node_ids: [id('US1')] },
        { layer: 1, node_ids: [id('US2')] },
      ],
      cycles: [],
      dangling_refs: [],
    };
    const serialized = serializeGraphForJson(graph, { all: false });
    // Layer 0 (all done) is omitted; Layer 1 survives, retaining its
    // original `layer: 1` number — the serializer must not re-index.
    expect(serialized.layers).toHaveLength(1);
    expect(serialized.layers[0]?.layer).toBe(1);
  });

  it('--all mode keeps every node and partitions by status via indexes', () => {
    const graph = makeGraph([
      { id: 'US1', status: 'done' },
      { id: 'US2', status: 'in-progress' },
      { id: 'US3', status: 'done' },
      { id: 'US4', status: 'not-started' },
    ]);
    const serialized = serializeGraphForJson(graph, { all: true });
    expect(serialized.mode).toBe('all');
    expect(Object.keys(serialized.nodes).sort()).toEqual([
      id('US1'),
      id('US2'),
      id('US3'),
      id('US4'),
    ]);
    expect(serialized.layers).toHaveLength(1);
    const layer = serialized.layers[0]!;
    expect(layer.mode).toBe('all');
    if (layer.mode === 'all') {
      expect(layer.node_ids).toEqual([id('US1'), id('US2'), id('US3'), id('US4')]);
      expect(layer.pending_node_indexes).toEqual([1, 3]);
      expect(layer.complete_node_indexes).toEqual([0, 2]);
    }
  });

  it('--all mode preserves a fully-done layer that default mode would omit', () => {
    const graph = makeGraph([
      { id: 'US1', status: 'done' },
      { id: 'US2', status: 'done' },
    ]);
    const defaultSerialized = serializeGraphForJson(graph, { all: false });
    expect(defaultSerialized.layers).toHaveLength(0);
    const allSerialized = serializeGraphForJson(graph, { all: true });
    expect(allSerialized.layers).toHaveLength(1);
    const layer = allSerialized.layers[0]!;
    if (layer.mode === 'all') {
      expect(layer.complete_node_indexes).toEqual([0, 1]);
      expect(layer.pending_node_indexes).toEqual([]);
    }
  });

  it('passes cycles and dangling_refs through verbatim in both modes', () => {
    const graph: DependencyGraph = {
      nodes: {},
      layers: [],
      cycles: [[id('US1'), id('US2')]],
      dangling_refs: [{ source_id: id('US1'), missing_id: id('US9') }],
    };
    for (const all of [false, true]) {
      const serialized = serializeGraphForJson(graph, { all });
      expect(serialized.cycles).toEqual([[id('US1'), id('US2')]]);
      expect(serialized.dangling_refs).toEqual([
        { source_id: id('US1'), missing_id: id('US9') },
      ]);
    }
  });
});

describe('statusAction artifacts-location integration', () => {
  // The scanner is taught to read `.smithy/smithy-manifest.json` (or
  // `~/.smithy/smithy-manifest.json`) and redirect its scan root to
  // `~/.smithy/<repo>/` when `artifactsLocation === 'external'`. These
  // tests exercise that wiring end-to-end via real on-disk files.
  //
  // The redirect only fires when `opts.root` is `undefined` (the scanner
  // falls back to `process.cwd()` then), so the cases that actually hit
  // the new branch stub both `process.cwd` and `process.env.HOME` —
  // tests that pass `root` explicitly intentionally bypass the redirect
  // and document the "explicit --root always wins" rule.

  let workdir: string;
  let fakeHome: string;
  let cwdSpy: MockInstance<() => string>;
  let logSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'smithy-status-workdir-'));
    fakeHome = mkdtempSync(join(tmpdir(), 'smithy-status-home-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workdir);
    vi.stubEnv('HOME', fakeHome);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    vi.unstubAllEnvs();
    logSpy.mockRestore();
    if (workdir) rmSync(workdir, { recursive: true, force: true });
    if (fakeHome) rmSync(fakeHome, { recursive: true, force: true });
  });

  function captured(): string {
    return logSpy.mock.calls.map((args) => args.join(' ')).join('\n');
  }

  function writeManifest(at: string, artifactsLocation?: 'repo' | 'external'): void {
    const manifestPath = join(at, '.smithy', 'smithy-manifest.json');
    mkdirSync(dirname(manifestPath), { recursive: true });
    const manifest = {
      version: 1,
      smithyVersion: '0.0.0-test',
      deployLocation: 'repo',
      agents: ['claude'],
      permissions: false,
      ...(artifactsLocation === 'external' ? { artifactsLocation } : {}),
      files: { claude: [] },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /** Write a minimal tasks-file fixture under `<root>/specs/sample/`. */
  function writeTasksFixture(root: string): void {
    const dir = join(root, 'specs', 'sample');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, '01-first.tasks.md'),
      '# US1 Tasks\n\n## Slice 1: Only\n\n- [ ] One\n\n## Dependency Order\n\n| ID | Title | Depends On | Artifact |\n|----|-------|------------|----------|\n| S1 | Only | — | — |\n',
    );
  }

  it('scans the in-repo root when no manifest is present (back-compat)', () => {
    writeTasksFixture(workdir);
    statusAction({ root: workdir, format: 'json' });
    const payload = JSON.parse(captured()) as StatusJsonPayload;
    expect(payload.records.length).toBeGreaterThan(0);
    expect(payload.records[0]!.path).toBe('specs/sample/01-first.tasks.md');
  });

  it('scans the in-repo root when artifactsLocation is "repo" in the manifest', () => {
    writeManifest(workdir, 'repo');
    writeTasksFixture(workdir);
    statusAction({ root: workdir, format: 'json' });
    const payload = JSON.parse(captured()) as StatusJsonPayload;
    expect(payload.records[0]!.path).toBe('specs/sample/01-first.tasks.md');
  });

  it('omitting --root with artifactsLocation=external redirects to ~/.smithy/<repo>/ and re-prepends the prefix on records', () => {
    writeManifest(workdir, 'external');
    const externalRoot = join(fakeHome, '.smithy', `${require('path').basename(workdir)}`);
    writeTasksFixture(externalRoot);

    // No `root` field — exercises the manifest-driven redirect branch.
    statusAction({ format: 'json' });
    const payload = JSON.parse(captured()) as StatusJsonPayload;

    const expectedPrefix = `~/.smithy/${require('path').basename(workdir)}/`;
    expect(payload.records.length).toBeGreaterThan(0);
    expect(payload.records[0]!.path).toBe(
      `${expectedPrefix}specs/sample/01-first.tasks.md`,
    );
    // Next: smithy.forge hint must carry the prefix too — the user pastes
    // this into Claude Code running from the source repo, and the agent
    // needs to find the file at its real on-disk location.
    expect(payload.records[0]!.next_action?.arguments[0]).toBe(
      `${expectedPrefix}specs/sample/01-first.tasks.md`,
    );
  });

  it('omitting --root with no external manifest scans cwd (default behavior unchanged)', () => {
    // No manifest at all — the redirect short-circuits and falls back to cwd.
    writeTasksFixture(workdir);
    statusAction({ format: 'json' });
    const payload = JSON.parse(captured()) as StatusJsonPayload;
    expect(payload.records[0]!.path).toBe('specs/sample/01-first.tasks.md');
  });

  it('omitting --root with artifactsLocation=external but no external dir yet falls back to cwd (friendly empty hint)', () => {
    // User flipped the flag but hasn't written anything to ~/.smithy/<repo>/ yet.
    writeManifest(workdir, 'external');
    statusAction({ format: 'json' });
    const payload = JSON.parse(captured()) as StatusJsonPayload;
    // Empty external root → fall back to cwd, which also has no artifacts → empty result.
    expect(payload.records).toEqual([]);
  });

  it('explicit --root always wins, even when the manifest declares external', () => {
    writeManifest(workdir, 'external');
    // Pre-create both locations with different fixtures so the test can tell
    // which root the scanner actually visited.
    writeTasksFixture(workdir);
    const externalRoot = join(fakeHome, '.smithy', require('path').basename(workdir));
    mkdirSync(join(externalRoot, 'specs', 'other'), { recursive: true });
    writeFileSync(
      join(externalRoot, 'specs', 'other', '99-other.tasks.md'),
      '# Other\n\n## Dependency Order\n\n| ID | Title | Depends On | Artifact |\n|----|-------|------------|----------|\n',
    );
    statusAction({ root: workdir, format: 'json' });
    const payload = JSON.parse(captured()) as StatusJsonPayload;
    expect(payload.records[0]!.path).toBe('specs/sample/01-first.tasks.md');
    // No tilde-prefixed paths leaked in — the redirect was bypassed entirely.
    for (const r of payload.records) {
      expect(r.path.startsWith('~/.smithy/')).toBe(false);
    }
  });
});

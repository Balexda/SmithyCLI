import { describe, expect, it } from 'vitest';

import { formatSummaryHeader, pickTopNextAction } from './status.js';
import type {
  ArtifactRecord,
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

  it('collapses to a single "No artifacts found." line when every row would be suppressed', () => {
    const summary = makeSummary();
    const output = formatSummaryHeader(summary, theme, null);
    expect(output).toContain(' Smithy Status');
    expect(output).toContain('No artifacts found.');
    expect(output).not.toContain('\u2713');
    expect(output).not.toContain('\u25CB');
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

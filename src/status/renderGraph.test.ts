import { describe, expect, it } from 'vitest';

// Import through the `./index.js` barrel so these tests also assert
// that `renderGraph` is re-exported on the stable public surface.
import {
  buildDependencyGraph,
  renderGraph,
  type ArtifactRecord,
  type ArtifactType,
  type DependencyGraph,
  type DependencyOrderTable,
  type DependencyRow,
  type RenderGraphOptions,
} from './index.js';
import { createTheme, type Theme } from './theme.js';

/**
 * Deterministic themes for renderer assertions. Colors are disabled so
 * snapshots stay ANSI-free; the ASCII variant exists to assert the
 * fallback connector glyphs survive the renderer.
 */
const utf8Theme: Theme = createTheme({ color: false, encoding: 'utf8' });
const asciiTheme: Theme = createTheme({ color: false, encoding: 'ascii' });

/**
 * Build a minimal `ArtifactRecord` for graph-renderer tests. Only the
 * fields `buildDependencyGraph` actually consults (`path`, `status`,
 * `parent_path`, `parent_row_id`, `dependency_order`) carry semantic
 * weight; the rest are padded so the call sites stay small.
 */
function makeRecord(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  const type: ArtifactType = overrides.type ?? 'spec';
  const idPrefix: DependencyOrderTable['id_prefix'] =
    type === 'rfc'
      ? 'M'
      : type === 'features'
        ? 'F'
        : type === 'spec'
          ? 'US'
          : 'S';
  const dependency_order: DependencyOrderTable = overrides.dependency_order ?? {
    rows: [],
    id_prefix: idPrefix,
    format: 'table',
  };
  return {
    type,
    path: overrides.path ?? `specs/sample.${type === 'tasks' ? 'tasks' : type}.md`,
    title: overrides.title ?? 'Sample',
    status: overrides.status ?? 'not-started',
    dependency_order,
    warnings: overrides.warnings ?? [],
    ...overrides,
  };
}

/** Build a single dependency row with sensible defaults. */
function row(
  id: string,
  depends_on: string[] = [],
  overrides: Partial<DependencyRow> = {},
): DependencyRow {
  return {
    id,
    title: overrides.title ?? `Story ${id}`,
    depends_on,
    artifact_path: overrides.artifact_path ?? null,
    ...overrides,
  };
}

describe('renderGraph — empty graph', () => {
  it('returns the empty string for a fully empty graph', () => {
    const graph: DependencyGraph = {
      nodes: {},
      layers: [],
      cycles: [],
      dangling_refs: [],
    };
    expect(renderGraph(graph, { theme: utf8Theme })).toBe('');
  });
});

describe('renderGraph — layered view (AS 10.1)', () => {
  // Same fixture pattern as graph.test.ts AS 10.1: US1 / US4 independent,
  // US2 depends on US1, US3 depends on US2.
  const SPEC_PATH = 'specs/sample/sample.spec.md';
  const spec = makeRecord({
    type: 'spec',
    path: SPEC_PATH,
    title: 'Sample Spec',
    status: 'in-progress',
    dependency_order: {
      id_prefix: 'US',
      format: 'table',
      rows: [
        row('US1', [], { title: 'First' }),
        row('US2', ['US1'], { title: 'Second' }),
        row('US3', ['US2'], { title: 'Third' }),
        row('US4', [], { title: 'Fourth' }),
      ],
    },
  });

  it('emits one labelled block per layer with the correct layer-0 ready heading', () => {
    const graph = buildDependencyGraph([spec]);
    const output = renderGraph(graph, { theme: utf8Theme });
    // Layer 0 header is the canonical "ready to work" form (per AS 10.1
    // / contracts §1 example output).
    expect(output).toContain('Layer 0 — ready to work (2 items)');
    // Subsequent layers use the simpler "Layer N (M items)" form.
    expect(output).toContain('Layer 1 (1 item)');
    expect(output).toContain('Layer 2 (1 item)');
  });

  it('lists each node id under its layer with tree connectors and the row title', () => {
    const graph = buildDependencyGraph([spec]);
    const output = renderGraph(graph, { theme: utf8Theme });
    // Every fully-qualified node id from buildDependencyGraph must
    // appear in the output exactly once.
    expect(output).toContain(`${SPEC_PATH}#US1`);
    expect(output).toContain(`${SPEC_PATH}#US2`);
    expect(output).toContain(`${SPEC_PATH}#US3`);
    expect(output).toContain(`${SPEC_PATH}#US4`);
    // Em-dash separator + title from the underlying row.
    expect(output).toContain(`${SPEC_PATH}#US1 — First`);
    expect(output).toContain(`${SPEC_PATH}#US2 — Second`);
    // Tree connectors used to lay out per-layer members.
    expect(output).toMatch(/[├└]─/);
    // Last-sibling glyph appears for the final entry of the
    // multi-member Layer 0 (US4).
    expect(output).toContain(`└─ ${SPEC_PATH}#US4`);
    // Non-last-sibling glyph appears for the first entry of Layer 0
    // (US1).
    expect(output).toContain(`├─ ${SPEC_PATH}#US1`);
  });

  it('orders Layer 0 members by their position in graph.layers[0].node_ids', () => {
    const graph = buildDependencyGraph([spec]);
    const output = renderGraph(graph, { theme: utf8Theme });
    const us1Pos = output.indexOf(`${SPEC_PATH}#US1`);
    const us4Pos = output.indexOf(`${SPEC_PATH}#US4`);
    const us2Pos = output.indexOf(`${SPEC_PATH}#US2`);
    const us3Pos = output.indexOf(`${SPEC_PATH}#US3`);
    expect(us1Pos).toBeGreaterThanOrEqual(0);
    expect(us4Pos).toBeGreaterThan(us1Pos);
    expect(us2Pos).toBeGreaterThan(us4Pos);
    expect(us3Pos).toBeGreaterThan(us2Pos);
  });

  it('separates adjacent layer blocks with a blank line', () => {
    const graph = buildDependencyGraph([spec]);
    const output = renderGraph(graph, { theme: utf8Theme });
    // A blank line followed by the "Layer 1" heading proves the layer
    // blocks are visually separated rather than smashed together.
    expect(output).toMatch(/\n\nLayer 1 \(1 item\)/);
    expect(output).toMatch(/\n\nLayer 2 \(1 item\)/);
  });
});

describe('renderGraph — done-layer collapsing (AS 10.4)', () => {
  // Spec with three layers: US1 (Layer 0, in-progress), US2 (Layer 1,
  // done), US3 (Layer 2, not-started). The Layer 1 collapses by default
  // because every member is `done`; under `{ all: true }` it expands.
  const SPEC_PATH = 'specs/sample/sample.spec.md';

  function buildSpec(): ArtifactRecord[] {
    // Each row lives in its own record so the rolled-up status varies
    // per-layer. We synthesise the parent linkage so the cross-artifact
    // stitcher pins later layers behind earlier ones — but the simplest
    // recipe is to keep them all in one spec and lean on intra-table
    // depends_on edges. Status is rolled up from the owning record, so
    // we model "Layer 1 entirely done" by giving US2's owning record
    // status: 'done'.
    const layer0 = makeRecord({
      type: 'spec',
      path: 'specs/a/a.spec.md',
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1', [], { title: 'Zeroth' })],
      },
    });
    const layer1 = makeRecord({
      type: 'spec',
      path: 'specs/b/b.spec.md',
      status: 'done',
      parent_path: 'specs/a/a.spec.md',
      parent_row_id: 'US1',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US2', [], { title: 'First' })],
      },
    });
    const layer2 = makeRecord({
      type: 'spec',
      path: 'specs/c/c.spec.md',
      status: 'not-started',
      parent_path: 'specs/b/b.spec.md',
      parent_row_id: 'US2',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US3', [], { title: 'Second' })],
      },
    });
    return [layer0, layer1, layer2];
  }

  it('collapses an all-done layer to a `Layer N: DONE (M items)` line in default mode', () => {
    const graph = buildDependencyGraph(buildSpec());
    const output = renderGraph(graph, { theme: utf8Theme });
    expect(output).toContain('Layer 1: DONE (1 item)');
    // The collapsed layer must NOT list its members.
    expect(output).not.toContain('specs/b/b.spec.md#US2');
  });

  it('expands every layer when {all: true} is passed', () => {
    const graph = buildDependencyGraph(buildSpec());
    const expandedOpts: RenderGraphOptions = {
      theme: utf8Theme,
      all: true,
    };
    const output = renderGraph(graph, expandedOpts);
    // The collapsed heading must NOT appear under --all.
    expect(output).not.toContain('Layer 1: DONE');
    // Every fully-qualified node ID must appear when expanded.
    expect(output).toContain('specs/a/a.spec.md#US1');
    expect(output).toContain('specs/b/b.spec.md#US2');
    expect(output).toContain('specs/c/c.spec.md#US3');
    // Layer headings still use the canonical "ready to work" form for
    // layer 0 and the simple form for subsequent layers.
    expect(output).toContain('Layer 0 — ready to work (1 item)');
    expect(output).toContain('Layer 1 (1 item)');
  });

  it('does not collapse a mixed-status layer', () => {
    // Build a graph where Layer 0 has two members, one done and one
    // not-started — the layer must NOT collapse.
    const recordA = makeRecord({
      type: 'spec',
      path: 'specs/a/a.spec.md',
      status: 'done',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1')],
      },
    });
    const recordB = makeRecord({
      type: 'spec',
      path: 'specs/b/b.spec.md',
      status: 'not-started',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1')],
      },
    });
    const graph = buildDependencyGraph([recordA, recordB]);
    const output = renderGraph(graph, { theme: utf8Theme });
    expect(output).not.toContain('DONE (');
    expect(output).toContain('specs/a/a.spec.md#US1');
    expect(output).toContain('specs/b/b.spec.md#US1');
  });
});

describe('renderGraph — cycle fallback (AS 10.3)', () => {
  const SPEC_PATH = 'specs/sample/sample.spec.md';

  it('emits a warning block plus a cycle line and does not throw', () => {
    const spec = makeRecord({
      type: 'spec',
      path: SPEC_PATH,
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1', ['US2']), row('US2', ['US1'])],
      },
    });
    const graph = buildDependencyGraph([spec]);
    const output = renderGraph(graph, { theme: utf8Theme });
    // Warning lead — exact wording must mention "cycle" so reviewers
    // and log scrapers can grep for it.
    expect(output.toLowerCase()).toContain('warning');
    expect(output.toLowerCase()).toContain('cycle');
    // Cycle line lists both fully-qualified IDs joined by ` -> `, with
    // the first ID repeated at the end so the loop is visually obvious.
    expect(output).toContain(`${SPEC_PATH}#US1`);
    expect(output).toContain(`${SPEC_PATH}#US2`);
    expect(output).toContain(' -> ');
    // No `Layer N` heading for cyclic nodes — the renderer must not
    // pretend the cyclic subgraph has layers.
    expect(output).not.toMatch(/Layer 0/);
    expect(output).not.toMatch(/Layer 1/);
  });

  it('renders non-cyclic nodes under a flat fallback heading', () => {
    // US1 ↔ US2 form a cycle; US3 / US4 are non-cyclic and stay
    // layerable. The flat fallback should list US3 and US4 under
    // `Nodes (flat fallback):` while the cycle line carries US1+US2.
    const spec = makeRecord({
      type: 'spec',
      path: SPEC_PATH,
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [
          row('US1', ['US2']),
          row('US2', ['US1']),
          row('US3'),
          row('US4', ['US3']),
        ],
      },
    });
    const graph = buildDependencyGraph([spec]);
    const output = renderGraph(graph, { theme: utf8Theme });
    expect(output).toContain('Nodes (flat fallback):');
    expect(output).toContain(`${SPEC_PATH}#US3`);
    expect(output).toContain(`${SPEC_PATH}#US4`);
    // Cyclic nodes are NOT listed in the flat fallback — they only
    // appear once on the Cycle line.
    const fallbackPos = output.indexOf('Nodes (flat fallback):');
    const tail = output.slice(fallbackPos);
    expect(tail).not.toContain(`${SPEC_PATH}#US1`);
    expect(tail).not.toContain(`${SPEC_PATH}#US2`);
  });
});

describe('renderGraph — dangling references (AS 10.6)', () => {
  const SPEC_PATH = 'specs/sample/sample.spec.md';

  it('emits a `Dangling refs:` block listing each unresolved pair', () => {
    const spec = makeRecord({
      type: 'spec',
      path: SPEC_PATH,
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1')],
        dangling_refs: [{ source_id: 'US1', missing_id: 'US99' }],
      },
    });
    const graph = buildDependencyGraph([spec]);
    const output = renderGraph(graph, { theme: utf8Theme });
    expect(output).toContain('Dangling refs:');
    expect(output).toContain(
      `${SPEC_PATH}#US1 -> ${SPEC_PATH}#US99 (unresolved)`,
    );
  });

  it('omits the `Dangling refs:` block when no dangling refs are present', () => {
    const spec = makeRecord({
      type: 'spec',
      path: SPEC_PATH,
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1'), row('US2', ['US1'])],
      },
    });
    const graph = buildDependencyGraph([spec]);
    const output = renderGraph(graph, { theme: utf8Theme });
    expect(output).not.toContain('Dangling refs:');
  });
});

describe('renderGraph — purity', () => {
  it('returns the same string on repeat calls (deterministic)', () => {
    const spec = makeRecord({
      type: 'spec',
      path: 'specs/sample/sample.spec.md',
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1'), row('US2', ['US1'])],
      },
    });
    const graph = buildDependencyGraph([spec]);
    const a = renderGraph(graph, { theme: utf8Theme });
    const b = renderGraph(graph, { theme: utf8Theme });
    expect(a).toBe(b);
  });

  it('does not mutate its input graph', () => {
    const spec = makeRecord({
      type: 'spec',
      path: 'specs/sample/sample.spec.md',
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1'), row('US2', ['US1'])],
        dangling_refs: [{ source_id: 'US1', missing_id: 'US99' }],
      },
    });
    const graph = buildDependencyGraph([spec]);
    const snapshot = JSON.parse(JSON.stringify(graph));
    renderGraph(graph, { theme: utf8Theme });
    expect(graph).toEqual(snapshot);
  });
});

describe('renderGraph — ASCII fallback', () => {
  it('uses ASCII connectors when given an ASCII theme', () => {
    const spec = makeRecord({
      type: 'spec',
      path: 'specs/sample/sample.spec.md',
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1'), row('US2'), row('US3', ['US1', 'US2'])],
      },
    });
    const graph = buildDependencyGraph([spec]);
    const output = renderGraph(graph, { theme: asciiTheme });
    // ASCII branch / lastBranch glyphs from the theme bundle.
    expect(output).toContain('+- ');
    expect(output).toContain('`- ');
    // No UTF-8 box-drawing characters leaked through.
    expect(output).not.toMatch(/[├└]/);
  });
});

describe('renderGraph — default theme', () => {
  it('uses a UTF-8 no-color theme when options are omitted', () => {
    const spec = makeRecord({
      type: 'spec',
      path: 'specs/sample/sample.spec.md',
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1')],
      },
    });
    const graph = buildDependencyGraph([spec]);
    const output = renderGraph(graph);
    // UTF-8 connector survives.
    expect(output).toMatch(/[├└]─/);
    // No ANSI escape sequences when color is disabled.
    // eslint-disable-next-line no-control-regex
    expect(output).not.toMatch(/\[/);
  });
});

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

  it('lists each node line with title-first layout, status marker, and a dim FQ-ID suffix', () => {
    const graph = buildDependencyGraph([spec]);
    const output = renderGraph(graph, { theme: utf8Theme });
    // Every fully-qualified node id still appears in the output — it
    // just lives at the tail as a copy/paste reference, not at the head.
    expect(output).toContain(`${SPEC_PATH}#US1`);
    expect(output).toContain(`${SPEC_PATH}#US2`);
    expect(output).toContain(`${SPEC_PATH}#US3`);
    expect(output).toContain(`${SPEC_PATH}#US4`);
    // Title leads each line directly after the connector — the
    // primary, scannable label.
    expect(output).toContain('├─ First');
    expect(output).toContain('└─ Fourth');
    expect(output).toContain('└─ Second');
    expect(output).toContain('└─ Third');
    // Tree connectors used to lay out per-layer members.
    expect(output).toMatch(/[├└]─/);
    // The full per-line layout: connector + title + marker + dim id.
    // (`utf8Theme` has color disabled, so the dim helper is identity
    // and the FQ id appears verbatim at the tail of the line.)
    expect(output).toMatch(
      new RegExp(`└─ Fourth\\s+[○✓◐⚠].*${SPEC_PATH}#US4`),
    );
  });

  it('orders Layer 0 members by their position in graph.layers[0].node_ids', () => {
    const graph = buildDependencyGraph([spec]);
    const output = renderGraph(graph, { theme: utf8Theme });
    // Match by title ("First" / "Fourth" / "Second" / "Third") rather
    // than the FQ id — the title is now the leading column.
    const us1Pos = output.indexOf('├─ First');
    const us4Pos = output.indexOf('└─ Fourth');
    const us2Pos = output.indexOf('└─ Second');
    const us3Pos = output.indexOf('└─ Third');
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

  it('omits an all-done layer entirely from default mode (no heading, no members)', () => {
    const graph = buildDependencyGraph(buildSpec());
    const output = renderGraph(graph, { theme: utf8Theme });
    // No Layer 1 heading at all — the per-layer done count adds no
    // actionable signal so the whole block is dropped.
    expect(output).not.toContain('Layer 1');
    expect(output).not.toContain('DONE (');
    expect(output).not.toContain('specs/b/b.spec.md#US2');
    // Surrounding non-done layers still surface.
    expect(output).toContain('Layer 0');
    expect(output).toContain('Layer 2');
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

  it('hides done members inside a mixed-status layer in default mode and surfaces a `done hidden` suffix', () => {
    // Layer 0 has two members: recordA (done) and recordB (not-started).
    // Default mode hides the done member from the listing and tacks
    // `, 1 done hidden` onto the heading; the not-started member
    // surfaces normally.
    const recordA = makeRecord({
      type: 'spec',
      path: 'specs/a/a.spec.md',
      status: 'done',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1', [], { title: 'Already Done' })],
      },
    });
    const recordB = makeRecord({
      type: 'spec',
      path: 'specs/b/b.spec.md',
      status: 'not-started',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1', [], { title: 'Still To Do' })],
      },
    });
    const graph = buildDependencyGraph([recordA, recordB]);
    const output = renderGraph(graph, { theme: utf8Theme });
    expect(output).not.toContain('DONE (');
    // Heading carries the visible-count and the hidden-done suffix.
    expect(output).toContain('Layer 0 — ready to work (2 items, 1 done hidden)');
    // The done member's FQ id must NOT appear — it's filtered out.
    expect(output).not.toContain('specs/a/a.spec.md#US1');
    // The not-started member surfaces with its title-first line.
    expect(output).toContain('└─ Still To Do');
    expect(output).toContain('specs/b/b.spec.md#US1');
  });

  it('expands hidden done members and drops the suffix under {all: true}', () => {
    const recordA = makeRecord({
      type: 'spec',
      path: 'specs/a/a.spec.md',
      status: 'done',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1', [], { title: 'Already Done' })],
      },
    });
    const recordB = makeRecord({
      type: 'spec',
      path: 'specs/b/b.spec.md',
      status: 'not-started',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1', [], { title: 'Still To Do' })],
      },
    });
    const graph = buildDependencyGraph([recordA, recordB]);
    const output = renderGraph(graph, { theme: utf8Theme, all: true });
    // No hidden-done suffix under --all.
    expect(output).toContain('Layer 0 — ready to work (2 items)');
    expect(output).not.toContain('done hidden');
    // Both members surface, including the done one.
    expect(output).toContain('specs/a/a.spec.md#US1');
    expect(output).toContain('specs/b/b.spec.md#US1');
    expect(output).toContain('Already Done');
    expect(output).toContain('Still To Do');
  });

  it('omits a fully-done layer entirely (no heading, no members) when every member rolls up to done', () => {
    // When the hide-done filter has nothing left to surface, the
    // whole layer block is dropped from default mode rather than
    // emitting a `Layer N: DONE` collapse line.
    const r1 = makeRecord({
      type: 'spec',
      path: 'specs/a/a.spec.md',
      status: 'done',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1')],
      },
    });
    const r2 = makeRecord({
      type: 'spec',
      path: 'specs/b/b.spec.md',
      status: 'done',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1')],
      },
    });
    const graph = buildDependencyGraph([r1, r2]);
    const output = renderGraph(graph, { theme: utf8Theme });
    // No layer heading and no member listing: an all-done graph
    // collapses to the empty string in default mode.
    expect(output).toBe('');
  });

  it('keeps non-done members (in-progress / not-started / unknown) visible alongside hidden done', () => {
    // Layer with one done, one in-progress, one not-started, one
    // unknown. Default mode hides the done; the other three must all
    // remain visible regardless of status.
    const done = makeRecord({
      type: 'spec',
      path: 'specs/a/done.spec.md',
      status: 'done',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1', [], { title: 'Finished work' })],
      },
    });
    const wip = makeRecord({
      type: 'spec',
      path: 'specs/b/wip.spec.md',
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1', [], { title: 'Half-finished work' })],
      },
    });
    const ns = makeRecord({
      type: 'spec',
      path: 'specs/c/ns.spec.md',
      status: 'not-started',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1', [], { title: 'Unstarted work' })],
      },
    });
    const unk = makeRecord({
      type: 'spec',
      path: 'specs/d/unk.spec.md',
      status: 'unknown',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [row('US1', [], { title: 'Parse-error work' })],
      },
    });
    const graph = buildDependencyGraph([done, wip, ns, unk]);
    const output = renderGraph(graph, { theme: utf8Theme });
    expect(output).toContain('Layer 0 — ready to work (4 items, 1 done hidden)');
    expect(output).not.toContain('Finished work');
    expect(output).toContain('Half-finished work');
    expect(output).toContain('Unstarted work');
    expect(output).toContain('Parse-error work');
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

  it('lists non-cyclic nodes downstream of a cycle in the flat fallback', () => {
    // US1 ↔ US2 form a cycle; US3 depends on US1, so Kahn's never
    // promotes US3 — it is non-cyclic but lives outside `graph.layers`
    // AND outside `graph.cycles`. The flat fallback must still surface
    // it so the rendered output covers every node in `graph.nodes`.
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
          row('US3', ['US1']),
        ],
      },
    });
    const graph = buildDependencyGraph([spec]);
    // Sanity guard: US3 really does live outside both layers and
    // cycles in the builder output. If this invariant ever changes we
    // want to know — the fallback rule it justifies would shift too.
    const inAnyLayer = graph.layers.some((l) =>
      l.node_ids.includes(`${SPEC_PATH}#US3`),
    );
    const inAnyCycle = graph.cycles.some((c) =>
      c.includes(`${SPEC_PATH}#US3`),
    );
    expect(inAnyLayer).toBe(false);
    expect(inAnyCycle).toBe(false);
    expect(graph.nodes).toHaveProperty(`${SPEC_PATH}#US3`);

    const output = renderGraph(graph, { theme: utf8Theme });
    const fallbackPos = output.indexOf('Nodes (flat fallback):');
    expect(fallbackPos).toBeGreaterThan(-1);
    const tail = output.slice(fallbackPos);
    expect(tail).toContain(`${SPEC_PATH}#US3`);
    // Cyclic nodes still stay off the flat list — they only appear on
    // the `Cycle:` line above.
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

describe('renderGraph — per-row action hints from records', () => {
  // When `RenderGraphOptions.records` is supplied, each visible node
  // line surfaces a `→ smithy.<cmd> <args>` hint derived from the row's
  // downstream record (real or virtual) instead of the dim FQ id.
  // Done downstreams yield no hint and the line falls back to the
  // dim FQ id so it still carries a referent.
  const SPEC_PATH = 'specs/sample/sample.spec.md';

  function makeSpecRowsRecord(): ArtifactRecord {
    return makeRecord({
      type: 'spec',
      path: SPEC_PATH,
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'US',
        format: 'table',
        rows: [
          row('US1', [], { title: 'Unstarted story', artifact_path: null }),
          row('US2', ['US1'], {
            title: 'In-progress story',
            artifact_path: 'specs/sample/02-second.tasks.md',
          }),
        ],
      },
      next_action: null,
    });
  }

  function makeVirtualUS1Tasks(): ArtifactRecord {
    return makeRecord({
      type: 'tasks',
      path: 'specs/sample/01-first.tasks.md',
      status: 'not-started',
      virtual: true,
      parent_path: SPEC_PATH,
      parent_row_id: 'US1',
      next_action: {
        command: 'smithy.cut',
        arguments: ['specs/sample', '1'],
        reason: 'US1 has no tasks file yet.',
      },
    });
  }

  function makeRealUS2Tasks(): ArtifactRecord {
    return makeRecord({
      type: 'tasks',
      path: 'specs/sample/02-second.tasks.md',
      status: 'in-progress',
      parent_path: SPEC_PATH,
      parent_row_id: 'US2',
      next_action: {
        command: 'smithy.forge',
        arguments: ['specs/sample/02-second.tasks.md'],
        reason: 'US2 has open slices.',
      },
    });
  }

  it("surfaces the downstream record's next_action as an arrow-prefixed smithy.<cmd> suffix", () => {
    const records = [
      makeSpecRowsRecord(),
      makeVirtualUS1Tasks(),
      makeRealUS2Tasks(),
    ];
    const graph = buildDependencyGraph(records);
    const output = renderGraph(graph, { theme: utf8Theme, records });
    expect(output).toContain('→ smithy.cut specs/sample 1');
    expect(output).toContain('→ smithy.forge specs/sample/02-second.tasks.md');
    expect(output).not.toContain(`${SPEC_PATH}#US1`);
    expect(output).not.toContain(`${SPEC_PATH}#US2`);
  });

  it('falls back to the dim FQ id for nodes whose downstream is done (next_action null)', () => {
    const spec = makeSpecRowsRecord();
    const doneTasks = makeRecord({
      type: 'tasks',
      path: 'specs/sample/02-second.tasks.md',
      status: 'done',
      parent_path: SPEC_PATH,
      parent_row_id: 'US2',
      next_action: null,
    });
    const records = [spec, makeVirtualUS1Tasks(), doneTasks];
    const graph = buildDependencyGraph(records);
    const output = renderGraph(graph, {
      theme: utf8Theme,
      records,
      all: true,
    });
    expect(output).toContain(`${SPEC_PATH}#US2`);
    expect(output).not.toContain('→ smithy.forge specs/sample/02-second.tasks.md');
  });

  it('synthesises per-slice smithy.forge <tasks> <N> hints for slice rows in tasks files', () => {
    const tasksRecord = makeRecord({
      type: 'tasks',
      path: 'specs/sample/01-first.tasks.md',
      status: 'in-progress',
      dependency_order: {
        id_prefix: 'S',
        format: 'table',
        rows: [
          row('S1', [], { title: 'First slice' }),
          row('S2', ['S1'], { title: 'Second slice' }),
        ],
      },
      next_action: {
        command: 'smithy.forge',
        arguments: ['specs/sample/01-first.tasks.md'],
        reason: '',
      },
    });
    const graph = buildDependencyGraph([tasksRecord]);
    const output = renderGraph(graph, {
      theme: utf8Theme,
      records: [tasksRecord],
    });
    expect(output).toContain('→ smithy.forge specs/sample/01-first.tasks.md 1');
    expect(output).toContain('→ smithy.forge specs/sample/01-first.tasks.md 2');
  });

  it('keeps the dim FQ id fallback when records option is omitted (legacy callers)', () => {
    const spec = makeSpecRowsRecord();
    const graph = buildDependencyGraph([spec, makeVirtualUS1Tasks()]);
    const output = renderGraph(graph, { theme: utf8Theme });
    expect(output).toContain(`${SPEC_PATH}#US1`);
    expect(output).toContain(`${SPEC_PATH}#US2`);
    expect(output).not.toContain('→ smithy.cut');
    expect(output).not.toContain('→ smithy.forge');
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

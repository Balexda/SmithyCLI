import { describe, expect, it } from 'vitest';
// Import through the `./index.js` barrel so these tests assert that the
// new graph types are re-exported on the stable public surface.
import {
  type DependencyGraph,
  type DependencyNode,
  type DependencyRow,
} from './index.js';

/**
 * Compile-time + runtime assertions that `DependencyGraph` and
 * `DependencyNode` exist on the public surface and match the shape
 * documented in `smithy-status-skill.data-model.md` §6.
 *
 * These tests are deliberately lightweight: TypeScript catches any
 * missing fields or mistyped fields at compile time when the literals
 * below are annotated with the imported interface; the runtime
 * `expect(...).toBeDefined()` calls just guarantee the file is exercised
 * by `vitest run` so a regression on the type surface is surfaced as a
 * failing build / failing test, not a silent type drift.
 */
describe('status type surface — DependencyGraph / DependencyNode', () => {
  it('DependencyNode wraps record_path, row, and rolled-up status', () => {
    const row: DependencyRow = {
      id: 'US1',
      title: 'Sample story',
      depends_on: [],
      artifact_path: null,
    };
    const node: DependencyNode = {
      record_path: 'specs/sample/sample.spec.md',
      row,
      status: 'not-started',
    };
    expect(node.record_path).toBe('specs/sample/sample.spec.md');
    expect(node.row.id).toBe('US1');
    expect(node.status).toBe('not-started');
  });

  it('DependencyGraph carries nodes (FQ-keyed), layers (with node_ids), cycles, and dangling_refs', () => {
    const fqId = 'specs/sample/sample.spec.md#US1';
    const row: DependencyRow = {
      id: 'US1',
      title: 'Sample story',
      depends_on: [],
      artifact_path: null,
    };
    const graph: DependencyGraph = {
      nodes: {
        [fqId]: {
          record_path: 'specs/sample/sample.spec.md',
          row,
          status: 'not-started',
        },
      },
      layers: [{ layer: 0, node_ids: [fqId] }],
      cycles: [],
      dangling_refs: [],
    };

    expect(Object.keys(graph.nodes)).toEqual([fqId]);
    expect(graph.layers).toHaveLength(1);
    expect(graph.layers[0]?.layer).toBe(0);
    expect(graph.layers[0]?.node_ids).toEqual([fqId]);
    expect(graph.cycles).toEqual([]);
    expect(graph.dangling_refs).toEqual([]);
  });

  it('DependencyGraph supports cycles and dangling_refs entries', () => {
    const a = 'specs/a.spec.md#US1';
    const b = 'specs/a.spec.md#US2';
    const graph: DependencyGraph = {
      nodes: {},
      layers: [],
      cycles: [[a, b]],
      dangling_refs: [{ source_id: a, missing_id: 'specs/a.spec.md#US99' }],
    };

    expect(graph.cycles[0]).toEqual([a, b]);
    expect(graph.dangling_refs[0]).toEqual({
      source_id: a,
      missing_id: 'specs/a.spec.md#US99',
    });
  });
});

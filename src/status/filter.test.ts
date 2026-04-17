import { describe, expect, it } from 'vitest';
// Import through the `./index.js` barrel — that is the stable public
// surface downstream modules consume, and these tests double as an
// assertion that the barrel re-exports the filter correctly.
import {
  filterRecords,
  type ArtifactRecord,
  type ArtifactType,
  type DependencyOrderTable,
  type FilterRecordsOptions,
  type Status,
} from './index.js';

/**
 * Build a synthetic `ArtifactRecord` with the minimum fields populated
 * to participate in filtering. Tests pass `overrides` for the fields
 * they care about (type, path, status, parent_path, virtual).
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
  return {
    type,
    path: overrides.path ?? `specs/sample.${type === 'tasks' ? 'tasks' : type}.md`,
    title: overrides.title ?? 'Sample',
    status: overrides.status ?? 'unknown',
    dependency_order: overrides.dependency_order ?? {
      rows: [],
      id_prefix: idPrefix,
      format: 'table',
    },
    warnings: overrides.warnings ?? [],
    ...overrides,
  };
}

/**
 * Build a canonical full-chain RFC→features→spec→tasks fixture where
 * the tasks file has the given status (for testing ancestor retention
 * under `--status`). Order is scanner-order: deepest first is NOT
 * required — we emit parent-first so tests that assert order stability
 * are explicit about what they expect.
 */
function fullChain(taskStatus: Status): ArtifactRecord[] {
  return [
    makeRecord({
      type: 'rfc',
      path: 'docs/rfcs/demo.rfc.md',
      title: 'Demo RFC',
      status: 'in-progress',
      parent_path: null,
    }),
    makeRecord({
      type: 'features',
      path: 'docs/rfcs/demo.features.md',
      title: 'Demo Features',
      status: 'in-progress',
      parent_path: 'docs/rfcs/demo.rfc.md',
    }),
    makeRecord({
      type: 'spec',
      path: 'specs/feature-a/feature-a.spec.md',
      title: 'Feature A',
      status: 'in-progress',
      parent_path: 'docs/rfcs/demo.features.md',
    }),
    makeRecord({
      type: 'tasks',
      path: 'specs/feature-a/01-first.tasks.md',
      title: 'First',
      status: taskStatus,
      parent_path: 'specs/feature-a/feature-a.spec.md',
    }),
  ];
}

describe('filterRecords — identity behavior', () => {
  it('returns the input array unchanged when no predicates are supplied', () => {
    const records = fullChain('done');
    const result = filterRecords(records, {});
    expect(result).toBe(records);
  });

  it('returns the input array unchanged when only `root` is supplied (root is a no-op inside the filter)', () => {
    const records = fullChain('in-progress');
    const result = filterRecords(records, { root: '/tmp/whatever' });
    expect(result).toBe(records);
  });

  it('returns an empty array unchanged on empty input', () => {
    const result = filterRecords([], { status: 'in-progress' });
    expect(result).toEqual([]);
  });
});

describe('filterRecords — status predicate with ancestor retention (AS 6.1)', () => {
  it('keeps status-matching records plus every ancestor by parent_path', () => {
    const records = fullChain('in-progress');
    const result = filterRecords(records, { status: 'in-progress' });
    // The tasks record matches, and its ancestors (spec, features,
    // rfc) walk up the chain. Every record in the fixture is
    // `in-progress`, so the whole chain survives.
    expect(result.map((r) => r.path)).toEqual([
      'docs/rfcs/demo.rfc.md',
      'docs/rfcs/demo.features.md',
      'specs/feature-a/feature-a.spec.md',
      'specs/feature-a/01-first.tasks.md',
    ]);
  });

  it('drops unrelated siblings whose status does not match and who are not ancestors of a match', () => {
    // Two independent chains under the same RFC. Only the first chain
    // has an in-progress tasks file; the second is entirely
    // not-started. Under `--status in-progress`, chain A survives in
    // full (tasks match + ancestors) while chain B is dropped wholesale
    // — including the features / spec / tasks nodes that share nothing
    // but the RFC.
    const records: ArtifactRecord[] = [
      makeRecord({
        type: 'rfc',
        path: 'rfc.md',
        status: 'in-progress',
        parent_path: null,
      }),
      makeRecord({
        type: 'features',
        path: 'featuresA.md',
        status: 'in-progress',
        parent_path: 'rfc.md',
      }),
      makeRecord({
        type: 'spec',
        path: 'specA.md',
        status: 'in-progress',
        parent_path: 'featuresA.md',
      }),
      makeRecord({
        type: 'tasks',
        path: 'tasksA.md',
        status: 'in-progress',
        parent_path: 'specA.md',
      }),
      makeRecord({
        type: 'features',
        path: 'featuresB.md',
        status: 'not-started',
        parent_path: 'rfc.md',
      }),
      makeRecord({
        type: 'spec',
        path: 'specB.md',
        status: 'not-started',
        parent_path: 'featuresB.md',
      }),
      makeRecord({
        type: 'tasks',
        path: 'tasksB.md',
        status: 'not-started',
        parent_path: 'specB.md',
      }),
    ];
    const result = filterRecords(records, { status: 'in-progress' });
    expect(result.map((r) => r.path)).toEqual([
      'rfc.md',
      'featuresA.md',
      'specA.md',
      'tasksA.md',
    ]);
  });

  it('terminates ancestor walks at records not present in the input (no crash on dangling parent_path)', () => {
    const records: ArtifactRecord[] = [
      makeRecord({
        type: 'tasks',
        path: 'orphan.tasks.md',
        status: 'in-progress',
        parent_path: 'specs/missing.spec.md',
      }),
    ];
    const result = filterRecords(records, { status: 'in-progress' });
    expect(result.map((r) => r.path)).toEqual(['orphan.tasks.md']);
  });
});

describe('filterRecords — type predicate with ancestor retention (AS 6.3)', () => {
  it('keeps type-matching records plus their ancestors so the renderer can surface them as headers', () => {
    const records = fullChain('done');
    const result = filterRecords(records, { type: 'spec' });
    // spec matches directly; its ancestors (features, rfc) walk up.
    // The tasks descendant is NOT an ancestor of the spec, so it is
    // dropped — matches the AS 6.3 "descendants hidden" promise.
    expect(result.map((r) => r.path)).toEqual([
      'docs/rfcs/demo.rfc.md',
      'docs/rfcs/demo.features.md',
      'specs/feature-a/feature-a.spec.md',
    ]);
  });

  it('drops descendants of type matches', () => {
    const records = fullChain('in-progress');
    const result = filterRecords(records, { type: 'features' });
    expect(result.map((r) => r.type)).toEqual(['rfc', 'features']);
  });
});

describe('filterRecords — intersection semantics (both status and type)', () => {
  it('retains a record only when both predicates match (or it is an ancestor of such a record)', () => {
    // Two specs under the same RFC → features chain. One spec is
    // in-progress, the other is not-started. `--status in-progress
    // --type spec` should retain only the first spec plus its
    // ancestors.
    const records: ArtifactRecord[] = [
      makeRecord({
        type: 'rfc',
        path: 'rfc.md',
        status: 'in-progress',
        parent_path: null,
      }),
      makeRecord({
        type: 'features',
        path: 'features.md',
        status: 'in-progress',
        parent_path: 'rfc.md',
      }),
      makeRecord({
        type: 'spec',
        path: 'specA.md',
        status: 'in-progress',
        parent_path: 'features.md',
      }),
      makeRecord({
        type: 'spec',
        path: 'specB.md',
        status: 'not-started',
        parent_path: 'features.md',
      }),
    ];
    const result = filterRecords(records, {
      status: 'in-progress',
      type: 'spec',
    });
    expect(result.map((r) => r.path)).toEqual([
      'rfc.md',
      'features.md',
      'specA.md',
    ]);
  });

  it('returns an empty array when no record matches both predicates', () => {
    // No `spec` record is `done` in this fixture, so the intersection
    // is empty and no ancestors get pulled in.
    const records = fullChain('in-progress');
    const result = filterRecords(records, { status: 'done', type: 'spec' });
    expect(result).toEqual([]);
  });

  it('drops an ancestor-by-type-only record when status does not match', () => {
    // A spec that matches `--type spec` but not `--status done` must
    // NOT be retained solely by virtue of being a type match — under
    // intersection semantics, the `--status` predicate also applies.
    const records: ArtifactRecord[] = [
      makeRecord({
        type: 'rfc',
        path: 'rfc.md',
        status: 'in-progress',
        parent_path: null,
      }),
      makeRecord({
        type: 'spec',
        path: 'spec.md',
        status: 'in-progress',
        parent_path: 'rfc.md',
      }),
    ];
    const result = filterRecords(records, { status: 'done', type: 'spec' });
    expect(result).toEqual([]);
  });
});

describe('filterRecords — virtual records', () => {
  it('retains a virtual record whose status matches, and walks its parent chain', () => {
    // A virtual not-started tasks record emitted for an `Artifact: —`
    // row on a parent spec. The virtual record has `status:
    // 'not-started'` and a non-null `parent_path`, identical to the
    // shape scanner.ts produces.
    const records: ArtifactRecord[] = [
      makeRecord({
        type: 'spec',
        path: 'spec.md',
        status: 'in-progress',
        parent_path: null,
      }),
      makeRecord({
        type: 'tasks',
        path: 'virtual-01.tasks.md',
        status: 'not-started',
        virtual: true,
        parent_path: 'spec.md',
      }),
    ];
    const result = filterRecords(records, { status: 'not-started' });
    expect(result.map((r) => r.path)).toEqual(['spec.md', 'virtual-01.tasks.md']);
  });

  it('treats a virtual record as an ancestor-eligible node just like a real record', () => {
    // Virtual spec (from an `Artifact: —` row on a feature map) sits
    // between a features record and a (hypothetical) tasks record. The
    // tasks record is the match; the virtual spec and the features
    // record are retained as ancestors.
    const records: ArtifactRecord[] = [
      makeRecord({
        type: 'features',
        path: 'features.md',
        status: 'in-progress',
        parent_path: null,
      }),
      makeRecord({
        type: 'spec',
        path: 'virtual-spec.md',
        status: 'not-started',
        virtual: true,
        parent_path: 'features.md',
      }),
      makeRecord({
        type: 'tasks',
        path: 'tasks.md',
        status: 'in-progress',
        parent_path: 'virtual-spec.md',
      }),
    ];
    const result = filterRecords(records, { status: 'in-progress' });
    expect(result.map((r) => r.path)).toEqual([
      'features.md',
      'virtual-spec.md',
      'tasks.md',
    ]);
  });
});

describe('filterRecords — purity and ordering', () => {
  it('does not mutate the input array', () => {
    const records = fullChain('in-progress');
    const snapshot = records.slice();
    filterRecords(records, { status: 'in-progress' });
    expect(records).toEqual(snapshot);
  });

  it('produces stable output for stable input (same input twice yields equal output)', () => {
    const records = fullChain('in-progress');
    const opts: FilterRecordsOptions = { status: 'in-progress', type: 'spec' };
    const a = filterRecords(records, opts);
    const b = filterRecords(records, opts);
    expect(a).toEqual(b);
  });

  it('preserves input order and emits each record exactly once', () => {
    // A spec matches `--type spec`, and its ancestor (features) also
    // has to be walked. The features record already appears earlier in
    // the input, so the result should list it once (not once-as-match
    // + once-as-ancestor) and in its original position.
    const records: ArtifactRecord[] = [
      makeRecord({
        type: 'rfc',
        path: 'rfc.md',
        status: 'in-progress',
        parent_path: null,
      }),
      makeRecord({
        type: 'features',
        path: 'features.md',
        status: 'in-progress',
        parent_path: 'rfc.md',
      }),
      makeRecord({
        type: 'spec',
        path: 'spec1.md',
        status: 'in-progress',
        parent_path: 'features.md',
      }),
      makeRecord({
        type: 'spec',
        path: 'spec2.md',
        status: 'in-progress',
        parent_path: 'features.md',
      }),
    ];
    const result = filterRecords(records, { type: 'spec' });
    expect(result.map((r) => r.path)).toEqual([
      'rfc.md',
      'features.md',
      'spec1.md',
      'spec2.md',
    ]);
  });

  it('tolerates a cyclic parent_path chain without infinite looping', () => {
    // Defensive — scanner output should be acyclic, but two records
    // referencing each other as parents must not hang the filter.
    const records: ArtifactRecord[] = [
      makeRecord({
        type: 'spec',
        path: 'a.md',
        status: 'in-progress',
        parent_path: 'b.md',
      }),
      makeRecord({
        type: 'spec',
        path: 'b.md',
        status: 'in-progress',
        parent_path: 'a.md',
      }),
    ];
    const result = filterRecords(records, { status: 'in-progress' });
    expect(result.map((r) => r.path).sort()).toEqual(['a.md', 'b.md']);
  });
});

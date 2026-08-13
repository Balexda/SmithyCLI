import { describe, expect, it } from 'vitest';
// Import through the `./index.js` barrel — that is the stable public
// surface downstream modules consume, and these tests double as an
// assertion that the barrel re-exports the defaulting helper correctly.
import {
  applyDefaultRepo,
  type ArtifactRecord,
  type SliceSummary,
} from './index.js';

function makeTasks(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    type: 'tasks',
    path: 'specs/foo/01-demo.tasks.md',
    title: 'Demo',
    status: 'not-started',
    dependency_order: { rows: [], id_prefix: 'S', format: 'table' },
    warnings: [],
    ...overrides,
  };
}

function makeSlice(overrides: Partial<SliceSummary> = {}): SliceSummary {
  return { id: 'S1', title: 'Foo', status: 'not-started', ...overrides };
}

describe('applyDefaultRepo', () => {
  it('fills the invoking repo on an undeclared tasks record and its slices', () => {
    const record = makeTasks({ slices: [makeSlice(), makeSlice({ id: 'S2' })] });
    applyDefaultRepo([record], 'SmithyCLI');
    expect(record.repo).toBe('SmithyCLI');
    expect(record.slices?.map((s) => s.repo)).toEqual(['SmithyCLI', 'SmithyCLI']);
  });

  it('never marks a defaulted value as declared', () => {
    // `repo_declared` is how a machine consumer tells a declaration from
    // a default — this helper must not blur that line.
    const record = makeTasks({ slices: [makeSlice()] });
    applyDefaultRepo([record], 'SmithyCLI');
    expect(record.repo_declared).toBeUndefined();
  });

  it('leaves a declared repo and inherited slice repos untouched', () => {
    const record = makeTasks({
      repo: 'story-spider',
      repo_declared: true,
      slices: [
        makeSlice({ repo: 'story-spider' }),
        makeSlice({ id: 'S2', repo: 'story-spider-api' }),
      ],
    });
    applyDefaultRepo([record], 'SmithyCLI');
    expect(record.repo).toBe('story-spider');
    expect(record.repo_declared).toBe(true);
    expect(record.slices?.map((s) => s.repo)).toEqual([
      'story-spider',
      'story-spider-api',
    ]);
  });

  it('does not paper over a malformed declaration', () => {
    // The record is already `unknown` because of this warning; filling in
    // a plausible-looking repo would hide the failure the warning exists
    // to surface.
    const record = makeTasks({
      warnings: ['implementation_repo: header declares an empty repo'],
      slices: [makeSlice()],
    });
    applyDefaultRepo([record], 'SmithyCLI');
    expect(record.repo).toBeUndefined();
    expect(record.slices?.[0]?.repo).toBeUndefined();
  });

  it('fills sibling slices but skips the one whose own override was malformed', () => {
    const record = makeTasks({
      repo: 'story-spider',
      repo_declared: true,
      warnings: ['implementation_repo: slice S2 declares more than one repo'],
      slices: [
        makeSlice({ repo: 'story-spider' }),
        makeSlice({ id: 'S2' }),
      ],
    });
    applyDefaultRepo([record], 'SmithyCLI');
    expect(record.slices?.map((s) => s.repo)).toEqual([
      'story-spider',
      undefined,
    ]);
  });

  it('ignores non-tasks records', () => {
    const spec: ArtifactRecord = {
      type: 'spec',
      path: 'specs/foo/demo.spec.md',
      title: 'Demo',
      status: 'not-started',
      dependency_order: { rows: [], id_prefix: 'US', format: 'table' },
      warnings: [],
    };
    applyDefaultRepo([spec], 'SmithyCLI');
    expect(spec.repo).toBeUndefined();
  });

  it('writes nothing when the repo identity could not be resolved', () => {
    const record = makeTasks({ slices: [makeSlice()] });
    applyDefaultRepo([record], '');
    expect(record.repo).toBeUndefined();
    expect(record.slices?.[0]?.repo).toBeUndefined();
  });

  it('tolerates a tasks record with no slices array', () => {
    const record = makeTasks();
    expect(() => applyDefaultRepo([record], 'SmithyCLI')).not.toThrow();
    expect(record.repo).toBe('SmithyCLI');
  });
});

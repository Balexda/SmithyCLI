import { describe, it, expect } from 'vitest';
import { computeDrift, hasDrift, formatDriftReport } from './drift.js';

describe('computeDrift', () => {
  it('reports no drift when existing matches canonical exactly', () => {
    const triple = { allow: ['Bash(ls *)', 'Bash(git status)'], ask: [], deny: ['Bash(rm -rf /)'] };
    const report = computeDrift(triple, triple);
    expect(report.unmanagedAllow).toEqual([]);
    expect(report.unmanagedAsk).toEqual([]);
    expect(report.unmanagedDeny).toEqual([]);
    expect(report.crossCategoryConflicts).toEqual([]);
    expect(hasDrift(report)).toBe(false);
  });

  it('flags allow-list entries the user has that Smithy does not manage', () => {
    const existing = { allow: ['Bash(ls *)', 'Bash(my-custom-tool)'], ask: [], deny: [] };
    const canonical = { allow: ['Bash(ls *)'], ask: [], deny: [] };
    const report = computeDrift(existing, canonical);
    expect(report.unmanagedAllow).toEqual(['Bash(my-custom-tool)']);
    expect(report.unmanagedAsk).toEqual([]);
    expect(report.unmanagedDeny).toEqual([]);
    expect(hasDrift(report)).toBe(true);
  });

  it('flags ask-list entries the user has that Smithy does not manage', () => {
    const existing = { allow: [], ask: ['Bash(stale-prompt)'], deny: [] };
    const canonical = { allow: [], ask: [], deny: [] };
    const report = computeDrift(existing, canonical);
    expect(report.unmanagedAsk).toEqual(['Bash(stale-prompt)']);
    expect(hasDrift(report)).toBe(true);
  });

  it('flags deny-list entries the user has that Smithy does not manage', () => {
    const existing = { allow: [], ask: [], deny: ['Bash(forbidden)'] };
    const canonical = { allow: [], ask: [], deny: [] };
    const report = computeDrift(existing, canonical);
    expect(report.unmanagedDeny).toEqual(['Bash(forbidden)']);
    expect(hasDrift(report)).toBe(true);
  });

  it('detects the issue #302 migration pattern (entry in both allow and ask)', () => {
    const entry = 'Bash(git push --force-with-lease *)';
    const existing = {
      allow: ['Bash(git status)', entry],
      ask: [entry],
      deny: [],
    };
    const canonical = {
      allow: ['Bash(git status)', entry],
      ask: [],
      deny: [],
    };
    const report = computeDrift(existing, canonical);
    // The stale ask copy is flagged as unmanaged.
    expect(report.unmanagedAsk).toEqual([entry]);
    // And as a cross-category conflict so the user knows the categories disagree.
    expect(report.crossCategoryConflicts).toEqual([
      { entry, categories: ['allow', 'ask'] },
    ]);
    expect(hasDrift(report)).toBe(true);
  });

  it('reports cross-category conflicts in stable allow → ask → deny order', () => {
    const entry = 'Bash(weird-case)';
    const existing = {
      // Insertion order chosen to be different from the canonical order
      // we expect in the output.
      deny: [entry],
      ask: [entry],
      allow: [entry],
    };
    const report = computeDrift(existing, { allow: [], ask: [], deny: [] });
    expect(report.crossCategoryConflicts).toHaveLength(1);
    const conflict = report.crossCategoryConflicts[0]!;
    expect(conflict.entry).toBe(entry);
    expect(conflict.categories).toEqual(['allow', 'ask', 'deny']);
  });

  it('sorts multiple cross-category conflicts alphabetically', () => {
    const existing = {
      allow: ['Bash(zzz)', 'Bash(aaa)'],
      ask: ['Bash(zzz)', 'Bash(aaa)'],
      deny: [],
    };
    const report = computeDrift(existing, { allow: [], ask: [], deny: [] });
    expect(report.crossCategoryConflicts.map(c => c.entry)).toEqual(['Bash(aaa)', 'Bash(zzz)']);
  });

  it('preserves user insertion order for unmanaged entries within a category', () => {
    const existing = {
      allow: ['Bash(custom-z)', 'Bash(custom-a)', 'Bash(custom-m)'],
      ask: [],
      deny: [],
    };
    const report = computeDrift(existing, { allow: [], ask: [], deny: [] });
    expect(report.unmanagedAllow).toEqual(['Bash(custom-z)', 'Bash(custom-a)', 'Bash(custom-m)']);
  });
});

describe('hasDrift', () => {
  it('returns false on an empty report', () => {
    expect(
      hasDrift({ unmanagedAllow: [], unmanagedAsk: [], unmanagedDeny: [], crossCategoryConflicts: [] }),
    ).toBe(false);
  });

  it('returns true if any single category has drift', () => {
    expect(
      hasDrift({ unmanagedAllow: ['x'], unmanagedAsk: [], unmanagedDeny: [], crossCategoryConflicts: [] }),
    ).toBe(true);
    expect(
      hasDrift({ unmanagedAllow: [], unmanagedAsk: ['x'], unmanagedDeny: [], crossCategoryConflicts: [] }),
    ).toBe(true);
    expect(
      hasDrift({ unmanagedAllow: [], unmanagedAsk: [], unmanagedDeny: ['x'], crossCategoryConflicts: [] }),
    ).toBe(true);
    expect(
      hasDrift({
        unmanagedAllow: [], unmanagedAsk: [], unmanagedDeny: [],
        crossCategoryConflicts: [{ entry: 'x', categories: ['allow', 'ask'] }],
      }),
    ).toBe(true);
  });
});

describe('formatDriftReport', () => {
  it('mentions the settings path in the header', () => {
    const out = formatDriftReport(
      { unmanagedAllow: ['Bash(x)'], unmanagedAsk: [], unmanagedDeny: [], crossCategoryConflicts: [] },
      '/some/path/settings.json',
    );
    expect(out).toContain('/some/path/settings.json');
  });

  it('lists cross-category collisions with the categories shown', () => {
    const out = formatDriftReport(
      {
        unmanagedAllow: [],
        unmanagedAsk: ['Bash(git push --force-with-lease *)'],
        unmanagedDeny: [],
        crossCategoryConflicts: [
          { entry: 'Bash(git push --force-with-lease *)', categories: ['allow', 'ask'] },
        ],
      },
      '/repo/.claude/settings.json',
    );
    expect(out).toContain('Cross-category collisions');
    expect(out).toContain('Bash(git push --force-with-lease *)');
    expect(out).toContain('[allow + ask]');
  });

  it('omits sections that have no entries', () => {
    const out = formatDriftReport(
      { unmanagedAllow: ['Bash(x)'], unmanagedAsk: [], unmanagedDeny: [], crossCategoryConflicts: [] },
      '/p/settings.json',
    );
    expect(out).toContain('Unmanaged `allow` entries');
    expect(out).not.toContain('Unmanaged `ask` entries');
    expect(out).not.toContain('Unmanaged `deny` entries');
    expect(out).not.toContain('Cross-category collisions');
  });

  it('reminds the user that update never removes entries', () => {
    const out = formatDriftReport(
      { unmanagedAllow: ['Bash(x)'], unmanagedAsk: [], unmanagedDeny: [], crossCategoryConflicts: [] },
      '/p/settings.json',
    );
    expect(out).toMatch(/never removes entries you added/);
  });
});

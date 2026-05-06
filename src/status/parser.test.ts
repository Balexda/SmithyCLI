import { describe, expect, it } from 'vitest';
// Import through the `./index.js` barrel — that is the stable public
// surface downstream modules consume, and these tests double as an
// assertion that the barrel re-exports the parser correctly.
import { parseArtifact, parseDependencyTable } from './index.js';

describe('parseDependencyTable', () => {
  it('parses a well-formed 4-column table preserving source order', () => {
    // Mix backticked and plain Artifact cells. Real specs wrap paths in
    // markdown inline-code backticks (the canonical form documented in
    // `src/templates/agent-skills/README.md`), so the parser must strip
    // a single pair of surrounding backticks while still accepting plain
    // paths for backwards compatibility.
    const markdown = `# Some Spec

Preamble text.

## Dependency Order

| ID  | Title       | Depends On | Artifact                |
|-----|-------------|------------|-------------------------|
| US1 | First story | —          | \`specs/a/us1.tasks.md\` |
| US2 | Second story| US1        | specs/a/us2.tasks.md    |
| US3 | Third story | —          | —                       |

## Next Section

trailing content
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.warnings).toEqual([]);
    expect(result.table.format).toBe('table');
    expect(result.table.id_prefix).toBe('US');
    expect(result.table.rows).toHaveLength(3);
    expect(result.table.rows[0]).toEqual({
      id: 'US1',
      title: 'First story',
      depends_on: [],
      artifact_path: 'specs/a/us1.tasks.md',
    });
    expect(result.table.rows[1]).toEqual({
      id: 'US2',
      title: 'Second story',
      depends_on: ['US1'],
      artifact_path: 'specs/a/us2.tasks.md',
    });
    expect(result.table.rows[2]).toEqual({
      id: 'US3',
      title: 'Third story',
      depends_on: [],
      artifact_path: null,
    });
  });

  it('coerces backtick-wrapped absolute Artifact paths to null with a warning', () => {
    // Backtick unwrapping must happen before the absolute-path check so
    // a backticked absolute path is still rejected instead of being
    // treated as a relative path after stripping.
    const markdown = `## Dependency Order

| ID  | Title | Depends On | Artifact            |
|-----|-------|------------|---------------------|
| US1 | Foo   | —          | \`/etc/passwd\`      |
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.rows).toHaveLength(1);
    expect(result.table.rows[0]?.artifact_path).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/absolute path/);
    expect(result.warnings[0]).toMatch(/US1/);
    // The warning should quote the unwrapped path, not the backticked form.
    expect(result.warnings[0]).toContain("'/etc/passwd'");
  });

  it('returns missing format when no Dependency Order section exists', () => {
    const markdown = `# Spec

Just prose, no dep order section.

## Unrelated

body
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.warnings).toEqual([]);
    expect(result.table.format).toBe('missing');
    expect(result.table.rows).toEqual([]);
    expect(result.table.id_prefix).toBe('US');
  });

  it('AS 9.5: detects legacy format from checkbox list under Dependency Order and emits migration-pointer warning', () => {
    // AS 9.5 — legacy checkbox-based `## Dependency Order` sections
    // must emit a `format_legacy` warning whose body points at the
    // canonical 4-column schema documentation (FR-028). No tolerant
    // parsing is performed: rows stay empty.
    const markdown = `# Old Spec

## Dependency Order

- [x] Foo
- [ ] Bar
- [ ] Baz

## Next
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.format).toBe('legacy');
    expect(result.table.rows).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^format_legacy:/);
    // FR-028: warning body must point at the canonical 4-column schema doc.
    expect(result.warnings[0]).toContain(
      'src/templates/agent-skills/README.md',
    );
  });

  it('parses as table when checkboxes appear inside the Title column of a 4-column table', () => {
    const markdown = `## Dependency Order

| ID  | Title               | Depends On | Artifact |
|-----|---------------------|------------|----------|
| US1 | Handle - [x] thing  | —          | —        |
| US2 | - [ ] Another title | —          | —        |
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.format).toBe('table');
    expect(result.table.rows).toHaveLength(2);
    expect(result.table.rows[0]?.title).toBe('Handle - [x] thing');
    expect(result.table.rows[1]?.title).toBe('- [ ] Another title');
  });

  it('drops dangling depends_on references with a warning', () => {
    const markdown = `## Dependency Order

| ID  | Title | Depends On | Artifact |
|-----|-------|------------|----------|
| US1 | Foo   | —          | —        |
| US2 | Bar   | US9        | —        |
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.format).toBe('table');
    expect(result.table.rows).toHaveLength(2);
    expect(result.table.rows[1]?.depends_on).toEqual([]);
    const dangling = result.warnings.filter(w => /dangling/.test(w));
    expect(dangling).toHaveLength(1);
    expect(dangling[0]).toMatch(/US9/);
  });

  it('records dangling depends_on references in a structured dangling_refs field alongside the warning string', () => {
    // Dual surfacing per data-model §4 / §6: the warning string MUST
    // continue to be emitted (existing callers key off it), but the
    // dropped reference MUST also appear in a structured field on the
    // table so `buildDependencyGraph` can consume it without parsing
    // strings.
    const markdown = `## Dependency Order

| ID  | Title | Depends On | Artifact |
|-----|-------|------------|----------|
| US1 | A     | —          | —        |
| US2 | B     | —          | —        |
| US3 | C     | US2, US9   | —        |
| US4 | D     | US42       | —        |
`;
    const result = parseDependencyTable(markdown, 'spec');
    // Warnings are unchanged — both unresolved IDs still produce one
    // warning each, in source order.
    const danglingWarnings = result.warnings.filter((w) => /dangling/.test(w));
    expect(danglingWarnings).toHaveLength(2);
    expect(danglingWarnings[0]).toMatch(/US3/);
    expect(danglingWarnings[0]).toMatch(/US9/);
    expect(danglingWarnings[1]).toMatch(/US4/);
    expect(danglingWarnings[1]).toMatch(/US42/);
    // Structured field carries bare (non-fully-qualified) IDs in source
    // order — the table itself has no path context to fully-qualify
    // against.
    expect(result.table.dangling_refs).toEqual([
      { source_id: 'US3', missing_id: 'US9' },
      { source_id: 'US4', missing_id: 'US42' },
    ]);
    // Surviving valid edges are kept on the row's `depends_on`.
    expect(result.table.rows[2]?.depends_on).toEqual(['US2']);
    expect(result.table.rows[3]?.depends_on).toEqual([]);
  });

  it('omits the dangling_refs field entirely when no references were dropped', () => {
    const markdown = `## Dependency Order

| ID  | Title | Depends On | Artifact |
|-----|-------|------------|----------|
| US1 | A     | —          | —        |
| US2 | B     | US1        | —        |
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.warnings).toEqual([]);
    expect(result.table.dangling_refs).toBeUndefined();
  });

  it('coerces absolute Artifact paths to null with a warning', () => {
    const markdown = `## Dependency Order

| ID  | Title | Depends On | Artifact         |
|-----|-------|------------|------------------|
| US1 | Foo   | —          | /abs/path.tasks.md |
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.rows).toHaveLength(1);
    expect(result.table.rows[0]?.artifact_path).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/absolute path/);
    expect(result.warnings[0]).toMatch(/US1/);
  });

  it('parses comma-separated depends_on into trimmed array', () => {
    const markdown = `## Dependency Order

| ID  | Title | Depends On | Artifact |
|-----|-------|------------|----------|
| US1 | A     | —          | —        |
| US2 | B     | —          | —        |
| US3 | C     | —          | —        |
| US4 | D     | US1, US3   | —        |
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.rows).toHaveLength(4);
    expect(result.table.rows[3]?.depends_on).toEqual(['US1', 'US3']);
    expect(result.warnings).toEqual([]);
  });

  it('drops rows whose ID fails the canonical regex and keeps following rows', () => {
    const markdown = `## Dependency Order

| ID   | Title | Depends On | Artifact |
|------|-------|------------|----------|
| us01 | Bad   | —          | —        |
| US2  | Good  | —          | —        |
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.rows).toHaveLength(1);
    expect(result.table.rows[0]?.id).toBe('US2');
    expect(result.warnings.some(w => /invalid ID/.test(w) && /us01/.test(w))).toBe(true);
  });

  it('warns when a row ID prefix disagrees with the derived id_prefix but keeps the row', () => {
    const markdown = `## Dependency Order

| ID  | Title | Depends On | Artifact |
|-----|-------|------------|----------|
| US1 | A     | —          | —        |
| F1  | B     | —          | —        |
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.id_prefix).toBe('US');
    expect(result.table.rows).toHaveLength(2);
    expect(result.table.rows.map(r => r.id)).toEqual(['US1', 'F1']);
    expect(result.warnings.some(w => /F1/.test(w) && /prefix/i.test(w))).toBe(true);
  });

  it('handles comma-separated depends_on with some dangling IDs', () => {
    const markdown = `## Dependency Order

| ID  | Title | Depends On | Artifact |
|-----|-------|------------|----------|
| US1 | A     | —          | —        |
| US2 | B     | —          | —        |
| US3 | C     | US2, US9   | —        |
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.rows[2]?.depends_on).toEqual(['US2']);
    const dangling = result.warnings.filter(w => /dangling/.test(w));
    expect(dangling).toHaveLength(1);
    expect(dangling[0]).toMatch(/US9/);
  });

  it('derives id_prefix from artifactType for rfc, features, and tasks', () => {
    const empty = `## Dependency Order

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
`;
    expect(parseDependencyTable(empty, 'rfc').table.id_prefix).toBe('M');
    expect(parseDependencyTable(empty, 'features').table.id_prefix).toBe('F');
    expect(parseDependencyTable(empty, 'tasks').table.id_prefix).toBe('S');
  });

  it('returns table format with empty rows when header is present but body is empty', () => {
    const markdown = `## Dependency Order

| ID  | Title | Depends On | Artifact |
|-----|-------|------------|----------|

## Next

body
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.format).toBe('table');
    expect(result.table.rows).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('drops duplicate IDs with a warning and keeps only the first occurrence', () => {
    const markdown = `## Dependency Order

| ID  | Title    | Depends On | Artifact |
|-----|----------|------------|----------|
| US1 | First    | —          | —        |
| US1 | Second   | —          | —        |
| US2 | Keeper   | US1        | —        |
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.format).toBe('table');
    expect(result.table.rows).toHaveLength(2);
    expect(result.table.rows[0]?.title).toBe('First');
    expect(result.table.rows[1]?.id).toBe('US2');
    const dupWarnings = result.warnings.filter((w) => /duplicate ID/.test(w));
    expect(dupWarnings).toHaveLength(1);
    expect(dupWarnings[0]).toMatch(/US1/);
    // The surviving US2 row can still reference US1 — the duplicate
    // drop happens after the first valid US1 is already recorded.
    expect(result.table.rows[1]?.depends_on).toEqual(['US1']);
  });

  it('parses headers whose columns are in a non-canonical order', () => {
    const markdown = `## Dependency Order

| Title | Depends On | ID  | Artifact |
|-------|------------|-----|----------|
| Foo   | —          | US1 | —        |
| Bar   | US1        | US2 | specs/foo/02-bar.tasks.md |
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.format).toBe('table');
    expect(result.table.rows).toEqual([
      { id: 'US1', title: 'Foo', depends_on: [], artifact_path: null },
      {
        id: 'US2',
        title: 'Bar',
        depends_on: ['US1'],
        artifact_path: 'specs/foo/02-bar.tasks.md',
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('reports format: missing with a warning when the section has no recognizable table header', () => {
    const markdown = `## Dependency Order

Some prose here that is neither a table nor a checkbox list.

Another paragraph.

## Next
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.format).toBe('missing');
    expect(result.table.rows).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/no 4-column table header/);
  });

  it('AS 9.6: ignores trailing freestanding checkboxes inside a valid 4-column Dependency Order section', () => {
    // AS 9.6 — under the new unified table format, checkboxes are
    // semantically meaningless inside `## Dependency Order`. A valid
    // 4-column table followed by trailing `- [ ]` / `- [x]` lines
    // must still parse as `format: 'table'` with the valid rows
    // preserved and no `format_legacy` warning.
    //
    // Note: interleaved-checkbox tolerance (a freestanding checkbox
    // between two valid table rows) is out of scope and tracked as
    // specification debt SD-010 in
    // `09-scanner-classifies-without-checkboxes.tasks.md`.
    const markdown = `## Dependency Order

| ID  | Title | Depends On | Artifact              |
|-----|-------|------------|-----------------------|
| US1 | First | —          | specs/a/us1.tasks.md  |
| US2 | Second| US1        | —                     |

- [x] Stray legacy completion marker
- [ ] Another stray checkbox

## Next
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.format).toBe('table');
    expect(result.table.rows).toEqual([
      {
        id: 'US1',
        title: 'First',
        depends_on: [],
        artifact_path: 'specs/a/us1.tasks.md',
      },
      {
        id: 'US2',
        title: 'Second',
        depends_on: ['US1'],
        artifact_path: null,
      },
    ]);
    expect(
      result.warnings.some((w) => w.startsWith('format_legacy:')),
    ).toBe(false);
  });

  it('rejects headers that are missing one of the canonical column labels', () => {
    // "Owner" is not a canonical label, so the header fails to match
    // and the section is treated as structurally missing.
    const markdown = `## Dependency Order

| ID  | Title | Owner | Artifact |
|-----|-------|-------|----------|
| US1 | Foo   | Alice | —        |
`;
    const result = parseDependencyTable(markdown, 'spec');
    expect(result.table.format).toBe('missing');
    expect(result.warnings).toHaveLength(1);
  });
});

describe('parseArtifact', () => {
  it('extracts title from a `# Feature Specification:` H1 prefix', () => {
    const markdown = `# Feature Specification: Status Scanner

Body text.
`;
    const record = parseArtifact('specs/foo/status.spec.md', markdown);
    expect(record.title).toBe('Status Scanner');
  });

  it('uses the verbatim H1 text when no specification prefix is present', () => {
    const markdown = `# Just A Title

Body text.
`;
    const record = parseArtifact('docs/rfcs/x.rfc.md', markdown);
    expect(record.title).toBe('Just A Title');
  });

  it('falls back to the filename stem for a tasks file with no H1', () => {
    const record = parseArtifact('specs/foo/01-bar.tasks.md', '');
    expect(record.title).toBe('01-bar');
  });

  it('falls back to the filename stem for a spec file with no H1', () => {
    const record = parseArtifact('specs/foo/baz.spec.md', '');
    expect(record.title).toBe('baz');
  });

  it('counts slices (not individual task checkboxes) and ignores checkboxes outside slice sections', () => {
    // Slice 1 has an unchecked task — not done.
    // Slice 2 has an unchecked task — not done.
    // The appendix checkbox is ignored regardless.
    // Expect 0 completed slices out of 2 total slices.
    const markdown = `# Tasks

## Slice 1: Foo

- [x] a
- [x] b
- [ ] c

## Slice 2: Bar

- [ ] d

## Appendix

- [x] ignored-in-appendix
`;
    const record = parseArtifact('specs/foo/tasks.tasks.md', markdown);
    expect(record.completed).toBe(0);
    expect(record.total).toBe(2);
  });

  it('marks a slice as done when every checkbox inside its `## Slice N:` section is ticked', () => {
    // Slice 1: all checked → done.
    // Slice 2: partially checked → not done.
    // Expect 1 completed slice out of 2 total slices — this is the
    // counter the user sees for `09-scanner-classifies-without-checkboxes.tasks.md`.
    const markdown = `# Tasks

## Slice 1: Foo

- [x] a
- [x] b

## Slice 2: Bar

- [x] c
- [ ] d
`;
    const record = parseArtifact('specs/foo/tasks.tasks.md', markdown);
    expect(record.completed).toBe(1);
    expect(record.total).toBe(2);
  });

  it('ignores checkboxes inside a legacy Dependency Order section when resolving slice completion', () => {
    const markdown = `# Legacy Tasks

## Dependency Order

- [x] Something
- [ ] Another

## Slice 1: Foo

- [ ] a
`;
    const record = parseArtifact('specs/foo/legacy.tasks.md', markdown);
    expect(record.completed).toBe(0);
    expect(record.total).toBe(1);
    expect(record.dependency_order.format).toBe('legacy');
    expect(record.warnings.some((w) => /format_legacy/.test(w))).toBe(true);
  });

  it('omits completed and total for non-tasks files', () => {
    const markdown = `# Spec

## Dependency Order

| ID  | Title | Depends On | Artifact |
|-----|-------|------------|----------|
| US1 | A     | —          | —        |
`;
    const record = parseArtifact('specs/foo/bar.spec.md', markdown);
    expect(record.completed).toBeUndefined();
    expect(record.total).toBeUndefined();
  });

  it('derives type rfc from `.rfc.md` suffix', () => {
    const record = parseArtifact('docs/rfcs/a.rfc.md', '# A\n');
    expect(record.type).toBe('rfc');
  });

  it('derives type features from `.features.md` suffix', () => {
    const record = parseArtifact('specs/foo/a.features.md', '# A\n');
    expect(record.type).toBe('features');
  });

  it('derives type spec from `.spec.md` suffix', () => {
    const record = parseArtifact('specs/foo/a.spec.md', '# A\n');
    expect(record.type).toBe('spec');
  });

  it('derives type tasks from `.tasks.md` suffix', () => {
    const record = parseArtifact('specs/foo/a.tasks.md', '# A\n');
    expect(record.type).toBe('tasks');
  });

  it('returns a record with format: missing and no warnings when no Dependency Order section exists', () => {
    const markdown = `# A Spec

Just prose.
`;
    const record = parseArtifact('specs/foo/a.spec.md', markdown);
    expect(record.dependency_order.format).toBe('missing');
    expect(record.warnings).toEqual([]);
  });

  it('returns a record with warnings for malformed but recoverable dependency order rows', () => {
    const markdown = `# A Spec

## Dependency Order

| ID   | Title | Depends On | Artifact |
|------|-------|------------|----------|
| us01 | Bad   | —          | —        |
| US2  | Good  | —          | —        |
`;
    const record = parseArtifact('specs/foo/a.spec.md', markdown);
    expect(record.dependency_order.rows).toHaveLength(1);
    expect(record.warnings.some((w) => /invalid ID/.test(w))).toBe(true);
  });

  // parseArtifact deliberately returns status: 'unknown' as a placeholder
  // on every record; the scanner's classifyRecord pass overwrites it.
  it('sets status to "unknown" as a placeholder — classifyRecord in the scanner overwrites it', () => {
    const markdown = `# A Spec

## Dependency Order

| ID  | Title | Depends On | Artifact |
|-----|-------|------------|----------|
| US1 | A     | —          | —        |
`;
    const record = parseArtifact('specs/foo/a.spec.md', markdown);
    expect(record.status).toBe('unknown');
  });

  it('never throws on pathological input', () => {
    const pathological = `###\n|||\n- [x]`;
    expect(() => parseArtifact('specs/foo/weird.spec.md', pathological)).not.toThrow();
    const record = parseArtifact('specs/foo/weird.spec.md', pathological);
    expect(record).toBeDefined();
    expect(record.type).toBe('spec');
  });

  it('counts indented checkboxes inside a slice body', () => {
    const markdown = `## Slice 1: Foo

  - [x] nested
`;
    const record = parseArtifact('specs/foo/a.tasks.md', markdown);
    expect(record.completed).toBe(1);
    expect(record.total).toBe(1);
  });

  it('parses multi-digit slice numbers', () => {
    const markdown = `## Slice 12: Foo

- [x] a
`;
    const record = parseArtifact('specs/foo/a.tasks.md', markdown);
    expect(record.completed).toBe(1);
    expect(record.total).toBe(1);
  });

  it('captures per-slice id, title, and status on tasks records', () => {
    // Mixed slice statuses exercise every branch of the per-slice
    // status derivation: all-checked → done, partially-checked →
    // in-progress, none-checked → not-started. The renderer surfaces
    // each entry with its `S<N>` id so the issue-296 visibility gap
    // (slice numbers missing from `smithy status`) cannot regress.
    const markdown = `# Tasks

## Slice 1: Foo

- [x] a
- [x] b

## Slice 2: Bar

- [x] c
- [ ] d

## Slice 3: Baz

- [ ] e
`;
    const record = parseArtifact('specs/foo/a.tasks.md', markdown);
    expect(record.slices).toEqual([
      { id: 'S1', title: 'Foo', status: 'done' },
      { id: 'S2', title: 'Bar', status: 'in-progress' },
      { id: 'S3', title: 'Baz', status: 'not-started' },
    ]);
  });

  it('emits an empty slices array when a tasks file has no slice headings', () => {
    const record = parseArtifact('specs/foo/a.tasks.md', '# Empty\n');
    expect(record.slices).toEqual([]);
  });

  it('omits slices on non-tasks records', () => {
    const record = parseArtifact('specs/foo/a.spec.md', '# Spec\n');
    expect(record.slices).toBeUndefined();
  });
});

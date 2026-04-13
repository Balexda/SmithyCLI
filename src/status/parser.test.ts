import { describe, expect, it } from 'vitest';
import { parseDependencyTable } from './parser.js';

describe('parseDependencyTable', () => {
  it('parses a well-formed 4-column table preserving source order', () => {
    const markdown = `# Some Spec

Preamble text.

## Dependency Order

| ID  | Title       | Depends On | Artifact              |
|-----|-------------|------------|-----------------------|
| US1 | First story | —          | specs/a/us1.tasks.md  |
| US2 | Second story| US1        | specs/a/us2.tasks.md  |
| US3 | Third story | —          | —                     |

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

  it('detects legacy format from checkbox list under Dependency Order', () => {
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
});

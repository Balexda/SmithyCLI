/**
 * Pure Markdown parser for Smithy artifact files.
 *
 * This module intentionally performs no filesystem I/O and no status
 * classification. It turns Markdown text into structured records and
 * collects non-fatal issues as warning strings for the caller to surface.
 */

import type {
  ArtifactRecord,
  ArtifactType,
  DependencyOrderTable,
  DependencyRow,
} from './types.js';

/**
 * Result returned by {@link parseDependencyTable}.
 *
 * `DependencyOrderTable` itself does not carry warnings (the scanner
 * attaches them to the owning `ArtifactRecord`), so the parser returns
 * them alongside the table as a parallel list.
 */
export interface ParsedDependencyTable {
  table: DependencyOrderTable;
  warnings: string[];
}

type IdPrefix = DependencyOrderTable['id_prefix'];

const ID_PREFIX_BY_TYPE: Record<ArtifactType, IdPrefix> = {
  rfc: 'M',
  features: 'F',
  spec: 'US',
  tasks: 'S',
};

const ID_REGEX = /^(M|F|US|S)[1-9][0-9]*$/;
const EM_DASH = '—';

const EXPECTED_HEADERS = ['id', 'title', 'depends on', 'artifact'];

/**
 * Parse the `## Dependency Order` section of a Smithy artifact.
 *
 * Returns a {@link DependencyOrderTable} plus a parallel `warnings` list
 * of human-readable non-fatal issues. Never throws.
 */
export function parseDependencyTable(
  markdown: string,
  artifactType: ArtifactType,
): ParsedDependencyTable {
  const id_prefix = ID_PREFIX_BY_TYPE[artifactType];
  const warnings: string[] = [];

  const sectionBody = extractDependencyOrderSection(markdown);
  if (sectionBody === null) {
    return {
      table: { rows: [], id_prefix, format: 'missing' },
      warnings,
    };
  }

  const lines = sectionBody.split('\n');
  const headerInfo = findTableHeader(lines);

  if (headerInfo === null) {
    // No 4-column header — check for legacy checkbox format.
    const hasCheckbox = lines.some((line) => /^\s*-\s*\[[ xX]\]/.test(line));
    if (hasCheckbox) {
      warnings.push(
        'format_legacy: `## Dependency Order` uses checkbox list; expected 4-column table (ID | Title | Depends On | Artifact)',
      );
      return {
        table: { rows: [], id_prefix, format: 'legacy' },
        warnings,
      };
    }
    // Neither header nor checkboxes — empty table.
    return {
      table: { rows: [], id_prefix, format: 'table' },
      warnings,
    };
  }

  // Parse data rows beginning after the separator line.
  const rows: DependencyRow[] = [];
  const rawRows: Array<{ cells: string[]; sourceIndex: number }> = [];
  for (let i = headerInfo.dataStart; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '') break;
    if (/^\s*##\s/.test(line)) break;
    if (!line.includes('|')) break;
    const cells = splitTableRow(line);
    if (cells.length < 4) continue;
    rawRows.push({ cells, sourceIndex: rawRows.length + 1 });
  }

  // First pass: validate IDs and build rows with raw depends_on lists.
  interface PartialRow {
    row: DependencyRow;
    rawDependsOn: string[];
  }
  const partials: PartialRow[] = [];
  for (const { cells, sourceIndex } of rawRows) {
    const id = (cells[0] ?? '').trim();
    const title = (cells[1] ?? '').trim();
    const dependsOnCell = (cells[2] ?? '').trim();
    const artifactCell = (cells[3] ?? '').trim();

    if (!ID_REGEX.test(id)) {
      warnings.push(
        `dependency_order: row ${sourceIndex} has invalid ID '${id}' — dropped`,
      );
      continue;
    }

    const rowPrefix = id.startsWith('US') ? 'US' : (id[0] as IdPrefix);
    if (rowPrefix !== id_prefix) {
      warnings.push(
        `dependency_order: row ${id} has prefix '${rowPrefix}' but expected '${id_prefix}' for artifact type '${artifactType}'`,
      );
    }

    const rawDependsOn =
      dependsOnCell === EM_DASH || dependsOnCell === ''
        ? []
        : dependsOnCell
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v.length > 0);

    let artifact_path: string | null;
    if (artifactCell === EM_DASH || artifactCell === '') {
      artifact_path = null;
    } else if (isAbsolutePath(artifactCell)) {
      warnings.push(
        `dependency_order: row ${id} has absolute path '${artifactCell}' — coerced to null`,
      );
      artifact_path = null;
    } else {
      artifact_path = artifactCell;
    }

    partials.push({
      row: { id, title, depends_on: [], artifact_path },
      rawDependsOn,
    });
  }

  // Second pass: resolve dangling depends_on references against the
  // set of valid IDs in this table.
  const validIds = new Set(partials.map((p) => p.row.id));
  for (const { row, rawDependsOn } of partials) {
    const resolved: string[] = [];
    for (const dep of rawDependsOn) {
      if (validIds.has(dep)) {
        resolved.push(dep);
      } else {
        warnings.push(
          `dependency_order: ${row.id} depends on dangling ID '${dep}' — dropped`,
        );
      }
    }
    row.depends_on = resolved;
    rows.push(row);
  }

  return {
    table: { rows, id_prefix, format: 'table' },
    warnings,
  };
}

/**
 * Parse a Smithy artifact Markdown file into an {@link ArtifactRecord}.
 *
 * Pure function — does not touch the filesystem and never throws. The
 * `filePath` argument is used to derive the {@link ArtifactType}, to set
 * the `path` field on the returned record, and to compute a fallback
 * title from the filename stem. Any non-fatal issue (malformed
 * dependency-order rows, unknown filename suffix) is appended to the
 * record's `warnings` list.
 *
 * Status classification is deferred to Slice 2 — every record returned
 * here carries `status: 'unknown'` as a placeholder.
 */
export function parseArtifact(
  filePath: string,
  content: string,
): ArtifactRecord {
  const warnings: string[] = [];

  // Derive ArtifactType from the filename suffix.
  let type: ArtifactType;
  if (filePath.endsWith('.rfc.md')) {
    type = 'rfc';
  } else if (filePath.endsWith('.features.md')) {
    type = 'features';
  } else if (filePath.endsWith('.spec.md')) {
    type = 'spec';
  } else if (filePath.endsWith('.tasks.md')) {
    type = 'tasks';
  } else {
    type = 'spec';
    warnings.push(
      `artifact_type: unknown filename suffix for ${filePath} — defaulted to 'spec'`,
    );
  }

  // Extract the title (never throw).
  let title: string;
  try {
    title = extractTitle(content, filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`parser: unexpected error while parsing title — ${message}`);
    title = filenameStem(filePath);
  }

  // Delegate to parseDependencyTable.
  const depResult = parseDependencyTable(content, type);
  warnings.push(...depResult.warnings);

  const record: ArtifactRecord = {
    type,
    path: filePath,
    title,
    status: 'unknown',
    dependency_order: depResult.table,
    warnings,
  };

  if (type === 'tasks') {
    try {
      const counts = countSliceBodyCheckboxes(content);
      record.completed = counts.completed;
      record.total = counts.total;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(
        `parser: unexpected error while counting slice checkboxes — ${message}`,
      );
      record.completed = 0;
      record.total = 0;
    }
  }

  return record;
}

/**
 * Extract the artifact title from its first H1, handling the canonical
 * `# Feature Specification: <Title>` prefix. Falls back to the filename
 * stem when no H1 exists.
 */
function extractTitle(content: string, filePath: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    if (/^#\s+/.test(line)) {
      const raw = line.replace(/^#\s+/, '').trimEnd();
      const specPrefix = 'Feature Specification:';
      if (raw.startsWith(specPrefix)) {
        return raw.slice(specPrefix.length).trim();
      }
      return raw.trim();
    }
  }
  return filenameStem(filePath);
}

/**
 * Strip the directory and the longest matching suffix from
 * `{.rfc.md, .features.md, .spec.md, .tasks.md, .md}` off a path,
 * preserving the remaining stem verbatim.
 */
function filenameStem(filePath: string): string {
  const base =
    filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;
  const suffixes = ['.rfc.md', '.features.md', '.spec.md', '.tasks.md', '.md'];
  for (const suffix of suffixes) {
    if (base.endsWith(suffix)) {
      return base.slice(0, base.length - suffix.length);
    }
  }
  return base;
}

/**
 * Count `- [ ]` and `- [x]` / `- [X]` items that appear only inside
 * `## Slice <N>:` H2 body sections. Checkboxes anywhere else in the
 * file (e.g., `## Dependency Order`, appendices) are ignored.
 */
function countSliceBodyCheckboxes(content: string): {
  completed: number;
  total: number;
} {
  const lines = content.split('\n');
  const sliceHeadingRegex = /^##\s+Slice\s+\d+:/;
  const h2Regex = /^##\s/;
  const checkboxRegex = /^\s*-\s*\[([ xX])\]\s/;

  let completed = 0;
  let total = 0;
  let insideSlice = false;

  for (const line of lines) {
    if (h2Regex.test(line)) {
      insideSlice = sliceHeadingRegex.test(line);
      continue;
    }
    if (!insideSlice) continue;
    const match = checkboxRegex.exec(line);
    if (match === null) continue;
    total += 1;
    const marker = match[1] ?? ' ';
    if (marker === 'x' || marker === 'X') {
      completed += 1;
    }
  }

  return { completed, total };
}

/**
 * Return the body of the `## Dependency Order` H2 section, or `null` if
 * no such section exists. The body is everything after the heading line
 * until the next H2 or end of file.
 */
function extractDependencyOrderSection(markdown: string): string | null {
  const lines = markdown.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Dependency Order\s*$/.test(lines[i] ?? '')) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s/.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/**
 * Locate a 4-column Markdown table header (ID | Title | Depends On |
 * Artifact) followed by a separator row. Returns the index of the first
 * data row, or `null` if no recognizable header/separator pair is found.
 */
function findTableHeader(
  lines: string[],
): { dataStart: number } | null {
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (!line.includes('|')) continue;
    const cells = splitTableRow(line).map((c) => c.trim().toLowerCase());
    if (cells.length < 4) continue;
    const matchesHeader = EXPECTED_HEADERS.every((label) =>
      cells.includes(label),
    );
    if (!matchesHeader) continue;
    // Look for the separator row on the next non-empty line.
    const sepIndex = i + 1;
    if (sepIndex >= lines.length) continue;
    const sepLine = lines[sepIndex];
    if (sepLine === undefined) continue;
    if (!isSeparatorRow(sepLine)) continue;
    return { dataStart: sepIndex + 1 };
  }
  return null;
}

/**
 * Split a Markdown table row on `|` and drop the leading / trailing
 * empty cells produced by the outer pipes.
 */
function splitTableRow(line: string): string[] {
  const parts = line.split('|');
  // Drop leading empty cell if the line starts with `|`.
  if (parts.length > 0 && (parts[0] ?? '').trim() === '') parts.shift();
  // Drop trailing empty cell if the line ends with `|`.
  if (parts.length > 0 && (parts[parts.length - 1] ?? '').trim() === '') parts.pop();
  return parts;
}

/**
 * True if the line is a Markdown table separator row — every cell is
 * a run of `-` characters, optionally prefixed/suffixed with `:` for
 * alignment hints.
 */
function isSeparatorRow(line: string): boolean {
  if (!line.includes('|')) return false;
  const cells = splitTableRow(line).map((c) => c.trim());
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

/**
 * Treat POSIX absolute paths and Windows drive-letter paths as absolute.
 */
function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

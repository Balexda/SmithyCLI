/**
 * Pure Markdown parser for Smithy artifact files.
 *
 * This module intentionally performs no filesystem I/O and no status
 * classification. It turns Markdown text into structured records and
 * collects non-fatal issues as warning strings for the caller to surface.
 */

import type {
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

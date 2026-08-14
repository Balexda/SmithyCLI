import path from 'path';
import { parse as parseYaml } from 'yaml';

import type {
  EngravedDomain,
  EngravedKind,
  EngravedLevel,
  EngravedRecord,
  LedgerDisposition,
  LedgerRow,
  LedgerSeverity,
  LedgerSummary,
} from './types.js';

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/;

/**
 * Id prefixes per level, longest first so `U-INV-` is tried before `INV-`
 * would ever match the tail of it.
 */
const LEVEL_PREFIXES: ReadonlyArray<{ level: EngravedLevel; prefix: string }> = [
  { level: 'user', prefix: 'U-' },
  { level: 'project', prefix: 'PJ-' },
];

const KIND_VALUES: readonly EngravedKind[] = ['decision', 'invariant', 'principle'];
const SEVERITIES: readonly LedgerSeverity[] = ['low', 'medium', 'high'];
const SEVERITY_RANK: Record<LedgerSeverity, number> = { low: 0, medium: 1, high: 2 };

/** The em-dash Smithy writes for "nothing here", plus the plain-hyphen slip. */
function isPlaceholder(cell: string): boolean {
  return cell === '—' || cell === '-' || cell.length === 0;
}

/**
 * The level a record's `id` claims, from its prefix. Independent of where the
 * file was found — {@link parseEngravedRecord} compares the two so a
 * disagreement surfaces instead of silently picking one.
 */
export function levelFromId(id: string): EngravedLevel {
  for (const { level, prefix } of LEVEL_PREFIXES) {
    if (id.startsWith(prefix)) return level;
  }
  return 'repo';
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

/**
 * Split one Markdown table row into trimmed cells. Leading and trailing pipes
 * are optional so a hand-edited ledger still parses.
 */
function tableCells(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * Parse the Known-Exceptions ledger out of an invariant body.
 *
 * The five-column shape (`Where | What diverges | Disposition + Why |
 * Tracking Issue | Severity`) is load-bearing on disk, so this reads by
 * position rather than by header text. A body with no `## Known Exceptions`
 * section returns null; a section whose only row is the em-dash placeholder
 * returns an empty, aligned summary.
 */
export function parseLedger(body: string): LedgerSummary | null {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => /^##\s+Known Exceptions\s*$/.test(line.trim()));
  if (start === -1) return null;

  const rows: LedgerRow[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^##\s/.test(line)) break;
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = tableCells(trimmed);
    if (cells.length < 5) continue;
    // Header and separator rows.
    if (/^-+$/.test((cells[0] ?? '').replace(/[:\s]/g, ''))) continue;
    if ((cells[0] ?? '').toLowerCase() === 'where') continue;

    const where = cells[0] ?? '';
    const whatDiverges = cells[1] ?? '';
    const dispositionCell = cells[2] ?? '';
    const trackingCell = cells[3] ?? '';
    const severityCell = (cells[4] ?? '').toLowerCase();

    let disposition: LedgerDisposition = 'placeholder';
    if (/^Accepted:/.test(dispositionCell)) disposition = 'accepted';
    else if (/^Temporary:/.test(dispositionCell)) disposition = 'temporary';
    else if (!isPlaceholder(dispositionCell)) continue;

    rows.push({
      where,
      whatDiverges,
      disposition,
      trackingIssue: isPlaceholder(trackingCell) ? null : trackingCell,
      severity: SEVERITIES.includes(severityCell as LedgerSeverity)
        ? (severityCell as LedgerSeverity)
        : null,
    });
  }

  const real = rows.filter((row) => row.disposition !== 'placeholder');
  const temporary = real.filter((row) => row.disposition === 'temporary').length;
  const maxSeverity = real.reduce<LedgerSeverity | null>((worst, row) => {
    if (row.severity === null) return worst;
    if (worst === null) return row.severity;
    return SEVERITY_RANK[row.severity] > SEVERITY_RANK[worst] ? row.severity : worst;
  }, null);

  return {
    rows: real,
    accepted: real.length - temporary,
    temporary,
    maxSeverity,
    derivedStatus: temporary > 0 ? 'drifting' : 'aligned',
  };
}

export interface ParseContext {
  /** The level of the store the file was read from. Authoritative. */
  level: EngravedLevel;
  /** Absolute store root, used to make `path` store-relative. */
  storeRoot: string;
  domain: EngravedDomain;
  /** Kind implied by the directory the file sits in. */
  kind: EngravedKind;
}

/**
 * Parse one engraved record file. Returns null when the file has no
 * frontmatter or no `id` — an unparseable file is reported by the scanner as a
 * malformed record rather than silently shaping a half-empty entry.
 */
export function parseEngravedRecord(
  absPath: string,
  content: string,
  ctx: ParseContext,
): EngravedRecord | null {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return null;

  let data: Record<string, unknown>;
  try {
    const parsed: unknown = parseYaml(match[1] ?? '');
    if (typeof parsed !== 'object' || parsed === null) return null;
    data = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const id = typeof data.id === 'string' ? data.id.trim() : '';
  if (id.length === 0) return null;

  const declaredKind = typeof data.kind === 'string' ? data.kind.trim() : '';
  const kind = KIND_VALUES.includes(declaredKind as EngravedKind)
    ? (declaredKind as EngravedKind)
    : ctx.kind;

  const declaredDomain = typeof data.domain === 'string' ? data.domain.trim() : '';
  const domain: EngravedDomain = declaredDomain === 'design' ? 'design' : ctx.domain;

  const body = match[2] ?? '';

  return {
    id,
    kind,
    level: ctx.level,
    domain,
    title: typeof data.title === 'string' ? data.title : '',
    status: typeof data.status === 'string' ? data.status : '',
    path: path.relative(ctx.storeRoot, absPath).split(path.sep).join('/'),
    absPath,
    topics: asStringArray(data.topics),
    scope: asStringArray(data.scope),
    appliesTo: asStringArray(data.applies_to),
    excepts: asStringArray(data.excepts),
    establishes: asStringArray(data.establishes),
    establishedBy: asStringArray(data.established_by),
    supersedes: asStringArray(data.supersedes),
    supersededBy: asStringArray(data.superseded_by),
    ledger: kind === 'invariant' ? parseLedger(body) : null,
    idLevelMismatch: levelFromId(id) !== ctx.level,
  };
}

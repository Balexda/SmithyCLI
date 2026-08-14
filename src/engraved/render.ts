import type { Theme } from '../status/theme.js';
import type {
  EngravedLevel,
  EngravedLevelReport,
  EngravedRecord,
  EngravedScan,
} from './types.js';

/**
 * Text and JSON renderings of an engraved scan.
 *
 * The inventory answers one question — *which durable rules am I subject to,
 * and from where* — so it groups by level rather than by kind. Kind is a
 * column; level is the structure, because the level is what a reader is
 * actually trying to establish when they ask.
 */

const LEVEL_BLURB: Record<EngravedLevel, string> = {
  user: 'true in every repo and project',
  repo: 'true for this repo and every workstream in it',
  project: 'true for this workstream only',
};

export interface EngravedJsonRecord {
  id: string;
  kind: string;
  level: EngravedLevel;
  domain: string;
  title: string;
  status: string;
  path: string;
  topics: string[];
  scope: string[];
  applies_to: string[];
  excepts: string[];
  establishes: string[];
  established_by: string[];
  supersedes: string[];
  superseded_by: string[];
  ledger: {
    accepted: number;
    temporary: number;
    max_severity: string | null;
    derived_status: string;
    /** True when the declared `status` disagrees with the ledger. */
    status_drift: boolean;
  } | null;
  id_level_mismatch: boolean;
}

export interface EngravedJsonPayload {
  levels: Array<{
    level: EngravedLevel;
    root: string;
    present: boolean;
    record_count: number;
    project?: string;
  }>;
  project: string | null;
  summary: {
    total: number;
    by_level: Record<string, number>;
    by_kind: Record<string, number>;
    drifting: number;
  };
  records: EngravedJsonRecord[];
}

/** Whether an invariant's declared status disagrees with its own ledger. */
export function hasStatusDrift(record: EngravedRecord): boolean {
  if (record.ledger === null) return false;
  if (record.status.length === 0) return false;
  return record.status !== record.ledger.derivedStatus;
}

export function serializeEngravedForJson(scan: EngravedScan): EngravedJsonPayload {
  const byLevel: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  let drifting = 0;

  for (const record of scan.records) {
    byLevel[record.level] = (byLevel[record.level] ?? 0) + 1;
    byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
    if (record.ledger?.derivedStatus === 'drifting') drifting++;
  }

  return {
    levels: scan.levels.map((level) => ({
      level: level.level,
      root: level.displayRoot,
      present: level.present,
      record_count: level.recordCount,
      ...(level.project !== undefined ? { project: level.project } : {}),
    })),
    project: scan.project,
    summary: {
      total: scan.records.length,
      by_level: byLevel,
      by_kind: byKind,
      drifting,
    },
    records: scan.records.map((record) => ({
      id: record.id,
      kind: record.kind,
      level: record.level,
      domain: record.domain,
      title: record.title,
      status: record.status,
      path: record.path,
      topics: record.topics,
      scope: record.scope,
      applies_to: record.appliesTo,
      excepts: record.excepts,
      establishes: record.establishes,
      established_by: record.establishedBy,
      supersedes: record.supersedes,
      superseded_by: record.supersededBy,
      ledger:
        record.ledger === null
          ? null
          : {
              accepted: record.ledger.accepted,
              temporary: record.ledger.temporary,
              max_severity: record.ledger.maxSeverity,
              derived_status: record.ledger.derivedStatus,
              status_drift: hasStatusDrift(record),
            },
      id_level_mismatch: record.idLevelMismatch,
    })),
  };
}

function ledgerNote(record: EngravedRecord): string | null {
  const ledger = record.ledger;
  if (ledger === null) return null;
  if (ledger.rows.length === 0) return 'ledger clean';
  const parts: string[] = [];
  if (ledger.temporary > 0) parts.push(`${ledger.temporary} temporary`);
  if (ledger.accepted > 0) parts.push(`${ledger.accepted} accepted`);
  if (ledger.maxSeverity !== null) parts.push(`max severity ${ledger.maxSeverity}`);
  return parts.join(', ');
}

function renderLevelHeader(level: EngravedLevelReport, theme: Theme): string {
  const label = theme.paint.bold(level.level);
  const project = level.project !== undefined ? ` (${level.project})` : '';
  const suffix = level.present
    ? `${level.recordCount} record${level.recordCount === 1 ? '' : 's'}`
    : 'no store';
  return `${label}${project} ${theme.paint.dim(`— ${LEVEL_BLURB[level.level]}`)}  ${theme.paint.dim(level.displayRoot)}  ${theme.paint.dim(`[${suffix}]`)}`;
}

/**
 * Render the inventory as text: one block per level, broadest first, each
 * listing its records with the ledger alignment that matters for invariants.
 * Precedence runs the other way (project wins), so the footer says so rather
 * than leaving the reading order to imply the wrong thing.
 */
export function renderEngraved(scan: EngravedScan, theme: Theme): string {
  const lines: string[] = [];

  for (const level of scan.levels) {
    lines.push(renderLevelHeader(level, theme));

    const records = scan.records.filter((record) => record.level === level.level);
    if (records.length === 0) {
      lines.push(`  ${theme.paint.dim('(none)')}`);
      lines.push('');
      continue;
    }

    for (const record of records) {
      const status = record.status.length > 0 ? record.status : 'unknown';
      const painted =
        status === 'drifting' || status === 'superseded' || status === 'deprecated'
          ? theme.paint.inProgress(status)
          : theme.paint.dim(status);
      const title = record.title.length > 0 ? record.title : '(untitled)';
      lines.push(`  ${record.id}  ${title}`);

      const notes: string[] = [`${record.kind}`, painted, record.path];
      const ledger = ledgerNote(record);
      if (ledger !== null) notes.push(ledger);
      if (record.excepts.length > 0) notes.push(`excepts ${record.excepts.join(', ')}`);
      lines.push(`      ${theme.paint.dim(notes.join('  ·  '))}`);

      if (hasStatusDrift(record)) {
        lines.push(
          `      ${theme.paint.error(`status says ${record.status}; ledger derives ${record.ledger?.derivedStatus}`)}`,
        );
      }
      if (record.idLevelMismatch) {
        lines.push(
          `      ${theme.paint.error(`id names a different level than the ${record.level} store it lives in`)}`,
        );
      }
    }
    lines.push('');
  }

  const total = scan.records.length;
  if (total === 0) {
    lines.push(
      'No engraved records found. Run `smithy.engrave` to author a decision, invariant, or principle.',
    );
    return lines.join('\n');
  }

  lines.push(
    theme.paint.dim(
      `${total} record${total === 1 ? '' : 's'} · precedence: project > repo > user (narrower wins)`,
    ),
  );
  if (scan.project === null) {
    lines.push(
      theme.paint.dim('No project level in play — pass --project <slug> to include one.'),
    );
  }

  return lines.join('\n');
}

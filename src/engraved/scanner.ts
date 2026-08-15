import fs from 'fs';
import path from 'path';

import { parseEngravedRecord } from './parser.js';
import { resolveEngravedRoots, type ResolveEngravedRootsOptions } from './roots.js';
import {
  ENGRAVED_LEVELS,
  type EngravedKind,
  type EngravedLevelReport,
  type EngravedRecord,
  type EngravedScan,
} from './types.js';

/**
 * Which filenames count as a record of each kind. Decisions and invariants
 * carry a dedicated suffix; principles have none and are discovered by walking
 * the constitution directory, so any `.md` there is a principle.
 */
const KIND_MATCHERS: Record<EngravedKind, (name: string) => boolean> = {
  decision: (name) => name.endsWith('.decision.md'),
  invariant: (name) => name.endsWith('.invariant.md'),
  principle: (name) => name.endsWith('.md') && !name.endsWith('.decision.md') && !name.endsWith('.invariant.md'),
};

const LEVEL_RANK = new Map(ENGRAVED_LEVELS.map((level, index) => [level, index]));
const KIND_RANK: Record<EngravedKind, number> = { decision: 0, invariant: 1, principle: 2 };

/**
 * Sort key for a record id: the numeric tail sorts numerically so `D-10`
 * follows `D-9` rather than `D-1`.
 */
function idSortKey(id: string): [string, number] {
  const match = id.match(/^(.*?)(\d+)$/);
  if (match === null) return [id, 0];
  return [match[1] ?? '', Number(match[2])];
}

function compareRecords(a: EngravedRecord, b: EngravedRecord): number {
  const levelDelta = (LEVEL_RANK.get(a.level) ?? 0) - (LEVEL_RANK.get(b.level) ?? 0);
  if (levelDelta !== 0) return levelDelta;
  const kindDelta = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (kindDelta !== 0) return kindDelta;
  const [aPrefix, aNum] = idSortKey(a.id);
  const [bPrefix, bNum] = idSortKey(b.id);
  if (aPrefix !== bPrefix) return aPrefix < bPrefix ? -1 : 1;
  return aNum - bNum;
}

/** Files under a directory, non-recursive, sorted. Missing dir → `[]`. */
function listFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export interface EngravedScanOptions extends ResolveEngravedRootsOptions {}

/**
 * Read every engraved record visible from `targetDir`, across all levels that
 * resolve.
 *
 * Missing stores are normal and reported as `present: false` rather than
 * skipped: "there is no user-level knowledge" and "the user level was never
 * looked at" are different answers to *which rules am I subject to*, and the
 * caller has to be able to tell them apart.
 *
 * Unreadable or unparseable files are dropped rather than thrown on. A single
 * malformed record must not take down an inventory whose whole job is to show
 * what is there.
 */
export function scanEngraved(targetDir: string, opts: EngravedScanOptions = {}): EngravedScan {
  const levels = resolveEngravedRoots(targetDir, opts);
  const records: EngravedRecord[] = [];
  const reports: EngravedLevelReport[] = [];

  for (const levelRoots of levels) {
    let present = false;
    let count = 0;

    for (const dir of levelRoots.dirs) {
      const files = listFiles(dir.path);
      if (fs.existsSync(dir.path)) present = true;

      for (const name of files) {
        if (!KIND_MATCHERS[dir.kind](name)) continue;
        const absPath = path.join(dir.path, name);
        let content: string;
        try {
          content = fs.readFileSync(absPath, 'utf8');
        } catch {
          continue;
        }
        const record = parseEngravedRecord(absPath, content, {
          level: levelRoots.level,
          storeRoot: levelRoots.root,
          domain: dir.domain,
          kind: dir.kind,
        });
        if (record === null) continue;
        records.push(record);
        count++;
      }
    }

    reports.push({
      level: levelRoots.level,
      root: levelRoots.root,
      displayRoot: levelRoots.displayRoot,
      present,
      recordCount: count,
      ...(levelRoots.project !== undefined ? { project: levelRoots.project } : {}),
    });
  }

  records.sort(compareRecords);

  const projectLevel = levels.find((entry) => entry.level === 'project');

  return {
    levels: reports,
    project: projectLevel?.project ?? null,
    records,
  };
}

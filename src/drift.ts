/**
 * Settings-drift detection for `smithy update`.
 *
 * `writePermissions` merges canonical Smithy permission lists into the user's
 * existing settings.json by union, so it never removes entries the user (or a
 * previous Smithy version) added. That means after a Smithy version that
 * relocates a permission between categories — e.g. issue #302 moved
 * `git push --force-with-lease` from the `ask` list into `allow` — a stale
 * copy of the entry stays in the old category and silently overrides the new
 * one (Claude Code resolves `ask > allow`).
 *
 * Rather than auto-pruning (which would also delete legitimate user
 * customizations), `smithy update` surfaces a drift report so the user can
 * decide what to do. This module is the pure logic behind that report.
 */

export type PermissionCategory = 'allow' | 'ask' | 'deny';

export interface PermissionTriple {
  allow: string[];
  ask: string[];
  deny: string[];
}

export interface CrossCategoryConflict {
  entry: string;
  /** Categories the entry appears in, in stable `allow → ask → deny` order. */
  categories: ReadonlyArray<PermissionCategory>;
}

export interface DriftReport {
  /** Entries in the user's `allow` list that Smithy does not manage. */
  unmanagedAllow: string[];
  /** Entries in the user's `ask` list that Smithy does not manage. */
  unmanagedAsk: string[];
  /** Entries in the user's `deny` list that Smithy does not manage. */
  unmanagedDeny: string[];
  /**
   * Entries that appear in two or more of the user's allow/ask/deny lists.
   * The strong signal that a Smithy version moved an entry between categories
   * and the old copy was never removed.
   */
  crossCategoryConflicts: CrossCategoryConflict[];
}

/**
 * Diff a user's existing permission triple against Smithy's current canonical
 * triple and report what does not match.
 *
 * "Unmanaged" entries may be legitimate user customizations OR stale entries
 * left over from a previous Smithy version. `computeDrift` cannot tell the
 * two apart — that's why the report is informational, not auto-applied.
 */
export function computeDrift(
  existing: PermissionTriple,
  canonical: PermissionTriple,
): DriftReport {
  const canonicalAllow = new Set(canonical.allow);
  const canonicalAsk = new Set(canonical.ask);
  const canonicalDeny = new Set(canonical.deny);

  const unmanagedAllow = existing.allow.filter(e => !canonicalAllow.has(e));
  const unmanagedAsk = existing.ask.filter(e => !canonicalAsk.has(e));
  const unmanagedDeny = existing.deny.filter(e => !canonicalDeny.has(e));

  const seen = new Map<string, Set<PermissionCategory>>();
  const track = (entry: string, cat: PermissionCategory) => {
    let s = seen.get(entry);
    if (!s) {
      s = new Set();
      seen.set(entry, s);
    }
    s.add(cat);
  };
  for (const e of existing.allow) track(e, 'allow');
  for (const e of existing.ask) track(e, 'ask');
  for (const e of existing.deny) track(e, 'deny');

  const order: ReadonlyArray<PermissionCategory> = ['allow', 'ask', 'deny'];
  const crossCategoryConflicts: CrossCategoryConflict[] = [];
  for (const [entry, cats] of seen) {
    if (cats.size >= 2) {
      crossCategoryConflicts.push({
        entry,
        categories: order.filter(c => cats.has(c)),
      });
    }
  }
  crossCategoryConflicts.sort((a, b) => a.entry.localeCompare(b.entry));

  return { unmanagedAllow, unmanagedAsk, unmanagedDeny, crossCategoryConflicts };
}

export function hasDrift(report: DriftReport): boolean {
  return (
    report.unmanagedAllow.length > 0 ||
    report.unmanagedAsk.length > 0 ||
    report.unmanagedDeny.length > 0 ||
    report.crossCategoryConflicts.length > 0
  );
}

/**
 * Render a drift report as plain text suitable for terminal output. The caller
 * applies any color styling — keeping this pure makes it easy to snapshot in
 * tests.
 */
export function formatDriftReport(report: DriftReport, settingsPath: string): string {
  const lines: string[] = [];
  lines.push(`Settings drift detected at ${settingsPath}:`);
  lines.push('');

  if (report.crossCategoryConflicts.length > 0) {
    const n = report.crossCategoryConflicts.length;
    lines.push(`  Cross-category collisions (${n}) — usually a Smithy migration that left a stale copy:`);
    for (const c of report.crossCategoryConflicts) {
      lines.push(`    - ${c.entry}  [${c.categories.join(' + ')}]`);
    }
    lines.push('    Action: keep the entry in the category Smithy now uses, delete it from the others.');
    lines.push('    (Claude Code resolves deny > ask > allow, so the strictest list wins on collisions.)');
    lines.push('');
  }

  const sections: ReadonlyArray<readonly [PermissionCategory, string[]]> = [
    ['allow', report.unmanagedAllow],
    ['ask', report.unmanagedAsk],
    ['deny', report.unmanagedDeny],
  ];
  for (const [name, entries] of sections) {
    if (entries.length === 0) continue;
    lines.push(`  Unmanaged \`${name}\` entries (${entries.length}) — your customizations or leftovers from older Smithy versions:`);
    for (const e of entries) {
      lines.push(`    - ${e}`);
    }
    lines.push('');
  }

  lines.push('  Smithy update never removes entries you added — review the list above and edit settings.json by hand if any are stale.');
  return lines.join('\n');
}

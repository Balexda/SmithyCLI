/**
 * Filesystem scanner for Smithy artifact files.
 *
 * `scan(root)` is the single entry point that turns a working directory
 * into a fully-classified `ArtifactRecord[]` matching the data-model
 * contract in `smithy-status-skill.data-model.md`. It proceeds in four
 * phases:
 *
 *   1. **Discovery / parse** — walk `specs/`, `docs/rfcs/`, and
 *      `specs/strikes/` under `root`, collect files by suffix
 *      (`.rfc.md`, `.features.md`, `.spec.md`, `.tasks.md`), read their
 *      contents, and call {@link parseArtifact} for each. Symlinks whose
 *      real path escapes `root` are silently skipped.
 *
 *   2. **Resolution + virtual emission** — walk every real parent
 *      record's `dependency_order.rows`, match each row to an existing
 *      child record per the data-model lineage (RFC → features file,
 *      feature row → spec folder → spec file, spec row → tasks file).
 *      Rows whose `artifact_path` is `—` or points at a file not present
 *      on disk produce a virtual `ArtifactRecord` with `virtual: true`,
 *      `status: 'not-started'`, and a naming-convention-derived path. On
 *      a virtual/real collision at the same path, the real record wins
 *      and the virtual is discarded.
 *
 *   3. **Classification** — call {@link classifyRecord} leaf-to-root
 *      (`tasks` → `spec` → `features` → `rfc`) so every parent sees its
 *      children's finalized `status` when it is classified. Records that
 *      carry a `read_error:` warning from Phase 1 are preserved as
 *      `status: 'unknown'` and are not re-classified.
 *
 *   4. **Next-action suggestion** — after every record's status has
 *      stabilized, iterate the record set once more and call
 *      {@link suggestNextAction} to populate `record.next_action`. An
 *      upward walk over each record's `parent_path` chain (with a
 *      seen-set cycle guard) detects whether any ancestor is itself
 *      `not-started`; when so, the returned {@link NextAction} carries
 *      `suppressed_by_ancestor: true` so FR-011 suppression is visible
 *      to JSON consumers. Records carrying a `read_error:` warning are
 *      skipped: their `next_action` stays omitted (not `null`) so the
 *      field's absence signals "never evaluated" to JSON consumers,
 *      matching the scanner's existing skip-on-read-error behavior.
 *
 * The scanner performs no network I/O and never throws on an individual
 * artifact failure. Per-file errors are surfaced as warnings on the
 * affected record and scanning continues.
 *
 * Notes on unresolved specification debt:
 * - SD-001: Feature-map virtual spec placeholders use `specs/<slug>/` —
 *   the canonical `YYYY-MM-DD-NNN-<slug>` prefix cannot be derived from
 *   a feature row alone, so the slug is a best-effort placeholder.
 * - SD-002: `parent_missing` is populated only for orphaned tasks
 *   records whose `**Source**:` header (emitted by `smithy.cut`)
 *   declares a repo-relative spec path missing from disk. Spec,
 *   features, and rfc artifacts do not carry an analogous self-declared
 *   parent reference today, so the field stays unset for them.
 * - SD-003: Integration tests use real on-disk temp directories under
 *   `os.tmpdir()` to exercise the recursive walk path.
 */

import fs from 'node:fs';
import path from 'node:path';

import { classifyRecord } from './classifier.js';
import { extractSourceHeader, parseArtifact } from './parser.js';
import { suggestNextAction } from './suggester.js';
import type {
  ArtifactRecord,
  ArtifactType,
  DependencyOrderTable,
  DependencyRow,
} from './types.js';

const SCAN_ROOTS = ['specs', 'docs/rfcs', 'specs/strikes'] as const;

const SUFFIX_TYPES: Array<readonly [string, ArtifactType]> = [
  ['.rfc.md', 'rfc'],
  ['.features.md', 'features'],
  ['.spec.md', 'spec'],
  ['.tasks.md', 'tasks'],
];

/**
 * Walk the repo under `root`, build `ArtifactRecord` entries for every
 * discovered Smithy artifact file, and return the fully-classified
 * record set. See the module-level JSDoc for the four-phase flow.
 */
export function scan(root: string): ArtifactRecord[] {
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    return [];
  }

  const records = new Map<string, ArtifactRecord>();
  // Canonical real paths of every directory the walker has descended
  // into. Used to break symlink cycles (e.g., `specs/a/link -> ..`)
  // and to avoid revisiting the same physical directory reached via
  // two different scan roots (e.g., `specs/strikes/` reached via both
  // `specs/` and `specs/strikes/`).
  const visitedDirs = new Set<string>();

  // Phase 1: discover + parse.
  for (const scanRoot of SCAN_ROOTS) {
    const startDir = path.join(realRoot, scanRoot);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(startDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    let realStart: string;
    try {
      realStart = fs.realpathSync(startDir);
    } catch {
      continue;
    }
    if (!isWithinRoot(realStart, realRoot)) continue;
    if (visitedDirs.has(realStart)) continue;
    visitedDirs.add(realStart);
    walkDir(startDir, realRoot, records, visitedDirs);
  }

  // Phase 2: resolve parent/child linkage and emit virtual records.
  const childrenByParent = new Map<string, ArtifactRecord[]>();
  const parentsSnapshot = Array.from(records.values()).filter(
    (r) => r.type !== 'tasks' && r.virtual !== true,
  );
  for (const parent of parentsSnapshot) {
    const kids: ArtifactRecord[] = [];
    for (const row of parent.dependency_order.rows) {
      const resolution = resolveChildForRow(parent, row, records);
      if (resolution === null) continue;

      let child = records.get(resolution.path);
      if (child !== undefined) {
        // Real or previously-emitted virtual already occupies this
        // path — real records always win because Phase 1 populated
        // them before any virtual could be inserted.
        if (
          child.parent_path !== undefined &&
          child.parent_path !== null &&
          child.parent_path !== parent.path
        ) {
          // Another parent already claimed this child. Keep the
          // first parent (deterministic: parents are iterated in
          // discovery order) and surface a warning on the child so
          // downstream renderers can flag the conflict.
          child.warnings.push(
            `parent_collision: also referenced by ${parent.path}`,
          );
        } else {
          child.parent_path = parent.path;
          child.parent_row_id = row.id;
        }
      } else {
        child = makeVirtualRecord(resolution.path, resolution.type, row, parent);
        records.set(resolution.path, child);
      }
      kids.push(child);
    }
    childrenByParent.set(parent.path, kids);
  }

  // Phase 2b: broken-link probe for orphaned tasks records.
  //
  // Any real (non-virtual) tasks record whose `parent_path` was never
  // populated in Phase 2 is a candidate for the narrow `**Source**:`
  // header probe. If the header declares a repo-relative spec path that
  // is missing from disk, the record is flagged as a broken link so the
  // downstream "Broken Links" grouping has data to group on. Tasks
  // files whose declared source exists on disk, or whose `**Source**:`
  // header is absent / unparseable, are left alone and fall through to
  // the orphan normalization below.
  //
  // Scoped strictly to tasks records: spec/features/rfc orphan handling
  // is unchanged by this pass.
  for (const record of records.values()) {
    if (record.type !== 'tasks') continue;
    if (record.virtual === true) continue;
    if (record.parent_path !== undefined) continue;
    // A record whose file could not be read in Phase 1 carries a
    // `read_error:` warning and genuinely unknown parent state — we
    // cannot inspect its `**Source**:` header. Leave `parent_path`
    // omitted (= "unknown" per the data model) rather than
    // misrepresenting a transient I/O failure as either a broken
    // link or an orphan.
    if (hasReadError(record)) continue;

    const abs = path.join(realRoot, record.path);
    let content: string;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }

    const declared = extractSourceHeader(content);
    if (declared === null) continue;

    // Security: the `**Source**:` header is untrusted text from disk,
    // so validate that the declared path is genuinely repo-relative
    // before we probe it on the filesystem or record it on the record.
    // Absolute paths (POSIX `/etc/passwd` or Windows `C:\...`) would
    // bypass `path.join(realRoot, ...)` — `path.join` drops earlier
    // segments when a later one is absolute — and `..` traversal
    // could escape `realRoot` entirely. Reject both up front; if the
    // declared path is malformed we simply treat it like an unparseable
    // header and fall through to the orphan normalization below.
    if (isAbsolutePath(declared)) continue;
    const declaredRel = normalizePath(declared);
    const declaredAbs = path.resolve(realRoot, declaredRel);
    if (!isWithinRoot(declaredAbs, realRoot)) continue;

    let declaredExists = false;
    try {
      declaredExists = fs.statSync(declaredAbs).isFile();
    } catch {
      declaredExists = false;
    }
    if (declaredExists) continue;

    record.parent_path = declaredRel;
    record.parent_missing = true;
  }

  // Phase 2c: orphan normalization for tasks records.
  //
  // Per the data model, `parent_path: null` means "no parent" while an
  // omitted field means "unknown". Tasks records that reached this
  // point with `parent_path` still undefined are definitively orphans
  // (no parent dep-order row claimed them, and either no `**Source**:`
  // header was present or it pointed at an existing file the scanner
  // could not link automatically). Set their `parent_path` to `null`
  // so downstream consumers get the explicit "no parent" signal.
  //
  // Records with a `read_error:` warning are skipped: we could not
  // read the file, so its parent state is genuinely unknown and the
  // omitted-field semantics must be preserved.
  for (const record of records.values()) {
    if (record.type !== 'tasks') continue;
    if (record.virtual === true) continue;
    if (record.parent_path !== undefined) continue;
    if (hasReadError(record)) continue;
    record.parent_path = null;
  }

  // Phase 3: classify leaf-to-root. `classifyRecord` is pure; all we do
  // here is order the calls so every parent sees its already-finalized
  // children.
  const classificationOrder: ArtifactType[] = ['tasks', 'spec', 'features', 'rfc'];
  for (const type of classificationOrder) {
    for (const record of records.values()) {
      if (record.type !== type) continue;
      if (hasReadError(record)) continue;
      const kids = childrenByParent.get(record.path) ?? [];
      record.status = classifyRecord(record, kids);
    }
  }

  // Phase 4: populate `next_action` on every classified record.
  //
  // `suggestNextAction` is pure — this pass runs after every status is
  // finalized. Records carrying a `read_error:` warning are skipped
  // entirely: their `next_action` field stays omitted (not set to
  // `null`) so JSON consumers can distinguish "never evaluated"
  // (absent) from "evaluated, no action" (`null`).
  //
  // Two sub-passes so the suppression flag tracks whether an ancestor
  // actually has a hint the user could run:
  //
  //  4a. Compute each record's tentative `next_action` with
  //      `ancestorNotStarted = false`. `suggestNextAction` may still
  //      return `null` (e.g. a spec whose US rows all have real tasks
  //      files on disk — no `smithy.cut` is needed at the spec level
  //      because the per-task `forge` hints drive the work).
  //
  //  4b. For every record whose tentative action is non-null, walk
  //      upward through `parent_path`. If any ancestor is both
  //      `not-started` **and** has a non-null `next_action`, mark the
  //      current record's action with `suppressed_by_ancestor: true`.
  //      Ancestors whose `next_action` is `null` are skipped — the
  //      user has no command to run on them, so their presence in
  //      the chain does not justify hiding a descendant's hint
  //      (otherwise an in-progress spec stacked under a not-started
  //      parent would silence every task below it with nothing left
  //      to surface).
  for (const record of records.values()) {
    if (hasReadError(record)) continue;
    const kids = childrenByParent.get(record.path) ?? [];
    record.next_action = suggestNextAction(record, kids, false);
  }
  for (const record of records.values()) {
    if (hasReadError(record)) continue;
    const action = record.next_action;
    if (action === null || action === undefined) continue;
    if (hasActionableNotStartedAncestor(record, records)) {
      action.suppressed_by_ancestor = true;
    }
  }

  return Array.from(records.values());
}

// ---------------------------------------------------------------------------
// Phase 1 helpers: walk + parse
// ---------------------------------------------------------------------------

/**
 * Recursively walk `dir`, resolving each entry through `realpath` and
 * skipping anything whose real path escapes `realRoot` or that has
 * already been visited (which breaks symlink cycles). Parses every
 * discovered artifact file into `records`.
 */
function walkDir(
  dir: string,
  realRoot: string,
  records: Map<string, ArtifactRecord>,
  visitedDirs: Set<string>,
): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    const abs = path.join(dir, name);
    let realAbs: string;
    try {
      realAbs = fs.realpathSync(abs);
    } catch {
      continue;
    }
    if (!isWithinRoot(realAbs, realRoot)) continue;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(realAbs);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      // Guard against directory cycles introduced by symlinks (and
      // duplicate descents from overlapping scan roots) by tracking
      // canonical real paths we have already walked.
      if (visitedDirs.has(realAbs)) continue;
      visitedDirs.add(realAbs);
      walkDir(abs, realRoot, records, visitedDirs);
    } else if (stat.isFile()) {
      handleFile(abs, realRoot, records);
    }
  }
}

function isWithinRoot(candidate: string, realRoot: string): boolean {
  if (candidate === realRoot) return true;
  return candidate.startsWith(realRoot + path.sep);
}

/**
 * True for POSIX absolute paths (`/foo`) and Windows drive-letter
 * paths (`C:\foo` or `C:/foo`). Platform-independent so the check
 * runs the same on every host — a Windows-style path pasted into a
 * `**Source**:` header on a Linux machine is still rejected.
 */
function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

/**
 * Parse a single discovered file into an `ArtifactRecord` and insert it
 * into `records` keyed by repo-relative path. Read errors produce an
 * `unknown`-status record with a `read_error:` warning so the scan can
 * continue.
 */
function handleFile(
  abs: string,
  realRoot: string,
  records: Map<string, ArtifactRecord>,
): void {
  const rel = toRepoRelative(abs, realRoot);
  const type = detectTypeFromSuffix(rel);
  if (type === null) return;

  // Same file visited via two scan roots (e.g., `specs/strikes/` lives
  // inside `specs/`): the first insert wins and subsequent visits are
  // no-ops. This keeps the returned record set free of duplicates.
  if (records.has(rel)) return;

  let content: string;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    records.set(rel, buildReadErrorRecord(rel, type, message));
    return;
  }

  const record = parseArtifact(rel, content);
  records.set(rel, record);
}

function detectTypeFromSuffix(relPath: string): ArtifactType | null {
  for (const [suffix, type] of SUFFIX_TYPES) {
    if (relPath.endsWith(suffix)) return type;
  }
  return null;
}

function buildReadErrorRecord(
  relPath: string,
  type: ArtifactType,
  message: string,
): ArtifactRecord {
  return {
    type,
    path: relPath,
    title: filenameStem(relPath),
    status: 'unknown',
    dependency_order: {
      rows: [],
      id_prefix: idPrefixForType(type),
      format: 'missing',
    },
    warnings: [`read_error: ${message}`],
  };
}

// ---------------------------------------------------------------------------
// Phase 2 helpers: parent/child resolution + virtual emission
// ---------------------------------------------------------------------------

interface ChildResolution {
  /** Repo-relative path where the child (real or virtual) lives. */
  path: string;
  /** Expected artifact type for the child row. */
  type: ArtifactType;
}

/**
 * Resolve a single dep-order row on `parent` to the repo-relative path
 * where its child record should live, per the data-model lineage rules.
 *
 * - RFC rows (`M`): child is a `.features.md` file — direct path match
 *   or a slug placeholder when the cell is `—`.
 * - Feature-map rows (`F`): child is a `.spec.md` file. The cell may
 *   point at either a spec folder or a spec file; folder cells are
 *   resolved by scanning the already-discovered record set for a
 *   `.spec.md` under the folder prefix.
 * - Spec rows (`US`): child is a `.tasks.md` file — direct path match
 *   or a naming-convention placeholder when the cell is `—`.
 * - Tasks rows (`S`): never reached because tasks records are filtered
 *   out of the parent set.
 */
function resolveChildForRow(
  parent: ArtifactRecord,
  row: DependencyRow,
  records: Map<string, ArtifactRecord>,
): ChildResolution | null {
  switch (parent.type) {
    case 'rfc': {
      const type: ArtifactType = 'features';
      if (row.artifact_path !== null) {
        return { path: normalizePath(row.artifact_path), type };
      }
      // Repo convention: `<NN>-<milestone-slug>.features.md` (see
      // existing render output examples like `01-milestone-1.features.md`).
      // Derive the NN from the row id (M1 → 01) so virtual placeholder
      // paths collide with real `smithy.render` output and the real
      // record wins on the next scan.
      const parentDir = repoDirname(parent.path);
      const nn = paddedNumberFromId(row.id);
      const placeholder = repoJoin(
        parentDir,
        `${nn}-${slugify(row.title)}.features.md`,
      );
      return { path: placeholder, type };
    }
    case 'features': {
      const type: ArtifactType = 'spec';
      if (row.artifact_path !== null) {
        const raw = normalizePath(row.artifact_path);
        if (raw.endsWith('.spec.md')) {
          return { path: raw, type };
        }
        // Treat as a spec folder — search the record set for a
        // `.spec.md` that lives inside that folder.
        const folder = raw.endsWith('/') ? raw : `${raw}/`;
        const match = findSpecInFolder(folder, records);
        if (match !== null) {
          return { path: match, type };
        }
        // No discovered spec in the folder — emit a virtual record
        // keyed by the folder path itself. This matches the feature
        // row's declared intent without inventing a canonical file
        // name that does not yet exist.
        return { path: folder, type };
      }
      // SD-001 placeholder for a feature-map `—` row: `specs/<slug>/`.
      return { path: `specs/${slugify(row.title)}/`, type };
    }
    case 'spec': {
      const type: ArtifactType = 'tasks';
      const parentDir = repoDirname(parent.path);
      const nn = paddedNumberFromId(row.id);

      if (row.artifact_path !== null) {
        const declared = normalizePath(row.artifact_path);
        // Happy path: the declared Artifact cell resolves to a real
        // discovered record. Use it directly.
        if (records.has(declared)) {
          return { path: declared, type };
        }
        // Declared path did not match a known record (typo, stale
        // path, malformed cell after parser edge cases). Fall back to
        // the filename convention — a single `<NN>-*.tasks.md` under
        // the spec's folder is unambiguous and recovers linkage that
        // would otherwise produce a floating orphan.
        const fallback = findTasksByStoryNumber(parentDir, nn, records);
        if (fallback !== null) {
          return { path: fallback, type };
        }
        // No convention-based match either. Return the declared path
        // so a virtual record is emitted there; subsequent scans that
        // create the file at that path will replace the virtual.
        return { path: declared, type };
      }

      // `—` row: try the convention-based match before emitting a
      // slug-based placeholder. A US row whose Artifact cell is `—`
      // but whose tasks file already exists under
      // `<parentDir>/<NN>-*.tasks.md` should link to that real file,
      // not a virtual derived from the row title (the row title and
      // the on-disk slug routinely diverge in practice).
      const fallback = findTasksByStoryNumber(parentDir, nn, records);
      if (fallback !== null) {
        return { path: fallback, type };
      }
      return {
        path: repoJoin(parentDir, `${nn}-${slugify(row.title)}.tasks.md`),
        type,
      };
    }
    case 'tasks':
      return null;
  }
}

/**
 * Look for an on-disk `<parentDir>/<nn>-*.tasks.md` record among the
 * already-discovered records. Used as a convention-based fallback when
 * a spec row's Artifact cell is `—` or fails to resolve directly. The
 * filename convention emitted by `smithy.cut` is
 * `<NN>-<story-slug>.tasks.md`; we key on the `<NN>-` prefix alone so
 * the slug portion can diverge between the row title and the on-disk
 * filename without breaking parent linking.
 *
 * Returns the repo-relative path of the match, or `null` if there is
 * no match or more than one (ambiguous cases fall through to the
 * caller's virtual-placeholder path so a warning can surface).
 */
function findTasksByStoryNumber(
  parentDir: string,
  nn: string,
  records: Map<string, ArtifactRecord>,
): string | null {
  const prefix = parentDir === '' ? `${nn}-` : `${parentDir}/${nn}-`;
  let match: string | null = null;
  for (const [p, rec] of records) {
    if (rec.type !== 'tasks') continue;
    if (rec.virtual === true) continue;
    if (!p.startsWith(prefix)) continue;
    if (!p.endsWith('.tasks.md')) continue;
    // Reject nested sub-folder matches: only direct children of
    // `parentDir` count. A tasks file at `specs/a/b/01-foo.tasks.md`
    // must not match a query rooted at `specs/a/`.
    const tail = p.slice(prefix.length);
    if (tail.includes('/')) continue;
    if (match !== null) {
      // Ambiguous — two or more `<nn>-*.tasks.md` siblings. Give up
      // so the caller's placeholder path is used and the conflict is
      // visible in the scan output.
      return null;
    }
    match = p;
  }
  return match;
}

/**
 * Look up the canonical `.spec.md` file inside `folder` within the
 * already-discovered record set. Two filenames count as canonical:
 *
 *   - `<folder-leaf>.spec.md` — used when the folder is named after the
 *     spec slug directly (e.g. `specs/foo/foo.spec.md`).
 *   - `<slug>.spec.md` where `<slug>` is `<folder-leaf>` with a
 *     `<YYYY>-<MM>-<DD>-<NNN>-` prefix stripped — the convention emitted
 *     by `smithy.mark`, which puts spec folders at
 *     `specs/<YYYY-MM-DD>-<NNN>-<slug>/` but names the spec file after
 *     the bare slug (e.g. `specs/2026-04-05-001-foo/foo.spec.md`).
 *
 * Only canonical filenames are accepted; if the folder contains no
 * canonical `.spec.md` (only non-canonical ones, or no `.spec.md` at
 * all), this returns `null` and the scanner emits a virtual record at
 * the folder path instead. Falling back to "first .spec.md found"
 * would make parent linkage depend on `readdirSync` order, which is
 * not stable across filesystems. When both canonical filenames are
 * present in the same folder (extremely unusual), the unprefixed
 * `<folder-leaf>.spec.md` form wins so legacy folders that happen to
 * start with a date-shaped slug still resolve the way they always did.
 */
function findSpecInFolder(
  folder: string,
  records: Map<string, ArtifactRecord>,
): string | null {
  const folderLeaf = folder.replace(/\/+$/, '').split('/').pop() ?? '';
  const canonicalLeafBase = `${folderLeaf}.spec.md`;
  // The smithy.mark convention strips a `<YYYY>-<MM>-<DD>-<NNN>-` prefix
  // (e.g. `2026-04-05-001-`) from the folder leaf before naming the
  // spec file after the bare slug. Only compute a second canonical
  // base when the folder leaf actually carries that prefix.
  const datedSlug = folderLeaf.match(/^\d{4}-\d{2}-\d{2}-\d{3}-(.+)$/)?.[1];
  const canonicalSlugBase =
    datedSlug !== undefined ? `${datedSlug}.spec.md` : null;

  let slugMatch: string | null = null;
  for (const [p, rec] of records) {
    if (rec.type !== 'spec') continue;
    if (!p.startsWith(folder)) continue;
    if (!p.endsWith('.spec.md')) continue;
    // Reject nested sub-folder matches: only direct children of the
    // folder are considered. A spec at `specs/a/b.spec.md` must not
    // match a folder query for `specs/`.
    const tail = p.slice(folder.length);
    if (tail.includes('/')) continue;
    if (tail === canonicalLeafBase) {
      // Leaf form always wins on a tie, so return immediately and skip
      // the rest of the scan — preserves the early-exit behavior the
      // function had before slug-form support was added.
      return p;
    }
    if (canonicalSlugBase !== null && tail === canonicalSlugBase) {
      slugMatch = p;
    }
  }
  return slugMatch;
}

function makeVirtualRecord(
  p: string,
  type: ArtifactType,
  row: DependencyRow,
  parent: ArtifactRecord,
): ArtifactRecord {
  return {
    type,
    path: p,
    title: row.title,
    status: 'not-started',
    parent_path: parent.path,
    parent_row_id: row.id,
    virtual: true,
    dependency_order: {
      rows: [],
      id_prefix: idPrefixForType(type),
      format: 'missing',
    },
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Phase 3 + Phase 4 helpers
// ---------------------------------------------------------------------------

function hasReadError(record: ArtifactRecord): boolean {
  return record.warnings.some((w) => w.startsWith('read_error:'));
}

/**
 * Walk upward from `record` through the `parent_path` chain (resolved
 * against the scanner's full `records` map) and return `true` as soon
 * as any ancestor is both `not-started` **and** has a populated
 * `next_action`.
 *
 * An ancestor with a `null` `next_action` is skipped even when its
 * `status` is `'not-started'` — there is no hint competing for the
 * user's attention at that level, so descendants are free to surface
 * their own hints. This avoids silencing every task under a
 * not-started spec whose only remaining work is per-task forges.
 *
 * Terminates when:
 * - `parent_path` is `null`, `undefined`, or an empty string.
 * - The parent path does not resolve to any known record.
 * - A previously-seen path is revisited (cycle guard) — defensive
 *   against malformed record sets that could otherwise loop forever.
 *
 * Pure function: never mutates inputs. Used by Phase 4 to populate
 * `NextAction.suppressed_by_ancestor` per FR-011. Callers must have
 * already computed `next_action` on every candidate ancestor in the
 * records map (Phase 4a).
 */
function hasActionableNotStartedAncestor(
  record: ArtifactRecord,
  recordsByPath: Map<string, ArtifactRecord>,
): boolean {
  const seen = new Set<string>();
  let cursor: string | null | undefined = record.parent_path;
  while (typeof cursor === 'string' && cursor.length > 0) {
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    const ancestor = recordsByPath.get(cursor);
    if (ancestor === undefined) return false;
    if (
      ancestor.status === 'not-started' &&
      ancestor.next_action !== null &&
      ancestor.next_action !== undefined
    ) {
      return true;
    }
    cursor = ancestor.parent_path ?? null;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Path + string helpers
// ---------------------------------------------------------------------------

function toRepoRelative(abs: string, realRoot: string): string {
  const rel = path.relative(realRoot, abs);
  return rel.split(path.sep).join('/');
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function repoDirname(relPath: string): string {
  const idx = relPath.lastIndexOf('/');
  if (idx < 0) return '';
  return relPath.slice(0, idx);
}

function repoJoin(dir: string, name: string): string {
  if (dir === '') return name;
  return `${dir}/${name}`;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extract the numeric portion of a canonical row id (`M1`, `F2`, `US3`,
 * `S10`) and zero-pad it to two digits. Used to build placeholder
 * virtual paths that match the `<NN>-<slug>` filename convention emitted
 * by `smithy.render` and `smithy.cut`. Falls back to the lower-cased id
 * itself if the id has no trailing digits, so malformed ids never
 * crash placeholder generation.
 */
function paddedNumberFromId(id: string): string {
  const digits = id.match(/[0-9]+$/)?.[0];
  if (digits === undefined) return id.toLowerCase();
  return digits.padStart(2, '0');
}

function idPrefixForType(type: ArtifactType): DependencyOrderTable['id_prefix'] {
  switch (type) {
    case 'rfc':
      return 'M';
    case 'features':
      return 'F';
    case 'spec':
      return 'US';
    case 'tasks':
      return 'S';
  }
}

function filenameStem(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath;
  for (const [suffix] of SUFFIX_TYPES) {
    if (base.endsWith(suffix)) {
      return base.slice(0, base.length - suffix.length);
    }
  }
  if (base.endsWith('.md')) return base.slice(0, -3);
  return base;
}

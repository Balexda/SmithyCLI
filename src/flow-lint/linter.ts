/**
 * The `flow-lint` engine: resolve the UI flow/screen graph in an app repo and
 * surface every dangling reference as a finding that names the severed path.
 *
 * Checks (all deterministic, no agent calls):
 *
 *   1. Front-matter integrity — required keys present, YAML valid, and `id`
 *      matching the filename stem, for both `.flow.md` and `.design.md`.
 *   2. Flat-namespace uniqueness — no `FlowId` and no `ScreenId` declared
 *      twice across the repo.
 *   3. Flow → screen resolution — every `screens:` entry resolves to an
 *      existing `design/screens/<ScreenId>.design.md`.
 *   4. Flow → Maestro resolution — every flow's `maestro:` path resolves to a
 *      real file (and warns when it is not the conventional location).
 *   5. Maestro → flow resolution — no `maestro/flows/*.yaml` is an orphan
 *      (referenced by no `.flow.md`).
 *   6. Screen → composable resolution — a screen's `composable:` path exists
 *      (a warning by default; the product code may legitimately lag the
 *      annotation, so it does not fail CI unless `--strict`).
 */

import fs from 'node:fs';
import path from 'node:path';

import { parseFlowDoc, parseScreenDoc } from './parser.js';
import type {
  Finding,
  FlowDoc,
  FlowLintOptions,
  FlowLintResult,
  ScreenDoc,
} from './types.js';

const FLOW_SUFFIX = '.flow.md';
const SCREEN_SUFFIX = '.design.md';
const MAESTRO_SUFFIX = '.yaml';

/** Normalise a path to repo-relative POSIX form for stable finding output. */
function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/** List files in `dir` (relative to root) ending in `suffix`, sorted. */
function listFiles(root: string, dir: string, suffix: string): string[] {
  const abs = path.join(root, dir);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return []; // Missing directory is not itself an error — an empty graph lints clean.
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(suffix))
    .map((e) => toPosix(path.join(dir, e.name)))
    .sort();
}

/** Filename stem with `suffix` removed (e.g. `AddTitle.flow.md` → `AddTitle`). */
function stemOf(relPath: string, suffix: string): string {
  const base = relPath.slice(relPath.lastIndexOf('/') + 1);
  return base.slice(0, base.length - suffix.length);
}

function readFlows(root: string, designDir: string): FlowDoc[] {
  const dir = `${designDir}/flows`;
  return listFiles(root, dir, FLOW_SUFFIX).map((rel) => {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    return parseFlowDoc(rel, stemOf(rel, FLOW_SUFFIX), text);
  });
}

function readScreens(root: string, designDir: string): ScreenDoc[] {
  const dir = `${designDir}/screens`;
  return listFiles(root, dir, SCREEN_SUFFIX).map((rel) => {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    return parseScreenDoc(rel, stemOf(rel, SCREEN_SUFFIX), text);
  });
}

/** Does `relPath` (repo-relative) resolve to a real file on disk? */
function fileExists(root: string, relPath: string): boolean {
  try {
    return fs.statSync(path.join(root, relPath)).isFile();
  } catch {
    return false;
  }
}

/**
 * Collect every duplicate value in `entries`, keyed by id. Only ids that
 * appear on more than one doc are returned, each with all owning paths sorted.
 */
function findDuplicates(entries: Array<{ id: string; path: string }>): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  for (const { id, path: p } of entries) {
    const list = byId.get(id) ?? [];
    list.push(p);
    byId.set(id, list);
  }
  const dupes = new Map<string, string[]>();
  for (const [id, paths] of byId) {
    if (paths.length > 1) dupes.set(id, [...paths].sort());
  }
  return dupes;
}

/**
 * Run the full lint over the repo rooted at `opts.root`. Pure with respect to
 * everything except reading the design/maestro trees — it writes no files and
 * touches no Smithy manifest.
 */
export function lintFlows(opts: FlowLintOptions): FlowLintResult {
  const designDir = (opts.designDir ?? 'design').replace(/\/+$/, '');
  const maestroDir = (opts.maestroDir ?? 'maestro/flows').replace(/\/+$/, '');
  const strict = opts.strict ?? false;

  const flows = readFlows(opts.root, designDir);
  const screens = readScreens(opts.root, designDir);
  const maestroFiles = listFiles(opts.root, maestroDir, MAESTRO_SUFFIX);

  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);

  // --- Screen front-matter integrity + the ScreenId resolution index --------
  // `screensById` maps a declared ScreenId to its design doc so flows can
  // resolve `screens:` entries by id (not by filename guesswork).
  const screensById = new Map<string, ScreenDoc>();
  for (const screen of screens) {
    if (screen.parseError) {
      add({
        severity: 'error',
        code: 'screen-frontmatter-invalid',
        path: screen.path,
        message: `${screen.path}: ${screen.parseError}`,
      });
      continue;
    }
    if (!screen.id) {
      add({
        severity: 'error',
        code: 'screen-frontmatter-missing',
        path: screen.path,
        ref: 'id',
        message: `${screen.path}: missing required front-matter key \`id\``,
      });
      continue;
    }
    if (screen.id !== screen.stem) {
      add({
        severity: 'error',
        code: 'screen-id-mismatch',
        path: screen.path,
        ref: screen.id,
        message: `${screen.path}: \`id: ${screen.id}\` does not match filename stem \`${screen.stem}\` (expected ${screen.stem}${SCREEN_SUFFIX})`,
      });
    }
    // Index by id even on a stem mismatch so flow resolution keys off the
    // declared id; the mismatch is reported separately above.
    if (!screensById.has(screen.id)) screensById.set(screen.id, screen);

    if (!screen.composable) {
      add({
        severity: 'error',
        code: 'screen-frontmatter-missing',
        path: screen.path,
        ref: 'composable',
        message: `${screen.path}: missing required front-matter key \`composable\``,
      });
    } else if (!fileExists(opts.root, screen.composable)) {
      add({
        severity: 'warning',
        code: 'screen-composable-missing',
        path: screen.path,
        ref: screen.composable,
        message: `${screen.path}: \`composable\` path does not exist → ${screen.composable}`,
      });
    }
  }

  // --- ScreenId uniqueness --------------------------------------------------
  const screenDupes = findDuplicates(
    screens.filter((s) => s.id).map((s) => ({ id: s.id as string, path: s.path })),
  );
  for (const [id, paths] of [...screenDupes].sort(([a], [b]) => a.localeCompare(b))) {
    add({
      severity: 'error',
      code: 'screen-id-duplicate',
      path: paths[0] as string,
      ref: id,
      message: `ScreenId \`${id}\` declared by ${paths.length} files: ${paths.join(', ')}`,
    });
  }

  // --- Flow front-matter integrity + the flow→maestro claim set -------------
  // `claimedMaestro` records which Maestro yaml each flow points at, so the
  // orphan check can spot any yaml no flow references.
  const claimedMaestro = new Set<string>();
  for (const flow of flows) {
    if (flow.parseError) {
      add({
        severity: 'error',
        code: 'flow-frontmatter-invalid',
        path: flow.path,
        message: `${flow.path}: ${flow.parseError}`,
      });
      continue;
    }

    const missing: string[] = [];
    if (!flow.id) missing.push('id');
    if (flow.screens === undefined) missing.push('screens');
    if (!flow.maestro) missing.push('maestro');
    for (const key of missing) {
      add({
        severity: 'error',
        code: 'flow-frontmatter-missing',
        path: flow.path,
        ref: key,
        message: `${flow.path}: missing required front-matter key \`${key}\``,
      });
    }

    if (flow.id && flow.id !== flow.stem) {
      add({
        severity: 'error',
        code: 'flow-id-mismatch',
        path: flow.path,
        ref: flow.id,
        message: `${flow.path}: \`id: ${flow.id}\` does not match filename stem \`${flow.stem}\` (expected ${flow.stem}${FLOW_SUFFIX})`,
      });
    }

    // Flow → screen resolution.
    for (const screenId of flow.screens ?? []) {
      if (!screensById.has(screenId)) {
        add({
          severity: 'error',
          code: 'flow-screen-missing',
          path: flow.path,
          ref: `${designDir}/screens/${screenId}${SCREEN_SUFFIX}`,
          message: `${flow.path}: \`screens\` entry \`${screenId}\` does not resolve → ${designDir}/screens/${screenId}${SCREEN_SUFFIX} not found`,
        });
      }
    }

    // Flow → Maestro resolution.
    if (flow.maestro) {
      const claimed = toPosix(path.normalize(flow.maestro));
      claimedMaestro.add(claimed);
      if (!fileExists(opts.root, flow.maestro)) {
        add({
          severity: 'error',
          code: 'flow-maestro-missing',
          path: flow.path,
          ref: flow.maestro,
          message: `${flow.path}: \`maestro\` path does not resolve → ${flow.maestro} not found`,
        });
      } else {
        const conventional = `${maestroDir}/${flow.stem}${MAESTRO_SUFFIX}`;
        if (claimed !== conventional) {
          add({
            severity: 'warning',
            code: 'flow-maestro-nonconventional',
            path: flow.path,
            ref: flow.maestro,
            message: `${flow.path}: \`maestro\` resolves to ${flow.maestro} but the conventional path is ${conventional}`,
          });
        }
      }
    }
  }

  // --- FlowId uniqueness ----------------------------------------------------
  const flowDupes = findDuplicates(
    flows.filter((f) => f.id).map((f) => ({ id: f.id as string, path: f.path })),
  );
  for (const [id, paths] of [...flowDupes].sort(([a], [b]) => a.localeCompare(b))) {
    add({
      severity: 'error',
      code: 'flow-id-duplicate',
      path: paths[0] as string,
      ref: id,
      message: `FlowId \`${id}\` declared by ${paths.length} files: ${paths.join(', ')}`,
    });
  }

  // --- Maestro → flow resolution (orphan tests) -----------------------------
  for (const yaml of maestroFiles) {
    if (!claimedMaestro.has(yaml)) {
      add({
        severity: 'error',
        code: 'maestro-orphan',
        path: yaml,
        ref: yaml,
        message: `${yaml}: orphan Maestro flow — no \`.flow.md\` references it via \`maestro:\``,
      });
    }
  }

  // Stable ordering: by source path, then code, then ref.
  findings.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.code.localeCompare(b.code) ||
      (a.ref ?? '').localeCompare(b.ref ?? ''),
  );

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const ok = errorCount === 0 && (!strict || warningCount === 0);

  return {
    findings,
    errorCount,
    warningCount,
    ok,
    strict,
    flowsScanned: flows.length,
    screensScanned: screens.length,
    maestroScanned: maestroFiles.length,
  };
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import picocolors from 'picocolors';

import { ensureStoreRepo } from '../artifact-store.js';
import {
  displayPath,
  isDefaultProjectSlug,
  isValidProjectSlug,
  listProjectSlugs,
  projectRoot,
  projectStoreExists,
} from '../engraved/roots.js';

/**
 * `smithy project` — manage named project stores under `~/.smithy/projects/`.
 *
 * A named store is the artifact root for one workstream: its own git
 * repository holding that workstream's planning artifacts (`specs/`,
 * `docs/rfcs/`, …) and its project-level engraved records (`decisions/`,
 * `invariants/`, `constitution/`). Two workstreams in two stores never share
 * a checkout or a branch, and a workstream spanning several code repos has
 * one home that is not keyed to any of them.
 *
 * These commands are operator-driven, like `init`. Nothing here is added to a
 * manifest: a project store is the user's, and `uninit` never reaches it.
 */

function fail(message: string): void {
  console.error(picocolors.red(`Error: ${message}`));
  process.exitCode = 2;
}

function validateSlug(slug: string): boolean {
  if (!isValidProjectSlug(slug)) {
    fail(
      `invalid project slug '${slug}'. Expected a single path segment (letters, digits, '.', '_', '-').`,
    );
    return false;
  }
  if (isDefaultProjectSlug(slug)) {
    fail(`'default' is the shared out-of-repo store, not a named project.`);
    return false;
  }
  return true;
}

/** `smithy project init <slug>` — create a git-backed named store. */
export function projectInitAction(slug: string): void {
  if (!validateSlug(slug)) return;
  const root = projectRoot(slug);
  const existed = projectStoreExists(slug);
  const result = ensureStoreRepo(root);
  if (result.warning !== undefined) {
    console.log(
      picocolors.yellow(
        `  Project store: ${result.warning} — artifacts can still be written, but without history`,
      ),
    );
  }
  if (existed && !result.gitInitialized) {
    console.log(picocolors.dim(`  Project store already exists: ${displayPath(root)}`));
  } else {
    console.log(
      picocolors.green(
        `  Project store ready: ${displayPath(root)}${result.gitInitialized ? ' (git repository initialized)' : ''}`,
      ),
    );
  }
  console.log(
    picocolors.dim(
      `  Target it with --project ${slug} on a planning command, or confirm with: smithy root --project ${slug}`,
    ),
  );
}

/**
 * `smithy project link <slug> <path>` — make `~/.smithy/projects/<slug>` a
 * symlink to a directory the user already keeps (a coord worktree, say).
 * The store path, its tilde spelling, and the `~/.smithy/projects` git
 * permissions stay the same; commits made through the link land in the
 * target's own history, so no second repository is created inside it.
 */
export function projectLinkAction(slug: string, target: string): void {
  if (!validateSlug(slug)) return;
  const link = projectRoot(slug);
  const dest = path.resolve(expandHome(target));

  let stat: fs.Stats;
  try {
    stat = fs.statSync(dest);
  } catch {
    fail(`link target does not exist: ${target}`);
    return;
  }
  if (!stat.isDirectory()) {
    fail(`link target is not a directory: ${target}`);
    return;
  }
  if (fs.existsSync(link) || isDanglingLink(link)) {
    fail(
      `${displayPath(link)} already exists. Remove it first if you mean to re-link the project.`,
    );
    return;
  }

  try {
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(dest, link, 'dir');
  } catch (err) {
    fail(`could not create ${displayPath(link)}: ${(err as Error).message}`);
    return;
  }

  const result = ensureStoreRepo(dest, { acceptEnclosingRepo: true });
  if (result.warning !== undefined) {
    console.log(
      picocolors.yellow(
        `  Project store: ${result.warning} — artifacts can still be written, but without history`,
      ),
    );
  }
  console.log(picocolors.green(`  Linked project store: ${displayPath(link)} -> ${dest}`));
  if (result.gitInitialized) {
    console.log(picocolors.dim('  (git repository initialized at the link target)'));
  }
}

/** `smithy project list` — the named stores on this machine, with link targets. */
export function projectListAction(opts: { format?: 'text' | 'json' } = {}): void {
  const entries = listProjectSlugs().map((slug) => {
    const root = projectRoot(slug);
    let linkTarget: string | null = null;
    try {
      if (fs.lstatSync(root).isSymbolicLink()) linkTarget = fs.realpathSync(root);
    } catch {
      linkTarget = null;
    }
    return { slug, path: displayPath(root), link_target: linkTarget };
  });

  if (opts.format === 'json') {
    console.log(JSON.stringify({ projects: entries }, null, 2));
    return;
  }
  if (entries.length === 0) {
    console.log('No named project stores. Create one with: smithy project init <slug>');
    return;
  }
  for (const e of entries) {
    console.log(e.link_target === null ? `${e.slug}\t${e.path}` : `${e.slug}\t${e.path} -> ${e.link_target}`);
  }
}

function isDanglingLink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

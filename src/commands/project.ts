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
} from '../engraved/roots.js';
import { isInsideGitRepo } from '../manifest.js';

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
      `invalid project slug '${slug}'. Expected a single path segment (letters, digits, '.', '_', '-'), not starting with '.', and not 'all'.`,
    );
    return false;
  }
  if (isDefaultProjectSlug(slug)) {
    fail(`'default' is the shared out-of-repo store, not a named project.`);
    return false;
  }
  return true;
}

function reportStoreWarning(warning: string): void {
  console.log(
    picocolors.yellow(
      `  Project store: ${warning} — artifacts can still be written, but without history`,
    ),
  );
}

/** `smithy project init <slug>` — create a git-backed named store. */
export function projectInitAction(slug: string): void {
  if (!validateSlug(slug)) return;
  const root = projectRoot(slug);

  // A linked slug is already a store: the user's own directory, with the
  // user's own history. Running the store engine on it would nest a second
  // repository inside their checkout — the one thing `link` promises not to
  // do — so report and leave it alone. A dangling link is an error the user
  // has to see: nothing can be written through it.
  const link = linkTarget(root);
  if (link !== null) {
    if (!fs.existsSync(root)) {
      fail(
        `${displayPath(root)} is a symlink to ${link}, which does not exist. Remove the link or restore its target.`,
      );
      return;
    }
    console.log(picocolors.dim(`  Project store already linked: ${displayPath(root)} -> ${link}`));
    return;
  }

  const existed = fs.existsSync(root);
  const result = ensureStoreRepo(root);
  if (result.warning !== undefined && !fs.existsSync(root)) {
    fail(`could not create ${displayPath(root)}: ${result.warning}`);
    return;
  }
  if (result.warning !== undefined) reportStoreWarning(result.warning);
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
 *
 * The target is the user's directory, not Smithy's, so this command never
 * commits what is already there: an existing repository is left as it is,
 * an empty directory is initialized so the store has a history from its
 * first artifact, and a non-empty plain directory is left unversioned with
 * a warning rather than having its contents swept into a Smithy commit.
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
  const forbidden = forbiddenLinkTarget(dest);
  if (forbidden !== null) {
    fail(forbidden);
    return;
  }
  if (fs.existsSync(link) || linkTarget(link) !== null) {
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

  console.log(picocolors.green(`  Linked project store: ${displayPath(link)} -> ${dest}`));

  if (fs.existsSync(path.join(dest, '.git')) || isInsideGitRepo(dest)) {
    // Already versioned by the user's own repository; nothing to do.
    ensureStoreRepo(dest, { acceptEnclosingRepo: true });
    return;
  }
  if (fs.readdirSync(dest).length > 0) {
    console.log(
      picocolors.yellow(
        `  ${dest} is not a git repository and is not empty, so it was left unversioned — ` +
          `artifacts written there have no history until you run git init in it yourself.`,
      ),
    );
    return;
  }
  const result = ensureStoreRepo(dest);
  if (result.warning !== undefined) {
    reportStoreWarning(result.warning);
    return;
  }
  if (result.gitInitialized) {
    console.log(picocolors.dim('  (git repository initialized at the link target)'));
  }
}

/** `smithy project list` — the named stores on this machine, with link targets. */
export function projectListAction(opts: { format?: 'text' | 'json' } = {}): void {
  const entries = listProjectSlugs().map((slug) => {
    const root = projectRoot(slug);
    const target = linkTarget(root);
    return {
      slug,
      path: displayPath(root),
      link_target: target === null ? null : safeRealpath(root) ?? target,
    };
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

/**
 * Why `dest` may not back a project store, or `null` when it may. The
 * home directory, the filesystem root, and anything that contains
 * `~/.smithy/projects/` would make the store a loop over every other store
 * (and over Smithy's own files); anything *inside* `~/.smithy/` is Smithy's,
 * not the user's, and gets no second identity.
 */
function forbiddenLinkTarget(dest: string): string | null {
  const home = os.homedir();
  const smithyDir = path.join(home, '.smithy');
  const projectsDir = path.join(smithyDir, 'projects');
  const real = safeRealpath(dest) ?? dest;
  for (const candidate of new Set([dest, real])) {
    if (candidate === home || candidate === path.parse(candidate).root) {
      return `link target ${dest} is the home directory or filesystem root; link a directory dedicated to the project instead.`;
    }
    if (candidate === smithyDir || projectsDir.startsWith(candidate + path.sep)) {
      return `link target ${dest} contains ~/.smithy/projects/ and would make the store a loop over every other store; link a directory dedicated to the project instead.`;
    }
    if (candidate.startsWith(smithyDir + path.sep)) {
      return `link target ${dest} is inside ~/.smithy/, which Smithy manages; link a directory of your own instead.`;
    }
  }
  return null;
}

/** The raw symlink target of `p`, or `null` when `p` is not a symlink. */
function linkTarget(p: string): string | null {
  try {
    return fs.lstatSync(p).isSymbolicLink() ? fs.readlinkSync(p) : null;
  } catch {
    return null;
  }
}

function safeRealpath(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

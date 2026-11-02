import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  isDefaultProjectSlug,
  isValidProjectSlug,
  listProjectSlugs,
  projectRoot,
  projectStoreExists,
  projectStorePrefixFor,
} from './engraved/roots.js';
import type { ArtifactsLocation } from './interactive.js';
import {
  readManifest,
  repoToplevel,
  templateArtifactsPrefix,
  type SmithyManifest,
} from './manifest.js';
import { extractProjectHeader } from './status/parser.js';

/**
 * Run-time resolution of the planning-artifact root.
 *
 * Every deployed prompt carries one root, baked in by `smithy init` through
 * `{{artifactsRoot}}`: the repo itself, or the repo-keyed / `default` store
 * under `~/.smithy/`. That is the right answer for one workstream per
 * install, and the wrong one the moment a machine runs two workstreams at
 * once or a project spans several repos — both then share one checkout, one
 * branch, and one `specs/` tree.
 *
 * Named project stores (`~/.smithy/projects/<slug>/`) already exist for
 * engraved knowledge, each its own git repository. This module makes a
 * resolved project the root for *every* planning artifact, by the same rule
 * the engraved side has used all along, so an agent asks `smithy root` once
 * per run and substitutes the answer for the rendered prefix. The rendered
 * value stays as the fallback: an install that never names a project behaves
 * exactly as before.
 *
 * ## The rules
 *
 * First match wins:
 *
 *   1. An explicit `--project <slug>`.
 *   2. The artifact being worked on names a project — a `**Project**:` header
 *      (or `project:` frontmatter), or the file physically lives inside a
 *      named store. This is what lets `smithy.forge`, standing in a code
 *      worktree, find the store its tasks file came from. An artifact that
 *      lives in no named store settles the run on the install root: the
 *      artifact's own location outranks any guess.
 *   3. **Reads only, and only when no artifact anchored the run:** exactly
 *      one named store exists.
 *   4. The install-time root.
 *
 * Rule 3 is skipped for writes on purpose. Recall or status guessing the one
 * named project costs a few extra records read; `smithy.mark` guessing it
 * would redirect every spec on the machine into that project the moment it
 * was created. A write that falls through to rule 4 while named stores exist
 * carries a `warning` so the agent can say where the artifact landed.
 *
 * Nothing here consults the working directory's *name*. A project is a
 * declaration, never an inference from where the shell happens to be.
 */

export type ArtifactRootKind =
  /** A named project store, `~/.smithy/projects/<slug>/`. */
  | 'project'
  /** The repo-keyed external store, `~/.smithy/repos/<repoKey>/`. */
  | 'repo-store'
  /** The shared out-of-repo store, `~/.smithy/projects/default/`. */
  | 'default-store'
  /** The code repo itself (`artifactsLocation: repo`). */
  | 'in-repo';

export type ArtifactRootRule = 1 | 2 | 3 | 4;

export interface ResolvedArtifactRoot {
  /**
   * The prefix to use in place of {@link rendered_prefix} wherever a prompt
   * names an artifact path. Tilde form with a trailing slash for any
   * `~/.smithy/` store, and `""` for the code repo — the same two shapes
   * `{{artifactsRoot}}` renders to, so substitution is a literal replacement.
   */
  prefix: string;
  /**
   * What `smithy init` baked into the deployed prompts for this install —
   * read from the manifest it wrote, so it is the string the prompts really
   * contain rather than a recomputation from wherever this command runs.
   */
  rendered_prefix: string;
  /** Absolute filesystem path of the resolved root. */
  path: string;
  kind: ArtifactRootKind;
  /** Whether the root is one of Smithy's git-backed stores (any kind but `in-repo`). */
  store: boolean;
  /** Which rule settled it. */
  rule: ArtifactRootRule;
  /** The resolved project slug, or `null` when no project is in play. */
  project: string | null;
  /**
   * The project whose engraved level this run should *read*. Equal to
   * {@link project} whenever one resolved. In write mode it additionally
   * names the single named store when exactly one exists: a read may take
   * that store even though the write may not, and recall is a read — without
   * this field a planning run on a single-store machine would lose the
   * project rules it consulted before writes stopped guessing.
   */
  recall_project: string | null;
  mode: 'read' | 'write';
  /** Set when a write fell through to the install root although named stores exist. */
  warning?: string;
}

export interface ResolveArtifactRootOptions {
  /** Directory the install is anchored at. Defaults to `process.cwd()`. */
  targetDir?: string;
  /** Rule 1: an explicit slug. */
  project?: string | undefined;
  /** Rule 2: the artifact (or spec folder) being worked on. */
  from?: string | undefined;
  /** `write` skips rule 3. Defaults to `read`. */
  mode?: 'read' | 'write';
}

/** A resolution that cannot proceed — the caller reports and exits 2. */
export class ArtifactRootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactRootError';
  }
}

/**
 * Resolve the root per the rules above. Throws {@link ArtifactRootError} on
 * an invalid slug, a named project with no store on disk, or an unreadable
 * `--from` path — each is a user error that must not quietly fall through to
 * rule 4, because that is exactly how a spec ends up in the wrong store.
 */
export function resolveArtifactRoot(
  opts: ResolveArtifactRootOptions = {},
): ResolvedArtifactRoot {
  const targetDir = path.resolve(opts.targetDir ?? process.cwd());
  const mode = opts.mode ?? 'read';
  const install = resolveInstallRoot(targetDir);

  const slugs = listProjectSlugs();

  const finish = (
    project: string | null,
    rule: ArtifactRootRule,
    anchored: boolean,
    warning?: string,
  ): ResolvedArtifactRoot => {
    if (project !== null) {
      return {
        prefix: projectStorePrefixFor(project),
        rendered_prefix: install.rendered,
        path: projectRoot(project),
        kind: 'project',
        store: true,
        rule,
        project,
        recall_project: project,
        mode,
      };
    }
    const result: ResolvedArtifactRoot = {
      prefix: install.rendered,
      rendered_prefix: install.rendered,
      path: install.path,
      kind: install.kind,
      store: install.kind !== 'in-repo',
      rule,
      project: null,
      // What a read would have settled on under rule 3.
      recall_project: !anchored && slugs.length === 1 ? (slugs[0] as string) : null,
      mode,
    };
    if (warning !== undefined) result.warning = warning;
    return result;
  };

  // Rule 1.
  if (opts.project !== undefined && opts.project.length > 0) {
    return finish(requireNamedStore(opts.project, '--project'), 1, true);
  }

  // Rule 2. An artifact that was read successfully anchors the run even when
  // it names no project: it lives at the install root, and that is where the
  // run belongs. Rule 3 would otherwise send a read against an in-repo spec
  // off to whichever named store happens to be the only one.
  let anchored = false;
  if (opts.from !== undefined && opts.from.length > 0) {
    const declared = projectDeclaredBy(opts.from);
    anchored = true;
    if (declared !== null) {
      return finish(requireNamedStore(declared, `the artifact ${opts.from}`), 2, true);
    }
  }

  // Rule 3 — reads only, unanchored runs only.
  if (mode === 'read' && !anchored && slugs.length === 1) {
    return finish(slugs[0] as string, 3, false);
  }

  // Rule 4.
  const warning =
    mode === 'write' && slugs.length > 0
      ? `${slugs.length} named project store${slugs.length === 1 ? '' : 's'} exist${slugs.length === 1 ? 's' : ''} (${slugs.join(', ')}) but none was named; writing to the install root. Pass --project <slug> to target one.`
      : undefined;
  return finish(null, 4, anchored, warning);
}

/** The install-time root, as the deployed prompts of this install know it. */
export interface InstallRoot {
  location: ArtifactsLocation;
  /** The `{{artifactsRoot}}` prefix the prompts contain; `""` in repo mode. */
  rendered: string;
  /** Absolute path of that root. */
  path: string;
  kind: Exclude<ArtifactRootKind, 'project'>;
}

/**
 * Find the install that governs `targetDir` and the root it rendered.
 *
 * The manifest is looked up at `targetDir`, then at the git toplevel (a
 * repo-level manifest lives in the toplevel's `.smithy/`, and planning
 * commands run from subdirectories), then at the user level. The rendered
 * prefix comes from the manifest's `artifactsRoot` when it recorded one;
 * only a manifest written before that field existed falls back to
 * recomputing it, anchored at the manifest's own repo rather than the
 * current directory.
 */
export function resolveInstallRoot(targetDir: string): InstallRoot {
  const found = findInstallManifest(targetDir);
  const manifest = found?.manifest ?? null;
  const anchor = found?.anchor ?? targetDir;
  const location: ArtifactsLocation = manifest?.artifactsLocation ?? 'repo';
  const rendered =
    location === 'external'
      ? manifest?.artifactsRoot ?? templateArtifactsPrefix(anchor, 'external')
      : '';
  if (rendered === '') {
    return { location, rendered, path: anchor, kind: 'in-repo' };
  }
  const kind: InstallRoot['kind'] = rendered.startsWith('~/.smithy/projects/')
    ? 'default-store'
    : 'repo-store';
  return { location, rendered, path: expandHome(rendered).replace(/[\\/]+$/, ''), kind };
}

function findInstallManifest(
  targetDir: string,
): { manifest: SmithyManifest; anchor: string } | null {
  const toplevel = repoToplevel(targetDir);
  const repoDirs = toplevel !== null && toplevel !== targetDir ? [targetDir, toplevel] : [targetDir];
  for (const dir of repoDirs) {
    const manifest = readManifest(dir, 'repo');
    if (manifest !== null) return { manifest, anchor: dir };
  }
  const user = readManifest(targetDir, 'user');
  if (user !== null) return { manifest: user, anchor: toplevel ?? targetDir };
  return null;
}

/**
 * The project an artifact declares: its `**Project**:` header or `project:`
 * frontmatter, else the named store it physically lives in. A spec *folder*
 * is accepted too — it is `smithy.cut`'s primary input — and declares what
 * its single `.spec.md` declares, else where it lives. `null` when neither
 * applies. Throws when the path cannot be read.
 */
export function projectDeclaredBy(artifactPath: string): string | null {
  const abs = path.resolve(expandHome(artifactPath));
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch (err) {
    throw new ArtifactRootError(
      `cannot read --from path ${artifactPath}: ${(err as Error).message}`,
    );
  }

  if (stat.isDirectory()) {
    const specs = fs.readdirSync(abs).filter((name) => name.endsWith('.spec.md'));
    if (specs.length === 1) {
      const header = extractProjectHeader(
        fs.readFileSync(path.join(abs, specs[0] as string), 'utf8'),
      );
      if (header !== null) return header;
    }
    return projectContaining(abs);
  }

  let content: string;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    throw new ArtifactRootError(
      `cannot read --from path ${artifactPath}: ${(err as Error).message}`,
    );
  }
  const header = extractProjectHeader(content);
  if (header !== null) return header;
  return projectContaining(abs);
}

/**
 * The named project whose store contains `abs`, or `null`. Resolved through
 * the real path so a linked store (a symlink under `projects/`) matches
 * whichever spelling of the path the caller used. When link targets nest,
 * the most specific store — the longest matching root — wins.
 */
export function projectContaining(abs: string): string | null {
  const projectsDir = path.join(os.homedir(), '.smithy', 'projects');
  const candidates = [abs, safeRealpath(abs)].filter(
    (p, i, all): p is string => p !== null && all.indexOf(p) === i,
  );
  let best: { slug: string; depth: number } | null = null;
  for (const slug of listProjectSlugs()) {
    const root = projectRoot(slug);
    const roots = [root, safeRealpath(root)].filter((r): r is string => r !== null);
    for (const candidate of candidates) {
      for (const r of roots) {
        if (candidate === r || candidate.startsWith(r + path.sep)) {
          if (best === null || r.length > best.depth) best = { slug, depth: r.length };
        }
      }
    }
  }
  if (best !== null) return best.slug;
  // A path under `projects/<slug>/` whose store has since vanished still
  // names its project; let `requireNamedStore` report that it is gone.
  const rel = path.relative(projectsDir, abs);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    const first = rel.split(path.sep)[0];
    if (first !== undefined && isValidProjectSlug(first) && !isDefaultProjectSlug(first)) {
      return first;
    }
  }
  return null;
}

function requireNamedStore(slug: string, source: string): string {
  if (!isValidProjectSlug(slug) || isDefaultProjectSlug(slug)) {
    throw new ArtifactRootError(
      `invalid project slug '${slug}' from ${source}. Expected a single path segment (letters, digits, '.', '_', '-'), not starting with '.', and not 'default' or 'all'.`,
    );
  }
  if (!projectStoreExists(slug)) {
    throw new ArtifactRootError(
      `no project store named '${slug}' (from ${source}). Create one with: smithy project init ${slug}`,
    );
  }
  return slug;
}

/** The install's `artifactsLocation`; `repo` when there is no manifest. */
export function installArtifactsLocation(targetDir: string): ArtifactsLocation {
  return resolveInstallRoot(targetDir).location;
}

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function safeRealpath(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

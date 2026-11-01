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
  isInsideGitRepo,
  readManifest,
  resolveArtifactsRoot,
  templateArtifactsPrefix,
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
 *      worktree, find the store its tasks file came from.
 *   3. **Reads only:** exactly one named store exists.
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
  /** What `smithy init` baked into the deployed prompts for this install. */
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
  mode: 'read' | 'write';
  /** Set when a write fell through to the install root although named stores exist. */
  warning?: string;
}

export interface ResolveArtifactRootOptions {
  /** Directory the install is anchored at. Defaults to `process.cwd()`. */
  targetDir?: string;
  /** Rule 1: an explicit slug. */
  project?: string | undefined;
  /** Rule 2: the artifact being worked on. */
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
  const location = installArtifactsLocation(targetDir);
  const rendered = templateArtifactsPrefix(targetDir, location);

  const finish = (
    project: string | null,
    rule: ArtifactRootRule,
    warning?: string,
  ): ResolvedArtifactRoot => {
    if (project !== null) {
      return {
        prefix: projectStorePrefixFor(project),
        rendered_prefix: rendered,
        path: projectRoot(project),
        kind: 'project',
        store: true,
        rule,
        project,
        mode,
      };
    }
    const kind = installRootKind(targetDir, location);
    const result: ResolvedArtifactRoot = {
      prefix: rendered,
      rendered_prefix: rendered,
      path: resolveArtifactsRoot(targetDir, location),
      kind,
      store: kind !== 'in-repo',
      rule,
      project: null,
      mode,
    };
    if (warning !== undefined) result.warning = warning;
    return result;
  };

  // Rule 1.
  if (opts.project !== undefined && opts.project.length > 0) {
    return finish(requireNamedStore(opts.project, '--project'), 1);
  }

  // Rule 2.
  if (opts.from !== undefined && opts.from.length > 0) {
    const declared = projectDeclaredBy(opts.from);
    if (declared !== null) {
      return finish(requireNamedStore(declared, `the artifact ${opts.from}`), 2);
    }
  }

  // Rule 3 — reads only.
  const slugs = listProjectSlugs();
  if (mode === 'read' && slugs.length === 1) {
    return finish(slugs[0] as string, 3);
  }

  // Rule 4.
  const warning =
    mode === 'write' && slugs.length > 0
      ? `${slugs.length} named project store${slugs.length === 1 ? '' : 's'} exist${slugs.length === 1 ? 's' : ''} (${slugs.join(', ')}) but none was named; writing to the install root. Pass --project <slug> to target one.`
      : undefined;
  return finish(null, 4, warning);
}

/**
 * The project an artifact declares: its `**Project**:` header or `project:`
 * frontmatter, else the named store it physically lives in. `null` when
 * neither applies. Throws when the path cannot be read.
 */
export function projectDeclaredBy(artifactPath: string): string | null {
  const abs = path.resolve(expandHome(artifactPath));
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
 * whichever spelling of the path the caller used.
 */
export function projectContaining(abs: string): string | null {
  const projectsDir = path.join(os.homedir(), '.smithy', 'projects');
  const candidates = [abs, safeRealpath(abs)].filter(
    (p, i, all): p is string => p !== null && all.indexOf(p) === i,
  );
  for (const slug of listProjectSlugs()) {
    const root = projectRoot(slug);
    const roots = [root, safeRealpath(root)].filter((r): r is string => r !== null);
    for (const candidate of candidates) {
      for (const r of roots) {
        if (candidate === r || candidate.startsWith(r + path.sep)) return slug;
      }
    }
  }
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
      `invalid project slug '${slug}' from ${source}. Expected a single path segment (letters, digits, '.', '_', '-'), and not 'default'.`,
    );
  }
  if (!projectStoreExists(slug)) {
    throw new ArtifactRootError(
      `no project store named '${slug}' (from ${source}). Create one with: smithy project init ${slug}`,
    );
  }
  return slug;
}

/** The install's `artifactsLocation`, from either manifest location; `repo` when there is no manifest. */
export function installArtifactsLocation(targetDir: string): ArtifactsLocation {
  const manifest = readManifest(targetDir, 'repo') ?? readManifest(targetDir, 'user');
  return manifest?.artifactsLocation ?? 'repo';
}

function installRootKind(
  targetDir: string,
  location: ArtifactsLocation,
): Exclude<ArtifactRootKind, 'project'> {
  if (location !== 'external') return 'in-repo';
  return isInsideGitRepo(targetDir) ? 'repo-store' : 'default-store';
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

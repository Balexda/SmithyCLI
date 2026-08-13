import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import type { ArtifactsLocation } from './interactive.js';
import { resolveArtifactsRoot } from './manifest.js';

/**
 * Git-backed external artifact stores.
 *
 * When planning artifacts live outside the code repo they have no history of
 * their own: an agent that overwrites or deletes a spec leaves nothing to
 * recover from, and there is no way to move the store between machines.
 * Making each store a git repository fixes both — `git restore` becomes the
 * undo button, and the user can attach a remote whenever they want the store
 * to follow them.
 *
 * One repository per store. Stores are independent projects; a single
 * repository spanning `~/.smithy/` would couple unrelated work onto one
 * history and one remote, and would nest badly the moment a user cloned an
 * existing store into place.
 */

const INIT_COMMIT_MESSAGE = 'smithy: initialize artifact store';

/** Identity used only when the machine has no global git identity at all. */
const FALLBACK_USER_NAME = 'Smithy CLI';
const FALLBACK_USER_EMAIL = 'smithy@localhost';

export interface EnsureArtifactStoreResult {
  /** Absolute path to the store. */
  root: string;
  /** Whether this call created the store directory. */
  createdDir: boolean;
  /** Whether this call ran `git init` (false if the store was already a repo). */
  gitInitialized: boolean;
  /**
   * Set when git-backing could not be established. The store directory still
   * exists and is usable — only the history is missing.
   */
  warning?: string;
}

/** Run a git command in `cwd`, letting failures throw for the caller to catch. */
function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Whether git can already attribute a commit made in `cwd` — i.e. `user.name`
 * and `user.email` resolve from any scope (global, system, or an existing
 * repo-local config).
 */
function hasGitIdentity(cwd: string): boolean {
  for (const key of ['user.name', 'user.email']) {
    try {
      if (git(cwd, ['config', '--get', key]).trim().length === 0) return false;
    } catch {
      // `git config --get` exits non-zero when the key is unset.
      return false;
    }
  }
  return true;
}

function storeReadme(root: string): string {
  return `# Smithy artifact store

Smithy planning artifacts (RFCs, feature maps, specs, tasks, strikes, PRDs)
for an install configured with \`artifactsLocation: external\`. Smithy created
this directory and initialized it as a git repository so the artifacts have a
history — if an agent overwrites or deletes one, \`git restore\` brings it
back.

    ${root}

Artifacts land under \`docs/\` and \`specs/\` here, using the same layout they
would have in-tree.

## Syncing between machines

Nothing is pushed anywhere by default. To carry this store between machines,
attach a remote yourself:

    git -C ${root} remote add origin <your-remote-url>
    git -C ${root} push -u origin main

Smithy will not push on your behalf.
`;
}

/**
 * Ensure the external artifact store for `targetDir` exists and is a git
 * repository. Returns `null` for `'repo'` mode, where artifacts live in the
 * code repo and already have its history.
 *
 * Idempotent: a store that is already a git repository is left completely
 * alone, so re-running `smithy init` or `smithy update` never rewrites
 * history or adds empty commits.
 *
 * Never throws. Creating the store is a side benefit of `init`, not its
 * purpose — a machine without git, or one where the commit is rejected by a
 * hook, should still get a working Smithy install. Failures come back as
 * `warning` for the caller to surface.
 */
export function ensureArtifactStore(
  targetDir: string,
  location: ArtifactsLocation,
): EnsureArtifactStoreResult | null {
  if (location !== 'external') return null;

  const root = resolveArtifactsRoot(targetDir, 'external');

  let createdDir = false;
  try {
    createdDir = !fs.existsSync(root);
    fs.mkdirSync(root, { recursive: true });
  } catch (err) {
    return {
      root,
      createdDir: false,
      gitInitialized: false,
      warning: `could not create ${root}: ${(err as Error).message}`,
    };
  }

  if (fs.existsSync(path.join(root, '.git'))) {
    return { root, createdDir, gitInitialized: false };
  }

  try {
    // `-c init.defaultBranch=main` pins the branch name regardless of the
    // user's git defaults and silences the "using 'master'" advice.
    git(root, ['-c', 'init.defaultBranch=main', 'init']);

    // These are the user's own commits, so inherit their identity. Only fall
    // back to a local placeholder when the machine has none — otherwise the
    // very first commit would fail on a fresh install.
    if (!hasGitIdentity(root)) {
      git(root, ['config', '--local', 'user.name', FALLBACK_USER_NAME]);
      git(root, ['config', '--local', 'user.email', FALLBACK_USER_EMAIL]);
    }

    const readmePath = path.join(root, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath, storeReadme(root));
    }

    git(root, ['add', '-A']);
    // `--no-gpg-sign` matters: a global `commit.gpgsign = true` would
    // otherwise block on a passphrase prompt in a non-interactive run.
    git(root, ['commit', '--no-gpg-sign', '-m', INIT_COMMIT_MESSAGE]);

    return { root, createdDir, gitInitialized: true };
  } catch (err) {
    return {
      root,
      createdDir,
      gitInitialized: false,
      warning: `could not git-init ${root}: ${(err as Error).message.trim()}`,
    };
  }
}

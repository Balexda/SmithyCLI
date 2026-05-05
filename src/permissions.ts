export type PermissionEntry = string[] | Record<string, string[]>;

export type LanguageToolchain = 'node' | 'java' | 'rust' | 'python';

export const toolchains: Record<LanguageToolchain, { label: string; permissionKeys: string[]; markers: string[] }> = {
  node:   { label: 'Node.js (npm)',        permissionKeys: ['npm', 'npx', 'nodenv'], markers: ['package.json'] },
  java:   { label: 'Java/Kotlin (Gradle)', permissionKeys: ['./gradlew'],  markers: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts', 'gradlew'] },
  rust:   { label: 'Rust (Cargo)',         permissionKeys: ['cargo'],               markers: ['Cargo.toml'] },
  python: { label: 'Python (pip)',         permissionKeys: ['python', 'pip', 'pytest', 'uv'], markers: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile', 'uv.lock'] },
};

/**
 * Platform-scoped package managers. Unlike language toolchains (which reflect
 * user choice), platforms reflect an OS fact: brew on macOS, apt/dpkg on Linux.
 * `detectPlatforms()` (in `./platform-detect.ts`) matches `process.platform`
 * against `osPlatforms` to decide which entries to include.
 */
export type PlatformPackageManager = 'mac' | 'linux';

export const platforms: Record<PlatformPackageManager, { label: string; permissionKeys: string[]; osPlatforms: NodeJS.Platform[] }> = {
  mac:   { label: 'Homebrew (macOS)', permissionKeys: ['brew'],                     osPlatforms: ['darwin'] },
  linux: { label: 'apt/dpkg (Linux)', permissionKeys: ['apt', 'apt-cache', 'dpkg'], osPlatforms: ['linux'] },
};

export const permissions: Record<string, PermissionEntry> = {
  // --- Git ---
  // Flag variants are listed explicitly because Gemini CLI's wildcard
  // matching does not treat `*` as covering flag arguments (e.g. `-b`).
  git: {
    "status": [],
    "status -s": [],
    "init": [],
    "fetch": ["*"],
    "pull": ["*"],
    "pull --rebase": ["*"],
    "checkout": ["*"],
    "checkout -b": ["*"],
    "branch": ["*"],
    "branch --show-current": [],
    "branch -a": [],
    "branch -v": [],
    "branch -vv": [],
    "add": ["*"],
    "add -A": [],
    "add --all": [],
    "commit": ["*"],
    "commit -m": ["*"],
    "commit -am": ["*"],
    "log": ["*"],
    "log --oneline": ["*"],
    "log -n": ["*"],
    "log --oneline -n": ["*"],
    "diff": ["*"],
    "diff --name-only": ["*"],
    "diff --stat": ["*"],
    "diff --cached": ["*"],
    "diff --staged": ["*"],
    "stash": ["*"],
    "stash pop": [],
    "stash list": [],
    "stash show": ["*"],
    "merge": ["*"],
    "rebase": ["*"],
    "tag": ["*"],
    "tag -l": ["*"],
    "remote -v": [],
    "remote show": ["*"],
    "rev-parse": ["*"],
    "rev-parse --abbrev-ref": ["*"],
    "show": ["*"],
    "blame": ["*"],
    "cherry-pick": ["*"],
    "check-ignore": ["*"],
    "mv": ["*"],
    // Read-only lookups only — no wildcard to prevent the mutating
    // form `git symbolic-ref <name> <ref>` from repointing refs.
    "symbolic-ref HEAD": [],
    "symbolic-ref refs/remotes/origin/HEAD": [],
    "push": [],
    "push -u origin": ["feature/*", "fix/*", "chore/*", "strike/*", "claude/*"],
    "push origin": ["feature/*", "fix/*", "chore/*", "strike/*", "claude/*"],
  },

  // --- Filesystem (read + create, no delete) ---
  // Flag variants are needed because Gemini CLI does not match flags with `*`.
  ls: ["*", "-l *", "-la *", "-al *", "-a *", "-lh *", "-R *"],
  cat: ["*", "-n *"],
  head: ["*", "-n *"],
  tail: ["*", "-n *", "-f *"],
  mkdir: ["*", "-p *"],
  cp: ["*", "-r *", "-R *", "-rp *"],
  mv: ["*"],
  touch: ["*"],
  find: ["*", "-name *", "-type *"],
  wc: ["*", "-l *", "-l"],
  sort: ["*", "-u *", "-n *", "-r *", "-k *"],
  uniq: ["*", "-c *"],
  diff: ["*", "-u *"],
  tree: ["*", "-L *"],
  stat: ["*"],
  file: ["*"],
  pwd: [],
  dirname: ["*"],
  basename: ["*"],
  tee: ["*", "-a *"],
  realpath: ["*"],
  readlink: ["*", "-f *"],

  // --- Text processing ---
  grep: ["*", "-r *", "-rn *", "-n *", "-i *", "-ri *", "-rni *", "-l *", "-rl *", "-c *"],
  rg: ["*"],
  sed: ["*", "-i *", "-n *"],
  awk: ["*"],
  jq: ["*", "-r *"],
  cut: ["*", "-d *", "-f *"],
  tr: ["*", "-d *"],

  // --- npm / Node.js ---
  npm: {
    "run build": [],
    "run test": [],
    "run typecheck": [],
    "run lint": [],
    "run format": [],
    "run check": [],
    "run dev": [],
    "run start": [],
    "install": [],
    "ci": [],
    "test": ["*"],
    "ls": [],
    "outdated": [],
    "audit": [],
    "pack": [],
    "version": ["*"],
  },
  // npx — enumerated safe commands only (no wildcard — Gemini has no deny-list)
  npx: {
    "tsc": ["*"],
    "tsc --noEmit": [],
    "tsx": ["*"],
    "vitest": ["*"],
    "vitest run": ["*"],
    "eslint": ["*"],
    "prettier": ["*"],
    "prettier --write": ["*"],
    "prettier --check": ["*"],
    "jest": ["*"],
    "mocha": ["*"],
    "ts-node": ["*"],
    "rimraf": ["*"],
    "mkdirp": ["*"],
    "semver": ["*"],
    "sort-package-json": [],
  },
  // nodenv — version management (read-only queries + safe switching)
  nodenv: {
    "version": [],
    "versions": [],
    "local": ["*"],
    "global": ["*"],
    "shell": ["*"],
    "which": ["*"],
    "whence": ["*"],
    "install": ["*"],
    "rehash": [],
    "root": [],
    "shims": [],
    "help": ["*"],
  },

  // --- Gradle (Java/Kotlin) ---
  // Only the wrapper (./gradlew) is auto-allowed. Bare `gradle` commands
  // require manual approval — mutating commands should go through the wrapper.
  // The wrapper is a project-controlled script, so we trust it with any task.
  "./gradlew": ["*"],

  // --- Cargo (Rust) ---
  // Project-scoped dependency commands (`add`, `update`, `fetch`,
  // `generate-lockfile`) mirror the `npm install` / `uv add` policy.
  // Global/publishing commands — `install`, `uninstall`, `publish`, `login`,
  // `logout`, `owner`, `yank`, `remove` — stay out of auto-allow so Claude
  // must ask before touching a global binary or crates.io.
  cargo: {
    "build": ["*"],
    "test": ["*"],
    "check": ["*"],
    "clippy": ["*"],
    "fmt": ["*"],
    "doc": ["*"],
    "run": ["*"],
    "bench": ["*"],
    "tree": [],
    "metadata": [],
    "version": [],
    // Project-scoped dep management
    "add": ["*"],
    "update": ["", "*"],
    "fetch": ["", "*"],
    "generate-lockfile": [],
    "package": ["", "*"],
    "vendor": ["", "*"],
    // Read-only queries
    "--version": [],
    "--list": [],
    "help": ["", "*"],
    "search": ["*"],
    "info": ["*"],
    "pkgid": ["", "*"],
    "locate-project": ["", "*"],
    "verify-project": [],
    "read-manifest": [],
  },

  // --- Python ---
  python: {
    "-m pytest": ["*"],
    "-m pip install": ["*"],
    "-m pip install -r": ["*"],
    "-m venv": ["*"],
    "-c": ["*"],
  },
  pip: {
    "install": ["*"],
    "install -r": ["*"],
    "freeze": [],
    "list": [],
    "show": ["*"],
  },
  pytest: ["*"],

  // --- uv (Python) — project-scoped dep management + read-only queries ---
  // Part of the python toolchain (see `toolchains.python.permissionKeys`).
  // Excludes globals: `uv tool install/uninstall`, `uv python install`,
  // `uv remove`, `uv self update`, `uv run *` (arbitrary code), `uv publish`.
  uv: {
    "--version": [],
    "add": ["*"],
    "sync": ["", "*"],
    "lock": ["", "*"],
    "pip install": ["*"],
    "pip install -r": ["*"],
    "pip compile": ["*"],
    "pip freeze": [],
    "pip list": ["", "*"],
    "pip show": ["*"],
    "pip check": [],
    "pip tree": ["", "*"],
    "tree": ["", "*"],
    "venv": ["", "*"],
    "export": ["", "*"],
    "cache dir": [],
    "cache info": [],
    "python list": ["", "*"],
    "python find": ["", "*"],
    "python dir": [],
    "python pin": ["*"],
    "tool list": [],
    "tool dir": [],
    "help": ["", "*"],
  },

  // --- Homebrew (macOS) — read-only queries only ---
  // Platform-scoped when callers pass the `platformManagers` filter: `brew`
  // is then included only for `['mac']`. If `platformManagers` is omitted,
  // `flattenPermissions()` includes all platform-manager keys for backward
  // compatibility. Install/uninstall/upgrade/reinstall/cleanup/tap with arg
  // intentionally omitted — they mutate the global system and require
  // explicit approval.
  brew: {
    "--version": [],
    "--prefix": ["", "*"],
    "--cellar": ["", "*"],
    "--repository": [],
    "--cache": [],
    "config": [],
    "doctor": [],
    "list": ["", "*"],
    "ls": ["", "*"],
    "leaves": [],
    "info": ["*"],
    "desc": ["*"],
    "search": ["*"],
    "home": ["*"],
    "deps": ["*"],
    "deps --tree": ["*"],
    "uses": ["*"],
    "uses --installed": ["*"],
    "outdated": [],
    "options": ["*"],
    "tap-info": ["*"],
    "analytics": [],
    "analytics state": [],
    "commands": [],
    "help": ["", "*"],
    "log": ["*"],
    "cat": ["*"],
    "formulae": [],
    "casks": [],
  },

  // --- apt (Debian/Ubuntu) — read-only queries only ---
  // Platform-scoped when callers pass the `platformManagers` filter: `apt`,
  // `apt-cache`, and `dpkg` are then included only for `['linux']`. If
  // `platformManagers` is omitted, `flattenPermissions()` includes all
  // platform-manager keys for backward compatibility.
  // install/remove/upgrade/update/purge/autoremove intentionally omitted.
  apt: {
    "--version": [],
    "list": ["", "*"],
    "list --installed": [],
    "list --upgradable": [],
    "search": ["*"],
    "show": ["*"],
    "policy": ["", "*"],
    "depends": ["*"],
    "rdepends": ["*"],
    "help": ["", "*"],
  },

  // --- apt-cache (read-only cache queries; mutation not possible here) ---
  "apt-cache": {
    "search": ["*"],
    "show": ["*"],
    "showpkg": ["*"],
    "showsrc": ["*"],
    "depends": ["*"],
    "rdepends": ["*"],
    "pkgnames": ["", "*"],
    "policy": ["", "*"],
    "madison": ["*"],
    "stats": [],
    "unmet": [],
  },

  // --- dpkg (query-only subcommands; -i/-r/-P intentionally omitted) ---
  dpkg: {
    "--version": [],
    "-l": ["", "*"],
    "--list": ["", "*"],
    "-L": ["*"],
    "--listfiles": ["*"],
    "-s": ["*"],
    "--status": ["*"],
    "-S": ["*"],
    "--search": ["*"],
    "-p": ["*"],
    "--print-avail": ["*"],
    "-c": ["*"],
    "--contents": ["*"],
    "-I": ["*"],
    "--info": ["*"],
    "--get-selections": ["", "*"],
    "--print-architecture": [],
    "--compare-versions": ["*"],
    "--help": [],
  },

  // --- GitHub CLI ---
  // Entries with ["", "*"] generate both bare and wildcard permissions,
  // e.g. `gh pr list` AND `gh pr list *`.
  gh: {
    "--version": [],
    "pr create": ["", "*"],
    "pr status": [],
    "pr view": ["", "*"],
    "pr list": ["", "*"],
    "pr edit": ["", "*"],
    "pr checkout": ["*"],
    "pr diff": ["", "*"],
    "issue list": ["", "*"],
    "issue view": ["", "*"],
    "issue create": ["", "*"],
    "label list": [],
    "run list": [],
    "run view": ["", "*"],
    "api": ["repos/*"],
    "repo view": ["", "*"],
  },

  // --- Misc utilities ---
  echo: ["*"],
  printf: ["*"],
  date: [],
  which: ["*"],
  env: [],
  true: [],
  test: ["*"],
  tar: ["*", "-czf *", "-xzf *", "-xf *", "-tf *"],
  zip: ["*", "-r *"],
  unzip: ["*", "-l *"],
  tmux: {
    "-V": [],
    "-h": [],
  },
};

/**
 * Claude-only raw permission strings that don't fit the nested `command -> args`
 * shape of `permissions`. Appended verbatim to the Claude allow list by
 * `buildClaudeAllowList`. **Do not** route through `flattenPermissions()` —
 * Gemini's `buildGeminiAllowList` also consumes that flattener and would wrap
 * these in `run_shell_command(...)`, which Gemini neither understands nor
 * needs (Claude's `:*` argument-suffix syntax is meaningless to Gemini, and
 * the `.claude/...` paths are Claude assets).
 */
export const extraPermissions: string[] = [
  // Smithy pr-review skill scripts — belt-and-suspenders for the skill's own
  // `allowed-tools` frontmatter. We enumerate likely deployment paths because
  // Claude Code's `*` wildcard doesn't reliably span `/` boundaries.
  // Repo-level deploy invokes scripts via the relative path; user-level deploy
  // invokes them via an absolute home path that no single pattern can match
  // without env-var expansion.
  ".claude/skills/smithy.pr-review/scripts/find-pr.sh",
  ".claude/skills/smithy.pr-review/scripts/get-comments.sh:*",
  ".claude/skills/smithy.pr-review/scripts/reply-comment.sh:*",
  "*/smithy.pr-review/scripts/find-pr.sh",
  "*/smithy.pr-review/scripts/get-comments.sh:*",
  "*/smithy.pr-review/scripts/reply-comment.sh:*",
];

/**
 * Ask list — Claude Code prompts the user before running a matching command,
 * even in auto mode. Sits between `allow` (silent auto-approve) and `deny`
 * (hard block). Use for actions that are sometimes legitimate (e.g. force-push
 * with lease during a rebase) but always deserve a human in the loop.
 */
export const askPermissions: string[] = [
  // Force-push with lease — safe variant, but still wants explicit confirmation
  // because it overwrites the remote branch tip.
  "git push --force-with-lease",
  "git push --force-with-lease *",
];

/**
 * Deny list — blocks dangerous subcommands even when the parent is allowed.
 * In Claude Code, deny takes precedence over allow.
 */
export const denyPermissions: string[] = [
  // Git branch deletion
  "git branch -d *",
  "git branch -D *",
  "git branch --delete *",
  // Git destructive checkout
  "git checkout -- *",
  "git checkout .",
  // Git stash destruction
  "git stash drop *",
  "git stash clear",
  // Git tag deletion
  "git tag -d *",
  "git tag --delete *",
  // Git destructive reset
  "git reset --hard *",
  "git clean *",
  // Git symbolic-ref mutation (repointing and deletion)
  "git symbolic-ref -m *",
  "git symbolic-ref --message *",
  "git symbolic-ref --delete *",
  "git symbolic-ref -d *",
  // Force push WITHOUT lease — clobbers the remote unconditionally. The
  // `--force-with-lease` variant is in the ask list instead.
  "git push --force",
  "git push --force *",
  "git push -f",
  "git push -f *",
  // npm publish — requires explicit approval
  "npm publish",
  "npm publish *",
];

/**
 * Non-Bash tool permissions specific to Claude Code.
 * These are added alongside Bash(...) permissions in settings.json.
 */
export const claudeToolPermissions: string[] = [
  "WebSearch",
  "WebFetch",
  "Write(/tmp/**)",
  "Skill(smithy.*:*)",
];

/**
 * Collect all permission keys that belong to language toolchains.
 */
function toolchainPermissionKeys(): Set<string> {
  const keys = new Set<string>();
  for (const tc of Object.values(toolchains)) {
    for (const k of tc.permissionKeys) keys.add(k);
  }
  return keys;
}

/**
 * Collect all permission keys that belong to platform-scoped package managers.
 */
function platformPermissionKeys(): Set<string> {
  const keys = new Set<string>();
  for (const p of Object.values(platforms)) {
    for (const k of p.permissionKeys) keys.add(k);
  }
  return keys;
}

/**
 * Flatten the nested permissions structure into a list of command strings.
 * e.g., git.checkout ["*"] -> ["git checkout *"]
 *        cp ["*"] -> ["cp *"]
 *        npm."run build" [] -> ["npm run build"]
 *
 * Filtering: `languages` and `platformManagers` each gate their own key set.
 * When either is `undefined`, that category's keys are all included
 * (backward compatible). When provided (even as `[]`), only keys belonging
 * to the selected toolchains / platforms are kept; the rest are skipped.
 * Universal permissions (those not owned by any toolchain or platform)
 * are always included.
 */
export function flattenPermissions(
  languages?: LanguageToolchain[],
  platformManagers?: PlatformPackageManager[],
): string[] {
  const result: string[] = [];

  // Build the set of keys to skip based on toolchain + platform filters.
  const skipKeys = new Set<string>();
  if (languages !== undefined) {
    const allToolchainKeys = toolchainPermissionKeys();
    const selectedKeys = new Set<string>();
    for (const lang of languages) {
      for (const k of toolchains[lang].permissionKeys) selectedKeys.add(k);
    }
    for (const k of allToolchainKeys) if (!selectedKeys.has(k)) skipKeys.add(k);
  }
  if (platformManagers !== undefined) {
    const allPlatformKeys = platformPermissionKeys();
    const selectedKeys = new Set<string>();
    for (const p of platformManagers) {
      for (const k of platforms[p].permissionKeys) selectedKeys.add(k);
    }
    for (const k of allPlatformKeys) if (!selectedKeys.has(k)) skipKeys.add(k);
  }

  for (const [cmd, value] of Object.entries(permissions)) {
    if (skipKeys.has(cmd)) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        result.push(cmd);
      } else {
        for (const arg of value) {
          result.push(`${cmd} ${arg}`);
        }
      }
    } else {
      for (const [sub, args] of Object.entries(value)) {
        if (args.length === 0) {
          result.push(`${cmd} ${sub}`);
        } else {
          for (const arg of args) {
            if (arg === "") {
              result.push(`${cmd} ${sub}`);
            } else {
              result.push(`${cmd} ${sub} ${arg}`);
            }
          }
        }
      }
    }
  }

  return result;
}

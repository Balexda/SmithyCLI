/**
 * Shared permission data for every agent Smithy deploys to.
 *
 * **Grammar.** Every Bash rule in this file is written in the space-wildcard
 * form — `git add *`, never `git add:*` and never `git add*`. Claude Code
 * treats a trailing `:*` as equivalent to a trailing ` *`, but only at the end
 * of a pattern, and a glued `ls*` drops the word boundary so it also matches
 * `lsof`. One form, verified against the documented semantics, is what keeps
 * the settings-level list and the skills' `allowed-tools` frontmatter
 * readable against each other. The full rule set — coverage, wrapper
 * stripping, what `*` does and does not span — is written up in
 * [`docs/permission-grammar.md`](../docs/permission-grammar.md).
 */
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

/**
 * The git operations auto-allowed against an external artifact store, as
 * argument strings following `git -C <store>`.
 *
 * Deliberately read-and-commit only. `push`, `reset`, `clean`, and `checkout`
 * are absent: the store's history is the whole point of git-backing it, and
 * whether it syncs to a remote is the user's decision.
 *
 * Shared across agents on purpose. Claude and Codex express these very
 * differently — Claude takes wildcard command strings, while Codex needs
 * exact token prefixes built from the resolved store path (see
 * `buildStoreRules` in `./agents/codex.ts`) — and the one thing that must
 * not diverge between them is *which* operations an agent may run unattended.
 */
export const STORE_GIT_ARGS = [
  'add -A',
  'add *',
  'commit -m *',
  'commit --no-gpg-sign -m *',
  'status',
  'status -s',
  'log --oneline *',
  'diff *',
  'show *',
] as const;

/**
 * The `git -C <store>` permission strings for one store namespace, generated
 * for both the trailing-slash and bare spellings of `<base>/<store-name>`.
 * See the `-C` entry under `git` below for why both are needed.
 */
function storeGitPermissions(base: string): string[] {
  return [`${base}/*`, `${base}/*/`].flatMap((prefix) =>
    STORE_GIT_ARGS.map((arg) => `${prefix} ${arg}`),
  );
}

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
    // Branch wildcards cover every Smithy auto-naming convention plus the
    // orchestrator-supplied worktree branch shapes (e.g. `smithy/cut/...`,
    // `<NNN>/us-<NN>-<slug>/slice-<N>`, `<YYYY-MM-DD>-<NNN>-<slug>`).
    // Force-push is still blocked: `git push --force` / `-f` are in the deny
    // list. `--force-with-lease` is auto-allowed below so AI agents can finish
    // a rebase without a human in the loop — the lease check is the safety
    // boundary, not user confirmation. We deliberately do NOT use a trailing
    // `*` on the bare form, because `Bash(git push --force-with-lease *)`
    // would also match `git push --force-with-lease --force origin <branch>`
    // — and `--force` overrides the lease check in Git, silently restoring
    // unconditional force-push. Only the explicit `origin <ref>` form gets
    // the wildcard, and the `--force` / `-f` follow-up combinations are
    // explicitly denied below.
    "push -u origin": ["*"],
    "push origin": ["*"],
    "push --force-with-lease": [""],
    "push --force-with-lease origin": ["*"],

    // External artifact stores (`artifactsLocation: external`) are git repos
    // under `~/.smithy/`, and agents commit to them there via `git -C <store>`.
    // That form needs its own entries: permission matching is prefix-based on
    // the whole command string, so `git -C ~/x commit -m "y"` does not match
    // the bare `git commit -m *` above.
    //
    // Scoped to the two store namespaces rather than granting `git -C *`, and
    // written in tilde form on purpose — these strings land in a committed
    // `.claude/settings.json`, so an expanded `/home/<user>/...` path would
    // leak one developer's home directory to the whole team. The prompts tell
    // agents the tilde path is authoritative, so that is the form they emit.
    //
    // Read and commit only: no `push`, no `reset`, no `clean`. Syncing a
    // store to a remote is the user's call, not an agent's.
    //
    // Both a trailing-slash and a bare form of each store path are listed.
    // `{{artifactsRoot}}` always ends in `/` (so `{{artifactsRoot}}specs/...`
    // concatenates), which means agents emit
    // `git -C ~/.smithy/repos/<key>/ add -A` — matching that against
    // `~/.smithy/repos/* add -A` would require `*` to swallow the trailing
    // separator, which permission wildcards do not reliably do. The `*/`
    // form matches it without spanning a `/` at all; the bare form is kept
    // for hand-typed commands that omit the slash.
    //
    // `commit --no-gpg-sign -m *` mirrors what the prompt tells agents to
    // run (and what `ensureArtifactStore` runs itself) so a machine with
    // `commit.gpgsign` set doesn't hit an approval prompt on the flag form.
    "-C": [
      ...storeGitPermissions("~/.smithy/repos"),
      ...storeGitPermissions("~/.smithy/projects"),
    ],
  },

  // --- Filesystem (read + create, no delete) ---
  // Flag variants are needed because Gemini CLI does not match flags with `*`.
  // They are redundant under Claude's grammar, where `ls *` already covers
  // `ls -la src`; `buildClaudeAllowList` prunes the covered variants back out
  // rather than shipping seven spellings of one grant to Claude Code.
  //
  // Removing a flag variant is therefore also how a grant gets *narrowed* for
  // Gemini: `sed *` covers `sed -i` for Claude (which is why the in-place
  // forms are denied below) but not for Gemini, so dropping `sed -i *` from
  // this table is what takes the in-place edit away there.
  //
  // `mv` and `tee` are deliberately absent. Both write over existing files,
  // no shipped template invokes either, and a shell write bypasses the path
  // protections the agent's own Edit/Write tools apply. Renames of tracked
  // files go through `git mv` (above), where they stay recoverable.
  ls: ["*", "-l *", "-la *", "-al *", "-a *", "-lh *", "-R *"],
  cat: ["*", "-n *"],
  head: ["*", "-n *"],
  tail: ["*", "-n *", "-f *"],
  mkdir: ["*", "-p *"],
  cp: ["*", "-r *", "-R *", "-rp *"],
  touch: ["*"],
  // Unscoped on purpose: `find` is the directory-walking primitive the
  // planning commands lean on, and its two destructive forms stay out of
  // reach anyway. Claude Code refuses to auto-approve `find` with `-exec` or
  // `-delete` from a prefix rule at all (and the deny list says so
  // explicitly); Gemini gets there from the other side, since no `-exec` or
  // `-delete` variant is listed here for a matcher that does not treat `*` as
  // covering flags.
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
  realpath: ["*"],
  readlink: ["*", "-f *"],

  // --- Text processing ---
  grep: ["*", "-r *", "-rn *", "-n *", "-i *", "-ri *", "-rni *", "-l *", "-rl *", "-c *"],
  rg: ["*"],
  // `-i` is absent: an in-place `sed` edits files without going through the
  // agent's Edit tool. See the deny list for the Claude-side half of that.
  sed: ["*", "-n *"],
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

  // --- Smithy CLI ---
  // `smithy status` only. It is the read path — the deterministic source of
  // truth the `smithy.status` skill wraps — and the skill auto-activates on
  // plain questions like "what's next?", so a permission prompt on every one
  // of them defeats the point of shipping it as a skill. The skill's own
  // `allowed-tools` grant covers the turn it is invoked in; this entry is the
  // session-level belt-and-suspenders for hosts that do not apply frontmatter
  // grants, mirroring what `extraPermissions` does for the script skills.
  //
  // `init`, `update`, and `uninit` are deliberately absent: they write into
  // the target repo and are operator-driven, not agent-driven. `status *`
  // also covers the bare `smithy status`, since a trailing ` *` matches at a
  // word boundary *or* end-of-string — the bare spelling is listed anyway for
  // Gemini, whose matcher has no such rule.
  smithy: {
    "status": ["", "*"],
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
  // Smithy script-backed skills — belt-and-suspenders for each skill's own
  // `allowed-tools` frontmatter. The frontmatter grants are written against
  // `${CLAUDE_SKILL_DIR}`, which Claude Code expands to the skill's installed
  // directory in both the rule and the body that names the script; these
  // entries cover the hosts that don't apply a frontmatter grant at all, and
  // the turns where a script runs without the skill having been invoked.
  //
  // Two spellings per script. Repo-level deploy invokes scripts via the
  // relative `.claude/skills/...` path; user-level deploy invokes them via an
  // absolute home path, which the leading-`*` form matches. A single `*` does
  // span `/`, so one pattern would do, but the anchored form keeps the
  // narrower rule available to anyone reading the settings file.
  //
  // Issue #261 added the GitHub MCP tools as the preferred path for these
  // skills; the script entries are the fallback (kept because the GitHub MCP
  // server isn't always configured — claude.ai web, vanilla Claude Code
  // installs, etc.). Each skill chooses MCP-vs-script per operation at
  // runtime.
  ".claude/skills/smithy.pr-review/scripts/find-pr.sh",
  ".claude/skills/smithy.pr-review/scripts/get-comments.sh *",
  ".claude/skills/smithy.pr-review/scripts/reply-comment.sh *",
  ".claude/skills/smithy.pr-review/scripts/add-comment.sh *",
  "*/smithy.pr-review/scripts/find-pr.sh",
  "*/smithy.pr-review/scripts/get-comments.sh *",
  "*/smithy.pr-review/scripts/reply-comment.sh *",
  "*/smithy.pr-review/scripts/add-comment.sh *",
  // The gh-issue scripts are the issue-creation path for `smithy.orders` and
  // `smithy.engrave`. Without these, every non-MCP host prompts once per
  // issue — which, on an orders run over a feature map, is once per feature.
  ".claude/skills/smithy.gh-issue/scripts/check-env.sh",
  ".claude/skills/smithy.gh-issue/scripts/search-issues.sh *",
  ".claude/skills/smithy.gh-issue/scripts/create-issue.sh *",
  ".claude/skills/smithy.gh-issue/scripts/link-blocked-by.sh *",
  "*/smithy.gh-issue/scripts/check-env.sh",
  "*/smithy.gh-issue/scripts/search-issues.sh *",
  "*/smithy.gh-issue/scripts/create-issue.sh *",
  "*/smithy.gh-issue/scripts/link-blocked-by.sh *",
];

/**
 * Ask list — Claude Code prompts the user before running a matching command,
 * even in auto mode. Sits between `allow` (silent auto-approve) and `deny`
 * (hard block). Use for actions that are sometimes legitimate but always
 * deserve a human in the loop. Currently empty: `--force-with-lease` was
 * promoted to the allow list in #302 because the lease check itself is the
 * safety boundary and gating it on user confirmation made AI-driven rebases
 * painful.
 */
export const askPermissions: string[] = [];

/**
 * Deny list — blocks dangerous subcommands even when the parent is allowed.
 * In Claude Code, deny takes precedence over allow.
 */
/**
 * `find` primaries that run a command or write a file. Everything else `find`
 * does is a query.
 *
 * Enumerated rather than pattern-matched because a permission rule matches
 * text, not option grammar. `-execdir`, `-ok`, and `-okdir` run a command
 * exactly as `-exec` does; the `-fprint` family writes caller-controlled text
 * to a caller-named path, which is a file write by another name.
 */
const FIND_DESTRUCTIVE_PRIMARIES = [
  '-delete',
  '-exec',
  '-execdir',
  '-ok',
  '-okdir',
  '-fprint',
  '-fprint0',
  '-fprintf',
  '-fls',
] as const;

/**
 * Deny rules for {@link FIND_DESTRUCTIVE_PRIMARIES}, in both positions the
 * primary can occupy.
 *
 * GNU `find` defaults its path argument to the current directory, so
 * `find -delete` and `find -exec rm {} \;` are valid with no path at all —
 * and a rule shaped `find * -delete` needs a token before the primary, so it
 * misses exactly those forms while the allow list's `find *` covers them.
 * Hence the pathless pair as well as the trailing one.
 */
function findDenyRules(): string[] {
  return FIND_DESTRUCTIVE_PRIMARIES.flatMap((primary) => [
    `find ${primary}`,
    `find ${primary} *`,
    `find * ${primary}`,
    `find * ${primary} *`,
  ]);
}

/**
 * Deny rules for `sed`'s in-place flags, in both positions.
 *
 * `sed` accepts its options in any order, so the in-place flag is not always
 * the first token: `sed -E -i 's/x/y/' f` and `sed -e 's/x/y/' --in-place f`
 * are both ordinary invocations. The glued `*` catches the suffix spelling
 * (`sed -i.bak`) alongside bare `-i` and `-i ''`.
 *
 * Known gap: GNU `sed` also bundles short options, and no glob can pick `-i`
 * out of `sed -ni'.bak'` without also matching the letter `i` inside a script
 * argument. These rules are defense in depth for Claude; the control that
 * does not depend on spelling is that no shipped template runs `sed -i` and
 * that the flag is gone from the allow table — which is what removes it for
 * Gemini, whose matcher does not reach flags through `*` at all.
 */
function sedDenyRules(): string[] {
  return ['-i', '--in-place'].flatMap((flag) => [`sed ${flag}*`, `sed * ${flag}*`]);
}

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
  // `--force-with-lease` variant is auto-allowed (see permissions.git above).
  "git push --force",
  "git push --force *",
  "git push -f",
  "git push -f *",
  // Defense in depth: combining `--force-with-lease` with `--force` / `-f`
  // overrides the lease check in Git, so the result is an unconditional
  // force-push. Block these explicitly so the wildcard in
  // `push --force-with-lease origin *` cannot be used to smuggle a `--force`
  // flag past the deny list.
  "git push --force-with-lease --force",
  "git push --force-with-lease --force *",
  "git push --force-with-lease -f",
  "git push --force-with-lease -f *",
  "git push --force-with-lease origin --force",
  "git push --force-with-lease origin --force *",
  "git push --force-with-lease origin -f",
  "git push --force-with-lease origin -f *",
  // npm publish — requires explicit approval
  "npm publish",
  "npm publish *",
  // In-place `sed` — a file write that never passes the agent's Edit tool,
  // which the allow list's `sed *` would otherwise cover.
  ...sedDenyRules(),
  // `find` forms that run a command or write a file. Claude Code's own
  // carve-out refuses to prefix-approve `-exec` and `-delete`, but it is
  // documented for those two only, so `-execdir` / `-ok` / `-okdir` and the
  // `-fprint` family need saying out loud. Gemini reaches none of them
  // through either list: this one is Claude-only, and `permissions.find`
  // lists no primary for a matcher that does not treat `*` as covering flags.
  ...findDenyRules(),
];

/**
 * Non-Bash tool permissions specific to Claude Code.
 * These are added alongside Bash(...) permissions in settings.json.
 *
 * The GitHub MCP entries below are scoped to the exact tools the shipped
 * smithy templates concretely reference: `create_pull_request` (the PR-
 * creation step in forge / strike / cut / mark / ignite / render),
 * `list_pull_requests` (cut/mark "is there an existing PR for this branch"
 * check + the smithy.pr-review skill's Find Open PR operation),
 * `pull_request_read` (smithy.pr-review's List PR Comments operation),
 * `add_reply_to_pull_request_comment` (smithy.pr-review's Reply to an
 * Inline Comment operation), and `issue_write` (the example tool the
 * `guidance-shell` snippet calls out for issue creation, also used by
 * smithy.pr-review's Reply to Conversation Comment operation).
 *
 * Anything broader — destructive operations like `merge_pull_request` /
 * `delete_file` / `fork_repository` / `create_repository` /
 * `run_secret_scanning`, mutation tools like `update_pull_request*` and
 * `pull_request_review_write`, or scope-expanding read tools like
 * `search_code` / `search_repositories` / `list_branches` /
 * `list_commits` — is deliberately omitted. Adding more should follow a
 * concrete template change that needs the tool, not be auto-allowed
 * speculatively.
 */
export const claudeToolPermissions: string[] = [
  "WebSearch",
  "WebFetch",
  "Write(/tmp/**)",
  // Claude Code's Skill permission grammar has two documented forms:
  // `Skill(name)` for an exact match and `Skill(name *)` for the name plus any
  // arguments. Neither admits a wildcard inside the name, so the
  // `Skill(smithy.*:*)` catch-all that used to close this list named no skill
  // and granted nothing — it is gone, and every Smithy skill and command is
  // spelled out instead. `src/agents/claude.test.ts` holds the list to the
  // set the templates actually deploy, in both directions.
  "Skill(smithy.audit *)",
  "Skill(smithy.cut *)",
  "Skill(smithy.engrave *)",
  "Skill(smithy.fix *)",
  "Skill(smithy.forge *)",
  "Skill(smithy.gh-issue *)",
  "Skill(smithy.helper-docker *)",
  "Skill(smithy.helper-documentation *)",
  "Skill(smithy.helper-flow-definition *)",
  "Skill(smithy.helper-screen-design *)",
  "Skill(smithy.helper-voice *)",
  "Skill(smithy.ignite *)",
  "Skill(smithy.mark *)",
  "Skill(smithy.orders *)",
  "Skill(smithy.persona *)",
  "Skill(smithy.pr-review *)",
  "Skill(smithy.render *)",
  "Skill(smithy.resolve *)",
  "Skill(smithy.spark *)",
  "Skill(smithy.status *)",
  "Skill(smithy.strike *)",
  // GitHub MCP — exactly the tools the smithy templates invoke.
  "mcp__github__create_pull_request",
  "mcp__github__list_pull_requests",
  "mcp__github__pull_request_read",
  "mcp__github__add_reply_to_pull_request_comment",
  "mcp__github__issue_write",
  "mcp__github__search_issues",
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

export type PermissionEntry = string[] | Record<string, string[]>;

export const permissions: Record<string, PermissionEntry> = {
  // --- Git ---
  // Flag variants are listed explicitly because Gemini CLI's wildcard
  // matching does not treat `*` as covering flag arguments (e.g. `-b`).
  git: {
    "status": [],
    "status -s": [],
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

  // --- Gradle (Java/Kotlin) ---
  gradle: {
    "build": [],
    "test": [],
    "check": [],
    "assemble": [],
    "clean": [],
    "dependencies": [],
    "tasks": [],
    "properties": [],
  },
  "./gradlew": {
    "build": [],
    "test": [],
    "check": [],
    "assemble": [],
    "clean": [],
    "dependencies": [],
    "tasks": [],
    "properties": [],
  },

  // --- Cargo (Rust) ---
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
  },

  // --- GitHub CLI ---
  // Entries with ["", "*"] generate both bare and wildcard permissions,
  // e.g. `gh pr list` AND `gh pr list *`.
  gh: {
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
};

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
];

/**
 * Non-Bash tool permissions specific to Claude Code.
 * These are added alongside Bash(...) permissions in settings.json.
 */
export const claudeToolPermissions: string[] = [
  "WebSearch",
  "WebFetch",
  "Write(//tmp/**)",
  "Skill(smithy.*:*)",
];

/**
 * Flatten the nested permissions structure into a list of command strings.
 * e.g., git.checkout ["*"] -> ["git checkout *"]
 *        cp ["*"] -> ["cp *"]
 *        npm."run build" [] -> ["npm run build"]
 */
export function flattenPermissions(): string[] {
  const result: string[] = [];

  for (const [cmd, value] of Object.entries(permissions)) {
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

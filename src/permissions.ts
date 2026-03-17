export type PermissionEntry = string[] | Record<string, string[]>;

export const permissions: Record<string, PermissionEntry> = {
  // --- Git ---
  git: {
    "status": [],
    "fetch": ["*"],
    "pull": ["*"],
    "checkout": ["*"],
    "branch": ["*"],
    "add": ["*"],
    "commit": ["*"],
    "log": ["*"],
    "diff": ["*"],
    "stash": ["*"],
    "merge": ["*"],
    "rebase": ["*"],
    "tag": ["*"],
    "remote -v": [],
    "remote show": ["*"],
    "rev-parse": ["*"],
    "show": ["*"],
    "blame": ["*"],
    "cherry-pick": ["*"],
    // Read-only lookups only — no wildcard to prevent the mutating
    // form `git symbolic-ref <name> <ref>` from repointing refs.
    "symbolic-ref HEAD": [],
    "symbolic-ref refs/remotes/origin/HEAD": [],
    "push": [],
    "push -u origin": ["feature/*", "fix/*", "chore/*", "strike/*"],
    "push origin": ["feature/*", "fix/*", "chore/*", "strike/*"],
  },

  // --- Filesystem (read + create, no delete) ---
  ls: ["*"],
  cat: ["*"],
  head: ["*"],
  tail: ["*"],
  mkdir: ["*"],
  cp: ["*"],
  mv: ["*"],
  touch: ["*"],
  find: ["*"],
  wc: ["*"],
  sort: ["*"],
  uniq: ["*"],
  diff: ["*"],
  tree: ["*"],
  stat: ["*"],
  file: ["*"],
  pwd: [],
  dirname: ["*"],
  basename: ["*"],
  tee: ["*"],
  realpath: ["*"],
  readlink: ["*"],

  // --- Text processing ---
  grep: ["*"],
  rg: ["*"],
  sed: ["*"],
  awk: ["*"],
  jq: ["*"],
  cut: ["*"],
  tr: ["*"],

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
  tar: ["*"],
  zip: ["*"],
  unzip: ["*"],
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
  // Git force push & destructive reset
  "git push --force *",
  "git push -f *",
  "git push --force-with-lease *",
  "git reset --hard *",
  "git clean *",
  // Git symbolic-ref mutation (repointing and deletion)
  "git symbolic-ref -m *",
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

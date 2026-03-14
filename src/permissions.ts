export type PermissionEntry = string[] | Record<string, string[]>;

export const permissions: Record<string, PermissionEntry> = {
  git: {
    "status": [],
    "fetch origin": [],
    "pull origin master": [],
    "checkout": ["*"],
    "branch": ["*"],
    "push origin": ["feature/*", "fix/*", "chore/*"],
  },
  cp: ["*"],
  npm: {
    "run build": [],
    "install": [],
    "test": [],
  },
  gh: {
    "pr create": ["*"],
    "pr status": [],
    "pr view": ["*"],
    "issue list": [],
    "issue view": ["*"],
    "label list": [],
    "run list": [],
    "run view": ["*"],
    "api": ["repos/*"],
  },
};

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
            result.push(`${cmd} ${sub} ${arg}`);
          }
        }
      }
    }
  }

  return result;
}

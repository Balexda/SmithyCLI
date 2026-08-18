import { filterFrontmatterKeys, splitFrontmatter } from './frontmatter.js';

/**
 * Per-target translation of an operational skill's frontmatter.
 *
 * A skill's `name` and `description` mean the same thing to all three agents,
 * so the source block is shared. Its tool grant is not: `allowed-tools` is a
 * Claude Code field, written in Claude Code's permission grammar, and the
 * values it carries — `Bash(...)` rules, `mcp__github__*` tool names,
 * `${CLAUDE_SKILL_DIR}` — mean nothing to Gemini (whose allowlist is built
 * from `run_shell_command(...)` entries in `.gemini/settings.json`) or to
 * Codex (whose rules live in `.codex/rules/default.rules`).
 *
 * Shipping one block verbatim to all three therefore left dead text in two of
 * the three deployments: Claude's copy of `smithy.pr-review` advertised four
 * Codex GitHub-app actions it cannot call, and Codex's copy advertised MCP
 * tool names and a Claude-only path variable. The templates now declare the
 * Codex grant under its own key and the deployers pick one:
 *
 * | Target | `allowed-tools` | `codex-allowed-tools` |
 * |--------|-----------------|-----------------------|
 * | Claude | kept            | dropped               |
 * | Codex  | replaced by the `codex-allowed-tools` value, or dropped when the template declares none | consumed |
 * | Gemini | dropped         | dropped               |
 */

/** The Claude Code tool-grant key. */
const CLAUDE_KEY = 'allowed-tools';
/** The Codex-only tool-grant key, promoted to {@link CLAUDE_KEY} on that path. */
const CODEX_KEY = 'codex-allowed-tools';

export type SkillTarget = 'claude' | 'gemini' | 'codex';

/** Read one top-level scalar key's value out of a frontmatter block. */
function readKey(frontmatter: string, key: string): string | undefined {
  for (const line of frontmatter.split('\n')) {
    if (!line.startsWith(`${key}:`)) continue;
    return line.slice(key.length + 1).trim();
  }
  return undefined;
}

/**
 * Rewrite a composed skill's frontmatter for one deployment target.
 *
 * Content without a frontmatter block is returned unchanged, as is content
 * that declares neither grant key.
 */
export function translateSkillFrontmatter(content: string, target: SkillTarget): string {
  const { frontmatter } = splitFrontmatter(content);
  if (!frontmatter) return content;

  if (target === 'claude') {
    return dropKeys(content, [CODEX_KEY]);
  }
  if (target === 'gemini') {
    return dropKeys(content, [CLAUDE_KEY, CODEX_KEY]);
  }

  const codexGrant = readKey(frontmatter, CODEX_KEY);
  const withoutGrants = dropKeys(content, [CLAUDE_KEY, CODEX_KEY]);
  if (codexGrant === undefined) return withoutGrants;

  const { frontmatter: kept, body } = splitFrontmatter(withoutGrants);
  const inner = kept.replace(/^---\s*\n/, '').replace(/\n---\s*\n$/, '');
  return `---\n${inner}\n${CLAUDE_KEY}: ${codexGrant}\n---\n${body}`;
}

/** Frontmatter minus the named keys, order and formatting otherwise intact. */
function dropKeys(content: string, keys: readonly string[]): string {
  const { frontmatter } = splitFrontmatter(content);
  const present = new Set<string>();
  for (const line of frontmatter.split('\n')) {
    const key = line.match(/^([A-Za-z0-9_.-]+)\s*:/)?.[1];
    if (key !== undefined) present.add(key);
  }
  for (const key of keys) present.delete(key);
  return filterFrontmatterKeys(content, present);
}

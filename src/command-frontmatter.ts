import { filterFrontmatterKeys } from './frontmatter.js';

/**
 * Translation of a command template's frontmatter for the Claude target.
 *
 * Claude Code unified slash commands with skills: a `.claude/commands/*.md`
 * file is advertised to the model through the same registry skills use, and
 * its frontmatter is what drives that registry entry. Deploying these files
 * with the frontmatter stripped (Smithy's behavior through v0.x) cost the
 * `description` every command template already carries — the model saw only
 * the filename and the recycled H1 — and forfeited the whole control surface
 * built on top of it.
 *
 * Gemini and Codex consume the source block verbatim as skill metadata, so
 * the block cannot simply be rewritten to Claude's vocabulary at the source.
 * The deployer translates instead.
 */

/**
 * Frontmatter keys Claude Code reads on a command file. Everything else in the
 * source block is dropped on the Claude path.
 *
 * The notable drop is `name`. Gemini and Codex derive the deployed skill
 * directory from it (`parseFrontmatterName`), but a Claude command is named by
 * its filename — `smithy.audit.md` is `/smithy.audit` — and the source `name`
 * carries the dashed Codex spelling (`smithy-audit`), so emitting it would
 * advertise a command that does not exist.
 *
 * | Key | Effect |
 * |-----|--------|
 * | `description` | Registry/menu text. The reason this translation exists. |
 * | `argument-hint` | Completion hint shown after the command name. |
 * | `allowed-tools` | Per-command tool grant, narrower than settings.json. |
 * | `disable-model-invocation` | Removes the command from the model registry; it stays user-invocable. |
 * | `model` | Pins the command to a model. |
 * | `context` | `fork` runs the command in a separate context window. |
 * | `agent` | Sub-agent to run a forked command in. |
 * | `hooks` | Command-scoped hooks. |
 */
export const CLAUDE_COMMAND_FRONTMATTER_KEYS = [
  'description',
  'argument-hint',
  'allowed-tools',
  'disable-model-invocation',
  'model',
  'context',
  'agent',
  'hooks',
] as const;

const CLAUDE_COMMAND_KEY_SET: ReadonlySet<string> = new Set(CLAUDE_COMMAND_FRONTMATTER_KEYS);

/**
 * Produce the Claude-deployed content for a command template: the source
 * frontmatter reduced to {@link CLAUDE_COMMAND_FRONTMATTER_KEYS}, with the
 * body untouched.
 *
 * A template whose frontmatter holds none of those keys deploys as a bare
 * body, which is what the previous unconditional strip produced.
 */
export function toClaudeCommandContent(content: string): string {
  return filterFrontmatterKeys(content, CLAUDE_COMMAND_KEY_SET);
}

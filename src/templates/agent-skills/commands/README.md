# Commands

Slash commands invocable by users (e.g., `/smithy.strike "add verbose flag"`).

Deployed to:
- **Claude**: `.claude/commands/smithy.<name>.md` (frontmatter *translated* — see
  [Frontmatter](#frontmatter) below)
- **Gemini**: `.gemini/skills/smithy.<name>/SKILL.md` (frontmatter kept verbatim)
- **Codex**: `.agents/skills/smithy-<name>/SKILL.md` (frontmatter kept verbatim)

## Current Commands

| Command | Purpose | Sub-Agents Used |
|---------|---------|-----------------|
| `smithy.strike` | Lightweight one-shot planning — explore, write `.strike.md`, create PR | clarify, plan, reconcile |
| `smithy.ignite` | Workshop an idea into an RFC with milestones | clarify, refine, plan, reconcile |
| `smithy.render` | Break an RFC milestone into a feature map | clarify, refine, **scout** |
| `smithy.mark` | Transform a feature into a spec with user stories | clarify, refine, **scout** |
| `smithy.cut` | Decompose a user story into PR-sized task slices | clarify, refine, **scout** |
| `smithy.forge` | Implement a slice end-to-end (TDD + review + PR) | implement, review, **maid** in Claude/Gemini agent mode; direct TDD/review in Codex |
| `smithy.fix` | Minimal-diff bug fix from a GitHub issue | (none) |
| `smithy.audit` | Audit a Smithy artifact against its checklist | (none) |
| `smithy.orders` | Show available Smithy commands and their usage | (none) |
| `smithy.engrave` | Author / update a durable-knowledge record (decision, invariant, principle) at the `user`, `repo`, or `project` level — the prompt itself carries the full schema | (none) |
| `smithy.resolve` | Interactively resolve one specification-debt item in a planning artifact — select the item, walk up to the parent for inherited context, ask the operator, record the answer | (none) |

`smithy.status` is deployed as a skill (see `../skills/smithy.status/`), not a
slash command, so it can auto-activate on natural-language status questions.
It is still invocable explicitly via `/smithy.status …`.

## Frontmatter

One source block serves all three targets. Gemini and Codex consume it
verbatim as skill metadata; the Claude deployer **translates** it, keeping only
the keys Claude Code reads on a command file and dropping everything else. The
translation lives in [`src/command-frontmatter.ts`](../../../command-frontmatter.ts).

Claude Code advertises `.claude/commands/*.md` through the same registry skills
use and drives that registry entry from this block, so the block is not
decoration — it is the command's only trigger signal.

### Required on every command

| Key | Purpose |
|-----|---------|
| `name` | Skill-directory name for Gemini and Codex (dashed form: `smithy-cut`). **Dropped on the Claude path** — a Claude command is named by its filename, and emitting the dashed form would advertise a `/smithy-cut` that does not exist. |
| `description` | What the command does and when to reach for it. Reaches all three targets. Never a restatement of the H1 — that is the failure this contract exists to prevent. |
| `argument-hint` | The command's argument shape, in the `<required> [optional]` convention (e.g. `<tasks-file\|strike-file> [<slice-number>]`). Shown after the command name in Claude Code's completion. |
| `disable-model-invocation: true` | Every Smithy command is an explicit pipeline step the operator drives. The opt-out keeps all 13 out of the model's registry — recovering that context — while leaving them fully user-invocable. |

### Optional, Claude-only

`allowed-tools`, `model`, `context` (`fork`), `agent`, `background`, and
`hooks` are passed through to Claude when present and ignored by the other two
targets. No command sets `allowed-tools` yet: per-command tool grants are the
structural replacement for the global `settings.json` allowlist, and that
migration is owned by the permissions work rather than this plumbing.

`background` only means anything alongside `context: fork`, and there it is
not optional: Claude Code runs a forked command detached unless the block says
`background: false`, and a detached run commits, pushes, and writes outside the
session's checkpoints while the rest of the session shares the worktree. No
command sets `context: fork` yet — the evaluation behind that
(`docs/research/2026-08-16-context-fork-evaluation.md`) gates adoption on an
intake-gate rewrite, because a forked command has no user to ask when its
input is under-specified.

Any other key is dropped on the Claude path rather than rejected — a source
block is the union of what all three targets need, so a key one target does not
understand is expected.

`src/templates.test.ts` asserts the four required keys on every command
template, that they survive the Claude translation, and that any command
declaring `context: fork` also declares `background: false`.

## Conventions

- Use `$ARGUMENTS` for user input; include a fallback for agents that don't substitute it.
- Use `{{>partial-name}}` to include shared snippets (resolved by Dotprompt at deploy time).
- Use `{{#ifAgent}}...{{else}}...{{/ifAgent}}` for orchestrator vs standalone conditional blocks; named branches such as `{{#ifAgent 'codex'}}` handle agent-specific paths.

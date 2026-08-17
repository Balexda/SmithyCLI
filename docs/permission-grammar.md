# Permission Grammar

Smithy writes permission rules into three places, and until now each had
drifted into its own dialect:

- `.claude/settings.json` — generated from [`src/permissions.ts`](../src/permissions.ts).
- `.gemini/settings.json` — the same table, wrapped in `run_shell_command(...)`.
- `.codex/rules/default.rules` — token-prefix rules built in [`src/agents/codex.ts`](../src/agents/codex.ts).
- The `allowed-tools` frontmatter of the script-backed skills
  (`smithy.pr-review`, `smithy.gh-issue`, `smithy.status`).

This page is the one verified answer for the Claude Code surfaces, so a rule
never has to be guessed at again. It is written against the [Claude Code
permission reference](https://code.claude.com/docs/en/permissions) and the
[skills reference](https://code.claude.com/docs/en/skills); every claim below
is documented behavior, not inference from a rule that happened to work.

## The one Bash form: `command *`

A Bash rule is `Bash(<pattern>)`. Smithy writes exactly one wildcard spelling:
**a space, then `*`**.

| Form | Status | Behavior |
|------|--------|----------|
| `Bash(git add *)` | **what Smithy writes** | Matches `git add`, `git add -A`, `git add src/x.ts`. The space enforces a word boundary: the prefix must be followed by a space or the end of the command. |
| `Bash(git add:*)` | valid, not used | Exactly equivalent to the space form — but only as a *trailing* suffix. In `Bash(git:* push)` the colon is a literal and matches nothing. Two spellings of one grant is a reading tax; the space form is also what Claude Code's own "Yes, don't ask again" writes. |
| `Bash(git add*)` | valid, avoid | No word boundary. `Bash(ls*)` matches `lsof` as well as `ls -la`. This is what `smithy.status` used to grant (`Bash(smithy status*)`). |

Three more documented properties the rules in `src/permissions.ts` depend on:

- **A `*` spans anything, including `/` and spaces.** One wildcard can cover
  several arguments, so `Bash(git *)` matches `git log --oneline --all`.
- **Wildcards work at any position**, not just the end: `Bash(* --version)`
  and `Bash(*/smithy.gh-issue/scripts/check-env.sh)` are both real rules.
- **Compound commands are matched per subcommand.** A rule matching
  `safe-cmd` does not approve `safe-cmd && rm -rf /`; each side of `&&`,
  `||`, `;`, `|`, `&`, and a newline must match on its own.

### Coverage, and why the tables look redundant

Because `P *` matches everything starting with `P ` *and* bare `P`, a rule is
dead weight when another rule already covers it — `ls -la *` under `ls *`,
`git add -A` under `git add *`.

The shared tables in `src/permissions.ts` keep those variants anyway, because
Gemini's matcher does not treat `*` as covering a flag argument, so there the
explicit spelling is the grant. `buildClaudeAllowList` prunes them back out
for Claude (`pruneCoveredBashRules` in
[`src/agents/claude.ts`](../src/agents/claude.ts)), which is why the generated
`.claude/settings.json` is much shorter than the table that produced it.

The same asymmetry is how a grant gets narrowed: dropping `sed -i *` from the
table removes the in-place edit for Gemini, and the deny rule `Bash(sed -i*)`
removes it for Claude.

## Skill tool rules

`Skill(name)` matches that skill exactly; `Skill(name *)` matches it with any
arguments. **There is no wildcard inside the name.** An allow rule with a glob
in the tool-name position is skipped with a startup warning, and the specifier
is matched against a skill name rather than a glob — which is why the former
`Skill(smithy.*:*)` catch-all granted nothing at all. Every Smithy skill and
command is listed individually in `claudeToolPermissions`, and
`src/permissions.test.ts` holds that list to the set the templates deploy.

MCP tool names are the one place an allow rule may glob, and only after a
literal `mcp__<server>__` prefix. Smithy names the GitHub MCP tools its
templates call, one per line, rather than granting `mcp__github__*`.

## `allowed-tools` frontmatter, and why settings-level fallbacks exist

A skill's `allowed-tools` grants its listed tools **for the turn that invokes
the skill only** — the grant clears with the next user message. It is a Claude
Code field: Gemini's allowlist lives in `.gemini/settings.json` and Codex's in
`.codex/rules/default.rules`, so neither reads it (see
[`src/skill-frontmatter.ts`](../src/skill-frontmatter.ts) for the per-target
translation, including the `codex-allowed-tools` key that carries Codex's
GitHub-app actions).

Inside `allowed-tools`, Claude Code substitutes `${CLAUDE_SKILL_DIR}` in Bash
rules *and* in the skill body. Smithy uses that in both places at once, so the
rule matches the exact command the body tells the agent to run:

```yaml
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/check-env.sh)
```

```markdown
Run `${CLAUDE_SKILL_DIR}/scripts/check-env.sh`.
```

Settings-level rules get no such substitution, so the `extraPermissions`
fallbacks in `src/permissions.ts` spell the same scripts out as paths — a
repo-relative `.claude/skills/...` form and a leading-wildcard form that
covers a user-level install under `~/.claude/`. Those exist because the
frontmatter grant covers one turn on one host family:

| Situation | What covers it |
|-----------|----------------|
| The skill was invoked this turn, on Claude Code | `allowed-tools` |
| A script runs on a later turn, or without the skill being invoked | `extraPermissions` |
| A host that does not apply frontmatter grants | `extraPermissions` |
| `smithy status` from an auto-activated status question | `permissions.smithy` plus `allowed-tools` |

## Versions this targets

Everything above is current documented Claude Code behavior as of the
2026-08 rewrite of these rules. Two version notes matter:

- `${CLAUDE_PROJECT_DIR}` substitution requires Claude Code v2.1.196 or
  later. Smithy does not use it in any rule — `${CLAUDE_SKILL_DIR}`, which
  carries no documented minimum, is enough for skill-bundled scripts.
- Older releases that do not substitute `${CLAUDE_SKILL_DIR}` in
  `allowed-tools` fall through to the path-spelled `extraPermissions`
  entries, which is the second reason those exist.

The deny list is unaffected by all of this and stays as written: deny beats
allow, a broad deny cannot carry an allowlist exception, and the force-push
taxonomy in `denyPermissions` is deliberate.

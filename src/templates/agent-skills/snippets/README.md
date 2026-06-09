# Snippets

Shared content fragments injected into other templates via Handlebars partials.
These are **not** deployed as standalone files — they are resolved at deploy
time by Dotprompt's partial system.

## How Partials Work

In any `.prompt` file, use `{{>partial-name}}` to include a snippet. Dotprompt
resolves the partial by looking up `snippets/<partial-name>.md` and inlining
its contents. The snippet file itself is never deployed.

## Current Snippets

| Snippet | Purpose | Used By |
|---------|---------|---------|
| `audit-checklist-strike.md` | Audit checklist for strike artifacts | smithy.audit |
| `audit-checklist-spec.md` | Audit checklist for spec artifacts | smithy.audit |
| `audit-checklist-rfc.md` | Audit checklist for RFC artifacts | smithy.audit |
| `audit-checklist-features.md` | Audit checklist for feature map artifacts | smithy.audit |
| `audit-checklist-tasks.md` | Audit checklist for task plan artifacts | smithy.audit |
| `feature-kinds.md` | Feature kind (`backend`/`ui`) + build/wire phase field schema and the two-feature seam; the single source of the kind/phase fields | smithy.render, smithy.audit |
| `review-protocol.md` | Read-only findings protocol shared by review agents (Finding structure, severity × confidence triage, no file edits) | smithy.plan-review, smithy.implementation-review |
| `guidance-shell.md` | Shell environment guidance | smithy.guidance |
| `tdd-protocol.md` | TDD workflow protocol | smithy.implement |
| `competing-lenses-decomposition.md` | Competing slice lenses for decomposition planning | smithy.cut |
| `competing-lenses-implementation.md` | Competing plan lenses for implementation planning | smithy.strike, smithy.ignite, smithy.render, smithy.mark |
| `competing-lenses-scoping.md` | Competing plan lenses for scoping | smithy.strike, smithy.ignite, smithy.render, smithy.mark |
| `one-shot-output.md` | Standardized terminal output format for one-shot planning runs (Summary → Assumptions → Specification Debt → PR), with PR-failure and bail-out fallbacks | smithy.strike, smithy.ignite, smithy.mark, smithy.render, smithy.cut |
| `pr-create-tool-choice.md` | One-line "prefer GitHub MCP `create_pull_request`, fall back to `gh pr create`" rule, embedded inline at every PR-creation step | smithy.strike, smithy.mark, smithy.forge, smithy.cut, smithy.ignite, smithy.render |
| `branch-policy.md` | Worktree-aware branch selection rule: keep the current branch only inside a linked git worktree on a non-default branch, otherwise auto-name as before; never rename the branch during PR creation | smithy.strike, smithy.mark, smithy.forge, smithy.cut, smithy.ignite, smithy.render |
| `consult-engraved-knowledge-subagent.md` | Engraved-knowledge consultation for sub-agent-capable agents (Claude, Codex): dispatch the `smithy-recall` sub-agent and use its result. Conditional-free; the consuming command selects it via the zero-arg `{{#ifAgent}}` capability gate (same gate forge/strike use for sub-agent dispatch). Not deployed standalone | Planned: smithy.strike, smithy.ignite, smithy.render, smithy.mark, smithy.cut |
| `consult-engraved-knowledge-degraded.md` | Engraved-knowledge consultation for agents without a recall sub-agent (Gemini): read the canonical engraved scan roots directly, embedding the shared `engraved-recall-rules` snippet rather than restating it. Conditional-free; the consuming command selects it via the zero-arg `{{#ifAgent}}…{{else}}` fallback. Not deployed standalone | Planned: smithy.strike, smithy.ignite, smithy.render, smithy.mark, smithy.cut |
| `engraved-recall-rules.md` | Single source of truth for engraved-knowledge recall behavior (canonical scan roots, frontmatter ranking, candidate invariant conflicts, superseded/deprecated citation hazards, empty-state result). Shared by the `smithy-recall` sub-agent and the degraded inline path so the rules are defined once, not duplicated | smithy-recall agent, consult-engraved-knowledge-degraded.md |

## Conventions

- Snippets use `.md` extension (not `.prompt`) — they are raw Markdown content,
  not Dotprompt files with frontmatter.
- Snippet filenames become the partial name: `foo-bar.md` → `{{>foo-bar}}`.
- Snippets can reference other snippets (nested partials are supported).
- **Keep snippets agent-agnostic.** A snippet must not branch on the target
  agent — no `{{#ifAgent}}` conditionals and no "if you are Claude / if you are
  Gemini or Codex" prose inside the snippet body. When a behavior genuinely
  differs per agent, author one agent-agnostic snippet per branch (e.g.
  `do-thing-claude.md` and `do-thing-degraded.md`) and let the **consuming
  command** pick between them with `{{#ifAgent 'claude'}}{{>do-thing-claude}}{{else}}{{>do-thing-degraded}}{{/ifAgent}}`.
  The conditional lives in the command, never in the snippet.
- **Share sub-agent behavior through a single snippet — never duplicate it.**
  When a sub-agent and an inline/degraded path need the same rules, extract
  those rules into one snippet that is the single source of truth, and have
  both the sub-agent prompt and the inline path `{{>include}}` it. Do not copy
  a sub-agent's body into a separate file. Established examples: `tdd-protocol.md`
  (shared by the `smithy.implement` agent and `smithy.forge`) and
  `review-protocol.md` (shared across `smithy.plan-review` /
  `smithy.implementation-review` and forge).
- **Snippets are content, not commentary.** A snippet is inlined verbatim into
  a deployed agent skill, so it must read as a direct instruction. Do not
  narrate future/out-of-scope work ("lands in a later story", "there is no
  recall agent yet, so…") or reference source-tree-only paths (`src/templates/…`,
  this README) — neither exists in a target repo where the skill is deployed.

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
| `review-protocol.md` | Read-only findings protocol shared by review agents (Finding structure, severity × confidence triage, no file edits) | smithy.plan-review, smithy.implementation-review |
| `guidance-shell.md` | Shell environment guidance | smithy.guidance |
| `tdd-protocol.md` | TDD workflow protocol | smithy.implement |
| `competing-lenses-decomposition.md` | Competing slice lenses for decomposition planning | smithy.cut |
| `competing-lenses-implementation.md` | Competing plan lenses for implementation planning | smithy.strike, smithy.ignite, smithy.render, smithy.mark |
| `competing-lenses-scoping.md` | Competing plan lenses for scoping | smithy.strike, smithy.ignite, smithy.render, smithy.mark |
| `one-shot-output.md` | Standardized terminal output format for one-shot planning runs (Summary → Assumptions → Specification Debt → PR), with PR-failure and bail-out fallbacks | smithy.strike, smithy.ignite, smithy.mark, smithy.render, smithy.cut |
| `pr-create-tool-choice.md` | One-line "prefer GitHub MCP `create_pull_request`, fall back to `gh pr create`" rule, embedded inline at every PR-creation step | smithy.strike, smithy.mark, smithy.forge, smithy.cut, smithy.ignite, smithy.render |
| `branch-policy.md` | Worktree-aware branch selection rule: keep the current branch only inside a linked git worktree on a non-default branch, otherwise auto-name as before; never rename the branch during PR creation | smithy.strike, smithy.mark, smithy.forge, smithy.cut, smithy.ignite, smithy.render |

## Conventions

- Snippets use `.md` extension (not `.prompt`) — they are raw Markdown content,
  not Dotprompt files with frontmatter.
- Snippet filenames become the partial name: `foo-bar.md` → `{{>foo-bar}}`.
- Snippets can reference other snippets (nested partials are supported).

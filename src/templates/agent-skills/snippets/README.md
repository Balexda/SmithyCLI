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
| `review-protocol.md` | Code review protocol shared by review agents | smithy.review |
| `guidance-shell.md` | Shell environment guidance | smithy.guidance |
| `tdd-protocol.md` | TDD workflow protocol | smithy.implement |

## Conventions

- Snippets use `.md` extension (not `.prompt`) — they are raw Markdown content,
  not Dotprompt files with frontmatter.
- Snippet filenames become the partial name: `foo-bar.md` → `{{>foo-bar}}`.
- Snippets can reference other snippets (nested partials are supported).

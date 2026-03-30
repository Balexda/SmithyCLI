---
name: pr-creation
description: "Use when creating pull requests. Ensures GitHub issues are properly linked with closing keywords so they auto-close on merge."
---

# PR Creation — Issue Linking

When creating a pull request, **always link related GitHub issues** using a closing keyword so they auto-close when the PR merges.

## Issue Discovery

Determine the related issue number using these methods (in priority order):

1. **Conversation context** — the user mentioned an issue number or linked an issue URL
2. **Branch name** — extract the issue number if the branch follows a pattern like `fix/123-description` or `issue-123`
3. **Search open issues** — if working from an issue description but the number isn't obvious, search the repo's open issues by title keywords to find the match

If no related issue can be identified after checking all three methods, **ask the user** whether there's an issue to link before creating the PR.

## PR Body

Use the repo's PR template (`.github/pull_request_template.md`) as the body structure. In the `## Issue` section, include one closing keyword per related issue:

```
## Issue
- Closes #123
```

Valid closing keywords: `Closes`, `Fixes`, `Resolves` (all work identically for auto-close).

If multiple issues are addressed:

```
## Issue
- Closes #123
- Closes #456
```

**Never leave the Issue section blank or with an unfilled `#`.** If there truly is no related issue, remove the section entirely rather than leaving a placeholder.

## Closing Keyword Placement

The closing keyword (`Closes #N`) **must** appear in the PR body (not just the title or a commit message) for GitHub to reliably auto-close the issue on merge.

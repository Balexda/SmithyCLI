# Copilot Contribution Guidelines

**Agent Execution Contract**

When assigned via “Assign to Copilot,” the coding agent **must**:

1. Run the following validation commands in the repository root **before opening or ready-ing a PR**:
    ```bash
    npm run build
    npx tsc --noEmit
    ```
2. If any command fails, stop, repair the failure, and re-run until all succeed.
3. Open the PR as **Draft**.
4. Only remove “Draft” when validation passes locally and in CI.
5. Tag intermediate commits `[wip]` so CI is skipped; push a final commit without `[wip]` once validation is clean.

## Validation Steps Before Submitting Changes

- Always run the core build and type-checking scripts prior to opening or updating a pull request:
  1. `npm install`
  2. `npm run build`
  3. `npx tsc --noEmit`
- Before adding new templates or workflow steps, ensure they align with the `Smithy` stages (`smithy.scope`, `smithy.segment`, etc.) documented in the `README.md`.
- When documentation (`*.md`) or prompt (`src/templates/base/*.md`) files change, verify they render correctly and the YAML frontmatter (for Gemini) is valid.
- If any command fails, fix the underlying issue and rerun the script. Do **not** proceed with the PR until all commands succeed.

## Pull Request Etiquette

- Use `.github/pull_request_template.md` when creating a new PR. Populate the Summary, Testing, and `Fixes #<issue>` sections rather than crafting ad-hoc descriptions.
- The PR body should remain a concise summary of the change. Do **not** edit the body to narrate subsequent requests or work logs—respond via review comments or PR discussion threads instead.
- When asked to adjust an existing PR, reply with a comment that summarizes the actions taken (tests run, files changed, etc.) rather than rewriting the PR body, unless the maintainer explicitly requests a body update.
- Populate the template’s Testing section with the actual outcomes—check off completed items or describe the manual verification steps.
- Append new commits when applying follow-up feedback instead of amending and force-pushing existing commits; incremental commits preserve review history and are easier to audit.
- Invoke CLI tools directly (`["git", "push", …]`, `["gh", …]`) instead of wrapping them in `bash -lc` so approval rules stay simple.

## General Conduct

- Reference the relevant issue number in commits/PRs using `Fixes #<issue>` so GitHub auto-closes the ticket on merge.
- Follow repository documentation (`README.md`, `package.json`) for project conventions.

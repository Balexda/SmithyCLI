---
applyTo: "**"
excludeAgent: "code-review"
---
# Working in this repository as the Copilot coding agent

## Before opening or readying a pull request

1. Run the validation commands from the repository root:
   ```bash
   npm run build
   npm run typecheck
   npm test
   ```
2. If any command fails, stop, repair the failure, and run all three again.
   Do not proceed until they pass.
3. Open the pull request as a **Draft**. Remove "Draft" only when validation
   passes locally and in CI.

Use the `npm` scripts. Do not call `npx vitest`, `npx tsx`, or `npx tsup`
directly. For changes to the `init`, `uninit`, or `update` flows, read the
manual cases in `tests/Agent.tests.md` and `tests/Manual.tests.md`.

## Editing templates

Changes under `src/templates/agent-skills/` follow
`.claude/rules/template-authoring.md`. Do not regenerate `.claude/`,
`.agents/`, `.codex/`, `tools/codex/`, or `.smithy/smithy-manifest.json` in
the same pull request: they are a committed snapshot refreshed separately.

## Pull request etiquette

- Use `.github/pull_request_template.md`. Fill in Summary and Testing with
  what actually happened, and link the issue with `Fixes #<number>`.
- Keep the description a concise summary of the change. Answer later requests
  in review threads or comments, not by rewriting the description, unless the
  maintainer asks for that.
- When applying follow-up feedback, add commits. Do not amend and force-push;
  incremental commits preserve the review history.
- Invoke CLI tools directly (`git push …`, `gh …`), not wrapped in
  `bash -lc`, so approval rules stay simple.

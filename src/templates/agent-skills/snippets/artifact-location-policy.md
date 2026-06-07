## Authored Smithy Artifacts Location

This Smithy install was set up with an explicit policy for **where authored
Smithy artifacts live**. Every path you see in the rest of this prompt that
refers to an authored Smithy artifact — `.rfc.md`, `.features.md`, `.spec.md`,
`.tasks.md`, `.strike.md`, `.prd.md`, `.persona.md`, `.data-model.md`,
`.contracts.md` — is already prefixed with `{{artifactsRoot}}` so it points
at the right root for this repo. Do not strip, override, or rewrite that
prefix.

- When `{{artifactsRoot}}` is empty, artifacts live **in the repo**:
  `docs/rfcs/...`, `docs/prds/...`, `docs/personas/...`, `specs/...`,
  `specs/strikes/...`.
- When `{{artifactsRoot}}` is `~/.smithy/<repo>/`, artifacts live **outside
  the repo, in the user's home directory**: `~/.smithy/<repo>/docs/rfcs/...`,
  `~/.smithy/<repo>/docs/personas/...`, `~/.smithy/<repo>/specs/...`, etc.
  Treat the resolved path as authoritative — agents (Claude Code, Gemini CLI,
  Codex) expand `~` at tool-call time, so the path is portable across team
  members even when this prompt is committed to source control.

### Scope of the policy

This policy applies **only to authored Smithy artifacts** such as planning
artifacts and durable persona files. It does **not** apply to:

- **Source code, tests, configuration, or any other repo file you edit as
  part of an implementation slice.** Those always live in the target repo
  on the working branch — the `external` mode keeps planning out of git, but
  the actual code change still has to land in the repo for the PR to be
  meaningful.
- **GitHub issue body templates** under `<manifestDir>/templates/orders/`.
  Those are managed separately by `smithy init` and `smithy.orders`.
- **The smithy manifest itself** (`.smithy/smithy-manifest.json` or
  `~/.smithy/smithy-manifest.json`), which is set by `smithy init`.

### When discovering existing artifacts

When you scan for existing artifacts (e.g. "list folders in
`{{artifactsRoot}}docs/rfcs/`"), use the prefixed path. The `smithy status`
CLI already reads the manifest and looks in the right place, so its output
will be consistent with the paths in this prompt.

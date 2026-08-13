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
- When `{{artifactsRoot}}` is `~/.smithy/repos/<repoKey>/` or
  `~/.smithy/projects/default/`, artifacts live **outside the repo, in the
  user's home directory**: `{{artifactsRoot}}docs/rfcs/...`,
  `{{artifactsRoot}}docs/personas/...`, `{{artifactsRoot}}specs/...`, etc.
  The repo-keyed form is used when Smithy was set up inside a git repo; the
  `projects/default` form is the shared store for cross-repo work set up
  outside one. Treat the resolved path as authoritative — agents (Claude
  Code, Gemini CLI, Codex) expand `~` at tool-call time, so the path is
  portable across team members even when this prompt is committed to source
  control.

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
{{#ifExternalArtifacts}}

### Committing artifacts to the store

`smithy init` initializes `{{artifactsRoot}}` as a **git repository**. When it
succeeded, that history is the only record these artifacts have — nothing
else tracks them, and an uncommitted file you overwrite is gone. So commit
your work there.

After you finish writing or updating artifacts — once the artifact is
complete, not after every partial write:

```bash
git -C {{artifactsRoot}} add -A
git -C {{artifactsRoot}} commit --no-gpg-sign -m "<command>: <what changed>"
```

- `--no-gpg-sign` keeps the commit from blocking on a signing passphrase
  prompt on machines that set `commit.gpgsign`.
- If the commit reports nothing to commit, that is fine — carry on rather
  than treating it as a failure.
- **If the store is not a git repository, skip this step entirely and carry
  on.** `smithy init` warns and continues when git is unavailable, so a
  historyless store is a supported state — not a reason to fail the run. Do
  not run `git init` yourself to work around it.
- **Do not `git push`** the store. Any remote on it belongs to the user, who
  decides when it syncs.
- This is **separate from, and never a substitute for**, the code commits you
  make in the target repo on the working branch. Committing the store does
  not put anything in the user's pull request.

{{/ifExternalArtifacts}}

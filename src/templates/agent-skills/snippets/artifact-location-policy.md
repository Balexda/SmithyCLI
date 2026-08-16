## Authored Smithy Artifacts Location
{{#ifExternalArtifacts}}

This Smithy install keeps authored artifacts **outside the repo**, in the
user's home directory under `{{artifactsRoot}}`. Every path you see in the
rest of this prompt that refers to an authored Smithy artifact — `.rfc.md`,
`.features.md`, `.spec.md`, `.tasks.md`, `.strike.md`, `.prd.md`,
`.persona.md`, `.data-model.md`, `.contracts.md`, and the engraved records
`.decision.md`, `.invariant.md`, and the principle files under
`constitution/` — is already prefixed with that root. Do not strip,
override, or rewrite the prefix. Treat the resolved path as authoritative:
agents (Claude Code, Gemini CLI, Codex) expand `~` at tool-call time, so the
path is portable across team members even when this prompt is committed to
source control.

The same holds when you scan for existing artifacts (e.g. "list folders in
`{{artifactsRoot}}docs/rfcs/`") — use the prefixed path. The `smithy status`
CLI reads the manifest and already looks in the right place, so its output
will be consistent with the paths in this prompt.

### Engraved records outside the repo level

Engraved durable knowledge is partitioned by level, and only its **repo**
level rides `{{artifactsRoot}}` — so `{{artifactsRoot}}docs/decisions/` is
the repo's decisions and nothing else. The other two levels have fixed homes
that this policy does not move:

- **user** — `~/.smithy/decisions/`, `~/.smithy/invariants/`,
  `~/.smithy/constitution/`, the same in every repo.
- **project** — `~/.smithy/projects/<project>/decisions/` and its siblings,
  keyed by workstream.

Reading those levels means reading their own roots directly.

### Scope of the policy

This policy applies **only to authored Smithy artifacts** such as planning
artifacts, durable persona files, and engraved records. It does **not** apply
to:

- **Source code, tests, configuration, or any other repo file you edit as
  part of an implementation slice.** Those always live in the target repo
  on the working branch — this mode keeps planning out of git, but the
  actual code change still has to land in the repo for the PR to be
  meaningful.
- **GitHub issue body templates** under `<manifestDir>/templates/orders/`.
  Those are managed separately by `smithy init` and `smithy.orders`.
- **The smithy manifest itself** (`.smithy/smithy-manifest.json` or
  `~/.smithy/smithy-manifest.json`), which is set by `smithy init`.

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
{{else}}

Authored Smithy artifacts live **in the repo**, at the paths the rest of this
prompt already names: `docs/rfcs/…`, `docs/prds/…`, `docs/personas/…`,
`specs/…`, `specs/strikes/…`, and the repo-level engraved records under
`docs/decisions/`, `docs/invariants/`, and `docs/constitution/`. Use those
paths as written — they are already correct for this repo.

Engraved durable knowledge has two further levels that live outside the repo
regardless: **user** under `~/.smithy/decisions/`, `~/.smithy/invariants/`,
and `~/.smithy/constitution/`, and **project** under
`~/.smithy/projects/<project>/decisions/` and its siblings. Reading those
levels means reading their own roots directly.
{{/ifExternalArtifacts}}

## Authored Smithy Artifacts Location

{{>artifact-root-resolution}}

### The rendered root
{{#ifExternalArtifacts}}

This Smithy install keeps authored artifacts **outside the repo**, in the
user's home directory under `{{artifactsRoot}}` — the rendered root. Every
path you see in the rest of this prompt that refers to an authored Smithy
artifact — `.rfc.md`, `.features.md`, `.spec.md`, `.tasks.md`, `.strike.md`,
`.prd.md`, `.persona.md`, `.data-model.md`, `.contracts.md`, and the
repo-level engraved records `.decision.md`, `.invariant.md`, and the principle
files under `constitution/` — is already prefixed with it. Unless the
resolution step above substituted a project store's prefix, do not strip,
override, or rewrite the prefix. Treat the resolved path as authoritative:
agents (Claude Code, Gemini CLI, Codex) expand `~` at tool-call time, so the
path is portable across team members even when this prompt is committed to
source control.

The same holds when you scan for existing artifacts (e.g. "list folders in
`{{artifactsRoot}}docs/rfcs/`") — use the prefixed path. The `smithy status`
CLI reads the manifest and already looks in the right place; pass it
`--project <slug>` when a project resolved, so its output names the same
store as the paths in this prompt.
{{else}}

Authored Smithy artifacts live **in the repo** by default — the rendered root
is the repo itself, so the paths the rest of this prompt names (`docs/rfcs/…`,
`docs/prds/…`, `docs/personas/…`, `specs/…`, `specs/strikes/…`, and the
repo-level engraved records under `docs/decisions/`, `docs/invariants/`, and
`docs/constitution/`) carry no prefix. Unless the resolution step above
substituted a project store, use them as written — they are already correct
for this repo. When it did, prefix each planning-artifact path with the
returned `prefix` (`~/.smithy/projects/<slug>/specs/…`), and pass
`--project <slug>` to `smithy status` so its output names the same store.
{{/ifExternalArtifacts}}

### Engraved records and the resolved root

Engraved durable knowledge is partitioned by level, and resolving a project
store for planning moves none of the levels:

- **repo** — `{{artifactsRoot}}docs/decisions/` and its siblings: the
  rendered root, even when this run's planning artifacts resolved to a
  project store. A repo-level record is true for every workstream in the
  repo, so it stays where every workstream can see it.
- **user** — `~/.smithy/decisions/`, `~/.smithy/invariants/`,
  `~/.smithy/constitution/`, the same in every repo.
- **project** — `~/.smithy/projects/<project>/decisions/` and its siblings:
  the record directories of the same store the project's planning artifacts
  resolve to.

Reading those levels means reading their own roots directly.

### The `**Project**` header

Every planning artifact written into a project store declares it, so the
downstream command that picks the artifact up — from any directory, including
a code worktree — resolves the same store with `smithy root --from <path>`:

```
**Project**: `<slug>`
```

Place it in the artifact's header block, directly after the Created / Status
line, with the slug `smithy root` returned. Omit the line entirely when no
project resolved — absence means absence, never "guess". Engraved records do
not carry it: their level is the store they sit in.

### Scope of the policy

This policy applies **only to authored Smithy artifacts** such as planning
artifacts, durable persona files, and engraved records. It does **not** apply
to:

- **Source code, tests, configuration, or any other repo file you edit as
  part of an implementation slice.** Those always live in the target repo
  on the working branch — keeping planning out of the repo does not change
  where the code change has to land for the PR to be meaningful.
- **GitHub issue body templates** under `<manifestDir>/templates/orders/`.
  Those are managed separately by `smithy init` and `smithy.orders`.
- **The smithy manifest itself** (`.smithy/smithy-manifest.json` or
  `~/.smithy/smithy-manifest.json`), which is set by `smithy init`.
{{#ifExternalArtifacts}}

### Committing artifacts to the store

`smithy init` initialized `{{artifactsRoot}}` as a **git repository**, and
`smithy project init` does the same for a named project store. When that
succeeded, the store's history is the only record these artifacts have —
nothing else tracks them, and an uncommitted file you overwrite is gone. So
commit your work there.

After you finish writing or updating artifacts — once the artifact is
complete, not after every partial write. The store path below is the rendered
root; when the resolution step substituted a project store, use its `prefix`
here too:

```bash
git -C {{artifactsRoot}} add -A
git -C {{artifactsRoot}} commit --no-gpg-sign -m "<command>: <what changed>"
```

- `--no-gpg-sign` keeps the commit from blocking on a signing passphrase
  prompt on machines that set `commit.gpgsign`.
- If the commit reports nothing to commit, that is fine — carry on rather
  than treating it as a failure.
- **If the store is not a git repository, skip this step entirely and carry
  on.** Smithy warns and continues when git is unavailable, so a historyless
  store is a supported state — not a reason to fail the run. Do not run `git init` yourself
  to work around it.
- **Do not `git push`** the store. Any remote on it belongs to the user, who
  decides when it syncs.
- This is **separate from, and never a substitute for**, the code commits you
  make in the target repo on the working branch. Committing the store does
  not put anything in the user's pull request.
{{else}}

### Committing to a resolved project store

In-repo artifacts ride the code repo's working branch like any other file and
need nothing here. The one exception is a run whose resolution step
substituted a project store: `smithy project init` made that store a **git
repository**, and its history is the only record those artifacts have. Once
the artifact is complete — not after every partial write — commit it there,
and only there:

```bash
git -C ~/.smithy/projects/<slug>/ add -A
git -C ~/.smithy/projects/<slug>/ commit --no-gpg-sign -m "<command>: <what changed>"
```

`--no-gpg-sign` keeps the commit from blocking on a passphrase prompt. If the
commit reports nothing to commit, carry on; if the store is not a git
repository, skip the commit entirely and do not run `git init` yourself; never
`git push` it — any remote on it belongs to the user. This is separate from,
and never a substitute for, the code commits you make in the target repo, and
it puts nothing in the user's pull request.
{{/ifExternalArtifacts}}

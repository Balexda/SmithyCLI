# Project stores: one artifact root per workstream

Smithy renders one planning-artifact root into every prompt at `smithy init`:
the repo itself, or an external store under `~/.smithy/` keyed to the repo.
That is right for one workstream per install. It breaks the moment a machine
runs two workstreams at once, or a project spans several repos:

| Case | What goes wrong with a single root |
|------|-----------------------------------|
| Parallel workstreams | Two specs share one store checkout and one current branch. Spec B's cut workers commit onto spec A's branch; spec A's uncommitted files block a branch switch for spec B. |
| Multi-repo projects | The store is keyed per repo, so a project spanning three repos has no key of its own and falls back to whatever folder the install was run from. |
| Forge in a code worktree | Forge runs in `<repo>/.worktrees/<slice>`. The fixed prefix leads back to the shared store and the first problem. |

A **named project store** is the fix: `~/.smithy/projects/<slug>/`, its own
git repository, holding that workstream's planning artifacts (`specs/`,
`docs/rfcs/`, `specs/strikes/`, in the same layout as any other store) and its
project-level engraved records (`decisions/`, `invariants/`, `constitution/`).
Two workstreams in two stores never share a checkout or a branch. A project
spanning several repos has one home that is keyed to none of them.

## Commands

```bash
smithy project init <slug>            # create a git-backed store
smithy project link <slug> <path>     # make ~/.smithy/projects/<slug> a symlink to a directory you already keep
smithy project list [--format json]   # the named stores on this machine
smithy root [--project <slug>] [--from <artifact>] [--write] [--format json]
```

`smithy project init` is operator-driven, like `smithy init`. Nothing it
creates is added to a manifest, so `smithy uninit` never reaches a project
store. The reserved slug `default` is the shared out-of-repo store and is not a
named project.

`smithy project link` is for users who already keep one working directory per
project — a coord worktree with a `repos/` symlink farm, say. The store path,
its tilde spelling, and the deployed git permissions stay the same; commits
made through `~/.smithy/projects/<slug>/` land in the target's own history, and
no second repository is created inside it.

## How a run picks its root

Every planning command resolves the root once, at the start, by calling
`smithy root`. The command applies four rules and the first match wins:

| # | Rule | Who it serves |
|---|------|---------------|
| 1 | `--project <slug>` in the invoking arguments | Orchestrators: `/smithy.cut --project 007-persona-profiles <spec> 3` |
| 2 | The artifact being worked on names a project — its `**Project**` header, or the store it physically lives in | Downstream commands. Forge in a code worktree receives a tasks path, and that path resolves the store; the working directory never matters. |
| 3 | **Reads only:** exactly one named store exists | `smithy status` and engraved recall on a machine with one active project |
| 4 | The install-time root (repo-keyed store, `default`, or in-repo) | Everyone who never creates a project. Behaviour is unchanged. |

Rule 3 is skipped for writes on purpose. A read that guesses the one named
project costs a few extra records scanned; a `/smithy.mark` that guessed it
would redirect every spec on the machine into that project the moment it was
created. A write that falls through to rule 4 while named stores exist carries
a `warning` naming the stores it did not choose, and the agent reports it.

A project is never inferred from the working directory's name.

The result has two spellings of the root so the agent's job is a literal
find-and-replace, not an inference:

```json
{
  "prefix": "~/.smithy/projects/007-persona-profiles/",
  "rendered_prefix": "~/.smithy/repos/pedregal/",
  "path": "/home/me/.smithy/projects/007-persona-profiles",
  "kind": "project",
  "store": true,
  "rule": 2,
  "project": "007-persona-profiles",
  "mode": "write"
}
```

When `prefix` and `rendered_prefix` differ, the agent uses `prefix` wherever
the prompt names `rendered_prefix`. When they are equal, the prompt is already
correct. `smithy root` exits 2 on an invalid slug or a project with no store on
disk, because silently falling back is exactly how a spec lands in the wrong
place.

## The `**Project**` header

Every artifact a run writes into a project store declares it, directly after
the Created / Status line of its header block:

```markdown
**Project**: `007-persona-profiles`
```

The line is omitted when no project resolved. Downstream commands feed the
artifact to `smithy root --from`, which reads the header (a `project:`
frontmatter key is the second spelling) and falls back to the store the file
lives in. `smithy status` reports the header verbatim as `project` on each
record. Engraved records do not carry the header: their level is the store
they sit in.

## Status across workstreams

```bash
smithy status --project <slug>       # one named store, paths in its tilde form
smithy status --project all          # every named store; each record carries its project
smithy status                        # the usual cascade, which appends the one named store when exactly one exists
smithy status --engraved --project <slug>   # the engraved inventory, unchanged
```

## Migrating existing artifacts

Nothing moves on its own. A spec that already lives in a repo-keyed store can
be moved into a project store by hand: move the folder, add the `**Project**`
header, and rewrite any `~/.smithy/repos/<key>/` paths in its `Artifact` cells
and tasks headers. A `smithy project import` command that does this in one step
is the natural follow-up; `smithy update` will never stamp or move user-authored
artifacts, for the same reason `uninit` never deletes them.

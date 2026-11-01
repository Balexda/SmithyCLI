---
id: D-5
kind: decision
domain: system
title: "The planning-artifact root is resolved at run time from a declared project, never from the working directory"
status: proposed
decided_at: 2026-11-01
topics: [artifact-root, project-stores, parallel-workstreams, multi-repo, template-authoring]
scope: [src/project-store.ts, src/commands/root.ts, src/commands/project.ts, src/templates/agent-skills/snippets/artifact-root-resolution.md, src/templates/agent-skills/snippets/artifact-location-policy.md]
applies_to: [deployed commands, planning artifacts, smithy root, smithy status, project stores]
supersedes: []
superseded_by: []
establishes: [INV-4]
---
# The planning-artifact root is resolved at run time from a declared project, never from the working directory

## Context

Every deployed prompt carried one planning-artifact root, fixed when
`smithy init` rendered `{{artifactsRoot}}`: the repo, or an external store
keyed to the repo under `~/.smithy/`. One root per install is right for one
workstream per install and wrong for everything else. On 2026-11-01 a spec
spanning four repos could not be cut: the install's single store was checked
out on another spec's branch, with that spec's uncommitted files and four live
forge sessions on it. The same shape fails for any two parallel workstreams,
for any project spanning repos (the repo key has no name for it), and for
forge running in a code worktree, whose relative paths resolve against the
code repo while the fixed prefix leads back to the shared store.

Named project stores — `~/.smithy/projects/<slug>/`, one git repository each
— already existed for engraved knowledge, with a resolution rule (an explicit
`--project`, else the artifact's `project:` field, else the single named
store, never the working directory) and the git permissions to commit to
them. The alternatives were a store `git worktree` per spec (the prompts name
the main checkout, so workers still write to the wrong tree), a marker file
found by walking up from the current directory (it is exactly the inference
the existing rule forbids, and forge's directory is the code worktree), a
per-session environment variable (IDE and agent-deck launches do not carry
one reliably), or a per-project key at install time (one user-level install
serves every session, so two projects cannot have two prefixes at once).

## Decision

A resolved project store is the root for every planning artifact, not only
for engraved records, and the resolution happens at run time, once per run,
by the CLI rather than by the agent. `smithy root` applies four rules in
order — an explicit `--project <slug>`; the project the input artifact
declares through its `**Project**` header or the store it physically lives
in; for reads only, the single named store on the machine; else the
install-time root — and prints both the resolved prefix and the rendered one,
so the agent's part is a literal replacement of a leading prefix and nothing
is inferred. The rendered `{{artifactsRoot}}` stays in the templates as the
rule-4 value, and installs that never name a project behave exactly as
before.

Writes never apply the single-named-store rule. For a read, guessing the one
project costs a few records scanned; for a write it would redirect every spec
on the machine into that project the moment it was created. A write that
falls through to the install root while named stores exist carries a warning
the agent must surface. Nothing, read or write, infers a project from the
working directory's name.

Every artifact written into a project store declares it with a `**Project**`
header, omitted when no project resolved, so the downstream command resolves
the same store from the artifact alone. Engraved records do not carry the
header, and resolving a project for planning moves no engraved level: the
repo level stays at the rendered root, the project level stays in the project
store's record directories. `smithy update` never stamps or moves
user-authored artifacts, for the same reason `uninit` never deletes them.

## Consequences

Good: two workstreams in two stores never share a checkout or a branch, with
no branch handling at all; a project spanning several repos has one home keyed
to none of them; forge finds its store from the tasks file it was handed, from
any directory; and the common single-root install pays nothing but one
read-only CLI call per run. The rule has one deployed home,
`artifact-root-resolution`, composed through the location policy every
planning command already carries, so the engraved and planning sides cannot
drift (per INV-1).

Bad: every planning run now starts with a shell call, and the substitution,
while literal, is still performed by the agent at every path the prompt names
— a prompt that spells a path without the prefix is now wrong in two modes
instead of one. The `**Project**` header is a new field the authoring
commands must remember to stamp; an unstamped artifact in a project store
still resolves by location, but one moved out of it loses the link. And the
repo-mode location policy grows a project-store commit paragraph it did not
need before (per P-1, spent so that a repo-mode install can still target a
project store without the agent ever being told to commit the code repo).

## Establishes

INV-4 — The planning-artifact root is declared, never inferred from the
working directory.

## Citations

INV-1 (the resolution rule is composed from one snippet, never restated).
INV-2 (`smithy root` prints tilde-form prefixes, so no expanded home path
reaches a deployed prompt). P-1 (the rule costs one read-only call per run
and one extra snippet in the policy every command already composes). Evidence
and alternatives: the 2026-11-01 project-scoped artifact roots proposal, and
`docs/project-stores.md`.

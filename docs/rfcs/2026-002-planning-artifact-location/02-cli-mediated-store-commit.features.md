# Feature Map: CLI-Mediated Store Commit

**Source RFC**: `docs/rfcs/2026-002-planning-artifact-location/planning-artifact-location.rfc.md`
**Milestone**: 2 — CLI-Mediated Store Commit
**Created**: 2026-11-15

## Features
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

### Feature 1: Per-Runtime Permission Probe

```yaml
kind: backend
```

**Description**: An experiment, run before the store write is built, that shows for Gemini CLI and Codex whether each runtime can grant a `smithy` CLI call without its permission file listing store paths. It covers both the store write and the location query, and its per-runtime result is recorded before work on Feature 2 starts.

**User-Facing Value**: The maintainer learns, before any write code exists, which runtimes can run a CLI-mediated commit unattended, and the write's command shape is chosen to fit what each runtime can actually grant.

**Scope Boundaries**:
- Includes: probing Gemini CLI and Codex with stand-in subcommands, so the probe waits on neither Milestone 1's query nor Feature 2's write; candidate argument shapes for the store (positional or flag, tilde or absolute form), because Codex matches a rule token by token; on Codex, a real commit landing in a store under `~/.smithy/` from inside the sandbox, not only a matching rule; on Gemini, the flag variants the write would take; a stated definition of a pass; Claude as a recorded control; a per-runtime result record, passes included; a new specification debt item for each runtime that fails.
- Excludes: building the write or the query; emitting or removing any permission rule (Features 3 and 4); the forge store-identity experiment (Milestone 5).

### Feature 2: Explicit-Store Write Command

```yaml
kind: backend
```

**Description**: A new `smithy` subcommand that takes an explicit store and a commit message and returns a commit. It works from any working directory, including a code worktree, and the commit lands in the named store and nowhere else.

**User-Facing Value**: A forge or planning session can record its progress in the store the work belongs to, whatever directory it runs in, and parallel workstreams committing to their own stores do not collide.

**Scope Boundaries**:
- Includes: a store given in tilde or absolute form, expanded by the CLI itself; git run against the named store, never the working directory, and unaffected by git environment variables inherited from a hook or worktree; acceptance of Smithy's own stores only (the user store `~/.smithy/`, and stores under `~/.smithy/repos/` and `~/.smithy/projects/`) and refusal of everything else, a code repository included; a check that the named store is the root of its own git repository, so a store nested inside another repository never commits into it; staging of either the whole store or a named set of paths, since today's prompts use both; a store that is not a git repository keeps its files, gets no commit and prints a notice; a stable, enumerated result for each outcome (committed with its id, nothing to commit, skipped with a notice, store path missing, not a recognised store, rejected by a hook); parallel commits to different stores, verified by a multi-process test; bounded handling of index-lock contention within one store, with a defined failure outcome.
- Excludes: deciding which store a run uses or which project is in play (Milestone 1); any reserved-name logic, since legacy stores are plain paths here (Milestone 4); the `git init` and first commit `smithy init` performs when it sets up an external store, which stay as they are; initialising a repository or pushing, ever; atomic Dependency Order cell edits and story-scoped debt ids (RFC SD-002); every prompt edit (Milestone 3).

### Feature 3: Path-Free CLI Grants on Every Runtime

```yaml
kind: backend
```

**Description**: The deployers grant the store write on every runtime, in the grammar that runtime reads and in the shape Feature 1 proved, with no store path in the rule. The change is additive: no existing rule is removed.

**User-Facing Value**: An agent on any runtime can call the store write without an approval prompt, and on Codex that now reaches project stores, which have no grant today.

**Scope Boundaries**:
- Includes: a grant narrowed to the write subcommand, never all of `smithy`, on Claude, Gemini and Codex; a Known Exceptions row under INV-3 for each runtime whose emitted permission metadata diverges because it failed the probe; a store-grant section in `docs/permission-grammar.md`, which documents no store rules today, carrying Feature 1's per-runtime results; a statement that the Codex grant widens from the install's one store to every Smithy store.
- Excludes: the location-query grant, which the first milestone that needs it emits from Feature 1's probe result (SD-001); removing any existing permission rule (Feature 4); any grant for `smithy init`, `update` or `uninit`; prompt edits (Milestone 3).

### Feature 4: Retire Store-Path Git Grants

```yaml
kind: backend
```

**Description**: On every runtime that passed the probe, the deployers stop emitting git rules that name a store location: the `~/.smithy/repos/*` and `~/.smithy/projects/*` wildcard rules on Claude and Gemini, and the resolved store path on Codex. This feature must not reach a release before Milestone 3 removes the store `git` commands from deployed prompts.

**User-Facing Value**: Permission files stop carrying store locations, so adding a project store never needs a permission change, and the unattended git surface on stores shrinks to the one CLI call.

**Scope Boundaries**:
- Includes: both kinds of store-path rule named above, on each runtime where the probe passed; a runtime that failed keeps its rules under its debt item; repo-mode permission output that differs only by the removed store-path rules (none on Codex, where repo mode emits no store rule), verified by a snapshot diff; repo-mode commits are unaffected, because in-repo prompts never issue store `git` commands; the release coupling to Milestone 3, stated here because the `Depends On` column holds only same-table IDs.
- Excludes: runtimes that failed the probe; removing the `git -C` commands from prompts (Milestone 3); any change to the repository's own `git add` and `git commit` grants.

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

| ID | Title | Source Category | Impact | Confidence | Origin |
|----|-------|-----------------|--------|------------|--------|

### Resolved

#### SD-001 — location-query-grant-owner

**Question:** Which milestone emits the permission grant for the location query? Unresolved choice between (a) M2's F3, which emits it next to the write grant: M2's description puts the location call in the probe, and F3 already touches the emission machinery, but F3 then carries a soft dependency on a verb name M1 has not fixed; and (b) M1, which emits it when it introduces the query, using F1's probe result: this keeps M2 to the write alone, but leaves M1 owning permission machinery that none of its success criteria mention. The RFC names no owner, and the pick decides whether F3's scope and acceptance scenarios include the query grant.

**Answer:** Resolved 2026-11-15 by the maintainer — neither option as posed: the first milestone that needs the grant emits it. Nothing in this milestone calls the location query, so Feature 3 grants the store write only, and the query grant is emitted by whichever milestone first has a caller for it, using Feature 1's probe result.

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

Recommended specification sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| F1 | Per-Runtime Permission Probe | — | specs/2026-11-15-013-per-runtime-permission-probe/ |
| F2 | Explicit-Store Write Command | F1 | — |
| F3 | Path-Free CLI Grants on Every Runtime | F1, F2 | — |
| F4 | Retire Store-Path Git Grants | F3 | — |

## Cross-Milestone Dependencies
<!-- audience: reviewer; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| Milestone 1: Workspace Location Contract and Read Path | depended upon by | Feature 1's probe result is the input for the location query's permission grant, which the first milestone that needs the grant emits (SD-001); this milestone does not emit it. This milestone does not wait on Milestone 1: the write takes an explicit store. |
| Milestone 3: Location-Free Templates | depended upon by | Its prompts call Feature 2's write, read its enumerated result, and rely on Feature 3's grant. It replaces two commit sites: the whole-store commit in the shared location policy and the path-scoped record commit in `smithy.engrave`, which also reaches the user store. |
| Milestone 3: Location-Free Templates | depends on | Release ordering only, for Feature 4: retiring the store-path git rules before the prompts stop issuing store `git` commands would put an approval prompt on every external-store commit. Features 1 to 3 carry no such constraint. |
| Milestone 5: Parallel Workstreams and Forge From Any Worktree | depended upon by | Its forge-from-worktree and parallel-workstream acceptance runs use Feature 2's write. |

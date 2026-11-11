# PRD: Planning Artifact Location Model

**Created**: 2026-11-11  |  **Status**: Draft

## Problem Statement
<!-- audience: stakeholder; mode: explanation; length: 2-3 paragraphs; diagram: optional; examples: discouraged -->

On 1 November 2026 the maintainer could not cut spec 007, a project that spans four repositories. Smithy keeps out-of-repo planning documents in one store per install, and that store was busy with spec 001. It was checked out on 001's branch, it held five uncommitted 001 files, and four 001 forge sessions were still running against it. Neither spec had done anything wrong; two workstreams simply cannot share one checkout. The same design fails in two more ways. A project that spans several repositories has no home of its own, because the store belongs to a single repository. Forge, which runs in a code worktree, follows a fixed path back to that shared store, but the progress it records there gets committed in the code worktree instead of the store. That is how uncommitted planning files pile up behind a running workstream.

All three failures have the same root cause: the location of planning documents is written into the prompt text once, at install time, in 97 places across the templates. Each new answer to "where do artifacts live" has been added as another layer on top of that fixed location: in-repo versus external, per-repository versus shared, named projects, worktrees, and cross-repository slices. The layers so far are agent-side path rewriting, a status lookup that tries several stores in turn, store-specific commit instructions inside prompts, and permission lists that name store paths. A stopgap under review (PR #610) lets commands choose a store at run time. That unblocks the incident, but it puts a second resolution mechanism on top of the first. Reviews of that work found the rule for "which project is in play" implemented in three places. They also found that the location instructions every planning command loads grew from 13 lines to 115, a context cost paid even by teams who keep their planning in-repo and never touch an external store.

We want one model for where planning artifacts and engraved records live, how every command finds them, and how they are committed. Parallel workstreams and multi-repo projects should each have their own home. Forge should find, and commit to, the right store from any worktree. Deployed prompts should carry no filesystem location at all. Teams that keep planning in their repository should see no change.

## Proposed Solution
<!-- audience: stakeholder; mode: explanation; length: 1-2 paragraphs; diagram: optional; examples: discouraged -->

Smithy's CLI becomes the single owner of where a workstream's planning
artifacts live. A deployed prompt never names a filesystem root. It refers to
artifacts by logical place — this workstream's specs, this repo's decisions —
and asks the CLI once per run for the concrete locations, which the CLI
resolves from one workspace model: the install, the project in play, and the
kind of store. That one answer serves the planning commands, status discovery,
engraved recall, and forge alike, so "which project is in play" is decided in
exactly one place. Writes to a store, including the commit that gives
artifacts their history, go through the CLI as well: prompts stop carrying git
commands, and a forge session standing in a code worktree leaves its progress
in the store rather than in the code checkout.

What the user observes: `smithy init` bakes no location into prompts; two
workstreams on one machine each get their own store and never share a
checkout or a branch; a project spanning several repos has one home keyed to
none of them; repo-level installs behave exactly as before; and the store
kinds collapse to two — in the repo, or in a project store, with today's
repo-keyed and shared default stores addressed as projects under reserved
names. The user-facing pieces of the phase-1 stopgap (named project stores,
`smithy status --project`, the `**Project**` header on artifacts) carry over;
its prefix-substitution mechanism is superseded.

## Target Users
<!-- audience: stakeholder; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- **The Smithy maintainer**, who runs several multi-repo workstreams from one
  machine and orchestrates mark → cut → forge agent sessions in parallel.
  Today a second workstream collides with the first's store checkout and
  branch, which is the incident that opened this PRD.
- **Teams with repo-level installs** who keep planning in the repo. They
  notice nothing today and must notice nothing afterwards; they are a hard
  compatibility constraint rather than a group gaining capability.
- **Template authors**, who maintain one template source for three agent
  runtimes and pay context budget for every line of location text. Today 97
  sites across 17 templates name a root, and the stopgap's location policy
  grows to 115 lines in every composing command.

## Success Signals
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: optional -->

- The 2026-11-01 scenario cannot recur: two specs in different projects are
  cut and forged in parallel on one machine with no shared checkout or
  branch, and a forge run in a code worktree records its progress in the
  store, not in the code worktree.
- Deployed templates contain no filesystem root — zero of today's 97
  `{{artifactsRoot}}` sites remain — so a prefix-mismatch bug has nothing to
  mismatch.
- "Which project is in play" is decided in one place, prompts carry no store
  `git` commands, and the location text each command carries returns to
  roughly its 13-line repo-mode size.
- Repo-mode installs show no observable behaviour change, including on a
  machine without a current `smithy` binary on PATH.


## Alternatives / Build-vs-Buy
<!-- audience: reviewer; mode: explanation; length: 3-6 paragraphs; diagram: optional; examples: recommended -->

### Alternatives Considered

| Name | URL | Category | Fit | Why not |
|------|-----|----------|-----|---------|
| OpenSpec "Stores" (beta) | <https://github.com/Fission-AI/openspec> | OSS CLI tool (MIT, npm `@fission-ai/openspec`) | Partial | It solves the same problem but is a rival spec workflow, not a library Smithy can embed. It is in beta, and its CLI never commits ("OpenSpec never clones, syncs, or pushes anything on its own"). It allows "one checkout per store id per machine", so it does not fix parallel workstreams sharing one store checkout. |
| Spec Kitty | <https://pypi.org/project/spec-kitty-cli/> | OSS CLI tool (MIT, Python) | Poor | It supports Claude Code, Codex and Gemini and gives parallel agents their own `.worktrees/`, but its planning artifacts live in the repo (`kitty-specs/`). It does not resolve stores outside the repo, and it is Python where Smithy needs Node.js/TypeScript. |
| direnv | <https://github.com/direnv/direnv> | OSS CLI tool (MIT) | Poor | This is what people mean by "just use per-directory env". It loads `.envrc` from a shell hook "before each prompt". Agent runtimes run commands non-interactively, so the hook may never fire (not confirmed, see Gaps). It also keys on the working directory, which Smithy rules out as a signal. And it only sets variables: it neither resolves stores nor commits to them. |

### Build-vs-Buy Rationale

The closest external match is OpenSpec Stores. Its resolver is strikingly similar to the one proposed. A store is a standalone planning git repo, registered per machine in a registry file under the XDG data dir (`~/.local/share/openspec/stores/registry.yaml`). Precedence runs: explicit `--store <id>` first, then the nearest `openspec/` root found by walking up, then a `store:` line in config, then a machine-wide `defaultStore`, then an error with a hint. JSON output reports which rule applied, much like `smithy root --format json` reports `prefix` and the reason. Its agent instructions also hand agents CLI fetch commands (`openspec show <id> --store <store>`) rather than literal paths. That is evidence the "prompts name artifacts logically, the CLI resolves them" pattern is sound and already in use. Smithy cannot adopt it, though:

- **It replaces Smithy rather than plugging in.** OpenSpec is a full spec-driven workflow with its own `openspec/` layout, its own specs-and-changes model and its own agent instructions. Smithy's artifact hierarchy (RFC → features → spec → tasks with `## Dependency Order` tables), its engraved user/repo/project levels and its manifest-tracked deploys have no counterpart there. Taking only the resolver would mean taking the whole tool.
- **It misses two of the stated problems.** The CLI deliberately never commits, so store git commands would stay in prompt text (today's `git -C {{artifactsRoot}} …` block in `artifact-location-policy.md`). And "one checkout per store id per machine" fails the parallel-workstreams requirement.
- **Its walk-up rule conflicts with Smithy's.** Resolution falls back to the nearest `openspec/` root above the current directory. Smithy's engraved rule (D-5 / INV-4) is that the working directory's name is never a signal.
- **It is beta.** The guide warns that flags, file formats and JSON output may change.

The repo facts point the same way. `src/manifest.ts` already computes the external root from `os.homedir()` and the `projects/default` segments, and renders it into `{{artifactsRoot}}` at install time. `src/engraved/roots.ts` already has `projectRoot(slug)`, `listProjectSlugs()`, `resolveProject()` and a tilde-form `displayPath()` for `~/.smithy/projects/<slug>/`. The missing piece is therefore one resolver plus a commit subcommand in a TypeScript codebase that already has nearly all the parts. That is a small, contained build, not a platform anyone sells. Recommendation: build it, borrowing OpenSpec's precedence-with-provenance output and its explicit refusal to guess a store by name as design references.

### Gaps / Missing Context

- **OpenSpec agent coverage:** the README names Codex and "30+ AI assistants" but does not explicitly confirm Claude Code or Gemini CLI on the page fetched. I did not open the full list of assistants.
- **OpenSpec release cadence:** the Releases section did not render, so I could not check it. Stores are described as shipping in 1.5 (beta).
- **OpenSpec and worktrees:** the stores guide does not mention worktrees. That parallel checkouts of one store are blocked is my reading of the "one checkout per store id per machine" line, not a documented workflow.
- **direnv in non-interactive shells:** the README fetch did not mention `direnv exec` or non-interactive use, so whether agent runtimes would ever trigger it is unconfirmed. The direnv.net homepage would not resolve in this session. To fetch it, direnv.net needs to be allowed in the session's network settings.
- **Jujutsu (`jj workspace add` / `jj workspace root`):** this looked like a relevant model of named working copies on one repo with a CLI that reports the root. But man.archlinux.org would not resolve in this session (it needs to be allowed in the network settings), so I could only see search snippets and left it out of the table. I stopped trying further hosts after two lookups failed.
- **gwm (`gwm-cli`, a Rust git-worktree manager with a multi-repo "workspace" mode and worktrees under `~/cc-worktree/<repo>/`):** I saw only docs.rs search snippets, never fetched it, and left it out of the table.
- **Not covered:** Nx/Terraform workspaces, Obsidian/Dendron vault resolvers, and XDG-state CLI resolvers, beyond OpenSpec's own XDG registry.

Sources: [OpenSpec repo](https://github.com/Fission-AI/openspec), [OpenSpec Stores user guide](https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/stores-beta/user-guide.md), [openspec.dev stores docs](https://openspec.dev/docs/stores), [Spec Kitty on PyPI](https://pypi.org/project/spec-kitty-cli/), [direnv repo](https://github.com/direnv/direnv), [jj workspace man page (snippet only)](https://man.archlinux.org/man/jj-workspace.1.en), [gwm-cli (snippet only)](https://docs.rs/crate/gwm-cli/1.6.0/source/docs/index.md).

### In-House Alternatives Already Rejected

The earlier phase-1 proposal considered and rejected these, and the survey was asked not to rediscover them:

| Alternative | Why not |
|---|---|
| One store `git worktree` per spec | The prompts name the store's main checkout, so workers write to the wrong tree; fixing that needs run-time resolution anyway, and then a project store is simpler than branch-per-spec. |
| A marker file found by walking up from the current directory | It is exactly the inference the engraved rule forbids, and forge's current directory is the code worktree, so forge would still need the artifact to declare its project. |
| A per-session `SMITHY_ROOT` environment variable | IDE and agent-deck launches do not reliably carry a per-session environment. |
| A repo-mode install launched from the coordination worktree | Forge then resolves `specs/` against the code repo, and a hand-typed `/smithy.mark` inside a code repo silently writes specs there. |
| A per-project repo key chosen at install time | One user-level install serves every session, so two projects cannot have two prefixes at once. |

## Assumptions
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- [Critical Assumption] The scope covers engraved records and status discovery, not only planning artifacts: one resolver serves every level and every reader, and only where records live changes. The engraved record schema, its edges, and its levels are untouched.
- [Critical Assumption] `master` is the baseline this PRD describes. The phase-1 branch (PR #610) is a stopgap: its user-facing surfaces may survive, its mechanism is superseded, and the merge-order choice is SD-001.
- [Critical Assumption] A CLI commit operation on its own retires only the index-lock and no-push rules of the parallel-cut preamble. The remaining rules (edit only your own Dependency Order row, reserved debt-id ranges) stay unless SD-002 resolves to include them.
- The engraving is absolute: the fixed home-anchored engraved roots come back from the CLI like every other location, so there are no exceptions to ledger. The user store stays unmanaged by any manifest, and every path the CLI prints is in portable tilde form.
- The single 2026-11-01 incident is the evidence. How often parallel or multi-repo workstreams collide, and what an incident costs, is unmeasured; the bet rests on the structural argument that one owner of location removes the class of failure, not on a frequency estimate.
- No external tools were named by the operator; the survey found one close analogue (OpenSpec Stores) and the in-house alternatives the earlier proposal rejected are listed above as already considered.
- Gemini CLI, which has no sub-agents, gets identical location behaviour through its inline path.

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

| ID | Title | Source Category | Impact | Confidence | Origin |
|----|-------|-----------------|--------|------------|--------|
| SD-001 | phase-1-pr-610-supersede-or-build-on | Solution Intent | High | Medium | local |
| SD-002 | intra-project-concurrency-in-scope | Scope Edges | Medium | Medium | local |
| SD-003 | undeclared-project-write-fallback | Solution Intent | High | Medium | local |
| SD-004 | existing-store-migration-shape | Scope Edges | High | Medium | local |
| SD-005 | behaviour-without-smithy-binary | Solution Intent | High | Medium | local |

### SD-001 — phase-1-pr-610-supersede-or-build-on

Unresolved choice between landing PR #610 as-is and migrating off its prefix-substitution mechanism afterwards, closing it and building the model from `master`, or reworking the branch in place before merging. The choice decides whether `smithy root`'s prefix output, the `**Project**` header, and `--from` remain as compatibility surfaces users can observe.

### SD-002 — intra-project-concurrency-in-scope

Unresolved choice between including the proposal's other phase-3 tools (atomic single-cell edits of a Dependency Order row, story-scoped debt ids) and limiting scope to the CLI commit operation while orchestrators keep the rest of the parallel-cut preamble. Scoped debt ids would change the Specification Debt content model, which this PRD otherwise leaves untouched.

### SD-003 — undeclared-project-write-fallback

What should a planning write do when named project stores exist but no project is declared, by `--project` or by the input artifact? Unresolved choice between falling through to the install root with a warning (the phase-1 behaviour, which risks one project's specs scattering across two stores) and refusing the write with a message naming `--project`. Asking is ruled out by the one-shot contract.

### SD-004 — existing-store-migration-shape

Unresolved choice between reinterpreting today's repo-keyed and `default` stores in place (same paths, addressed as projects under reserved names, no files move) and physically importing them into named project stores through an explicit `project import` that rewrites Artifact cells and leaves a tombstone. `smithy update` cannot move them on its own, because it never moves user-authored artifacts or manages the home-level store.

### SD-005 — behaviour-without-smithy-binary

Should location-free templates work when no current `smithy` binary is on PATH, as for teammates of a repo-mode install who use committed prompts without installing Smithy? Unresolved choice between prompts carrying the in-repo layout as the logical-name default with the CLI call only redirecting when available, and every mode requiring the CLI and failing with an install message when it is absent. The first keeps the "repo-mode teams see no change" promise; the second is purer but breaks it.

## Open Questions
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- Whether Gemini CLI and Codex can grant one CLI location call and a CLI-mediated store commit without their permission files enumerating store paths per agent, as they do today. This needs a probe against each runtime, in the way the context-fork evaluation probed Claude Code, before the RFC fixes the permission shape.
- Whether forge's run-time inputs (a tasks path handed to it by an orchestrator) are enough for it to commit progress to the right store from any worktree, or whether the tasks file itself must carry a store identity. The answer depends on SD-001 and should be settled by an experiment on the phase-1 branch.

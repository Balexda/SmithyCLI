# Feature Map: Workspace Location Contract and Read Path

**Source RFC**: `docs/rfcs/2026-002-planning-artifact-location/planning-artifact-location.rfc.md`
**Milestone**: 1 — Workspace Location Contract and Read Path
**Created**: 2026-11-15

## Features
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

Terms used below: an **in-repo install** keeps planning artifacts in the repository and an **out-of-repo install** keeps them in a store under `~/.smithy/`. Neither is the engraved `repo` level, which names the scope of a record. A **named project store** is a directory under `~/.smithy/projects/` other than the reserved ones.

### Feature 1: Declared Project Resolution

```yaml
kind: backend
```

**Description**: The CLI decides which project is in play from declared inputs only: the invocation's `--project` or the input artifact's `**Project**` header. Every case it cannot answer comes back as a named outcome, so no caller keeps a project rule of its own.

**User-Facing Value**: A maintainer running several workstreams gets the same project answer from every command and every working directory, and a wrong or missing declaration is refused with a message instead of landing work in the wrong store.

**Scope Boundaries**:
- Includes:
  - the working directory's name never deciding the project;
  - a project existing exactly when its directory exists under `~/.smithy/projects/`;
  - refusing an invalid slug with a message naming the problem;
  - a fixed set of reserved store names (`default`, plus one new name for the repo-keyed store) refused as user project slugs, which ends today's acceptance of `--project default`;
  - listing named project stores by name, and picking none, when no project is declared and several exist;
  - refusing, and naming both values, when `--project` and the `**Project**` header disagree;
  - reading the `**Project**` header from an input artifact;
  - one shared definition of the project helpers that planning status and engraved status both use;
  - retiring today's implicit pick of a lone named project store, subject to SD-001.
- Excludes: mapping a project to locations (Feature 2); reaching today's repo-keyed and `default` stores through their reserved names (Milestone 4); any project registry; any working-directory or walk-up signal.

### Feature 2: Workspace Location Query

```yaml
kind: backend
```

**Description**: One CLI call per run returns every logical place the run may touch, each with its concrete location in portable tilde form and the rule that chose it. The answer applies Feature 1's project decision and reports edge cases as outcomes, never as guesses.

**User-Facing Value**: A command, an orchestrator, or a person debugging a run asks once where things live and sees why, instead of reconstructing precedence from prompt text and several lookup orders.

**Scope Boundaries**:
- Includes:
  - planning places, and engraved places at the user, repo and project levels;
  - a declared project's store at `~/.smithy/projects/<slug>/`, belonging to no repository and identical from every repository in the project;
  - the install's own store reported at the path it has today;
  - a form of the query that takes an input artifact and resolves from what it declares;
  - the answer for a write with no declared project on an out-of-repo install: the install's own store when no named project stores exist, and a refusal naming `--project` when they do; an in-repo install's undeclared write always resolves to the repository;
  - a missing store reported absent and never created;
  - a normal answer for a store that is not a git repository;
  - a code worktree resolving to the same store as its main checkout;
  - a machine-readable answer whose vocabulary of logical places, rules, refusals and candidate lists is fixed for Milestone 3 to build on;
  - the layout of a named project store, with planning places and project-level engraved records side by side at its root.
- Excludes: writing or committing to a store (Milestone 2); any prompt or template that calls the query (Milestone 3); addressing today's repo-keyed and `default` stores under reserved names (Milestone 4); asking the user anything.

### Feature 3: Status on the Location Answer

```yaml
kind: backend
```

**Description**: `smithy status` and `smithy status --engraved` take their locations and their project from the location query, and neither keeps a lookup order of its own. Planning status gains `--project`, which today works only with `--engraved`.

**User-Facing Value**: The two inventories can no longer point at different stores for the same invocation, a maintainer can ask for the status of one named workstream, and teams with in-repo installs see the output they see today.

**Scope Boundaries**:
- Includes:
  - retiring planning status's first-non-empty fallback across the repository, the repo-keyed store and the shared `default` store;
  - `--project` accepted without `--engraved`, showing the declared project's planning artifacts;
  - engraved status taking all three levels from the query's answer;
  - refusals, candidate lists and absent stores shown as the query reports them;
  - in-repo installs producing identical text and JSON output before and after for both inventories, including in a directory that is not a git repository, checked against output captured from `master`. The exceptions are the outcomes Feature 1 introduces (invalid-slug refusal, reserved-name refusal, candidate listing with two or more named stores, and refusal when `--project` and `**Project**` disagree), and the exactly-one-named-store case, which SD-001 governs.
- Excludes: changes to how artifacts are parsed or how dependency order is computed; the `smithy.status` skill's prompt text (Milestone 3); showing the contents of today's `default` store to out-of-repo installs under a reserved name (Milestone 4).

### Feature 4: Engraved Recall on the Declared Project Rule

```yaml
kind: backend
```

**Description**: Engraved recall resolves the project by the same declared-only rule the query applies and scans the same locations. The prompt-side project rule shrinks to one shared statement that no longer counts stores or restates the CLI's precedence.

**User-Facing Value**: A planning command's recall and `smithy status --engraved` name the same records for the same invocation, so a maintainer is never planning against a different rule set than the one the CLI reports.

**Scope Boundaries**:
- Includes:
  - the one shared project-resolution text dropping its "exactly one named store" step and taking its artifact-side signal from the `**Project**` header;
  - that same edit reaching `smithy.engrave` and the inline recall path used where no sub-agent is available, as intended;
  - in-repo prompts keeping fixed repository paths and gaining no CLI call;
  - confirming that recall's existing scan-roots input can carry the query's engraved locations unchanged;
  - recall's scanned levels and locations matching the query's answer for the same declared inputs;
  - removing the clash between the `**Project**` artifact header and the same label on recall's dispatch field.
- Excludes: planning commands calling the query and handing recall its answer on out-of-repo installs (Milestone 3, subject to SD-002); removing `{{artifactsRoot}}` sites and the shared location fragment (Milestone 3); any change to the engraved record schema, edges or levels.

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

| ID | Title | Source Category | Impact | Confidence | Origin |
|----|-------|-----------------|--------|------------|--------|
| SD-001 | repo-mode-implicit-project-vs-parity | Integration Points | High | Medium | local |
| SD-002 | recall-consumption-out-of-repo-in-m1 | Scope Within the Milestone | High | Medium | local |

### SD-001 — repo-mode-implicit-project-vs-parity

The Milestone 1 criterion "Only declared inputs decide which project is in play" says only `--project` and the `**Project**` header decide the project. The criterion "Repo-mode installs see identical status, engraved status and recall output before and after" says that output stays identical. Today a repo-mode install with exactly one named dir under `~/.smithy/projects/` gets a project level by auto-pick, and the prompt rule also honours a legacy `project:` field. Which way? (a) Drop both auto-pick and `project:` everywhere; parity is measured only for invocations that declare a project or have no named stores. (b) Keep auto-pick and `project:` in repo mode only, so repo mode keeps a second project rule. (c) Read `project:` as an alias for `**Project**` and drop auto-pick everywhere.

### SD-002 — recall-consumption-out-of-repo-in-m1

What does the Milestone 1 criterion "Status, engraved status and engraved recall return the same locations as the query" require of M1 on out-of-repo installs? (a) The same rule and the same roots now, with recall literally consuming the query's answer deferred to M3's template rewrite. (b) M1 edits the five planning commands so the parent calls the query and fills recall's Scan roots. (c) M1 edits only the recall sub-agent so it calls the query itself on out-of-repo installs, with no change to the planning commands. The choice decides whether F4 is a snippet-only feature or also touches dispatch templates. It also decides whether the out-of-repo render of the project-resolution text points at the query's answer in M1, or whether both renders carry the same declared-only prose rule until M3, as option (a) implies.

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

Recommended specification sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| F1 | Declared Project Resolution | — | — |
| F2 | Workspace Location Query | F1 | — |
| F3 | Status on the Location Answer | F2 | — |
| F4 | Engraved Recall on the Declared Project Rule | F2 | — |

F3 and F4 touch disjoint surfaces (the status command and the recall prompt text) and can be specced and cut in parallel once F2's answer vocabulary is fixed. Two milestone criteria pass only when all four features have landed: status, engraved status and recall matching the query, and in-repo output staying identical.

## Cross-Milestone Dependencies
<!-- audience: reviewer; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| Milestone 3: Location-Free Templates | depended upon by | Builds on Feature 2's answer vocabulary, and replaces the interim project-resolution text Feature 4 leaves in out-of-repo prompts with the query call; in-repo prompts keep Feature 4's short prose rule. |
| Milestone 4: Existing-Store Continuity | depended upon by | Reuses Feature 1's reserved-name set to make today's repo-keyed and `default` stores reachable. Between this milestone and that one, out-of-repo installs lose sight of the `default` store and of artifacts still in the repository, because Feature 3 retires the fallback that found them. |

Milestone 2 (CLI-Mediated Store Commit) takes an explicit store and shares no dependency with this milestone in either direction.

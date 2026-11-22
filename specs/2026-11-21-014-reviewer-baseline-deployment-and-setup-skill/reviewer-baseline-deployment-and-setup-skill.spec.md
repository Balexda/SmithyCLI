# Feature Specification: Reviewer Baseline Deployment and Setup Skill

**Spec Folder**: `2026-11-21-014-reviewer-baseline-deployment-and-setup-skill`
**Branch**: `feature/review-config-deploy`
**Created**: 2026-11-21
**Status**: Draft
**Input**: User description — deploy the baseline (Smithy-general) automated-reviewer configuration for Copilot, Codex, and CodeRabbit through `smithy init` / `update` / `uninit`, so a repository extends a maintained baseline instead of hand-copying it; and add a deployed skill that helps an agent manage Smithy configuration, including extending the auto-review rules and the existing user-level state under `~/.smithy`. Background: GitHub issue #622 ("A reviewer target for `smithy init`" and "The general layer as templates" scope areas), `docs/reviewer-instructions.md`, and the hand-placed installs in this repository and Balexda/March.

## Overview
<!-- audience: reviewer; mode: explanation; length: 3-6 paragraphs; diagram: optional; examples: discouraged -->

Copilot, Codex, and CodeRabbit read instruction files from the repository
they review. This repository splits those files into two layers. The
**baseline** holds `smithy.*` instruction files, `smithy-*` review skills, the
general rules Codex reads from `AGENTS.md`, and the CodeRabbit entries that
point at them. It says how Smithy artifacts and Smithy-pipeline pull requests
work in any repository. The **repository layer** holds everything else: that
repository's own rules. The baseline was written to be deployed elsewhere
unchanged, but nothing deploys it. Today it reaches another repository only by
hand-copying.

Hand-copying has already failed. The baseline copies in Balexda/March lack two
rules added here since: the bar for what is worth posting, and how to read an
empty debt section. Every future rule change will widen that gap. A reviewer
reading a stale copy repeats the misfires the rules were written to stop.

This feature makes the baseline a Smithy deliverable like the prompt
templates. `smithy init` deploys it into a repository, `smithy update`
refreshes it, and `smithy uninit` removes it. Smithy owns exactly what it
ships: three whole files, one marked block in `AGENTS.md`, and the CodeRabbit
entries whose paths carry the reserved prefix. The repository keeps everything
else and extends the baseline beside it, never inside it.

The second half is a deployed `smithy.setup` skill. An agent asked to change
how Smithy is installed, to add a repository review rule, or to find where
user-level Smithy state lives currently has to reverse-engineer CLI flags and
file conventions. The skill gives it the procedure. It drives the CLI rather
than editing manifests, and it applies the same shape rules this repository's
reviewer tests enforce, so a rule a repository adds is one its reviewers
actually load.

## Clarifications
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

### Session 2026-11-21

| Question | Answer |
|----------|--------|
| What does the skill do with `~/.smithy` configuration? | Manage the state that already exists there. No new user-level config file is introduced. |
| Is the reviewer baseline deployed by default? | Yes when deploying to a repository. No when deploying outside one (user location). |
| What is the skill called? | `smithy.setup`. |
| How are SmithyCLI's own deployed baseline copies treated? | They are an exception to the snapshot-drift rule and are kept in byte parity with the source. |

- _SmithyCLI's own `## Code Review Rules` section in `AGENTS.md` is restructured: the general rules move inside the managed block, which must match the source byte for byte, and the repository-only rules stay outside it. This extends the parity exception to the block._ `[Critical Assumption]`
- _Before overwriting a baseline file, update reports any file whose bytes differ from the new baseline. No content hashes are stored, so a file made stale by an older Smithy version is reported the same way as one edited by hand, and the wording says "differed from the shipped baseline" rather than claiming a user edit._ `[Critical Assumption]`
- _The `smithy.setup` description is framed around installing and configuring Smithy and contains no review vocabulary, because Copilot catalogs `.claude/skills/` and `.agents/skills/` and may load a skill whose description fits a review._ `[Critical Assumption]`
- _The `AGENTS.md` block text has one source, shipped with the baseline and copied verbatim. It carries the general rules (review against the plan; begin with "Steering question:"; read the planning instruction file and skill before commenting on an artifact) plus a pointer to the deployed files._
- _A review skill's CodeRabbit entry takes the `applyTo` of each instruction file that names it, one entry per sender._
- _When owned CodeRabbit entries are absent they are inserted together at the start of `filePatterns`. Existing owned entries are rewritten in place, and entries outside the owned prefixes are never reordered._
- _Uninit removes the marked block and deletes `AGENTS.md` only when nothing but whitespace would remain._
- _The reviewer baseline is independent of which agents are deployed, including a Gemini-only install._
- _`smithy update` takes no option flags. Turning the baseline on or off after install means re-running `smithy init --reviewers` or `--no-reviewers`. Turning it off removes everything Smithy owns, as uninit would._

## Artifact Hierarchy
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| Level | Lineage |
|-------|---------|
| RFC | None — direct feature description (issue #622 is the design context) |
| Feature | Reviewer Baseline Deployment and Setup Skill |
| Children | US1–US7 below; none cut yet |

## User Scenarios & Testing *(mandatory)*
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: optional -->

### User Story 1: Deploy the Baseline Reviewer Files (Priority: P1)

As a maintainer of a repository that uses Smithy, I want `smithy init` to
install the baseline reviewer instruction files and review skill, and `update`
and `uninit` to refresh and remove them, so that my reviewers always read the
current Smithy-general rules without my copying them by hand.

**Why this priority**: This is the core of the feature and fixes the drift on
its own. Copilot reads the three files with no further registration.

**Independent Test**: Run `smithy init --reviewers -y` in a fresh repository,
confirm the three files exist with the baseline's bytes and are listed in the
manifest, change the baseline source, run `smithy update`, confirm the files
changed, run `smithy uninit`, and confirm they are gone.

**Acceptance Scenarios**:

1. **Given** a fresh repository and a repo-location init with no reviewer flag, **When** `smithy init -y` runs, **Then** `.github/instructions/smithy.review-stance.instructions.md`, `.github/instructions/smithy.planning-artifacts.instructions.md`, and `.github/skills/smithy-review-planning/SKILL.md` are written byte-identical to the shipped baseline, and the manifest records them and records the reviewer setting as on.
2. **Given** an interactive repo-location init, **When** the reviewer question is reached, **Then** it defaults to yes, and answering no deploys none of the files and records nothing.
3. **Given** `--no-reviewers`, **When** init runs at repo location, **Then** no baseline file is written and the manifest omits the reviewer setting.
4. **Given** a user-location init with no reviewer flag, **When** it runs, **Then** no baseline file is written anywhere and a one-line note says the reviewer baseline is per-repository.
5. **Given** a repository with the baseline deployed, **When** a newer Smithy ships changed baseline text and `smithy update` runs, **Then** each file is rewritten to the new baseline, each file whose previous bytes differed from the new baseline is named in the output, and a file the newer baseline no longer ships is removed.
6. **Given** a manifest written before this feature (no reviewer setting), **When** `smithy update` runs, **Then** no baseline file is written.
7. **Given** a repository with the baseline deployed, **When** `smithy init --no-reviewers` runs, **Then** the baseline files are removed and the manifest no longer records the setting.
8. **Given** a repository with the baseline deployed, **When** `smithy uninit` runs, **Then** the three files are removed, empty directories Smithy created are pruned, and repository-layer files in the same directories are untouched.
9. **Given** any deployed baseline file, **When** its frontmatter is read, **Then** `applyTo`, `excludeAgent`, `name`, and `description` are exactly as in the source.

---

### User Story 2: Register the Baseline with CodeRabbit (Priority: P1)

As a maintainer whose repository uses CodeRabbit, I want Smithy to keep the
baseline's entries in `.coderabbit.yaml` while leaving my own entries,
comments, and settings alone, so that CodeRabbit applies the baseline to the
paths it governs instead of only inside `.github/instructions/`.

**Why this priority**: Without the entries CodeRabbit scopes the deployed
files wrongly. Both P1 stories ship in the first release.

**Independent Test**: With the baseline deployed, run init against a
repository whose `.coderabbit.yaml` has a header comment, `inheritance: true`,
and two repository entries, and diff the result: only the owned entries
differ.

**Acceptance Scenarios**:

1. **Given** the baseline is on and no `.coderabbit.yaml` exists, **When** init runs, **Then** the file is created with `inheritance: true`, code guidelines enabled, and one owned entry per baseline instruction file and per sender of each baseline skill.
2. **Given** an existing `.coderabbit.yaml` with comments, other keys, and repository entries, **When** init or update runs, **Then** the owned entries are added or rewritten and every byte outside them is unchanged.
3. **Given** a baseline file's `applyTo` changes in a newer Smithy, **When** update runs, **Then** its owned entry carries the new `applyTo`, read from the file's own frontmatter.
4. **Given** a repository entry whose `files` path begins with `.github/skills/smithycli-` or any prefix other than the two owned prefixes, **When** init, update, or uninit runs, **Then** that entry is never modified or removed.
5. **Given** a `.coderabbit.yaml` that cannot be parsed, or whose `filePatterns` is not a block sequence, **When** init or update runs, **Then** the file is left byte-identical and the output lists each owned entry that is missing or differs.
6. **Given** the baseline is deployed, **When** uninit runs, **Then** the owned entries are removed, and the file is deleted only when nothing but Smithy-written keys would remain.

---

### User Story 3: Maintain the General Review Rules in AGENTS.md (Priority: P1)

As a maintainer whose repository is reviewed by Codex, I want the
Smithy-general review rules kept in a marked block in `AGENTS.md`, so that
Codex, which reads only that file, gets the same baseline as the other
reviewers, and my own rules around the block stay mine.

**Why this priority**: Codex reads nothing under `.github/`. Without the block
the baseline reaches two of the three reviewers.

**Independent Test**: Deploy into a repository whose `AGENTS.md` has a
`## Code Review Rules` heading and a repository bullet, confirm the block
appears under the heading and the bullet is untouched, re-run init, and
confirm the file is byte-identical.

**Acceptance Scenarios**:

1. **Given** an `AGENTS.md` with a `## Code Review Rules` heading and no markers, **When** init runs with the baseline on, **Then** one `<!-- smithy:review:begin -->` / `<!-- smithy:review:end -->` block holding the baseline rules is inserted directly under the heading.
2. **Given** an `AGENTS.md` with no such heading, **When** init runs, **Then** the block, preceded by the heading, is appended to the end of the file.
3. **Given** no `AGENTS.md`, **When** init runs, **Then** the file is created holding only the heading and the block.
4. **Given** exactly one marker pair, **When** init or update runs, **Then** only the text between the markers is replaced, and a second run produces a byte-identical file.
5. **Given** malformed or duplicated `smithy:review` markers, **When** init, update, or uninit runs, **Then** the file is left unchanged and a warning names the problem.
6. **Given** an `AGENTS.md` that also holds the `smithy:engraved` block, **When** init runs, **Then** the engraved block is unchanged.
7. **Given** the baseline is deployed, **When** uninit runs, **Then** the block and its markers are removed, the heading is removed only if Smithy added it and nothing else is under it, and the file is deleted only when nothing but whitespace would remain.

---

### User Story 4: Adopt a Hand-Copied Baseline (Priority: P2)

As a maintainer of a repository that already holds a hand-copied baseline, I
want the first `smithy init` with the baseline on to take ownership of those
copies without duplicating or deleting my text, so that I can move to the
maintained baseline in one step.

**Why this priority**: The motivating repositories, this one and Balexda/March,
are in this state. A fresh repository never is, so the P1 stories stand
without it.

**Independent Test**: Run init against a copy of a repository whose
`.github/` baseline files are stale hand copies, whose `.coderabbit.yaml`
lists them by hand, and whose `AGENTS.md` repeats the general rules without
markers. Confirm the files are replaced and tracked, the YAML holds no
duplicate entries, and the output names the probable duplicate lines in
`AGENTS.md`.

**Acceptance Scenarios**:

1. **Given** baseline-named files that exist but are not in the manifest, **When** init runs with the baseline on, **Then** they are overwritten with the baseline, recorded in the manifest, and named in the output as adopted.
2. **Given** hand-written entries for baseline files in `.coderabbit.yaml`, **When** init runs, **Then** they are treated as owned entries and rewritten in place, so no file is listed twice.
3. **Given** an `AGENTS.md` that states general baseline rules outside any marker, **When** init inserts the block, **Then** the output names the lines that probably duplicate the block, and no line outside the markers is changed or deleted.

---

### User Story 5: Change Installed Options Through the Setup Skill (Priority: P2)

As a developer working with an agent, I want to ask in plain language to
change how Smithy is installed (agents, location, permissions, toolchains,
session titles, artifact location, reviewer baseline), so that the agent
reports the current settings and runs the right `smithy` command instead of
guessing flags or editing the manifest.

**Why this priority**: It is the documented way to switch the reviewer
baseline on or off after install, and it makes every existing option
reachable from an agent session.

**Independent Test**: In a repository with a manifest, ask the agent to "stop
deploying Gemini and turn off the reviewer baseline", and confirm it reports
the current settings, proposes the one `smithy init` command that changes only
those two settings, and runs it on approval.

**Acceptance Scenarios**:

1. **Given** a repository with a manifest, **When** the skill is used, **Then** the agent reports the stored settings from the manifest before proposing any change.
2. **Given** a requested change, **When** the agent acts, **Then** it runs `smithy init` with flags that reproduce every unchanged stored setting plus the requested change, and never edits the manifest directly.
3. **Given** a request to refresh templates without changing settings, **When** the agent acts, **Then** it runs `smithy update`.
4. **Given** a request to turn on the reviewer baseline for a user-location install, **When** the agent acts, **Then** it explains that the baseline is per-repository and follows whatever the CLI does for that case.

---

### User Story 6: Extend the Repository's Review Rules Through the Setup Skill (Priority: P2)

As a maintainer, I want an agent to add a repository-specific review rule as a
correctly shaped instruction file or review skill, registered everywhere my
reviewers look, so that the rule is loaded by every reviewer and no Smithy
update can overwrite it.

**Why this priority**: Extending the baseline is the other half of the
two-layer design. Without it every repository rediscovers the shape rules by
trial and error, and a malformed file is silently ignored by its reviewer.

**Independent Test**: Ask the agent to add a review rule for `infra/**`, and
confirm a new instruction file with a non-reserved name and a narrow
`applyTo`, a matching `.coderabbit.yaml` entry outside the owned entries, and
an `AGENTS.md` pointer outside the marked block, all of which pass the shape
checks.

**Acceptance Scenarios**:

1. **Given** a request to add a rule, **When** the agent writes it, **Then** the file name does not begin with the reserved `smithy.` or `smithy-` prefixes and the file passes every shape rule (see Requirements).
2. **Given** a new instruction file or review skill, **When** the agent registers it, **Then** `.coderabbit.yaml` gains one entry outside the owned entries whose `applyTo` is copied from the file (or from each instruction file that sends a reviewer to the skill).
3. **Given** a rule Codex should see, **When** the agent registers it, **Then** a pointer bullet is added to `## Code Review Rules` outside the marked block.
4. **Given** a request to change a baseline rule, **When** the agent responds, **Then** it does not edit a `smithy.*` or `smithy-*` file or the marked block, and instead adds a repository-layer rule or says the change belongs upstream in Smithy.
5. **Given** an existing rule that is mechanical (checkable by a test or lint), **When** the agent is asked to add it, **Then** it says so before writing a reviewer rule.

---

### User Story 7: Locate and Manage User-Level Smithy State (Priority: P3)

As a developer, I want an agent to tell me what Smithy keeps under `~/.smithy`
and how each piece is changed, so that I can find and adjust user-level state
without expecting a config file that does not exist.

**Why this priority**: It is a lookup over state that already exists, and it is
needed only when someone asks.

**Independent Test**: Ask the agent "where is my Smithy config?" on a machine
with a user-location install, orders templates, and an external artifact
store, and confirm it lists each surface that is present, says which are
absent, and names the command or file each is changed through.

**Acceptance Scenarios**:

1. **Given** any machine, **When** asked about user-level configuration, **Then** the agent lists the user-location manifest and deployment, the orders body templates, the user-level engraved stores, and the external artifact stores, marking which exist.
2. **Given** a request to change one of them, **When** the agent acts, **Then** it routes through the owning mechanism: `smithy init --location user` for the user deployment, editing the orders template file for issue bodies, `smithy.engrave` for engraved records.
3. **Given** a question that assumes a Smithy config file, **When** the agent answers, **Then** it says no such file exists and does not create one.

### Edge Cases

- `.coderabbit.yaml` exists but has no `knowledge_base` key: the owned entries are added under a new `knowledge_base.code_guidelines` mapping without touching other keys.
- `.coderabbit.yaml` uses flow-style `filePatterns`: report-only, file unchanged (US2 scenario 5).
- A repository file is named with a prefix that only resembles the reserved one (`smithycli-review-templates`): never owned (US2 scenario 4).
- The repository's own rule files still point a reviewer at a baseline skill after uninit: uninit lists those references and leaves the files alone.
- Artifacts live in an external store: the baseline still deploys; its suffix-scoped `applyTo` globs match nothing in pull requests and cost nothing.
- A baseline file was deleted by hand between deploys: update rewrites it.
- `-y` init in a repository that never used these reviewers: the baseline deploys (the default), and the summary names every file written so the change is visible.
- Two `smithy:review` marker pairs: malformed, file unchanged (US3 scenario 5).

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| US1 | Deploy the Baseline Reviewer Files | — | — |
| US7 | Locate and Manage User-Level Smithy State | — | — |
| US2 | Register the Baseline with CodeRabbit | US1 | — |
| US3 | Maintain the General Review Rules in AGENTS.md | US1 | — |
| US5 | Change Installed Options Through the Setup Skill | US1 | — |
| US4 | Adopt a Hand-Copied Baseline | US1, US2, US3 | — |
| US6 | Extend the Repository's Review Rules Through the Setup Skill | US2, US3 | — |

## Requirements *(mandatory)*
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: recommended -->

### Functional Requirements

**Baseline source and deployment**

- **FR-001**: The baseline MUST have exactly one source in Smithy's shipped templates: the three whole files and the `AGENTS.md` block text. Deployment copies them verbatim, with no per-agent rendering. (US1, US3)
- **FR-002**: `smithy init` MUST accept `--reviewers` / `--no-reviewers`. At repo location the default is on, both interactively (question defaults to yes) and under `-y`. At user location the default is off. (US1)
- **FR-003**: The reviewer setting MUST be persisted in the manifest, omitted when off so earlier manifests stay byte-identical, and replayed by `smithy update`. A manifest without it means off. (US1)
- **FR-004**: The deployed baseline whole files MUST be recorded in the manifest under a reviewer key distinct from every agent key, so stale-file cleanup and uninit treat them like any other deployed file. (US1)
- **FR-005**: Before overwriting a baseline whole file, init and update MUST name each file whose bytes differ from the new baseline. (US1, US4)
- **FR-006**: Re-running init with the baseline turned off MUST remove every Smithy-owned reviewer surface: whole files, owned CodeRabbit entries, and the marked block. (US1, US5)
- **FR-007**: Deployed baseline frontmatter MUST reach the target unchanged. (US1)
- **FR-008**: The baseline review skill MUST be deployed only under `.github/skills/`, never into an agent's skill tree, and no deployed agent skill may share its name. (US1)

**CodeRabbit registration**

- **FR-009**: Smithy MUST own exactly the `filePatterns` entries whose `files` value begins with `.github/instructions/smithy.` or `.github/skills/smithy-`, matched as exact prefixes including the trailing character. (US2, US4, US6)
- **FR-010**: Each owned entry's `applyTo` MUST be derived at deploy time from the deployed file's frontmatter, or for a skill from each instruction file that names it. It is never stored a second time. (US2)
- **FR-011**: Edits to `.coderabbit.yaml` MUST leave every byte outside owned entries unchanged. When the file is unparseable or its `filePatterns` is not a block sequence, Smithy MUST leave it byte-identical and report the missing or differing owned entries instead. On init and update, owned entries are reconciled against the expected set. Existing owned entries keep their positions and are rewritten in order to the expected set. Surplus owned entries are removed. Missing ones are inserted after the last owned entry, or at the start of `filePatterns` when none exist. (US2)
- **FR-012**: When the baseline is on and `.coderabbit.yaml` is absent, init MUST create it with `inheritance: true`, code guidelines enabled, and the owned entries. Uninit MUST delete it only when nothing but Smithy-written keys would remain. (US2)

**AGENTS.md block**

- **FR-013**: Smithy MUST maintain one `<!-- smithy:review:begin -->` / `<!-- smithy:review:end -->` block holding the baseline rules. It sits under `## Code Review Rules` when that heading exists, and otherwise is appended with the heading. When `AGENTS.md` is absent, Smithy creates the file with only the heading and the block. Creating the file is a deliberate departure from the engraved block's manage-existing-files-only rule. (US3)
- **FR-014**: Marker handling MUST follow the engraved block's rules: with no markers insert, with one pair replace between them, and with malformed or duplicated markers warn and leave the file unchanged. Repeat runs MUST be byte-identical, and the engraved block MUST be unaffected. (US3)
- **FR-015**: Uninit MUST remove the block and its markers, remove the heading only when Smithy added it and nothing else remains under it, and delete `AGENTS.md` only when nothing but whitespace would remain. (US3)

**Adoption**

- **FR-016**: Baseline-named files present but not in the manifest MUST be adopted: overwritten, recorded, and named in the output. (US4)
- **FR-017**: When inserting the block into an `AGENTS.md` that states baseline rules outside markers, init MUST name the probable duplicate lines and MUST NOT change or delete any text outside the markers. (US4)
- **FR-018**: Uninit MUST list repository-layer files that still reference a removed baseline file, without editing them. (US1, US4)

**Shape rules**

- **FR-019**: The reviewer-file shape rules MUST exist as one reusable check shared by SmithyCLI's own tests and by deployment reporting. The rules are: an instruction file has `applyTo`; `excludeAgent`, when present, is `code-review` or `coding-agent`; an instruction file, frontmatter included, is at most 4,000 characters; a skill's `name` matches its directory and is lowercase-hyphenated; a skill's description fits the skill description budget; the CodeRabbit config holds no rule text (no `instructions` or `*_instructions` key anywhere); `code_guidelines` is not disabled; every instruction file has exactly one entry, and every review skill has exactly one entry per sender instruction file (a repeated `files` value is allowed only with distinct `applyTo` values); an instruction file excluded from `code-review` has no entry; every review skill has at least one sender, and every skill an instruction file names exists; every listed `files` value is an existing rule file; and each entry's `applyTo` matches its file. (US2, US6)
- **FR-020**: Baseline content MUST name nothing that resolves only inside SmithyCLI: no SmithyCLI source paths, engraved-record IDs or paths, issue or pull-request numbers, or the repository name. The existing portability check MUST run against the baseline source. (US1, US3)

**Setup skill**

- **FR-021**: Smithy MUST deploy a model-invocable `smithy.setup` skill to every agent that receives skills. (US5, US6, US7)
- **FR-022**: The skill's description MUST stay within the skill description budget, be framed around installing and configuring Smithy, and contain no review vocabulary. (US5)
- **FR-023**: The skill MUST read current settings from the manifest and change them only through `smithy init` / `smithy update`, never by editing the manifest. (US5)
- **FR-024**: The skill MUST direct new review rules to non-reserved names, apply the FR-019 shape rules, register each rule in `.coderabbit.yaml` outside the owned entries and in `AGENTS.md` outside the marked block, and refuse to edit baseline files or the block. (US6)
- **FR-025**: The skill MUST describe the existing user-level surfaces and the mechanism that changes each, and MUST NOT create a user-level config file. (US7)
- **FR-026**: The skill body MUST stay a router. Procedure detail needed only for one job (extending review rules, the user-level surface map) lives in bundled reference files that the body links to and says when to read. (US5, US6, US7)

**SmithyCLI's own repository**

- **FR-027**: SmithyCLI's deployed baseline whole files and `AGENTS.md` block MUST match the source byte for byte, enforced by a test. This is an exception to the snapshot-drift rule, and the repository's deployed-snapshot guidance MUST say so. (US1, US3)
- **FR-028**: SmithyCLI's reviewer-layout documentation and architecture overview MUST describe the baseline as deployed by `smithy init` and stop describing it as hand-placed. The general "how to add a rule" procedure moves into the setup skill, and the documentation cites it. (US6)

### Key Entities

- **Reviewer Baseline**: The Smithy-owned set of three whole files plus the `AGENTS.md` block text, shipped with Smithy.
- **Reviewer Setting**: The persisted on/off choice for deploying the baseline.
- **Owned CodeRabbit Entry**: A `.coderabbit.yaml` `filePatterns` entry identified by an owned path prefix.
- **Review Rules Block**: The marked region of `AGENTS.md` Smithy owns.
- **Repository-Layer Rule File**: An instruction file or review skill the repository owns, named outside the reserved prefixes.
- **Shape Rule Set**: The checks a reviewer file must pass to be loaded.
- **User-Level Surface**: An existing piece of Smithy state under `~/.smithy`.

## Assumptions
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- The baseline content to ship is the current SmithyCLI copy of the three `smithy.*` / `smithy-*` files, which is newer than Balexda/March's.
- The baseline review skill already names the audit checklist neutrally for all three agents ("whichever of these exists"), so no per-agent rendering is needed.
- Reviewer file formats (`applyTo`, `excludeAgent`, `filePatterns`, `inheritance`) are as documented by the vendors on 2026-11-16 and may change. Deriving entries from file frontmatter keeps each change to one place.
- The `yaml` library already in the dependency set can edit a document while preserving comments.
- Smithy's `.coderabbit.yaml` entries for the baseline are the same in every repository, because the baseline scopes by artifact suffix, not by directory.

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

| ID | Title | Source Category | Impact | Confidence | Origin |
|----|-------|-----------------|--------|------------|--------|
| SD-001 | explicit-reviewers-at-user-location | Interaction & UX | Medium | Medium | local |

### SD-001 — explicit-reviewers-at-user-location

At user location the manifest lives under `~/.smithy`, so reviewer files would
resolve to `~/.github`, which no reviewer reads. What should an explicit
`--reviewers` do there? There are three choices: reject it with an error saying
the baseline is per-repository; accept it with a warning and deploy nothing; or
deploy into the target repository while the user-level manifest tracks the
files.

## Out of Scope
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- A deterministic artifact-structure check and its CI wiring, and a CLI command that runs the shape rules.
- Cross-cutting review packs: their format, selection, pinning, and upgrades.
- Projecting repository review rules from engraved records or authoring rules.
- Measuring reviewer effectiveness and the declined-finding feedback loop.
- Per-reviewer selection (choosing Copilot, Codex, and CodeRabbit separately).
- Deploying or managing `.github/copilot-instructions.md`, which is repository-layer orientation.
- A user-level Smithy config file or user-level defaults for init.
- Copilot approval settings, merge rules, and pull-request identity.

## Success Criteria *(mandatory)*
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

### Measurable Outcomes

- **SC-001**: After `smithy init` (baseline on, the repo-location default) in a repository with a stale hand-copied baseline (Balexda/March's state), its three baseline files are byte-identical to the shipped baseline, with zero manual copying.
- **SC-002**: Init followed by uninit on a repository with no prior `.github/`, `AGENTS.md`, or `.coderabbit.yaml` leaves none of those paths behind.
- **SC-003**: Init, update, and uninit on a repository with its own `.coderabbit.yaml` and `AGENTS.md` change zero bytes outside the owned entries and the marked block.
- **SC-004**: Running init twice in a row produces no diff.
- **SC-005**: Every file the setup skill adds when extending review rules passes the shared shape rules on the first attempt.
- **SC-006**: SmithyCLI's own baseline copies and `AGENTS.md` block show zero bytes of drift from the source on `master`, enforced in CI.
- **SC-007**: The `smithy.setup` description contains none of the words "review", "reviewer", or "pull request" and fits the skill description budget.

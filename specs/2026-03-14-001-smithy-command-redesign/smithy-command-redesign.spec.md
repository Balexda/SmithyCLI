# Feature Specification: Smithy Command Redesign

**Spec Folder**: `2026-03-14-001-smithy-command-redesign`
**Branch**: `2026-03-14-001-smithy-command-redesign`
**Created**: 2026-03-14
**Status**: Draft
**Input**: User description — redesign the smithy command structure to reduce cognitive load, establish consistent artifact hierarchy, and provide variably-scoped entry points.

## Clarifications

### Session 2026-03-14

- Q: What is the pipeline command sequence and naming? → A: `ignite → render → mark → cut → forge`. All names follow the forge/smithing metaphor. "mark" replaces the former "design"; "cut" replaces "refine"; "render" replaces "slice"/"trace".
- Q: What is the artifact hierarchy? → A: RFC → Milestone → Feature → User Story → Slice → Tasks. Six levels. "Capability" was collapsed into "Feature" since they mapped 1:1.
- Q: Where do artifacts live? → A: RFC + maps in `docs/rfcs/<YYYY-NNN-slug>/` (co-located). Specs + tasks in `specs/<YYYY-MM-DD-NNN-slug>/`. Strikes in `specs/strikes/`.
- Q: How do `.tasks.md` and `.strike.md` differ? → A: `.tasks.md` decomposes a single user story into slices (produced by `cut`, one file per story named `<NN>-<story-slug>.tasks.md`). `.strike.md` is self-contained with inline requirements, data model, contracts, and exactly one slice.
- Q: How do `orders` and `audit` determine behavior? → A: Both detect artifact type by file extension — no flags needed. Orders creates tickets representing the next pipeline step. Audit adapts its checklist per extension; on a forge branch with no file argument, it audits code changes using the slice and feature spec as context.
- Q: How does the review loop work? → A: Repeating a pipeline command on existing artifacts enters a refinement Q&A. `audit` is a separate independent review that does not modify the artifact.
- Q: What is the forge branch naming convention? → A: `<NNN>/us-<NN>-<slug>/slice-<N>` (e.g., `001/us-01-auth-flow/slice-1`). Keeps branches short and encodes full traceability back to spec, user story, and slice.

## Artifact Hierarchy

The smithy workflow operates on a strict hierarchy of planning abstractions:

| Level | Term | Description |
|-------|------|-------------|
| 1 | **RFC** | High-level proposal with problem statement, goals, and milestones |
| 2 | **Milestone** | A major deliverable phase within an RFC |
| 3 | **Feature** | A coherent unit of user-facing functionality within a milestone |
| 4 | **User Story** | A single user-facing scenario within a feature, decomposed by cut |
| 5 | **Slice** | A PR-sized chunk of work implementing part of a user story |
| 6 | **Tasks** | Individual implementation steps within a slice |

### Artifact Files

| Command | Produces | Location | Extension |
|---------|----------|----------|-----------|
| ignite | RFC with milestones | `docs/rfcs/<YYYY-NNN-slug>/` | `.rfc.md` |
| render | Feature map for a milestone | `docs/rfcs/<YYYY-NNN-slug>/` | `.features.md` |
| mark | Feature spec + data model + contracts | `specs/<YYYY-MM-DD-NNN-slug>/` | `.spec.md`, `.data-model.md`, `.contracts.md` |
| cut | Slices of tasks for a user story | `specs/<YYYY-MM-DD-NNN-slug>/` | `<NN>-<story-slug>.tasks.md` (one per user story) |
| forge | Pull request | GitHub | — |
| strike | Self-contained strike plan (fast track) | `specs/strikes/` | `.strike.md` (single slice, includes inline requirements/model/contracts) |

### Folder Structure

```
docs/rfcs/
  2026-001-my-idea/
    my-idea.rfc.md           ← ignite output
    milestone-1.features.md       ← render output
    milestone-2.features.md       ← render output

specs/
  2026-03-14-001-feature-a/
    feature-a.spec.md        ← mark output
    feature-a.data-model.md  ← mark output
    feature-a.contracts.md   ← mark output
    01-first-story.tasks.md  ← cut output (user story 1)
    02-second-story.tasks.md ← cut output (user story 2)

specs/strikes/
    2026-03-14-quick-fix.strike.md  ← strike output (self-contained, single slice)
```

## User Scenarios & Testing

### User Story 1 — Ignite: Workshop Broad Idea into RFC (Priority: P2)

As a developer with a broad idea, I want to interactively workshop it into a structured RFC with milestones so that I have a reviewable starting point for a large initiative.

**Why this priority**: Ignite is the highest-level entry point but the core loop (mark/cut/forge/strike) must work first. Ignite extends the pipeline upward once the foundation is solid.

**Independent Test**: Run `smithy.ignite "build a plugin system"` and verify it produces a well-structured `.rfc.md` with clearly defined milestones, asks clarifying questions, and writes to `docs/rfcs/`.

**Acceptance Scenarios**:

1. **Given** a broad idea description, **When** I run `smithy.ignite "description"`, **Then** the agent asks clarifying questions before producing an RFC.
2. **Given** an existing PRD-like document, **When** I run `smithy.ignite path/to/prd.md`, **Then** the agent workshops it into RFC format, identifying ambiguities.
3. **Given** an existing `.rfc.md` file, **When** I run `smithy.ignite` pointing at it, **Then** the agent reviews it for ambiguity and structural completeness (review loop).
4. **Given** a completed ignite session, **When** the RFC is written, **Then** it is saved to `docs/rfcs/<YYYY-NNN-slug>/<slug>.rfc.md` with milestones clearly delineated.

---

### User Story 2 — Render: Break Milestone into Features (Priority: P2)

As a developer with an approved RFC, I want to break a milestone down into a feature map so that I can see the discrete units of functionality I need to build.

**Why this priority**: Render depends on ignite output and extends the pipeline upward. Core loop must be solid first.

**Independent Test**: Point `smithy.render` at an RFC milestone and verify it produces a `.features.md` file listing features with descriptions, co-located with the RFC.

**Acceptance Scenarios**:

1. **Given** an RFC with milestones, **When** I run `smithy.render` pointing at a specific milestone, **Then** the agent interactively breaks it into features and writes a `.features.md` alongside the RFC.
2. **Given** an existing `.features.md`, **When** I run `smithy.render` again, **Then** the agent enters a review loop to refine the feature breakdown.
3. **Given** a milestone with overlapping concerns, **When** the agent identifies ambiguous feature boundaries, **Then** it asks clarifying questions before finalizing.

---

### User Story 3 — Mark: Specify a Feature (Priority: P1)

As a developer ready to build a feature, I want to produce a detailed feature specification so that implementation is well-scoped and reviewable before any code is written.

**Why this priority**: Mark is the second entry point into the system — usable both after render and standalone from a description. It produces the core artifact (spec) that cut and forge consume.

**Independent Test**: Run `smithy.mark "add webhook support"` and verify it produces `.spec.md`, `.data-model.md`, and `.contracts.md` in a properly named specs folder with a git branch.

**Acceptance Scenarios**:

1. **Given** a feature from a map, **When** I run `smithy.mark` referencing it, **Then** the agent produces a feature spec with user stories, requirements, and acceptance scenarios.
2. **Given** a standalone feature description, **When** I run `smithy.mark "description"`, **Then** the agent treats it as a mid-pipeline entry point and produces the same spec artifacts.
3. **Given** an existing spec, **When** I run `smithy.mark` again, **Then** the agent enters a review loop to refine the spec.
4. **Given** a feature that involves data, **When** the spec is produced, **Then** a `.data-model.md` with entities, relationships, and state transitions is included.
5. **Given** a feature that involves integration boundaries, **When** the spec is produced, **Then** a `.contracts.md` with interface definitions is included.
6. **Given** a feature with no data or integration needs, **When** the spec is produced, **Then** minimal placeholder `.data-model.md` and `.contracts.md` files are still created.

---

### User Story 4 — Cut: Slice a User Story into Tasks (Priority: P1)

As a developer with an approved feature spec, I want to cut a single user story into PR-sized slices of tasks so that I can implement incrementally with clear scope per PR.

**Why this priority**: Cut produces the direct input to forge — without it, there's no bridge from spec to implementation.

**Independent Test**: Point `smithy.cut` at a `.spec.md` and a specific user story number and verify it produces a `<NN>-<story-slug>.tasks.md` with multiple slices, each sized for a single PR.

**Acceptance Scenarios**:

1. **Given** a feature spec and a user story number, **When** I run `smithy.cut` referencing them, **Then** the agent produces a `<NN>-<story-slug>.tasks.md` with one or more slices, each containing ordered tasks.
2. **Given** a user story, **When** slices are generated, **Then** each slice is scoped to a single PR's worth of work with clear boundaries.
3. **Given** an existing `.tasks.md` for a user story, **When** I run `smithy.cut` again, **Then** the agent enters a review loop to refine slice boundaries and task details.
4. **Given** a user story, **When** slices are generated, **Then** each slice references which FRs and acceptance scenarios it addresses.
5. **Given** a feature spec with user stories numbered 01-99, **When** the tasks file is named, **Then** it uses zero-padded two-digit numbering (`01-`, `02-`, ...) for consistent sort order.

---

### User Story 5 — Forge: Implement a Slice as a PR (Priority: P1)

As a developer ready to implement, I want to take a slice from a tasks.md and forge it into a working pull request so that I can ship incrementally.

**Why this priority**: Forge is the terminal step — it's where planning becomes code.

**Independent Test**: Point `smithy.forge` at a specific slice in a `.tasks.md` and verify it creates a branch, implements the tasks, and opens a PR.

**Acceptance Scenarios**:

1. **Given** a slice from a tasks.md, **When** I run `smithy.forge` referencing it, **Then** the agent implements the tasks and creates a PR.
2. **Given** a slice with clear task ordering, **When** the agent implements, **Then** tasks are completed in order with tests passing at each step.
3. **Given** a completed forge, **When** the PR is created, **Then** it references the source spec and slice for reviewability.

---

### User Story 6 — Strike: Fast Track Idea to Implementation (Priority: P1)

As a developer with a straightforward idea, I want to go from idea to implementation in one session so that I don't pay the overhead of the full pipeline for simple changes.

**Why this priority**: Strike is the most-used command and the primary entry point for day-to-day work.

**Independent Test**: Run `smithy.strike "add verbose flag"` and verify it interactively plans, produces a `.strike.md` in `specs/strikes/`, and implements it.

**Acceptance Scenarios**:

1. **Given** a simple feature description, **When** I run `smithy.strike "description"`, **Then** the agent interactively plans and implements in one session.
2. **Given** a strike session, **When** the `.strike.md` is produced, **Then** it is self-contained (summary, requirements, data model, contracts, single slice, validation plan) and contains exactly one slice.
3. **Given** a strike session, **When** implementation begins, **Then** the agent asks clarifying questions before writing code (no YOLO).
4. **Given** a completed strike, **When** the `.strike.md` is written, **Then** it is saved to `specs/strikes/<YYYY-MM-DD>-<slug>.strike.md`.

---

### User Story 7 — Audit: Context-Aware Artifact Review (Priority: P2)

As a developer, I want to audit any smithy artifact and get a tailored review so that I can catch issues before they propagate downstream.

**Why this priority**: Audit is a quality gate but not on the critical path — the pipeline works without it, it just works better with it.

**Independent Test**: Run `smithy.audit` against each artifact type and verify the checklist adapts. Run it on a forge branch and verify it reviews code against upstream context.

**Acceptance Scenarios**:

1. **Given** a `.rfc.md` file, **When** I run `smithy.audit path/to/file.rfc.md`, **Then** the audit checks for ambiguity, milestone completeness, and feasibility.
2. **Given** a `.features.md` file, **When** I run `smithy.audit path/to/file.features.md`, **Then** the audit checks feature coverage, gaps, and overlap.
3. **Given** a `.spec.md` file, **When** I run `smithy.audit path/to/file.spec.md`, **Then** the audit checks requirement traceability, acceptance coverage, and data model consistency.
4. **Given** a `.tasks.md` file, **When** I run `smithy.audit path/to/file.tasks.md`, **Then** the audit checks slice scoping, testability, and edge case coverage.
5. **Given** a `.strike.md` file, **When** I run `smithy.audit path/to/file.strike.md`, **Then** the audit checks requirement completeness, slice scoping, validation plan coverage, and that data model/contracts sections are present.
6. **Given** I am on a forge branch implementing a slice, **When** I run `smithy.audit` without a file argument, **Then** the audit reviews the code changes using the slice and feature spec as context.
7. **Given** an audit finding, **When** the review is complete, **Then** findings are presented but the artifact is NOT modified (unlike repeat-command refinement).

---

### User Story 8 — Orders: Create Tickets from Artifacts (Priority: P3)

As a developer, I want to point `smithy.orders` at any artifact and have it create the appropriate GitHub tickets so that planning work is tracked without manual ticket creation.

**Why this priority**: Orders is a productivity accelerator but not blocking — developers can create tickets manually. Depends on the artifact conventions being stable first.

**Independent Test**: Run `smithy.orders` against each artifact type and verify it creates the correct ticket structure in GitHub.

**Acceptance Scenarios**:

1. **Given** a `.rfc.md` file, **When** I run `smithy.orders path/to/file.rfc.md`, **Then** one epic/tracking issue is created plus one issue per milestone (next step: render each).
2. **Given** a `.features.md` file, **When** I run `smithy.orders path/to/file.features.md`, **Then** one issue per feature is created, linked to the milestone issue if it exists (next step: mark each).
3. **Given** a `.spec.md` file, **When** I run `smithy.orders path/to/file.spec.md`, **Then** one issue per user story is created (representing the next step: running `cut` on each).
4. **Given** a `.tasks.md` file, **When** I run `smithy.orders path/to/file.tasks.md`, **Then** one issue per slice is created (representing the next step: running `forge` on each), linked to the user story issue if it exists.
5. **Given** an artifact type, **When** orders detects the type via file extension, **Then** no flags or mode arguments are required.

---

### Edge Cases

- Running `render` without an existing RFC — should prompt user to run `ignite` first or provide a milestone description inline.
- Running `mark` with both a feature reference from a map and a standalone description — feature reference takes precedence.
- Running `orders` on an artifact that already has tickets — should detect existing tickets and offer to update rather than duplicate.
- Running `forge` on a slice that's already been forged — should warn and confirm before proceeding.
- Running `audit` on a forge branch with no upstream spec artifacts — should still audit the code but note the missing context.
- Running `cut` on a spec with no user stories — should error with guidance to complete the spec first.
- Running `cut` with a user story number that doesn't exist in the spec — should error listing available user stories.
- A feature spec with more than 99 user stories — should error indicating the feature needs to be split.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST support five pipeline commands (`ignite`, `render`, `mark`, `cut`, `forge`) that operate on the artifact hierarchy.
- **FR-002**: The system MUST support four utility commands (`strike`, `audit`, `orders`, `fix`) that operate independently or across the hierarchy.
- **FR-003**: All pipeline commands MUST ask clarifying questions before producing artifacts (no YOLO).
- **FR-004**: All pipeline commands MUST enter a review/refinement loop when re-run against existing artifacts.
- **FR-005**: Artifact type MUST be identifiable by file extension (`.rfc.md`, `.features.md`, `.spec.md`, `.tasks.md`, `.strike.md`).
- **FR-006**: `ignite` output MUST be written to `docs/rfcs/<YYYY-NNN-slug>/`.
- **FR-007**: `render` output MUST be co-located with its source RFC in `docs/rfcs/<YYYY-NNN-slug>/`.
- **FR-008**: `mark` output MUST be written to `specs/<YYYY-MM-DD-NNN-slug>/` with spec, data-model, and contracts files.
- **FR-009**: `cut` operates on a single user story from a spec and MUST write its output as `<NN>-<story-slug>.tasks.md` in the same spec folder, where `<NN>` is the zero-padded user story number (01-99).
- **FR-010**: `strike` MUST produce a self-contained `.strike.md` with exactly one slice, including inline requirements, data model, contracts, and a validation plan.
- **FR-011**: `cut` output (`.tasks.md`) MUST reference its source spec artifacts and user story, contain slices as H2 sections numbered sequentially, each with FR/acceptance scenario traceability, a standalone goal, and ordered task checklists.
- **FR-012**: `audit` MUST adapt its checklist based on the artifact file extension.
- **FR-013**: `audit` on a forge branch (no file argument) MUST review code changes using the slice and feature spec as context.
- **FR-014**: `orders` MUST detect artifact type via file extension and create tickets at the appropriate hierarchy level.
- **FR-015**: `orders` MUST link child tickets to parent tickets when parent tickets exist.
- **FR-016**: The system MUST remove the following legacy commands: `slice`, `trace`, `load`, `design`, `refine`.

### Key Entities

- **RFC**: Top-level planning document containing problem statement, goals, and milestones.
- **Milestone**: A major deliverable phase within an RFC.
- **Feature**: A coherent unit of user-facing functionality within a milestone, specified with user stories, requirements, and acceptance criteria.
- **User Story**: A single user-facing scenario within a feature, the unit that `cut` operates on to produce a tasks file.
- **Slice**: A PR-sized chunk of implementation work within a user story.
- **Task**: An individual implementation step within a slice.

## Assumptions

- All commands will continue to be deployed as prompt templates via `smithy init`.
- The `command: true` frontmatter convention for Claude Code slash commands remains.
- GitHub CLI (`gh`) is available for `orders` and `forge` ticket/PR operations.
- The existing `specs/strikes/` convention for strike output is preserved.

## Out of Scope

- Implementation of individual command prompts (each is a separate task).
- Changes to `smithy init` / `smithy uninit` CLI logic (separate task, driven by template changes).
- Migration tooling for existing artifacts in the old format.
- IDE integrations or non-CLI interfaces.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Total user-facing commands reduced from 10 to 9, with clear single-word names that fit a forge metaphor.
- **SC-002**: A developer can describe the full pipeline in one sentence: "ignite, render, mark, cut, forge."
- **SC-003**: No command requires the user to remember which other command to run for review — repeat the command or use audit.
- **SC-004**: Every artifact file is identifiable by extension without reading its contents.
- **SC-005**: `orders` and `audit` require zero flags — artifact type detection is automatic.

# Tasks: Render — Break Milestone into Features

**Source**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.spec.md` — User Story 2
**Data Model**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.data-model.md`
**Contracts**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.contracts.md`
**Story Number**: 02

---

## Slice 1: Core Render Template — New Feature Map Generation

**Goal**: Deliver a working `smithy.render` slash command that takes an RFC path, identifies a milestone, interactively breaks it into discrete features via clarifying Q&A, and writes a `<NN>-<milestone-slug>.features.md` co-located with the RFC.

**Justification**: This slice delivers the primary render workflow end-to-end. A developer can invoke `/smithy.render path/to/rfc.rfc.md` and get a feature map for the next unprocessed milestone — the core value of the command. The review loop (Slice 2) enhances iteration but is not needed for first use.

**Addresses**: FR-001, FR-003, FR-007; Acceptance Scenarios 1, 3

### Tasks

- [X] Read `src/templates/base/smithy.strike.md` and `src/templates/base/smithy.ignite.md` as reference templates for phased interaction, STOP points, and frontmatter conventions.
- [X] Create `src/templates/base/smithy.render.md` with frontmatter: `name: smithy-render`, `description: "Stage: [Render]. Break an RFC milestone into a feature map."`, `command: true`.
- [X] Write the **Input** section: accept `$ARGUMENTS` as a path to an RFC (`.rfc.md`) with an optional milestone number. Include fallback: "If no input is provided, ask the user for the path to an RFC."
- [X] Write **input routing logic** — the template must instruct the agent to handle these cases:
  - **RFC path only**: Scan the RFC folder for existing `.features.md` files, auto-select the first milestone that doesn't have one yet. If all milestones have maps, prompt the user to choose which one to audit (hand off to Phase 0 once Slice 2 is implemented).
  - **RFC path + milestone number**: Target that specific milestone. If a `.features.md` already exists for it, enter review loop (Phase 0, Slice 2).
  - **No input**: Ask the user for an RFC path.
  - **Description string (not a file path)**: Abort with guidance: "Render works from an existing RFC. Run `smithy.ignite` first to workshop your idea into an RFC."
- [X] Write **Phase 1: Intake** — read the RFC file, parse its milestones, validate the target milestone exists, derive a kebab-case slug from the milestone title, confirm target with user: RFC path, milestone number and title, derived filename `<NN>-<milestone-slug>.features.md`.
- [X] Write **Phase 2: Clarify** — structured ambiguity scan across categories (feature boundaries, overlap between features, dependency relationships, scope within the milestone, integration points). Present up to 5 questions **one at a time** with a recommended answer for each. STOP after each question and wait for user response. If the milestone has overlapping concerns (Scenario 3), this phase surfaces them.
- [X] Write **Phase 3: Draft Feature Map** — using the workshopped answers, produce a structured `.features.md` containing: milestone title and reference back to the RFC, a numbered list of features each with title, description, user-facing value, and scope boundaries. Present the full draft for user approval before writing.
- [X] Write **Phase 4: Output** — write `<NN>-<milestone-slug>.features.md` to the RFC folder (`docs/rfcs/<YYYY-NNN-slug>/`). Confirm the file path to the user and suggest next step: "Ready for `smithy.mark` to specify each feature."
- [X] Write the **Rules** section: do not write code, do not skip clarification, do not publish until user confirms, render is not an entry point (requires RFC from ignite), features must be discrete units of user-facing functionality.

**PR Outcome**: `/smithy.render` is a working slash command. Developers can break an RFC milestone into a feature map via interactive Q&A, with smart auto-selection of the next unprocessed milestone.

---

## Slice 2: Review Loop for Existing Feature Maps

**Goal**: Add Phase 0 to the render template so that re-running `/smithy.render` against a milestone with an existing `.features.md` triggers a structured audit and refinement flow instead of generating a new map.

**Justification**: This slice completes the render command's iteration story. Without it, render is generate-only; with it, developers can refine feature maps through repeated invocation — matching the spec's "repeat command = refinement" convention.

**Addresses**: FR-004; Acceptance Scenario 2

### Tasks

- [X] Add **Phase 0: Review Loop** to `src/templates/base/smithy.render.md`, placed before Phase 1. Triggered when the target milestone already has a `.features.md` file in the RFC folder.
- [X] Write **Phase 0a: Audit Scan** — read the existing map file alongside the source RFC milestone. Check for: feature coverage (are all aspects of the milestone represented?), gaps (missing features), overlap (features with unclear boundaries), dependency clarity, and alignment with the RFC's stated goals for the milestone. Assess each category as Sound, Weak, or Gap.
- [X] Write **Phase 0b: Refinement Questions** — present audit findings as a summary table, then ask up to 5 refinement questions one at a time, targeting the most impactful Weak/Gap categories. Each question includes a recommended resolution. STOP after each question.
- [X] Write **Phase 0c: Apply Refinements** — after all questions are answered, update the existing `.features.md` to incorporate refinements. Present changes for user approval before writing.
- [X] Update the input routing logic from Slice 1: when all milestones have maps and user selects one, or when a specific milestone with an existing map is targeted, route to Phase 0.

**PR Outcome**: Re-running `/smithy.render` on a milestone with an existing feature map enters a structured audit and refinement flow. The "repeat to refine" convention is fully implemented for render.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

| ID | Title                                              | Depends On | Artifact |
|----|----------------------------------------------------|------------|----------|
| S1 | Core Render Template — New Feature Map Generation  | —          | —        |
| S2 | Review Loop for Existing Feature Maps              | S1         | —        |

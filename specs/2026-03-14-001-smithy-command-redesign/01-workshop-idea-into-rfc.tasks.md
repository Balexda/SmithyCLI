# Tasks: Ignite — Workshop Broad Idea into RFC

**Source**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.spec.md` — User Story 1
**Data Model**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.data-model.md`
**Contracts**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.contracts.md`
**Story Number**: 01

---

## Slice 1: Core Ignite Template — New RFC Generation

**Goal**: Deliver a working `smithy.ignite` slash command that takes a broad idea (or PRD file path), interactively workshops it through clarifying questions, and produces a structured RFC with milestones written to `docs/rfcs/<YYYY-NNN-slug>/<slug>.rfc.md`.

**Justification**: This slice delivers the primary ignite workflow end-to-end. A developer can invoke `/smithy.ignite "build a plugin system"` and get a reviewable RFC with milestones — the core value of the command. The review loop (Slice 2) enhances iteration but is not needed for first use.

**Addresses**: FR-001, FR-003, FR-006; Acceptance Scenarios 1, 2, 4

### Tasks

- [ ] Read the current `src/templates/base/smithy.ignite.md` and `src/templates/base/smithy.strike.md` (as a reference for mature template structure).
- [ ] Rewrite `src/templates/base/smithy.ignite.md` frontmatter: add `command: true`, update description to match the spec's forge metaphor naming.
- [ ] Write the **Input** section: accept `$ARGUMENTS` as either a broad idea description or a file path to a PRD/document. Include fallback: "If no input is clear, ask the user what idea they want to workshop."
- [ ] Write **Phase 1: Intake** — parse input, determine if it's a description string or a file path (read the file if path), scan `docs/rfcs/` for existing folders to derive the next sequential `NNN` number, derive a kebab-case slug from the idea, and confirm the target folder (`docs/rfcs/<YYYY-NNN-slug>/`) with the user.
- [ ] Write **Phase 2: Clarify** — structured ambiguity scan across categories (personas, value proposition, constraints, risks, scope). Present up to 5 questions **one at a time** with a recommended answer for each. STOP after each question and wait for user response.
- [ ] Write **Phase 3: Draft RFC** — using the workshopped answers, produce a structured RFC containing: summary, motivation/problem statement, goals, proposal, milestones (each with title, description, and success criteria), design considerations, open questions. Present the full draft for user approval before writing.
- [ ] Write **Phase 4: Output** — create the `docs/rfcs/<YYYY-NNN-slug>/` folder, write `<slug>.rfc.md`. Confirm the file path to the user and suggest next step: "Ready for `smithy.render` to break a milestone into features."
- [ ] Write the **Rules** section: do not write code, do not skip clarification, do not publish until user confirms, maintain "WHAT not HOW" tone, milestones must be clearly delineated.
- [ ] Manually test: run `npm run build && node dist/cli.js init` targeting a test repo with Claude selected, restart Claude Code, invoke `/smithy.ignite "build a plugin system"`, and verify the interactive flow produces a well-structured RFC with milestones in the correct folder.

**PR Outcome**: `/smithy.ignite` is a working slash command. Developers can workshop a broad idea or PRD into a structured RFC with milestones via interactive Q&A.

---

## Slice 2: Review Loop for Existing RFCs

**Goal**: Add Phase 0 to the ignite template so that re-running `/smithy.ignite` against an existing `.rfc.md` triggers a structured audit and refinement flow instead of generating a new RFC from scratch.

**Justification**: This slice completes the ignite command's iteration story. Without it, ignite is generate-only; with it, developers can refine RFCs through repeated invocation — matching the spec's "repeat command = refinement" convention used across all pipeline commands.

**Addresses**: FR-004; Acceptance Scenario 3

### Tasks

- [ ] Add **Phase 0: Review Loop** to `src/templates/base/smithy.ignite.md`, placed before Phase 1. Triggered when input points to an existing `.rfc.md` file or when a matching RFC is detected in `docs/rfcs/`.
- [ ] Write **Phase 0a: Audit Scan** — read the existing RFC and check for: ambiguity in problem statement or goals, milestone completeness (are milestones well-defined with clear scope?), feasibility concerns, scope drift, missing stakeholder perspectives. Assess each category as Sound, Weak, or Gap.
- [ ] Write **Phase 0b: Refinement Questions** — present audit findings as a summary table, then ask up to 5 refinement questions one at a time, targeting the most impactful Weak/Gap categories. Each question includes a recommended resolution. STOP after each question.
- [ ] Write **Phase 0c: Apply Refinements** — after all questions are answered, update the existing RFC to incorporate refinements. Present changes for user approval before writing.
- [ ] Add routing logic at the top of the template: if input is an existing `.rfc.md` path, go to Phase 0 (review loop). If input is a description or PRD path, go to Phase 1 (new RFC generation).
- [ ] Manually test: create a sample RFC via Slice 1's ignite flow, then re-run `/smithy.ignite path/to/existing.rfc.md` and verify it enters the review loop with audit findings and refinement questions.

**PR Outcome**: Re-running `/smithy.ignite` on an existing RFC enters a structured audit and refinement flow. The "repeat to refine" convention is fully implemented for ignite.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — Core template must exist before the review loop can be added or tested.
2. **Slice 2** — Adds review loop on top of the working template from Slice 1.

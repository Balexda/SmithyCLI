# Feature Specification: Refactor Ignite Workflow

**Spec Folder**: `2026-04-07-003-refactor-ignite-workflow`
**Branch**: `claude/refactor-ignite-workflow-gDuYU`
**Created**: 2026-04-07
**Status**: Draft
**Input**: GitHub Issues #49 (Personas in `smithy.ignite`) and #50 (Out of scope when building with `smithy.ignite`), plus user-described problems with one-shot RFC generation quality variance.

## Clarifications

### Session 2026-04-07

- Q: Should the 3g assemble step just concatenate or also harmonize? → A: Concatenate + harmonize. Assemble reads all `_wip/` files, concatenates into RFC structure, then does a coherence pass to smooth tone and fix cross-references before writing the final file.
- Q: How should Phase 0 handle partial `_wip/` state from interrupted sessions? → A: Resume from last incomplete sub-phase. Detect which `_wip/` files exist, skip completed sub-phases, resume from the first missing one. User is told which phases completed and where resumption starts.
- Q: Should Phase 0 audit categories be updated for new Personas and Out of Scope sections? → A: Yes, update both Phase 0 inline categories and the `audit-checklist-rfc.md` snippet to add Persona Coverage and Out of Scope Completeness.

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

## User Scenarios & Testing *(mandatory)*

### User Story 1: Piecewise RFC Generation (Priority: P1)

As a developer using `smithy.ignite`, I want the RFC to be built section by section with intermediate file writes so that each section gets dedicated attention and no section is silently skipped or underwritten.

**Why this priority**: This is the core structural change that addresses the root cause of inconsistent section quality and large output variance. All other stories depend on this pipeline existing.

**Independent Test**: Run `smithy.ignite` with a broad idea description. Verify that `_wip/` files are created sequentially (01-problem.md through 06-milestones.md) during drafting, and that the final assembled RFC contains all sections with substantive content.

**Acceptance Scenarios**:

1. **Given** a user provides a broad idea description, **When** ignite reaches Phase 3, **Then** it drafts each RFC section as a separate sub-phase (3a through 3f), writing each to a numbered file in `docs/rfcs/<YYYY-NNN-slug>/_wip/`.
2. **Given** sub-phase 3d (Proposal) is being drafted, **When** the agent begins writing, **Then** it reads `_wip/01-problem.md`, `_wip/02-personas.md`, and `_wip/03-goals.md` from disk before drafting, ensuring context flows forward.
3. **Given** all sub-phases 3a-3f have completed, **When** sub-phase 3g (Assemble) runs, **Then** it reads all `_wip/` files, concatenates them into the RFC template structure, performs a coherence/harmonization pass, writes the final RFC to `<slug>.rfc.md`, and deletes the `_wip/` directory.
4. **Given** a sub-phase is writing its section, **When** the section is written to disk, **Then** the next sub-phase can begin without requiring the prior section to remain in the context window.

---

### User Story 2: Mandatory Personas Section (Priority: P1)

As a developer using `smithy.ignite`, I want personas identified during clarification to always appear as a dedicated section in the final RFC so that downstream commands (mark, render) can reference them for user stories and feature scoping.

**Why this priority**: Directly addresses Issue #49. Personas are consistently discussed during clarification but lost in the one-shot draft because the RFC template has no section for them.

**Independent Test**: Run `smithy.ignite` and verify the generated RFC contains a `## Personas` section with at least one persona described, and that this section appears between Goals and Proposal in the final document.

**Acceptance Scenarios**:

1. **Given** the user runs `smithy.ignite` with any idea, **When** the RFC is generated, **Then** the final RFC contains a `## Personas` section listing identified users/stakeholders with descriptions.
2. **Given** the Personas section is drafted in sub-phase 3b, **When** sub-phase 3b completes, **Then** the personas are written to `_wip/02-personas.md` and are available for subsequent sub-phases to reference.
3. **Given** the Phase 2 clarification identifies personas, **When** the sub-phases draft the RFC, **Then** the personas from clarification appear in the Personas section (not lost between clarification and drafting).

---

### User Story 3: Mandatory Out of Scope Section (Priority: P1)

As a developer using `smithy.ignite`, I want the RFC to always include an explicit Out of Scope section so that scope boundaries are clearly documented and downstream commands know what is excluded.

**Why this priority**: Directly addresses Issue #50. The clarification phase asks about scope but the RFC template has no section to receive the answer, so it is consistently omitted.

**Independent Test**: Run `smithy.ignite` and verify the generated RFC contains a `## Out of Scope` section, even if the content is "None identified at this time."

**Acceptance Scenarios**:

1. **Given** the user runs `smithy.ignite` with any idea, **When** the RFC is generated, **Then** the final RFC contains a `## Out of Scope` section after the Goals section.
2. **Given** clarification identifies items as out of scope, **When** the RFC is drafted, **Then** those items appear in the Out of Scope section.
3. **Given** nothing is identified as out of scope during clarification, **When** the RFC is drafted, **Then** the Out of Scope section contains a placeholder (e.g., "None identified at this time") rather than being omitted.

---

### User Story 4: Sub-Phase Snippet Extraction (Priority: P1)

As a maintainer of the smithy template system, I want each sub-phase's instructions extracted into separate snippet files so that the ignite prompt remains maintainable and each sub-phase can be reviewed/tested independently.

**Why this priority**: The ignite prompt is already 249 lines. Adding 6 sub-phase specifications inline would make it unmanageable. Snippets are the established codebase pattern and this is a prerequisite for the piecewise pipeline to be maintainable.

**Independent Test**: Verify that the ignite prompt uses `{{>ignite-phase3a}}` style partial includes for each sub-phase, that the snippet files exist in `src/templates/agent-skills/snippets/`, and that Dotprompt resolves them correctly at deploy time.

**Acceptance Scenarios**:

1. **Given** the refactored ignite prompt, **When** it references sub-phase 3a, **Then** it includes the instruction via a Handlebars partial (e.g., `{{>ignite-phase3a}}`).
2. **Given** snippet files exist for each sub-phase, **When** they are placed in `src/templates/agent-skills/snippets/`, **Then** they follow the naming convention `ignite-phase3a.md`, `ignite-phase3b.md`, etc.
3. **Given** the ignite prompt is deployed via `smithy init`, **When** Dotprompt resolves partials, **Then** all sub-phase snippets are inlined into the final deployed prompt.

---

### User Story 5: Session Resume from Partial State (Priority: P2)

As a developer whose `smithy.ignite` session was interrupted mid-pipeline, I want to resume from where I left off so that I don't lose the work already completed in earlier sub-phases.

**Why this priority**: Important for robustness but not a core workflow change. The `_wip/` directory structure (from Story 1) naturally enables this; this story defines the detection and resume UX.

**Independent Test**: Create a partial `_wip/` directory with files 01-03, then run `smithy.ignite` pointing to the same RFC folder. Verify it detects the partial state, reports which phases completed, and resumes from sub-phase 3d.

**Acceptance Scenarios**:

1. **Given** a `_wip/` directory exists in the RFC folder with files `01-problem.md`, `02-personas.md`, and `03-goals.md`, **When** the user runs `smithy.ignite` and Phase 0 detects partial state, **Then** Phase 0 informs the user which sub-phases completed and offers to resume from sub-phase 3d.
2. **Given** the user accepts the resume, **When** the pipeline continues, **Then** sub-phases 3a-3c are skipped and 3d begins by reading the existing `_wip/` files for context.
3. **Given** no `_wip/` directory exists, **When** Phase 0 runs, **Then** it proceeds with the normal review loop (existing behavior unchanged).

---

### User Story 6: Cross-Session Question Deduplication (Priority: P2)

As a developer iterating on an RFC across multiple `smithy.ignite` sessions, I want previously asked clarification questions to not be re-asked so that repeat sessions are faster and less redundant.

**Why this priority**: Addresses the "repeated questions" problem but is an enhancement on top of the core pipeline, not a structural prerequisite.

**Independent Test**: Run `smithy.ignite` twice on the same RFC. Verify that on the second run, smithy-clarify receives the `.clarify-log.md` from the first session and avoids re-asking the same questions.

**Acceptance Scenarios**:

1. **Given** a clarification phase completes, **When** the Q&A and assumptions are finalized, **Then** they are written to `docs/rfcs/<YYYY-NNN-slug>/.clarify-log.md` in the RFC folder.
2. **Given** a `.clarify-log.md` exists from a prior session, **When** smithy-clarify is invoked in a new session, **Then** the log contents are passed as additional context with the instruction "Do not re-ask questions already answered in this log."
3. **Given** no `.clarify-log.md` exists, **When** smithy-clarify runs, **Then** clarification proceeds normally (no dedup context).

---

### User Story 7: Updated Phase 0 Audit Categories (Priority: P2)

As a developer reviewing an existing RFC via `smithy.ignite` Phase 0, I want the audit to check for persona coverage and out-of-scope completeness so that the review catches the same gaps that the new template sections are designed to prevent.

**Why this priority**: Ensures the review loop stays aligned with the new RFC template. Without this, Phase 0 could approve an RFC that is missing the new mandatory sections.

**Independent Test**: Run `smithy.ignite` on an existing RFC that lacks Personas and Out of Scope sections. Verify the Phase 0 audit flags these as gaps.

**Acceptance Scenarios**:

1. **Given** the Phase 0 review loop runs on an existing RFC, **When** the audit categories are evaluated, **Then** "Persona Coverage" and "Out of Scope Completeness" are included alongside existing categories (Problem Statement, Goals, Milestones, Feasibility, Scope, Stakeholders).
2. **Given** the `audit-checklist-rfc.md` snippet is used by `smithy.audit`, **When** it audits an RFC, **Then** it includes checks for persona coverage and out-of-scope completeness.
3. **Given** an RFC has a Personas section but it contains only vague references, **When** the audit runs, **Then** it flags the section as Weak rather than Sound.

---

### User Story 8: Updated RFC Template Schema (Priority: P1)

As a developer using `smithy.ignite`, I want the RFC template to include all sections that downstream commands expect so that the generated RFC is complete and parseable by `smithy.render` and `smithy.mark`.

**Why this priority**: The template schema defines what sections the RFC contains. Without updating it, the piecewise pipeline would still produce an RFC missing Personas and Out of Scope even if sub-phases draft them, because the assemble step uses the template as its structure guide.

**Independent Test**: Read the RFC template in the ignite prompt and verify it contains: Summary, Motivation/Problem Statement, Goals, Out of Scope, Personas, Proposal, Design Considerations, Decisions, Open Questions, Milestones.

**Acceptance Scenarios**:

1. **Given** the RFC template in the ignite prompt, **When** it is rendered, **Then** it includes `## Personas` between Goals and Proposal.
2. **Given** the RFC template in the ignite prompt, **When** it is rendered, **Then** it includes `## Out of Scope` after Goals (before Personas).
3. **Given** the Phase 3g assemble step uses the template as its structure guide, **When** it assembles the final RFC, **Then** all template sections are present in the output.

---

### Edge Cases

- **Empty idea description**: If the user provides no input, the prompt asks for an idea before starting the pipeline. No `_wip/` directory is created until Phase 3 begins.
- **PRD file input**: When the input is a PRD file path, intake reads and extracts the core idea. The piecewise pipeline proceeds identically — the PRD content feeds into clarification and sub-phase 3a.
- **Very small RFC**: For trivially simple ideas, each sub-phase may produce only 1-2 sentences. This is acceptable — the pipeline structure ensures all sections exist even if minimal.
- **`_wip/` directory already exists from a different idea**: Phase 0's resume detection should verify that the `_wip/` content is contextually related to the current idea (by reading `01-problem.md` and comparing). If unrelated, warn the user and offer to delete and restart.
- **Session crash during 3g (assemble)**: If the assemble step crashes after writing the final RFC but before deleting `_wip/`, the next session's Phase 0 should detect both the final RFC and the `_wip/` directory and prioritize the final RFC (entering normal review mode).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST replace the monolithic Phase 3 (Draft RFC) with sequential sub-phases 3a through 3g, each producing one or more RFC sections.
- **FR-002**: Each sub-phase (3a-3f) MUST write its output to a numbered file in a `_wip/` subdirectory within the RFC folder before the next sub-phase begins.
- **FR-003**: Each sub-phase (3b-3f) MUST read all prior `_wip/` files from disk before drafting its section, ensuring context flows forward without relying on the context window.
- **FR-004**: Sub-phase 3g (Assemble) MUST read all `_wip/` files, concatenate them into the RFC template structure, perform a coherence/harmonization pass, write the final RFC to `<slug>.rfc.md`, and delete the `_wip/` directory.
- **FR-005**: The RFC template MUST include a mandatory `## Personas` section positioned between Goals and Proposal.
- **FR-006**: The RFC template MUST include a mandatory `## Out of Scope` section positioned after Goals and before Personas.
- **FR-007**: Sub-phase instructions MUST be extracted into snippet files in `src/templates/agent-skills/snippets/` and included via Handlebars partials.
- **FR-008**: Phase 0 MUST detect partial `_wip/` directories and offer to resume from the first missing sub-phase.
- **FR-009**: After each clarification phase completes, the system MUST write Q&A and assumptions to a `.clarify-log.md` file in the RFC folder.
- **FR-010**: When a `.clarify-log.md` exists from a prior session, the system MUST pass its contents to smithy-clarify as additional context with instructions to avoid re-asking answered questions.
- **FR-011**: Phase 0 audit categories MUST include "Persona Coverage" and "Out of Scope Completeness" alongside existing categories.
- **FR-012**: The `audit-checklist-rfc.md` snippet MUST be updated to include persona coverage and out-of-scope completeness checks.
- **FR-013**: The `_wip/` file naming convention MUST use zero-padded two-digit prefixes: `01-problem.md`, `02-personas.md`, `03-goals.md`, `04-proposal.md`, `05-decisions.md`, `06-milestones.md`.

### Key Entities

- **`_wip/` directory**: Temporary subdirectory within an RFC folder that holds intermediate sub-phase outputs during piecewise drafting. Deleted after successful assembly.
- **`.clarify-log.md`**: Persistent file in the RFC folder that records Q&A and assumptions from each clarification session for cross-session deduplication.
- **Sub-phase snippet**: A Markdown file in `src/templates/agent-skills/snippets/` containing the instructions for one sub-phase of the piecewise pipeline (e.g., `ignite-phase3a.md`).

## Assumptions

- Sub-agent prompts (smithy-clarify, smithy-plan, smithy-reconcile, smithy-refine) do not need modification — they are generic enough to handle the new invocation patterns.
- No TypeScript code changes are required — this is purely a prompt template and snippet change.
- The existing Dotprompt/Handlebars partial resolution system handles nested snippet includes correctly.
- The competing plans phase (Phase 1.5) with three lenses and smithy-reconcile remains unchanged in structure, though it now benefits from richer context when sub-phases reference its output.
- smithy-scout is NOT added to the ignite pipeline (ignite works from ideas/PRDs, not existing code).

## Out of Scope

- Changes to other smithy commands (mark, render, cut, forge, strike) — they consume RFCs but their templates are not modified by this feature.
- New sub-agent definitions — no new agent files are created; all piecewise orchestration happens within the ignite template via snippets.
- TypeScript code changes to `src/cli.ts`, `src/commands/`, or `src/agents/` — this is a prompt-only change.
- Gemini/Codex deployment considerations — the ignite template deploys the same way; only the content changes.
- Per-section clarification passes — the reconciled approach uses a single upfront clarify pass, not per-section runs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every RFC generated by the refactored `smithy.ignite` contains all template sections (Summary, Motivation, Goals, Out of Scope, Personas, Proposal, Design Considerations, Decisions, Open Questions, Milestones) with non-empty content.
- **SC-002**: The Personas section in generated RFCs contains at least one named persona with a description (Issue #49 resolved).
- **SC-003**: The Out of Scope section in generated RFCs contains explicit content — either exclusions or "None identified" (Issue #50 resolved).
- **SC-004**: Running `smithy.ignite` on the same idea twice in separate sessions does not re-ask questions that were answered and logged in `.clarify-log.md`.
- **SC-005**: Interrupting an `smithy.ignite` session mid-pipeline and restarting successfully resumes from the last completed sub-phase without losing prior work.
- **SC-006**: The `audit-checklist-rfc.md` snippet includes persona coverage and out-of-scope completeness checks, and `smithy.audit` flags RFCs missing these sections.
- **SC-007**: The ignite prompt template uses snippet partials for sub-phase instructions, keeping the main template under 150 lines (excluding snippet content).

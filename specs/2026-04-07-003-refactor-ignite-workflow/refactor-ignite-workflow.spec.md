# Feature Specification: Refactor Ignite Workflow

**Spec Folder**: `2026-04-07-003-refactor-ignite-workflow`
**Branch**: `claude/refactor-ignite-workflow-gDuYU`
**Created**: 2026-04-07
**Status**: Draft
**Input**: GitHub Issues #49 (Personas in `smithy.ignite`) and #50 (Out of scope when building with `smithy.ignite`), plus user-described problems with one-shot RFC generation quality variance.

## Clarifications

### Session 2026-04-07

- Q: Should the 3g assemble step just concatenate or also harmonize? → A: Concatenate + harmonize. The orchestrator does a coherence pass to smooth tone and fix cross-references after all sections are written.
- Q: How should Phase 0 handle partial RFC state from interrupted sessions? → A: Resume from last incomplete sub-phase. Parse the RFC file's headings to detect which sections exist, skip completed sub-phases, resume from the first missing one. User is told which phases completed and where resumption starts.
- Q: Should Phase 0 audit categories be updated for new Personas and Out of Scope sections? → A: Yes, update both Phase 0 inline categories and the `audit-checklist-rfc.md` snippet to add Persona Coverage and Out of Scope Completeness.
- Q: Should sub-phase instructions be extracted into snippets or delegated to sub-agents? → A: Delegate to sub-agents. Create a new shared `smithy-prose` sub-agent for narrative/persuasive sections (Summary, Motivation). Use `smithy-plan` for structured analytical sections (scope derivation, milestone decomposition). Drop ignite-specific snippets — they aren't shared content. The ignite orchestrator becomes primarily a dispatcher.
- Q: Should smithy-prose be reusable across commands or ignite-only? → A: Shared across commands. Design as a general narrative-writing sub-agent that any command can dispatch for prose-heavy sections.
- Q: Should intermediate output use a `_wip/` directory or write directly to the RFC file? → A: Write directly to the RFC file. Each sub-phase appends its section(s) to `<slug>.rfc.md`. Resume by parsing which headings exist. Harmonize pass rewrites the file in place at the end. No `_wip/` directory.

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

## User Scenarios & Testing *(mandatory)*

### User Story 1: Updated RFC Template Schema (Priority: P1)

As a developer using `smithy.ignite`, I want the RFC template to include all sections that downstream commands expect so that the generated RFC is complete and parseable by `smithy.render` and `smithy.mark`.

**Why this priority**: The template schema defines what sections the RFC contains. All other stories depend on the template having slots for Personas and Out of Scope. Without these slots, no amount of piecewise drafting can produce them in the final RFC.

**Independent Test**: Read the RFC template in the ignite prompt and verify it contains: Summary, Motivation/Problem Statement, Goals, Out of Scope, Personas, Proposal, Design Considerations, Decisions, Open Questions, Milestones.

**Acceptance Scenarios**:

1. **Given** the RFC template in the ignite prompt, **When** it is rendered, **Then** it includes `## Personas` between Out of Scope and Proposal.
2. **Given** the RFC template in the ignite prompt, **When** it is rendered, **Then** it includes `## Out of Scope` after Goals (before Personas).
3. **Given** the sub-phases write directly to the RFC file using the template as their structure guide, **When** all sub-phases complete, **Then** all template sections are present in the output.

---

### User Story 2: Shared Smithy-Prose Sub-Agent (Priority: P1)

As a developer using `smithy.ignite`, I want narrative/persuasive RFC sections (Summary, Motivation/Problem Statement) to be drafted by a dedicated `smithy-prose` sub-agent so that these sections receive focused prose-writing attention distinct from structured analytical sections.

**Why this priority**: The problem statement is the foundation the entire RFC builds on. It's fundamentally different from structured sections (goals lists, milestone tables) — it requires compelling narrative framing. A dedicated sub-agent with prose-tuned instructions produces better results than generic inline drafting. This agent must exist before the piecewise pipeline can dispatch it.

**Independent Test**: Dispatch smithy-prose with a problem description and context files. Verify it returns a well-structured Summary and Motivation/Problem Statement with compelling narrative framing that the orchestrator can then append to the RFC file.

**Acceptance Scenarios**:

1. **Given** a new `smithy-prose` sub-agent definition exists at `src/templates/agent-skills/agents/smithy.prose.prompt`, **When** it is dispatched by the ignite orchestrator during sub-phase 3a, **Then** it returns the drafted Summary and Motivation/Problem Statement sections to the orchestrator, which appends them to `<slug>.rfc.md`.
2. **Given** smithy-prose receives the idea description and clarification output as context, **When** it drafts the narrative sections, **Then** the output uses persuasive framing (impact of not solving, urgency, stakeholder value) rather than dry bullet-point style.
3. **Given** smithy-prose is designed as a shared sub-agent, **When** other commands (render, mark) need narrative sections drafted, **Then** they can dispatch smithy-prose with their own context without modification.
4. **Given** the ignite orchestrator dispatches smithy-prose, **When** the sub-agent returns its content, **Then** the orchestrator appends it to the RFC file on disk so that subsequent sub-phases can read the accumulating file for context.

---

### User Story 3: Smithy-Plan for Structured RFC Sections (Priority: P1)

As a developer using `smithy.ignite`, I want structured analytical RFC sections (Goals, Out of Scope, Proposal, Milestones) to be drafted by dispatching `smithy-plan` sub-agents so that each structured section gets focused analytical attention with codebase awareness.

**Why this priority**: Structured sections like Goals, Proposal, and Milestones require analytical decomposition — the same kind of work smithy-plan already does well. Reusing smithy-plan for these sections leverages an existing, proven sub-agent rather than relying on the orchestrator to draft inline. This dispatch pattern must be defined before the pipeline can use it.

**Independent Test**: During sub-phase 3c (Goals + Out of Scope), verify that smithy-plan is dispatched with the clarification output and the accumulating RFC file as context, and that it returns a structured Goals list and Out of Scope section.

**Acceptance Scenarios**:

1. **Given** sub-phase 3c (Goals + Out of Scope) begins, **When** the orchestrator dispatches smithy-plan, **Then** smithy-plan receives the clarification output and the path to the accumulating `<slug>.rfc.md` (containing Summary, Motivation, Personas) as context and produces structured Goals and Out of Scope sections.
2. **Given** sub-phase 3d (Proposal + Design Considerations) begins, **When** the orchestrator dispatches smithy-plan, **Then** smithy-plan receives the reconciled approach from Phase 1.5 plus the accumulating RFC file and produces the Proposal and Design Considerations sections.
3. **Given** sub-phase 3f (Milestones) begins, **When** the orchestrator dispatches smithy-plan, **Then** smithy-plan produces milestone decomposition with success criteria, informed by the accumulated RFC content.
4. **Given** smithy-plan is dispatched for a structured section, **When** it completes, **Then** its returned content is appended to the RFC file by the orchestrator.

---

### User Story 4: Piecewise RFC Generation (Priority: P1)

As a developer using `smithy.ignite`, I want the RFC to be built section by section with intermediate file writes so that each section gets dedicated attention and no section is silently skipped or underwritten.

**Why this priority**: This is the core orchestration that wires together the template (Story 1), smithy-prose (Story 2), and smithy-plan (Story 3) into a working pipeline. It addresses the root cause of inconsistent section quality and large output variance.

**Independent Test**: Run `smithy.ignite` with a broad idea description. Verify that `<slug>.rfc.md` grows incrementally as each sub-phase appends its section(s), and that the final RFC contains all sections with substantive content.

**Acceptance Scenarios**:

1. **Given** a user provides a broad idea description, **When** ignite reaches Phase 3, **Then** the orchestrator creates `<slug>.rfc.md` with the RFC header, then dispatches sub-agents for each section group (smithy-prose for narrative sections, smithy-plan for structured sections), appending each sub-agent's returned content to the RFC file.
2. **Given** sub-phase 3d (Proposal) is being drafted via smithy-plan, **When** the sub-agent begins, **Then** it receives the path to the accumulating `<slug>.rfc.md` (containing Summary, Motivation, Personas, Goals, Out of Scope) as context, ensuring prior sections inform the current one.
3. **Given** all sub-phases 3a-3f have completed, **When** the harmonization pass (3g) runs, **Then** the orchestrator reads the full RFC file, performs a coherence pass to smooth tone and fix cross-references, and rewrites the file in place.
4. **Given** a sub-agent returns its drafted content to the orchestrator, **When** the orchestrator appends it to the RFC file, **Then** the next sub-phase can begin in a fresh context by reading the file from disk rather than relying on the context window.

---

### User Story 5: Mandatory Personas Section (Priority: P1)

As a developer using `smithy.ignite`, I want personas identified during clarification to always appear as a dedicated section in the final RFC so that downstream commands (mark, render) can reference them for user stories and feature scoping.

**Why this priority**: Directly addresses Issue #49. Personas are consistently discussed during clarification but lost in the one-shot draft because the RFC template previously had no section for them. With the template updated (Story 1) and smithy-prose available (Story 2), this story ensures the pipeline actually produces the section.

**Independent Test**: Run `smithy.ignite` and verify the generated RFC contains a `## Personas` section with at least one persona described, and that this section appears between Out of Scope and Proposal in the final document.

**Acceptance Scenarios**:

1. **Given** the user runs `smithy.ignite` with any idea, **When** the RFC is generated, **Then** the final RFC contains a `## Personas` section listing identified users/stakeholders with descriptions.
2. **Given** the Personas section is drafted in sub-phase 3b, **When** sub-phase 3b completes, **Then** the personas are appended to `<slug>.rfc.md` and are available for subsequent sub-phases to reference by reading the file.
3. **Given** the Phase 2 clarification identifies personas, **When** the sub-phases draft the RFC, **Then** the personas from clarification appear in the Personas section (not lost between clarification and drafting).

---

### User Story 6: Mandatory Out of Scope Section (Priority: P1)

As a developer using `smithy.ignite`, I want the RFC to always include an explicit Out of Scope section so that scope boundaries are clearly documented and downstream commands know what is excluded.

**Why this priority**: Directly addresses Issue #50. The clarification phase asks about scope but the RFC template previously had no section to receive the answer. With the template updated (Story 1) and smithy-plan dispatched for scope (Story 3), this story ensures the pipeline actually produces the section.

**Independent Test**: Verify that sub-phase 3c's dispatch to smithy-plan includes "Out of Scope" in its section assignment, and that the generated RFC contains a `## Out of Scope` section with substantive content or an explicit "None identified at this time" placeholder, positioned after Goals and before Personas.

**Acceptance Scenarios**:

1. **Given** the user runs `smithy.ignite` with any idea, **When** the RFC is generated, **Then** the final RFC contains a `## Out of Scope` section after Goals and before Personas.
2. **Given** the Out of Scope section is drafted in sub-phase 3c alongside Goals, **When** sub-phase 3c dispatches smithy-plan, **Then** smithy-plan produces an explicit Out of Scope section and the orchestrator appends it to `<slug>.rfc.md`.
3. **Given** clarification identifies items as out of scope, **When** the RFC is drafted, **Then** those items appear in the Out of Scope section.
4. **Given** nothing is identified as out of scope during clarification, **When** the RFC is drafted, **Then** the Out of Scope section contains a placeholder (e.g., "None identified at this time") rather than being omitted.

---

### User Story 7: Session Resume from Partial State (Priority: P2)

As a developer whose `smithy.ignite` session was interrupted mid-pipeline, I want to resume from where I left off so that I don't lose the work already completed in earlier sub-phases.

**Why this priority**: Important for robustness but not a core workflow change. The direct-write approach (from Story 4) naturally leaves a partial RFC on disk; this story defines the detection and resume UX.

**Independent Test**: Create a partial RFC file containing Summary, Motivation, and Personas sections but no Goals or later sections. Run `smithy.ignite` pointing to the same RFC folder. Verify it detects the partial state, reports which sections are present, and resumes from sub-phase 3c.

**Acceptance Scenarios**:

1. **Given** an RFC file exists with sections through Personas but no Goals or later sections, **When** the user runs `smithy.ignite` and Phase 0 detects the partial RFC, **Then** Phase 0 informs the user which sections are present and offers to resume from the first missing section (Goals).
2. **Given** the user accepts the resume, **When** the pipeline continues, **Then** completed sub-phases are skipped and the next sub-phase begins by reading the existing RFC file for context.
3. **Given** no RFC file exists, **When** Phase 0 runs, **Then** it proceeds to Phase 1 (Intake) as normal.

---

### User Story 8: Cross-Session Question Deduplication (Priority: P2)

As a developer iterating on an RFC across multiple `smithy.ignite` sessions, I want previously asked clarification questions to not be re-asked so that repeat sessions are faster and less redundant.

**Why this priority**: Addresses the "repeated questions" problem but is an enhancement on top of the core pipeline, not a structural prerequisite.

**Independent Test**: Run `smithy.ignite` twice on the same RFC. Verify that on the second run, smithy-clarify receives the `.clarify-log.md` from the first session and avoids re-asking the same questions.

**Acceptance Scenarios**:

1. **Given** a clarification phase completes, **When** the Q&A and assumptions are finalized, **Then** they are written to `docs/rfcs/<YYYY-NNN-slug>/.clarify-log.md` in the RFC folder.
2. **Given** a `.clarify-log.md` exists from a prior session, **When** smithy-clarify is invoked in a new session, **Then** the log contents are passed as additional context with the instruction "Do not re-ask questions already answered in this log."
3. **Given** no `.clarify-log.md` exists, **When** smithy-clarify runs, **Then** clarification proceeds normally (no dedup context).

---

### User Story 9: Updated Phase 0 Audit Categories (Priority: P2)

As a developer reviewing an existing RFC via `smithy.ignite` Phase 0, I want the audit to check for persona coverage and out-of-scope completeness so that the review catches the same gaps that the new template sections are designed to prevent.

**Why this priority**: Ensures the review loop stays aligned with the new RFC template. Without this, Phase 0 could approve an RFC that is missing the new mandatory sections.

**Independent Test**: Run `smithy.ignite` on an existing RFC that lacks Personas and Out of Scope sections. Verify the Phase 0 audit flags these as gaps.

**Acceptance Scenarios**:

1. **Given** the Phase 0 review loop runs on an existing RFC, **When** the audit categories are evaluated, **Then** "Persona Coverage" and "Out of Scope Completeness" are included alongside existing categories (Problem Statement, Goals, Milestones, Feasibility, Scope, Stakeholders).
2. **Given** the `audit-checklist-rfc.md` snippet is used by `smithy.audit`, **When** it audits an RFC, **Then** it includes checks for persona coverage and out-of-scope completeness.
3. **Given** an RFC has a Personas section but it contains only vague references, **When** the audit runs, **Then** it flags the section as Weak rather than Sound.

---

### Edge Cases

- **Empty idea description**: If the user provides no input, the prompt asks for an idea before starting the pipeline. No RFC file is created until Phase 3 begins.
- **PRD file input**: When the input is a PRD file path, intake reads and extracts the core idea. The piecewise pipeline proceeds identically — the PRD content feeds into clarification and sub-phase 3a.
- **Very small RFC**: For trivially simple ideas, each sub-phase may produce only 1-2 sentences. This is acceptable — the pipeline structure ensures all sections exist even if minimal.
- **Partial RFC from a different idea**: Phase 0's resume detection should verify that the RFC's Summary/Motivation are contextually related to the current idea. If unrelated, warn the user and offer to overwrite or create a new RFC.
- **Session crash during harmonization (3g)**: If the harmonization pass crashes mid-rewrite, the RFC file may be in an inconsistent state. The next session's Phase 0 should detect the RFC and enter the review loop, where smithy-refine can identify and repair inconsistencies.

## Dependency Order

| ID  | Title                                          | Depends On   | Artifact                                                                                          |
|-----|------------------------------------------------|--------------|---------------------------------------------------------------------------------------------------|
| US1 | Updated RFC Template Schema                    | —            | `specs/2026-04-07-003-refactor-ignite-workflow/01-updated-rfc-template-schema.tasks.md`           |
| US2 | Shared Smithy-Prose Sub-Agent                  | —            | `specs/2026-04-07-003-refactor-ignite-workflow/02-shared-smithy-prose-sub-agent.tasks.md`         |
| US3 | Smithy-Plan for Structured RFC Sections        | —            | `specs/2026-04-07-003-refactor-ignite-workflow/03-smithy-plan-for-structured-rfc-sections.tasks.md` |
| US4 | Piecewise RFC Generation                       | US1, US2, US3 | `specs/2026-04-07-003-refactor-ignite-workflow/04-piecewise-rfc-generation.tasks.md`              |
| US5 | Mandatory Personas Section                     | US1, US2, US4 | —                                                                                                 |
| US6 | Mandatory Out of Scope Section                 | US1, US3, US4 | `specs/2026-04-07-003-refactor-ignite-workflow/06-mandatory-out-of-scope-section.tasks.md`        |
| US7 | Session Resume from Partial State              | US4          | —                                                                                                 |
| US8 | Cross-Session Question Deduplication           | US4          | —                                                                                                 |
| US9 | Updated Phase 0 Audit Categories               | US1          | `specs/2026-04-07-003-refactor-ignite-workflow/09-updated-phase-0-audit-categories.tasks.md`      |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST replace the monolithic Phase 3 (Draft RFC) with sequential sub-phases 3a through 3g, each producing one or more RFC sections.
- **FR-002**: Each sub-phase (3a-3f) MUST append its output directly to `<slug>.rfc.md` before the next sub-phase begins.
- **FR-003**: Each sub-phase (3b-3f) MUST pass the path to the accumulating `<slug>.rfc.md` to its sub-agent as context, ensuring prior sections inform the current one without relying on the context window.
- **FR-004**: Sub-phase 3g (Harmonize) MUST read the complete `<slug>.rfc.md`, reorder sections to match the RFC template structure, perform a coherence pass to smooth tone and fix cross-references, and rewrite the file in place.
- **FR-005**: The RFC template MUST include a mandatory `## Personas` section positioned after `## Out of Scope` and before `## Proposal`.
- **FR-006**: The RFC template MUST include a mandatory `## Out of Scope` section positioned after Goals and before Personas.
- **FR-007**: A new shared `smithy-prose` sub-agent MUST be created at `src/templates/agent-skills/agents/smithy.prose.prompt` for drafting narrative/persuasive RFC sections (Summary, Motivation/Problem Statement).
- **FR-007a**: The ignite orchestrator MUST dispatch `smithy-plan` for structured analytical sections (Goals, Out of Scope, Proposal, Design Considerations, Milestones).
- **FR-007b**: The ignite orchestrator MUST dispatch `smithy-prose` for narrative sections (Summary, Motivation/Problem Statement, Personas) and `smithy-plan` for structured sections, appending each sub-agent's returned content to `<slug>.rfc.md`.
- **FR-008**: Phase 0 MUST detect partial RFC files (by parsing which template headings exist) and offer to resume from the first missing section's sub-phase.
- **FR-009**: After each clarification phase completes, the system MUST write Q&A and assumptions to a `.clarify-log.md` file in the RFC folder.
- **FR-010**: When a `.clarify-log.md` exists from a prior session, the system MUST pass its contents to smithy-clarify as additional context with instructions to avoid re-asking answered questions.
- **FR-011**: Phase 0 audit categories MUST include "Persona Coverage" and "Out of Scope Completeness" alongside existing categories.
- **FR-012**: The `audit-checklist-rfc.md` snippet MUST be updated to include persona coverage and out-of-scope completeness checks.
### Key Entities

- **`.clarify-log.md`**: Persistent file in the RFC folder that records Q&A and assumptions from each clarification session for cross-session deduplication.
- **`smithy-prose` sub-agent**: New shared sub-agent specialized for narrative/persuasive writing. Dispatched for Summary, Motivation/Problem Statement, and other prose-heavy sections across any smithy command.
- **`<slug>.rfc.md`**: The RFC file itself, written incrementally by the piecewise pipeline. Each sub-phase (3a-3f) appends its sections; the harmonize step (3g) rewrites in place. Also serves as the resume checkpoint for interrupted sessions.

## Assumptions

- Existing sub-agent prompts (smithy-clarify, smithy-plan, smithy-reconcile, smithy-refine) do not need modification — they are generic enough to handle the new invocation patterns. smithy-plan's interface (planning context, feature description, codebase file paths, additional directives) already supports being dispatched for individual RFC sections.
- No TypeScript code changes are required — this is a prompt template change plus one new sub-agent definition (`smithy-prose`).
- The competing plans phase (Phase 1.5) with three lenses and smithy-reconcile remains unchanged in structure, though it now benefits from richer context when sub-phases reference its output.
- smithy-scout is NOT added to the ignite pipeline (ignite works from ideas/PRDs, not existing code).
- smithy-prose is designed as a shared sub-agent from day one, but adoption by other commands (render, mark) is deferred to future work.

## Specification Debt

_None — all ambiguities resolved._

## Out of Scope

- Changes to other smithy commands (mark, render, cut, forge, strike) — they consume RFCs but their templates are not modified by this feature. Adoption of smithy-prose by other commands is future work.
- TypeScript code changes to `src/cli.ts`, `src/commands/`, or `src/agents/` — this is a prompt-only change plus a new agent definition file.
- Gemini/Codex deployment considerations — the ignite template deploys the same way; only the content changes. smithy-prose deploys as a standard sub-agent.
- Per-section clarification passes — the reconciled approach uses a single upfront clarify pass, not per-section runs.
- Ignite-specific snippets — sub-phase instructions are delegated to sub-agents (smithy-prose, smithy-plan), not extracted into ignite-specific snippets.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every RFC generated by the refactored `smithy.ignite` contains all template sections (Summary, Motivation, Goals, Out of Scope, Personas, Proposal, Design Considerations, Decisions, Open Questions, Milestones) with non-empty content.
- **SC-002**: The Personas section in generated RFCs contains at least one named persona with a description (Issue #49 resolved).
- **SC-003**: The Out of Scope section in generated RFCs contains explicit content — either exclusions or "None identified" (Issue #50 resolved).
- **SC-004**: Running `smithy.ignite` on the same idea twice in separate sessions does not re-ask questions that were answered and logged in `.clarify-log.md`.
- **SC-005**: Interrupting a `smithy.ignite` session mid-pipeline and restarting successfully resumes from the first missing section (detected by parsing RFC headings) without losing prior work.
- **SC-006**: The `audit-checklist-rfc.md` snippet includes persona coverage and out-of-scope completeness checks, and `smithy.audit` flags RFCs missing these sections.
- **SC-007**: The ignite prompt template dispatches smithy-prose for narrative sections and smithy-plan for structured sections, keeping the orchestrator focused on pipeline management rather than inline drafting.
- **SC-008**: The `smithy-prose` sub-agent produces compelling narrative framing (impact, urgency, stakeholder value) that is qualitatively distinct from bullet-point-style output.

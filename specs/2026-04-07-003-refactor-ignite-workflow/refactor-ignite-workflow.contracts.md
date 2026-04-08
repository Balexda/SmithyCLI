# Contracts: Refactor Ignite Workflow

## Overview

This feature restructures the ignite prompt into an orchestrator that dispatches sub-agents for each RFC section. It introduces a new shared `smithy-prose` sub-agent for narrative sections and reuses `smithy-plan` for structured analytical sections. The contracts between ignite and existing sub-agents (smithy-clarify, smithy-reconcile, smithy-refine) remain unchanged.

The primary contract changes are: (1) the new smithy-prose sub-agent interface, (2) the sub-phase pipeline protocol and intermediate file conventions, and (3) expanded smithy-plan dispatch for per-section analytical drafting.

## Interfaces

### Smithy-Prose Sub-Agent Interface (NEW)

**Purpose**: Shared sub-agent for drafting narrative/persuasive sections of planning artifacts.
**Consumers**: Ignite orchestrator (sub-phases 3a, 3b), potentially render, mark, and other commands in future.
**Providers**: `src/templates/agent-skills/agents/smithy.prose.prompt`

#### Signature

The orchestrator dispatches smithy-prose with a section assignment and context. The sub-agent drafts the narrative section and returns it as text output. The orchestrator writes the output to the `_wip/` file.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `section_assignment` | Text | Yes | Which RFC section(s) to draft (e.g., "Summary and Motivation / Problem Statement") |
| `idea_description` | Text | Yes | The user's original idea or PRD content from intake |
| `clarify_output` | Text | Yes | The Q&A and assumptions from Phase 2 clarification |
| `prior_wip_files` | File paths | No | Paths to prior `_wip/` files for context (empty for 3a, populated for 3b) |
| `tone_directives` | Text | No | Specific prose guidance (e.g., "emphasize stakeholder impact", "frame as urgency") |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `section_content` | Markdown | The drafted RFC section(s) in Markdown format |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Insufficient context | Return partial with flags | If the idea description is too vague to write a compelling narrative, return what's possible and flag the gaps for the orchestrator to address. |
| Empty output | Halt | If no meaningful content can be produced, return an error rather than placeholder text. |

#### Agent Properties

| Property | Value | Notes |
|----------|-------|-------|
| Tools | Read, Grep, Glob | Read-only codebase access for context gathering |
| Model | opus | Narrative quality benefits from the strongest model |
| Interactive | No | Returns output to parent agent only |

---

### Sub-Phase Pipeline Protocol

**Purpose**: Defines how each sub-phase (3a-3f) operates within the piecewise drafting pipeline.
**Consumers**: The ignite orchestrator (main prompt context)
**Providers**: Sub-agents (smithy-prose for 3a/3b, smithy-plan for 3c/3d/3f, orchestrator inline for 3e)

#### Signature

Each sub-phase follows this protocol:
1. Orchestrator gathers context: prior `_wip/` files, clarification output, reconciled plan
2. Orchestrator dispatches the appropriate sub-agent with section assignment and context
3. Sub-agent returns drafted section content
4. Orchestrator writes output to the designated `_wip/<NN>-<section>.md` file
5. Orchestrator proceeds to next sub-phase

#### Sub-Agent Dispatch Map

| Sub-Phase | Sub-Agent | Rationale |
|-----------|-----------|-----------|
| 3a (Summary, Motivation) | smithy-prose | Narrative/persuasive writing |
| 3b (Personas) | smithy-prose | Persona descriptions are narrative |
| 3c (Goals, Out of Scope) | smithy-plan | Structured analytical decomposition |
| 3d (Proposal, Design Considerations) | smithy-plan | Analytical, draws on reconciled approach |
| 3e (Decisions, Open Questions) | Orchestrator inline | Synthesis of clarification record — straightforward partitioning |
| 3f (Milestones) | smithy-plan | Structured decomposition with success criteria |

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `rfc_folder` | Path | Yes | The RFC folder path (e.g., `docs/rfcs/2026-001-slug/`) |
| `prior_wip_files` | File paths | Yes | Paths to all `_wip/` files with lower numeric prefixes |
| `clarify_output` | Text | Yes | The Q&A and assumptions from Phase 2 clarification |
| `reconciled_plan` | Text | Conditional | The reconciled approach from Phase 1.5 (required for 3d, 3e, 3f) |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `wip_file` | File | The `_wip/<NN>-<section>.md` file written to disk by the orchestrator |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Prior `_wip/` file missing | Halt pipeline | If a required prior file is missing, the sub-phase cannot proceed. Report the gap and halt. |
| Sub-agent returns empty/error | Halt pipeline | If the dispatched sub-agent fails to produce content, halt and report. |
| Write failure | Halt pipeline | If the `_wip/` file cannot be written, report the error and halt. |

### Sub-Phase to Section Mapping

**Purpose**: Defines which RFC sections each sub-phase is responsible for drafting.
**Consumers**: Sub-agents (smithy-prose, smithy-plan), orchestrator, assemble step (3g)
**Providers**: The ignite template specification

#### Mapping Table

| Sub-Phase | WIP File | RFC Sections Produced |
|-----------|----------|----------------------|
| 3a | `01-problem.md` | Summary, Motivation / Problem Statement |
| 3b | `02-personas.md` | Personas |
| 3c | `03-goals.md` | Goals, Out of Scope |
| 3d | `04-proposal.md` | Proposal, Design Considerations |
| 3e | `05-decisions.md` | Decisions, Open Questions |
| 3f | `06-milestones.md` | Milestones (with Success Criteria per milestone) |

### Assemble Step (3g) Contract

**Purpose**: Defines how the final RFC is composed from intermediate files.
**Consumers**: Phase 4 (Write & Review)
**Providers**: Sub-phase 3g

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wip_files` | File list | Yes | All 6 `_wip/` files (01 through 06) |
| `rfc_template` | Template | Yes | The RFC Markdown template structure from the ignite prompt |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `rfc_file` | File | The final `<slug>.rfc.md` written to disk |
| `wip_cleanup` | Side effect | The `_wip/` directory is deleted after successful write |

#### Process

1. Read all 6 `_wip/` files in order
2. Map each file's content to the corresponding RFC template section(s)
3. Concatenate into the full RFC template structure
4. Perform coherence/harmonization pass (smooth tone, fix cross-references)
5. Add RFC metadata header (`Created`, `Status`)
6. Write final RFC to `<slug>.rfc.md`
7. Delete `_wip/` directory

### Clarify Log Contract

**Purpose**: Defines the format and usage of `.clarify-log.md` for cross-session deduplication.
**Consumers**: smithy-clarify sub-agent (on subsequent sessions)
**Providers**: The ignite orchestrator (after Phase 2 completes)

#### Write Format

```markdown
### Session YYYY-MM-DD

**Assumptions**:
- <assumption 1>
- <assumption 2>

**Questions & Answers**:
- Q: <question> → A: <answer>
- Q: <question> → A: <answer>
```

#### Read Protocol

When passed to smithy-clarify as additional context:
- Include the instruction: "Do not re-ask questions already answered in this log."
- Pass the last 2 sessions from the log (not the full history) to limit context usage.

### Updated RFC Template Schema

**Purpose**: The canonical RFC template structure that all sub-phases and the assemble step must conform to.
**Consumers**: Sub-phases 3a-3f, assemble step 3g, Phase 0 audit, `smithy.audit`
**Providers**: The ignite template specification

#### Template Structure

```markdown
# RFC: <Title>

**Created**: YYYY-MM-DD  |  **Status**: Draft

## Summary
## Motivation / Problem Statement
## Goals
## Out of Scope
## Personas
## Proposal
## Design Considerations
## Decisions
## Open Questions
## Milestones
### Milestone N: <Title>
```

New sections vs. current template:
- `## Out of Scope` — NEW (after Goals)
- `## Personas` — NEW (after Out of Scope)

### Updated Phase 0 Audit Categories

**Purpose**: The audit criteria used by smithy-refine during the Phase 0 review loop.
**Consumers**: smithy-refine sub-agent
**Providers**: The ignite template Phase 0 specification

#### Categories

| Category | What to check |
|----------|---------------|
| **Problem Statement** | Problem clarity, solution outline, compelling motivation |
| **Goals** | Concrete, achievable, non-overlapping |
| **Out of Scope Completeness** | Explicit exclusions documented, scope boundaries clear |
| **Persona Coverage** | Personas identified with descriptions, relevant to stated goals |
| **Milestones** | Well-defined scope, clear boundaries, success criteria |
| **Feasibility** | Technical risks, dependency concerns, resource assumptions |
| **Scope** | Drift from stated goals, feature creep indicators |
| **Stakeholders** | Missing perspectives, unconsidered personas |

New categories vs. current: **Out of Scope Completeness** and **Persona Coverage**.

## Integration Boundaries

This feature's integration boundaries are entirely within the smithy template system:

- **Ignite → smithy-prose (NEW)**: New sub-agent dispatched for narrative RFC sections. Deployed as `src/templates/agent-skills/agents/smithy.prose.prompt` and follows the same agent conventions as smithy-plan, smithy-clarify, etc.
- **Ignite → smithy-plan (expanded)**: smithy-plan is now dispatched for individual structured sections (3c, 3d, 3f) in addition to its existing role in Phase 1.5 competing plans. Its interface is unchanged — only the planning context and directives differ per dispatch.
- **Ignite → smithy-clarify, smithy-reconcile, smithy-refine**: Invocation interfaces unchanged. Only the content of context and criteria parameters changes.
- **Ignite → File System**: New file I/O patterns (`_wip/` directory, `.clarify-log.md`) use standard file read/write operations already available to the agent.
- **Ignite → Downstream Commands**: The final RFC format adds two new sections (Personas, Out of Scope) that `smithy.render` and `smithy.mark` may reference but do not require. No breaking changes to downstream consumers.
- **smithy-prose → Other Commands (future)**: smithy-prose is designed as a shared agent. Other commands can dispatch it for their narrative sections without modification to smithy-prose itself.

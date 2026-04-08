# Contracts: Refactor Ignite Workflow

## Overview

This feature restructures the ignite prompt into an orchestrator that dispatches sub-agents for each RFC section. It introduces a new shared `smithy-prose` sub-agent for narrative sections and reuses `smithy-plan` for structured analytical sections. The contracts between ignite and existing sub-agents (smithy-clarify, smithy-reconcile, smithy-refine) remain unchanged.

The primary contract changes are: (1) the new smithy-prose sub-agent interface, (2) the sub-phase pipeline protocol with direct RFC file writes, and (3) expanded smithy-plan dispatch for per-section analytical drafting.

## Interfaces

### Smithy-Prose Sub-Agent Interface (NEW)

**Purpose**: Shared sub-agent for drafting narrative/persuasive sections of planning artifacts.
**Consumers**: Ignite orchestrator (sub-phases 3a, 3b), potentially render, mark, and other commands in future.
**Providers**: `src/templates/agent-skills/agents/smithy.prose.prompt`

#### Signature

The orchestrator dispatches smithy-prose with a section assignment and context. The sub-agent drafts the narrative section and returns it as text output. The orchestrator appends the output to the RFC file.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `section_assignment` | Text | Yes | Which RFC section(s) to draft (e.g., "Summary and Motivation / Problem Statement") |
| `idea_description` | Text | Yes | The user's original idea or PRD content from intake |
| `clarify_output` | Text | Yes | The Q&A and assumptions from Phase 2 clarification |
| `rfc_file_path` | Path | No | Path to the accumulating `<slug>.rfc.md` for context (empty for 3a, populated for 3b) |
| `tone_directives` | Text | No | Specific prose guidance (e.g., "emphasize stakeholder impact", "frame as urgency") |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `section_content` | Markdown | The drafted RFC section(s) in Markdown format. If context is insufficient but some useful draft content can be produced, the output MUST still be returned in this field and MUST end with a `## Gaps / Missing Context` section that lists the specific missing facts, assumptions, or questions the orchestrator should address. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Insufficient context | Return partial in `section_content` with `## Gaps / Missing Context` | If the idea description is too vague to write a fully compelling narrative, return the best partial draft possible and append a `## Gaps / Missing Context` section so the orchestrator can detect and address the gaps consistently. |
| Empty output | Halt | If no meaningful content can be produced, return an error rather than placeholder text. |

#### Agent Properties

| Property | Value | Notes |
|----------|-------|-------|
| Tools | Read, Grep, Glob | Read-only codebase access for context gathering |
| Model | Opus | Narrative quality benefits from the strongest model |
| Interactive | No | Returns output to parent agent only |

---

### Sub-Phase Pipeline Protocol

**Purpose**: Defines how each sub-phase (3a-3f) operates within the piecewise drafting pipeline.
**Consumers**: The ignite orchestrator (main prompt context)
**Providers**: Sub-agents (smithy-prose for 3a/3b, smithy-plan for 3c/3d/3f, orchestrator inline for 3e)

#### Signature

Each sub-phase follows this protocol:
1. Orchestrator gathers context: path to accumulating RFC file, clarification output, reconciled plan
2. Orchestrator dispatches the appropriate sub-agent with section assignment and context
3. Sub-agent returns drafted section content
4. Orchestrator appends the returned content to `<slug>.rfc.md`
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
| `rfc_file_path` | Path | Yes | Path to the accumulating `<slug>.rfc.md` file |
| `clarify_output` | Text | Yes | The Q&A and assumptions from Phase 2 clarification |
| `reconciled_plan` | Text | Conditional | The reconciled approach from Phase 1.5 (required for 3d, 3e, 3f) |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `section_content` | Markdown | The drafted section(s) returned by the sub-agent, appended to the RFC file by the orchestrator |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| RFC file missing or unreadable | Halt pipeline | If the accumulating RFC file is missing when a sub-phase needs it for context, halt and report. |
| Sub-agent returns empty/error | Halt pipeline | If the dispatched sub-agent fails to produce content, halt and report. |
| Write failure | Halt pipeline | If the RFC file cannot be appended to, report the error and halt. |

### Sub-Phase to Section Mapping

**Purpose**: Defines which RFC sections each sub-phase is responsible for drafting.
**Consumers**: Sub-agents (smithy-prose, smithy-plan), orchestrator, harmonize step (3g)
**Providers**: The ignite template specification

#### Mapping Table

| Sub-Phase | RFC Sections Produced |
|-----------|----------------------|
| 3a | Summary, Motivation / Problem Statement |
| 3b | Personas |
| 3c | Goals, Out of Scope |
| 3d | Proposal, Design Considerations |
| 3e | Decisions, Open Questions |
| 3f | Milestones (with Success Criteria per milestone) |

### Harmonize Step (3g) Contract

**Purpose**: Defines how the accumulated RFC is polished after all sections are written.
**Consumers**: Phase 4 (Write & Review)
**Providers**: Sub-phase 3g (orchestrator inline)

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `rfc_file_path` | Path | Yes | Path to the complete `<slug>.rfc.md` with all sections |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `rfc_file` | File | The harmonized `<slug>.rfc.md` rewritten in place |

#### Process

1. Read the complete `<slug>.rfc.md`
2. Perform coherence pass (smooth tone across sections, fix cross-references)
3. Verify all template sections are present and non-empty
4. Rewrite the file in place

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

**Purpose**: The canonical RFC template structure that all sub-phases must conform to.
**Consumers**: Sub-phases 3a-3f, harmonize step 3g, Phase 0 audit, `smithy.audit`
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
- **Ignite → File System**: Piecewise writes append to `<slug>.rfc.md` incrementally. `.clarify-log.md` uses standard append. All file I/O uses operations already available to the agent.
- **Ignite → Downstream Commands**: The final RFC format adds two new sections (Personas, Out of Scope) that `smithy.render` and `smithy.mark` may reference but do not require. No breaking changes to downstream consumers.
- **smithy-prose → Other Commands (future)**: smithy-prose is designed as a shared agent. Other commands can dispatch it for their narrative sections without modification to smithy-prose itself.

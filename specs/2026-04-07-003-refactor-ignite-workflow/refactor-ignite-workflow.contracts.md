# Contracts: Refactor Ignite Workflow

## Overview

This feature modifies the ignite prompt template's internal pipeline structure but does not introduce new external interfaces, APIs, or integration boundaries. The contracts between ignite and its sub-agents (smithy-clarify, smithy-plan, smithy-reconcile, smithy-refine) remain unchanged — only the invocation parameters and context passed to them are enriched.

The primary contract changes are internal to the ignite template: the sub-phase pipeline protocol and the intermediate file format conventions.

## Interfaces

### Sub-Phase Pipeline Protocol

**Purpose**: Defines how each sub-phase (3a-3f) operates within the piecewise drafting pipeline.
**Consumers**: The ignite orchestrator (main prompt context)
**Providers**: Each sub-phase snippet (`ignite-phase3a.md` through `ignite-phase3f.md`)

#### Signature

Each sub-phase follows this protocol:
1. Read all prior `_wip/` files from disk for context
2. Draft its assigned RFC section(s)
3. Write output to the designated `_wip/<NN>-<section>.md` file
4. Control returns to the orchestrator for the next sub-phase

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `rfc_folder` | Path | Yes | The RFC folder path (e.g., `docs/rfcs/2026-001-slug/`) |
| `prior_wip_files` | File contents | Yes | Contents of all `_wip/` files with lower numeric prefixes |
| `clarify_output` | Text | Yes | The Q&A and assumptions from Phase 2 clarification |
| `reconciled_plan` | Text | Conditional | The reconciled approach from Phase 1.5 (required for 3d, 3e, 3f) |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `wip_file` | File | The `_wip/<NN>-<section>.md` file written to disk |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Prior `_wip/` file missing | Halt pipeline | If a required prior file is missing, the sub-phase cannot proceed. Report the gap and halt. |
| Write failure | Halt pipeline | If the `_wip/` file cannot be written, report the error and halt. |

### Sub-Phase to Section Mapping

**Purpose**: Defines which RFC sections each sub-phase is responsible for drafting.
**Consumers**: Sub-phase snippets, assemble step (3g)
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

- **Ignite → Sub-agents**: The invocation interface for smithy-clarify, smithy-plan, smithy-reconcile, and smithy-refine remains unchanged. Only the content of the context and criteria parameters changes.
- **Ignite → Snippets**: New snippet files are consumed via existing Dotprompt `{{>partial-name}}` mechanism. No changes to the partial resolution system.
- **Ignite → File System**: New file I/O patterns (`_wip/` directory, `.clarify-log.md`) use standard file read/write operations already available to the agent.
- **Ignite → Downstream Commands**: The final RFC format adds two new sections (Personas, Out of Scope) that `smithy.render` and `smithy.mark` may reference but do not require. No breaking changes to downstream consumers.

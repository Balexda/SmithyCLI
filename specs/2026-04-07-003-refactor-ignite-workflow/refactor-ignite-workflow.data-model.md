# Data Model: Refactor Ignite Workflow

## Overview

This feature introduces a new shared sub-agent definition (`smithy-prose`) and a persistent clarification log file (`.clarify-log.md`). The RFC file itself (`<slug>.rfc.md`) serves as the intermediate artifact during piecewise generation — each sub-phase appends its section(s) directly to the growing file.

## Entities

### 1) Clarify Log (`.clarify-log.md`)

Purpose: Persistent record of clarification Q&A and assumptions from each `smithy.ignite` session. Used by smithy-clarify in subsequent sessions to avoid re-asking resolved questions.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `filename` | String | Yes | Always `.clarify-log.md` |
| `location` | Path | Yes | `docs/rfcs/<YYYY-NNN-slug>/` (co-located with the RFC) |
| `sessions` | Markdown sections | Yes | Each session is a dated heading (`### Session YYYY-MM-DD`) followed by assumptions and Q&A |

Validation rules:
- Each session entry must include a date heading.
- Assumptions and questions should be formatted consistently (bullet points with Q/A notation).
- The file is append-only — new sessions are added at the end, existing sessions are never modified.

### 2) Smithy-Prose Agent Definition (`smithy.prose.prompt`)

Purpose: New shared sub-agent template for drafting narrative/persuasive sections of planning artifacts. Used by ignite for Summary, Motivation, and Personas sections. Designed for reuse by other commands.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `filename` | String | Yes | `smithy.prose.prompt` |
| `location` | Path | Yes | `src/templates/agent-skills/agents/` |
| `frontmatter.name` | String | Yes | `smithy-prose` |
| `frontmatter.tools` | Array | Yes | `[Read, Grep, Glob]` — read-only codebase access |
| `frontmatter.model` | String | Yes | `opus` — narrative quality benefits from strongest model |
| `body` | Markdown | Yes | Prompt instructions for narrative drafting |

Validation rules:
- Must follow the same frontmatter schema as other agent definitions (name, description, tools, model).
- Must be non-interactive (returns output to parent agent only).
- Must accept section assignment, idea description, clarification output, and optional RFC file path as input.

## Relationships

- Clarify Log 1:1 RFC — each `.clarify-log.md` belongs to exactly one RFC folder.
- Clarify Log is consumed-by smithy-clarify — passed as additional context on subsequent sessions.
- RFC File is written-by orchestrator — the orchestrator appends sub-agent output to `<slug>.rfc.md` after each sub-phase.
- RFC File is read-by sub-agents — smithy-prose and smithy-plan receive the path to the accumulating RFC file as context for subsequent sub-phases.

## State Transitions

### RFC File Lifecycle (during piecewise generation)

1. `nonexistent` → `header-only`
   - Trigger: Phase 3 begins; orchestrator creates `<slug>.rfc.md` with RFC title and metadata header
   - Effects: File exists with `# RFC: <Title>` and `**Created**: ... | **Status**: Draft`

2. `header-only` → `partial` (sections accumulate)
   - Trigger: Each sub-phase (3a-3f) completes and orchestrator appends the returned content
   - Effects: New section(s) appended to the file

3. `partial` → `complete`
   - Trigger: All sub-phases 3a-3f have appended their sections
   - Effects: File contains all RFC template sections

4. `complete` → `harmonized`
   - Trigger: Sub-phase 3g (Harmonize) rewrites the file in place for coherence
   - Effects: File is the final RFC, ready for Phase 4 (Write & Review)

5. `partial` → `partial` (resumed after interruption)
   - Trigger: Phase 0 detects partial RFC (by parsing headings), user accepts resume
   - Effects: Pipeline continues from first missing section

### Clarify Log Lifecycle

1. `nonexistent` → `created`
   - Trigger: First clarification phase completes for an RFC
   - Effects: `.clarify-log.md` created with initial session entry

2. `created` → `appended`
   - Trigger: Subsequent clarification sessions complete
   - Effects: New session entry appended to existing file

## Identity & Uniqueness

- The RFC file is uniquely identified by its filename (`<slug>.rfc.md`) within the RFC folder. Only one RFC file per folder.
- The clarify log is uniquely identified by its fixed filename (`.clarify-log.md`) within an RFC folder. Only one can exist per RFC.

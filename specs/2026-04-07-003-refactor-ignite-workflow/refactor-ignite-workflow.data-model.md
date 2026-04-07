# Data Model: Refactor Ignite Workflow

## Overview

This feature introduces intermediate file artifacts used during piecewise RFC generation. These are transient (the `_wip/` directory) or persistent (the `.clarify-log.md`) files that support the pipeline's context-passing and deduplication mechanisms.

## Entities

### 1) WIP Sub-Phase Output (`_wip/<NN>-<section>.md`)

Purpose: Holds the intermediate output of a single sub-phase during piecewise RFC drafting. Each file contains one or more RFC sections in Markdown format. Files are consumed by subsequent sub-phases for context and by the assemble step for final RFC composition.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `filename` | String | Yes | Zero-padded prefix + kebab-case section name (e.g., `01-problem.md`, `02-personas.md`) |
| `content` | Markdown | Yes | One or more RFC sections in Markdown format, using the RFC template's heading conventions |
| `location` | Path | Yes | `docs/rfcs/<YYYY-NNN-slug>/_wip/` |

Validation rules:
- Filename prefix must be two-digit zero-padded (01-06).
- Content must be non-empty Markdown.
- Files must be numbered sequentially without gaps for the assemble step to succeed.

### 2) Clarify Log (`.clarify-log.md`)

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

## Relationships

- WIP Sub-Phase Output 1:1 RFC — each `_wip/` directory belongs to exactly one RFC folder.
- Clarify Log 1:1 RFC — each `.clarify-log.md` belongs to exactly one RFC folder.
- WIP Sub-Phase Output is consumed-by Assemble Step — the 3g assemble step reads all `_wip/` files to produce the final RFC.
- Clarify Log is consumed-by smithy-clarify — passed as additional context on subsequent sessions.

## State Transitions

### WIP Directory Lifecycle

1. `nonexistent` → `in-progress`
   - Trigger: Sub-phase 3a begins and writes `01-problem.md`
   - Effects: `_wip/` directory is created inside the RFC folder

2. `in-progress` → `in-progress` (files accumulate)
   - Trigger: Each subsequent sub-phase (3b-3f) completes
   - Effects: New numbered file added to `_wip/`

3. `in-progress` → `deleted`
   - Trigger: Sub-phase 3g (Assemble) successfully writes the final RFC
   - Effects: `_wip/` directory and all contents are deleted

4. `in-progress` → `partial` (interrupted)
   - Trigger: Session interruption or crash during any sub-phase
   - Effects: `_wip/` directory remains with files from completed sub-phases only

5. `partial` → `in-progress` (resumed)
   - Trigger: Phase 0 detects partial state and user accepts resume
   - Effects: Pipeline continues from first missing sub-phase file

### Clarify Log Lifecycle

1. `nonexistent` → `created`
   - Trigger: First clarification phase completes for an RFC
   - Effects: `.clarify-log.md` created with initial session entry

2. `created` → `appended`
   - Trigger: Subsequent clarification sessions complete
   - Effects: New session entry appended to existing file

## Identity & Uniqueness

- WIP files are uniquely identified by their numeric prefix within a `_wip/` directory. Only one file per prefix number can exist.
- The clarify log is uniquely identified by its fixed filename (`.clarify-log.md`) within an RFC folder. Only one can exist per RFC.
- The `_wip/` directory is uniquely identified by its parent RFC folder path. Only one `_wip/` directory can exist per RFC.

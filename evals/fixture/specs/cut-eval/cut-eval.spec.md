<!--
  Planted fixture for the `cut-from-spec` eval scenario.

  Realism: representative (NOT scout-flawed).

  This file is consumed by the `cut-from-spec` eval scenario via exact-path
  reference (FR-005). The eval depends on the EXACT structure of two rows
  in this file:

    1. The `## Specification Debt` table contains an `SD-001` row whose
       `Status` cell is the literal string `open`. cut's Phase 1 step 3
       (upstream-debt inheritance) only emits the `inherited from spec:`
       prefix in its tasks-file output when at least one upstream debt row
       is `open` (or `inherited`). The eval's PASS depends on that prefix
       appearing in cut's terminal one-shot snippet.

    2. The `## Dependency Order` 4-column table's first user-story row
       carries the ID `US1`. cut's Phase 5 step 1 seeds the tasks-file
       `## Dependency Order` table from the user-story list parsed in
       Phase 1; the eval needs at least US1 so cut emits at least one
       slice in that table.

  DO NOT "fix" anything in this file during routine cleanup. The eval
  treats the SD-001 / Status: open row and the US1 row as load-bearing
  invariants. Removing either silently breaks `npm run eval -- --case
  cut-from-spec`.
-->

# Feature Specification: Add `--dry-run` flag to `smithy init`

**Spec Folder**: `cut-eval`
**Branch**: `cut-eval`
**Created**: 2026-05-12
**Status**: Draft
**Input**: User description — Add a `--dry-run` flag to `smithy init` that prints the deployment plan (which files would be written where) without touching the filesystem, so users can preview what initialization will do before committing.

## Clarifications

### Session 2026-05-12

- The `--dry-run` flag defaults to `false`; users opt in explicitly. `[Critical Assumption]`

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

## User Scenarios & Testing *(mandatory)*

### User Story 1: Preview smithy init deployment with --dry-run (Priority: P1)

As a Smithy user, I want to run `smithy init --dry-run` to see exactly which files would be written and where, so that I can preview the deployment plan before any changes hit my filesystem.

**Why this priority**: Previewing destructive or far-reaching commands is a foundational user-trust feature. Without `--dry-run`, users either guess at what `init` will do or run it in a throwaway directory first; both add friction to a command that should be safe-by-inspection.

**Independent Test**: With Smithy installed, running `smithy init --dry-run -a claude` in an empty directory prints the planned file list (paths the deployer would create or overwrite) and exits with code 0 without creating any files or directories. Re-running without `--dry-run` then produces exactly the planned files.

**Acceptance Scenarios**:

1. **Given** an empty target directory, **When** the user runs `smithy init --dry-run -a claude`, **Then** the CLI prints a per-agent plan listing the destination paths (e.g., `.claude/commands/smithy.strike.md`) without writing any file or creating `.smithy/smithy-manifest.json`, and exits with code 0.
2. **Given** a target directory that already contains a partial Smithy install, **When** the user runs `smithy init --dry-run`, **Then** the CLI prints the plan distinguishing files that would be created from files that would be overwritten, without modifying any existing file.

### Edge Cases

- The user passes `--dry-run` together with `--no-permissions`; the dry-run output must still reflect the permissions flag's effect (no permissions block in the plan).
- The user passes `--dry-run` in a directory the deployer has no write permission to; the dry-run must still succeed (it never writes) and the plan output must not surface a permission-denied error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `init` command MUST accept a `--dry-run` boolean flag that defaults to `false`.
- **FR-002**: When `--dry-run` is set, the `init` command MUST compute the full deployment plan (per-agent destination paths) and print it to stdout, then exit with code 0 without creating, modifying, or deleting any file or directory on the filesystem.
- **FR-003**: The dry-run output MUST be formatted to clearly distinguish planned creations from planned overwrites of existing files, so the user can spot collisions before committing.

### Key Entities

n/a — flag-only feature; no new persistent entities.

## Assumptions

- The existing `init` deployment logic can be cleanly split into a "compute plan" phase and a "write plan" phase without major refactor.
- Stdout is the appropriate destination for the plan output (not a separate `--plan-file` argument), consistent with other Smithy CLI verbose output.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Whether `--dry-run` should also skip writing the `.smithy/smithy-manifest.json` is not yet decided. Skipping it matches "no filesystem writes"; writing it would let subsequent `smithy update` runs reason about the planned state. Needs a product call before implementation. | Functional Scope | High | Medium | open | — |

## Out of Scope

- Adding `--dry-run` to `smithy uninit` or `smithy update` — handled in a follow-up story once the `init` shape is settled.
- A machine-readable `--dry-run --json` output format.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running `smithy init --dry-run` in an empty directory completes in under 2 seconds and writes zero bytes to disk.
- **SC-002**: Re-running `smithy init` (without `--dry-run`) immediately after a `--dry-run` invocation produces the exact set of files listed in the dry-run plan output.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| US1 | Preview smithy init deployment with --dry-run | — | — |

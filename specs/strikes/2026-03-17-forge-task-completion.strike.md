# Strike: Forge marks tasks complete on implementation

**Date:** 2026-03-17  |  **Branch:** strike/forge-task-completion  |  **Status:** Ready

## Summary

When forge completes a task, it should mark it as `[X]` in the source file (`.tasks.md` or `.strike.md`). This provides visible progress tracking without requiring external ticket systems. Additionally, two already-completed tasks files need their checkboxes marked retroactively.

## Goal

Forge automatically marks each task `[X]` in the source file as it completes implementation, and previously completed tasks files are updated to reflect their done state.

## Out of Scope

- Creating external tickets or issues for task tracking
- Changing commit message format to mention task completion
- Modifying the auto-select logic for incomplete slices (it already works correctly once tasks are marked)

## Requirements

- **FR-001**: Forge marks each task `- [ ]` as `- [X]` in the source file after the task's tests pass
- **FR-002**: Task marking applies to both `.tasks.md` and `.strike.md` modes
- **FR-003**: Task marking happens as part of the normal implementation flow, not as a separate step

## Success Criteria

- **SC-001**: The forge template instructs the agent to mark tasks `[X]` after completing each one
- **SC-002**: The instruction applies to both `.tasks.md` and `.strike.md` modes
- **SC-003**: All tasks in `05-implement-slice-as-pr.tasks.md` are marked `[X]`
- **SC-004**: All tasks in `06-fast-track-idea-to-implementation.tasks.md` are marked `[X]`

## User Flow

The user runs `/smithy.forge` with a tasks or strike file. As forge completes each task and its tests pass, it updates the source file to change `- [ ]` to `- [X]` for that task. When the user later looks at the tasks file, they can see which tasks have been completed.

## Data Model

N/A

## Contracts

N/A

## Decisions

- Task completion marks are included in implementation commits, not separated. No special mention in commit messages.
- Both `.tasks.md` and `.strike.md` modes get task marking behavior.
- The existing auto-select logic (pick first slice with incomplete tasks) is left as-is since it was already correct — it just wasn't being fed marked tasks.

## Single Slice

**Goal**: Add task-completion marking instruction to forge template and retroactively mark completed tasks files.

**Justification**: All changes are small edits to markdown files — a single slice covers it cleanly.

### Tasks

- [X] Add instruction to the Implementation section of `src/templates/base/smithy.forge.md` to mark each task `[X]` in the source file after it passes validation
- [X] Ensure the instruction covers both `.tasks.md` and `.strike.md` modes
- [X] Mark all tasks in `specs/2026-03-14-001-smithy-command-redesign/05-implement-slice-as-pr.tasks.md` as `[X]`
- [X] Mark all tasks in `specs/2026-03-14-001-smithy-command-redesign/06-fast-track-idea-to-implementation.tasks.md` as `[X]`

**PR Outcome**: Forge template instructs agents to mark tasks complete as they go, and two previously completed tasks files reflect their done state.

## Validation Plan

- [X] Read the updated forge template and confirm the task-marking instruction is present and clear
- [X] Confirm the instruction applies to both file modes
- [X] Confirm all tasks in `05-implement-slice-as-pr.tasks.md` show `[X]`
- [X] Confirm all tasks in `06-fast-track-idea-to-implementation.tasks.md` show `[X]`

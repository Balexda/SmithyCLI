# Strike: Fix gh CLI permissions and add shared shell guidance prompt

**Date:** 2026-03-17  |  **Branch:** strike/gh-pr-list-permission  |  **Status:** Ready

## Summary

Claude Code blocks `gh pr list` and `gh pr edit` commands due to missing or insufficient permission entries, and rejects commands containing `$(...)` subshell expansions even when the individual commands are permitted. This strike adds missing `gh` permissions, creates a shared guidance prompt to instruct agents on shell best practices, and wires the guidance into workflow prompts.

## Goal

Ensure all common `gh` CLI operations work without permission blocks, and establish a shared guidance prompt pattern for cross-cutting agent instructions.

## Out of Scope

- Changing Claude Code's permission matching algorithm
- Adding permissions for non-GitHub CLI tools
- Refactoring the existing permission structure beyond adding new entries

## Requirements

- **FR-001**: Add `gh pr edit` to the allowed permissions (issue #14)
- **FR-002**: Add bare (no-arg) versions of `gh` subcommands that currently only have wildcard variants (issue #15)
- **FR-003**: Create a shared `smithy.guidance.md` prompt with shell best practices, including avoiding `$(...)` subshell syntax
- **FR-004**: Reference the guidance prompt from workflow prompts that execute shell commands (`smithy.forge.md`)

## Success Criteria

- **SC-001**: `gh pr edit *` appears in generated `settings.json` allow list after `smithy init`
- **SC-002**: Bare `gh pr list`, `gh pr view`, etc. appear in generated `settings.json`
- **SC-003**: `smithy.guidance.md` is deployed to `.claude/prompts/` on init
- **SC-004**: `smithy.forge.md` references `smithy.guidance` for shell best practices
- **SC-005**: `npm run build` and `npm run typecheck` pass

## User Flow

When a developer runs `smithy init` targeting Claude, the generated `.claude/settings.json` includes both bare and wildcard versions of `gh` subcommands plus `gh pr edit`. The deployed `.claude/prompts/smithy.guidance.md` provides shell best practices. When an agent runs `/smithy.forge`, it reads the guidance and avoids constructing commands with `$(...)` subshells, preventing permission blocks.

## Data Model

N/A

## Contracts

N/A

## Decisions

- **Shared prompt over helper scripts**: Instructions in a prompt are simpler to maintain and deploy than bash wrapper scripts. If agents occasionally still use `$(...)`, the permission error will remind them.
- **`smithy.guidance` as a prompt, not a command**: It's reference material, not user-invocable, so no `command: true` in frontmatter.
- **Guidance in forge only for now**: Strike and other prompts that don't directly run complex shell commands don't need the reference yet.

## Single Slice

**Goal**: Add missing `gh` permissions, create the guidance prompt, and wire it into forge.

**Justification**: All three changes are small and interdependent — the permissions fix the immediate blocking issue, the guidance prevents recurrence.

### Tasks

- [x] Task 1: Add `gh pr edit` (bare + wildcard) to `src/permissions.ts`
- [x] Task 2: Add bare versions of existing `gh` subcommands that only have wildcard entries
- [x] Task 3: Create `src/templates/base/smithy.guidance.md` with shell best practices
- [x] Task 4: Add guidance reference to `smithy.forge.md`
- [x] Task 5: Build and typecheck

**PR Outcome**: `smithy init` deploys correct `gh` permissions and a shared guidance prompt; forge references the guidance to avoid subshell-related permission blocks.

## Validation Plan

- [x] `npm run build` succeeds
- [x] `npm run typecheck` succeeds
- [ ] Review generated `settings.json` for new `gh` entries after running `node dist/cli.js init`
- [ ] Verify `smithy.guidance.md` appears in `.claude/prompts/` after init

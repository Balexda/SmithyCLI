# Tasks: Commit-or-gitignore choice for `.smithy/`

**Source**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.spec.md` — User Story 3
**Data Model**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.data-model.md`
**Contracts**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.contracts.md`
**Story Number**: 03

---

## Slice 1: Add commit-or-gitignore prompt to init flow

**Goal**: After `.smithy/` templates are created during `smithy init`, prompt the user to choose whether `.smithy/` is checked into the repo or added to `.gitignore`. The `-y` flag defaults to "commit" (no gitignore). The prompt is skipped on overwrite (only shown on first creation).

**Justification**: This is the entire user story — a single prompt with gitignore integration. The gitignore mechanics (`addToGitignore`) already exist, so this slice is self-contained and PR-sized.

**Addresses**: FR-003; Acceptance Scenarios 3.1, 3.2, 3.3, 3.4

### Tasks

- [ ] In `src/interactive.ts`, add a `promptSmithyCommit()` function using `confirm()` that asks: "Check .smithy/ into the repo?" with default `true`. Return `boolean`.
- [ ] In `src/commands/init.ts`, after the `.smithy/` template creation step (Story 1's code), call `promptSmithyCommit()` only when templates were **newly created** (not on overwrite). If the user declines (chooses gitignore), call `addToGitignore(targetDir, ['.smithy/'])`.
- [ ] Handle the `-y` (non-interactive) flag: when `-y` is set, skip the prompt and default to "commit" (do not add to gitignore).
- [ ] Add unit tests in `src/cli.test.ts` covering:
  - Init with `-y` does NOT add `.smithy/` to `.gitignore`.
  - Init with gitignore choice appends `.smithy/` to `.gitignore`.
  - Init with gitignore choice when `.gitignore` already contains `.smithy/` does not duplicate.
  - Init with gitignore choice when no `.gitignore` exists creates one with `.smithy/` entry.
  - Init overwrite flow does NOT re-prompt for commit/gitignore.
- [ ] Run `npm test` and `npm run typecheck` to verify all tests pass.

**PR Outcome**: Running `smithy init` and accepting template creation now asks whether to commit or gitignore `.smithy/`. Choosing gitignore correctly updates `.gitignore` with deduplication and file-creation support.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — This is the only slice. It depends on Story 1 (template creation) being implemented first, as the prompt is triggered by successful template creation.

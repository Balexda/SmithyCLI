# Tasks: Create `.smithy/` issue templates during init

**Source**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.spec.md` — User Story 1
**Data Model**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.data-model.md`
**Contracts**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.contracts.md`
**Story Number**: 01

---

## Slice 1: Default template content and provisioning utility

**Goal**: Ship the `.smithy/` template source files and a reusable utility that writes them to a target directory, with unit tests.

**Justification**: This is the foundational data + logic layer. The init flow integration (Slice 2) depends on having templates to deploy and a function to call.

**Addresses**: FR-002, FR-007; Acceptance Scenario 1.1 (template files created with correct content)

### Tasks

- [ ] Create `src/templates/smithy-issue-templates/rfc.md` with the default RFC milestone issue template content from the spec
- [ ] Create `src/templates/smithy-issue-templates/features.md` with the default feature issue template content from the spec
- [ ] Create `src/templates/smithy-issue-templates/spec.md` with the default user story issue template content from the spec
- [ ] Create `src/templates/smithy-issue-templates/tasks.md` with the default slice issue template content from the spec
- [ ] Add a `deploySmithyTemplates(targetDir: string)` function (in `src/utils.ts` or a new module) that creates `.smithy/` and writes all 4 files — overwrites existing files if present, preserves extra files in the directory
- [ ] Add a `addSmithyToGitignore(targetDir: string)` function leveraging the existing `addToGitignore` pattern
- [ ] Add unit tests: verify template files are written with correct content, overwrite replaces only the 4 known files, gitignore append works (including dedup and create-from-scratch cases)

**PR Outcome**: The provisioning utility is tested and ready to be called from the init flow. No user-facing behavior change yet.

---

## Slice 2: Init flow integration, CLI flag, interactive prompts, and uninit guard

**Goal**: Wire `.smithy/` provisioning into `smithy init` with interactive prompts, a CLI flag, `--yes` default, and verify uninit leaves `.smithy/` alone.

**Justification**: This delivers the complete user-facing feature — all 4 acceptance scenarios are testable after this slice.

**Addresses**: FR-001, FR-003, FR-004, FR-009; Acceptance Scenarios 1.1–1.4

### Tasks

- [ ] Add `--smithy-templates` / `--no-smithy-templates` flag to the init command in `src/cli.ts` (mirrors `--issue-templates` pattern)
- [ ] Add `promptCreateSmithyTemplates()` prompt in `src/interactive.ts`: "Create smithy issue templates in .smithy/? (Y/n)" — default yes
- [ ] Add `promptOverwriteSmithyTemplates()` prompt in `src/interactive.ts`: "Overwrite existing .smithy/ templates with defaults? (y/N)" — default no
- [ ] Add `promptCommitSmithyTemplates()` prompt in `src/interactive.ts`: "Check .smithy/ into the repo? (Y/n)" — default yes; if declined, call `addSmithyToGitignore()`
- [ ] Wire into `src/commands/init.ts`: after target dir is resolved but before agent deployment — check if `.smithy/` exists to decide create vs overwrite prompt; `--yes` defaults to creating templates; skip commit/gitignore prompt on overwrite (per contracts spec)
- [ ] Verify `src/commands/uninit.ts` does NOT touch `.smithy/` — add an explicit test that `.smithy/` survives uninit
- [ ] Add integration tests in `src/cli.test.ts`: (a) `--yes` creates `.smithy/` with 4 files, (b) `--no-smithy-templates` skips creation, (c) double-init offers overwrite (tested via `--yes` which overwrites), (d) uninit preserves `.smithy/`

**PR Outcome**: Running `smithy init` prompts for `.smithy/` templates. All 4 acceptance scenarios pass. `smithy uninit` leaves `.smithy/` untouched.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — Templates and utility must exist before the init flow can call them
2. **Slice 2** — Wires everything together into the user-facing feature; depends on Slice 1's utility functions

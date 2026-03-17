# Tasks: Orders: Create Tickets from Artifacts

**Source**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.spec.md` — User Story 8
**Data Model**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.data-model.md`
**Contracts**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.contracts.md`
**Story Number**: 08

---

## Slice 1: Create smithy.orders template with per-extension ticket mapping

**Goal**: A working `smithy.orders.md` template that auto-detects artifact type by extension and creates the correct ticket structure for each type, with parent-child linking and simple duplicate detection.

**Justification**: This is the core deliverable — orders must handle all 4 artifact types with distinct ticket mappings. The GitHub CLI patterns from `smithy.load` are preserved and adapted.

**Addresses**: FR-005, FR-014, FR-015; Acceptance Scenarios 8.1, 8.2, 8.3, 8.4, 8.5

### Tasks

- [ ] Create `src/templates/base/smithy.orders.md` with `command: true` frontmatter
- [ ] Define input handling: accept a file path, auto-detect artifact type by extension (FR-005, AS 8.5) — no flags or mode arguments
- [ ] Add error handling for companion files (`.data-model.md`, `.contracts.md`) — reject with guidance to use the parent `.spec.md` instead (per contracts error conditions)
- [ ] Define ticket mapping for `.rfc.md`: one epic/tracking issue + one issue per milestone, next step annotation "render" (AS 8.1)
- [ ] Define ticket mapping for `.features.md`: one issue per feature, linked to milestone issue if it exists, next step "mark" (AS 8.2)
- [ ] Define ticket mapping for `.spec.md`: one issue per user story, next step "cut" (AS 8.3)
- [ ] Define ticket mapping for `.tasks.md`: one issue per slice, linked to user story issue if it exists, next step "forge" (AS 8.4)
- [ ] Add parent-child linking instructions: search for parent tickets by title convention, link with GitHub issue references (FR-015)
- [ ] Add simple duplicate detection: before creating, search `gh issue list --search` for issues matching the title convention, prompt user if matches found
- [ ] Preserve useful GitHub CLI command patterns from `smithy.load.md` (milestone create/update, issue creation with `--body-file`, GraphQL blocked-by links)
- [ ] Add output summary: list of created issues with numbers, links, and any follow-up actions

**PR Outcome**: Running `/smithy.orders path/to/artifact` auto-detects the artifact type and creates the correct ticket structure with parent linking. Works for all 4 artifact extensions.

---

## Slice 2: Remove legacy smithy.load and update references

**Goal**: The legacy `smithy.load.md` template is removed, and all project references point to `smithy.orders` instead.

**Justification**: Standalone because the orders template is already functional from Slice 1. This cleans up the old command.

**Addresses**: FR-016

### Tasks

- [ ] Delete `src/templates/base/smithy.load.md`
- [ ] Search codebase for references to `smithy.load` or `smithy-load` (in `.ts` files, other templates, CLAUDE.md, specs) and update or remove them
- [ ] Verify `npm run build` succeeds
- [ ] Verify `npm run typecheck` passes

**PR Outcome**: `smithy.load` is fully removed. All references point to `smithy.orders`.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — Must come first because Slice 2 deletes the source file whose patterns Slice 1 draws from.
2. **Slice 2** — Safe after Slice 1 since the new template is in place.

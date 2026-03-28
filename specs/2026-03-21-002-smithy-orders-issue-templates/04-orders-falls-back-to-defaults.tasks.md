# Tasks: Orders falls back to built-in defaults

**Source**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.spec.md` — User Story 4
**Data Model**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.data-model.md`
**Contracts**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.contracts.md`
**Story Number**: 04

---

## Slice 1: Built-in default template files

**Goal**: Create the 4 default issue template source files as a single source of truth that both the orders prompt fallback and future `smithy init` deployment can reference.

**Justification**: These files are foundational — the orders prompt needs to reference their content for fallback behavior, and `smithy init` (Story 1) will later copy them to `.smithy/`. Without them, there's nothing to fall back to.

**Addresses**: FR-006, FR-010; Acceptance Scenario 4.1

### Tasks

- [ ] Create `src/templates/smithy-templates/rfc.md` with the default RFC template from the spec (lines 131-143), using `{{variable}}` placeholder syntax.
- [ ] Create `src/templates/smithy-templates/features.md` with the default features template from the spec (lines 147-160).
- [ ] Create `src/templates/smithy-templates/spec.md` with the default spec/user-story template from the spec (lines 164-186).
- [ ] Create `src/templates/smithy-templates/tasks.md` with the default tasks/slice template from the spec (lines 189-209).
- [ ] Wire the new `src/templates/smithy-templates/` directory into the build/deploy pipeline: add a helper in `src/templates.ts` (e.g., `getSmithyTemplateFiles()` / `readSmithyTemplate(type)`) so that init and the orders prompt can reference these files, and update `package.json` `files` if needed to ensure the directory is included in the published package.
- [ ] Add tests in `src/templates.test.ts` verifying: all 4 files exist, each contains the expected `{{variable}}` placeholders for its type (per the data model's variable table), has no unclosed code fences, and only uses placeholders that match the pattern `{{[a-z0-9_]+}}`.

**PR Outcome**: 4 default issue template files exist in `src/templates/smithy-templates/` with correct `{{variable}}` placeholders, wired into the template system, and verified by tests.

---

## Slice 2: Template resolution and interpolation in the orders prompt

**Goal**: Update `smithy.orders.md` to check for `.smithy/<type>.md` templates, interpolate `{{variable}}` placeholders, and fall back to built-in defaults when custom templates are absent.

**Justification**: This is the core behavior change — the orders prompt gains awareness of `.smithy/` templates and a structured fallback path. Slice 1's default files provide the fallback content this slice references.

**Addresses**: FR-005, FR-006, FR-007, FR-008, FR-010; Acceptance Scenarios 4.1, 4.2, 4.3

### Tasks

- [ ] Add a new **Phase 2.5: Resolve Template** section to `smithy.orders.md` (between current Phase 2 and Phase 3) that instructs the agent to: (1) check for `.smithy/<artifact-type>.md` in the repo root, (2) if found, read it as the body template, (3) if not found, use the built-in default template for that type. Include the full text of each built-in default template inline in the prompt (sourced from Slice 1's files) so the agent has the fallback content available without needing to read external files.
- [ ] Add interpolation instructions within the new phase: after loading a template (custom or default), replace all `{{variable}}` placeholders with artifact-derived content using the variable mappings from the data model (e.g., `{{user_story}}` → extracted story text, `{{spec_path}}` → repo-relative path). Unknown placeholders are left as literal text. Missing content → empty string.
- [ ] Refactor Phase 5's hardcoded `cat > /tmp/orders_body.md` blocks to reference the resolved+interpolated template body instead of inline heredocs. The existing Phase 5 structure (title conventions, `gh issue create` calls, parent linking) stays intact — only the body content source changes.
- [ ] Add edge case handling instructions: (a) `.smithy/` exists but target template is missing → fall back to default for that type only, (b) template is empty → use it as-is (empty body, title still set), (c) template has unknown `{{placeholder}}` → leave as literal text.
- [ ] Update tests in `src/templates.test.ts` to verify: `smithy.orders.md` contains template resolution instructions (check for `.smithy/` reference), contains interpolation instructions (check for `{{variable}}` handling language), and references all 4 artifact types' fallback content.

**PR Outcome**: The `smithy.orders` prompt instructs the AI agent to resolve templates from `.smithy/` with fallback to built-in defaults, interpolate `{{variable}}` placeholders, and handle edge cases — covering all 3 acceptance scenarios.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — Default template files must exist first so Slice 2 can reference their content inline in the prompt.
2. **Slice 2** — Adds resolution, interpolation, and fallback logic to the orders prompt, consuming Slice 1's templates.

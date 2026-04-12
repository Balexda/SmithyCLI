# Tasks: Orders uses `.smithy/` templates when creating issues

**Source**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.spec.md` — User Story 2
**Data Model**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.data-model.md`
**Contracts**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.contracts.md`
**Story Number**: 02

---

## Slice 1: Template resolution and interpolation context

**Goal**: Add a new phase to `smithy.orders.md` that instructs the agent to resolve issue body templates from `.smithy/` (with built-in fallback) and defines the interpolation variable context for all 4 artifact types.

**Justification**: This slice delivers the template resolution algorithm and variable definitions as a self-contained reference within the prompt. Even before Phase 5 is restructured, this phase documents the contract between `.smithy/` templates and the orders command — making it reviewable and testable independently.

**Addresses**: FR-005, FR-006, FR-007, FR-008; Acceptance Scenarios 1–5 (partial — defines the mechanism, Slice 2 wires it in)

### Tasks

- [ ] Add a new "Phase 3b: Resolve Body Template" section to `src/templates/base/smithy.orders.md`, placed between the current Phase 3 (Parse Artifact) and Phase 4 (Duplicate Detection). Renumber subsequent phases accordingly (old Phase 4 → Phase 5, etc.).
- [ ] In the new phase, document the **resolution algorithm**: (1) determine artifact type from extension, (2) check for `.smithy/<type>.md` in repo root, (3) if found use it as body template, (4) if not found use built-in default. Note that an empty template file is a valid override (title is set independently).
- [ ] Add an **interpolation context table** for each artifact type listing all `{{variable}}` names, their source (which field of the parsed artifact), and content type (inline text vs. repo-relative path). Use the variable names from the data model: `{{title}}`, `{{next_step}}`, `{{parent_issue}}`, plus type-specific variables (`{{user_story}}`, `{{acceptance_scenarios}}`, `{{priority}}`, `{{spec_path}}`, `{{data_model_path}}`, `{{contracts_path}}`, `{{slice_goal}}`, `{{slice_tasks}}`, `{{slice_number}}`, `{{tasks_path}}`, `{{milestone_description}}`, `{{rfc_path}}`, `{{feature_description}}`, `{{feature_title}}`, `{{features_path}}`, `{{user_story_number}}`).
- [ ] Document the **interpolation algorithm**: (1) parse template for `{{variable}}` patterns, (2) look up each in the context for the artifact type, (3) if found replace with content, (4) if not found leave as literal text. Note: malformed placeholders (`{{}}`, `{{ }}`) are left as-is.
- [ ] Add the **`{{next_step}}` mapping** within the interpolation context section: rfc→render, features→mark, spec→cut, tasks→forge.
- [ ] Add a **"Built-in Default Templates"** subsection containing the 4 default body templates from the spec's "Default Template Content" section. These serve as the fallback when `.smithy/` templates are absent.
- [ ] Run `npm run build` and `npm run typecheck` to verify no build regressions.
- [ ] Run `npm test` to verify no test regressions.

**PR Outcome**: The orders prompt contains a complete template resolution phase with variable definitions and built-in defaults. The existing Phase 5 body construction is unchanged — it still works as before. The new phase is additive and self-contained.

---

## Slice 2: Restructure ticket body construction to use template pipeline

**Goal**: Rewrite the ticket creation phase of `smithy.orders.md` to use the template resolution and interpolation pipeline from Slice 1 instead of hardcoded inline body text, and add tests verifying the prompt structure.

**Justification**: This slice completes the integration — the agent now follows the resolve → build context → interpolate → write flow for every ticket it creates. Without this, the resolution phase from Slice 1 is documentation only.

**Addresses**: FR-005, FR-007, FR-008, FR-010; Acceptance Scenarios 1–6

### Tasks

- [ ] Restructure the "Create Tickets" phase in `src/templates/base/smithy.orders.md` to follow a 3-step pipeline for each ticket: (1) resolve the body template (custom or built-in default from the new phase), (2) build the interpolation context from the parsed artifact data, (3) interpolate `{{variable}}` placeholders and write the result to the temp body file.
- [ ] Replace the 5 hardcoded `cat > /tmp/orders_body.md << 'BODY' ... BODY` blocks (rfc parent, rfc child, features child, spec child, tasks child) with instructions that reference the resolved template and interpolation context. Keep the `gh issue create --title ... --body-file` pattern unchanged.
- [ ] Ensure the **title conventions table** remains unchanged — titles are set independently of the body template.
- [ ] Ensure the **parent linking logic** (searching for existing parent issues) remains in the ticket creation phase — the `{{parent_issue}}` variable is populated from this lookup.
- [ ] Verify that the **duplicate detection phase** is unaffected — it runs before body construction.
- [ ] Update the **Rules** section at the bottom of the prompt to include: "DO use `.smithy/` templates when available, falling back to built-in defaults" and "DO leave unknown `{{variable}}` placeholders as literal text".
- [ ] Add or update tests in the appropriate test file to verify: (a) the orders prompt contains the template resolution phase, (b) the prompt references `.smithy/` directory, (c) the prompt contains interpolation context tables for all 4 artifact types, (d) the prompt contains the `{{next_step}}` mapping.
- [ ] Run `npm run build` and `npm run typecheck` to verify no build regressions.
- [ ] Run `npm test` to verify all tests pass including new ones.

**PR Outcome**: The orders prompt instructs the agent to use `.smithy/` templates with `{{variable}}` interpolation for all ticket bodies, falling back to built-in defaults. All 6 acceptance scenarios for Story 2 are addressed.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

Recommended implementation sequence:

- [ ] **Slice 1** — establishes the template resolution algorithm, variable context definitions, and built-in default templates. Must come first because Slice 2 references these sections.
- [ ] **Slice 2** — restructures the body construction to use the pipeline and adds tests. Depends on Slice 1's resolution phase and context tables being in place.

# Tasks: Audit: Context-Aware Artifact Review

**Source**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.spec.md` — User Story 7
**Data Model**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.data-model.md`
**Contracts**: `specs/2026-03-14-001-smithy-command-redesign/smithy-command-redesign.contracts.md`
**Story Number**: 07

---

## Slice 1: Add audit checklist markers to producing command templates

**Goal**: Each producing command template (ignite, render, mark, cut, strike) contains a marked audit checklist section that defines what "good" looks like for its artifact type.

**Justification**: This is the foundation — the checklists must exist in source templates before `init` can extract and compose them. Each template is independently valid after this change (markers are HTML comments, invisible to agents).

**Addresses**: FR-012; Acceptance Scenarios 7.1, 7.2, 7.3, 7.4, 7.5

### Tasks

- [x] Define the marker convention: `<!-- audit-checklist-start -->` / `<!-- audit-checklist-end -->`
- [x] Add audit checklist section to `smithy.ignite.md` covering: ambiguity, milestone completeness, feasibility (AS 7.1)
- [x] Add audit checklist section to `smithy.render.md` covering: feature coverage, gaps, overlap (AS 7.2)
- [x] Add audit checklist section to `smithy.mark.md` covering: requirement traceability, acceptance coverage, data model consistency (AS 7.3)
- [x] Add audit checklist section to `smithy.cut.md` covering: slice scoping, testability, edge case coverage (AS 7.4) — align with existing Phase 0 categories
- [x] Add audit checklist section to `smithy.strike.md` covering: requirement completeness, slice scoping, validation plan coverage, data model/contracts presence (AS 7.5)
- [x] Ensure each checklist uses a consistent format (category table with "what to check" column) so `init` can extract uniformly

**PR Outcome**: All producing command templates contain marked audit checklists. Templates still function normally — markers are invisible to agents. No behavior change yet.

---

## Slice 2: Add audit template composition to templates.ts

**Goal**: A `composeAuditTemplate()` function in `templates.ts` extracts audit checklists from all producing command templates and assembles them into the audit template.

**Justification**: This is the build-time wiring that replaces runtime lookups. It's independently testable — you can call the function and verify the composed output without deploying.

**Addresses**: FR-012, FR-005; Acceptance Scenarios 7.1, 7.2, 7.3, 7.4, 7.5

### Tasks

- [X] Add `extractAuditChecklist(content: string): string | null` function to `templates.ts` — extracts content between audit checklist markers, returns null if no markers found
- [X] Add `composeAuditTemplate(templates: Map<string, string>, auditTemplate: string): string` function to `templates.ts` — collects checklists from all templates, maps each to its artifact extension, injects them into the audit template at a designated placeholder
- [X] Define the audit template placeholder convention (e.g., `<!-- composed-checklists -->`) where composed checklists get injected
- [X] Map template names to artifact extensions for the composed output (e.g., `smithy-ignite` → `.rfc.md`, `smithy-cut` → `.tasks.md`)
- [X] Add unit tests for `extractAuditChecklist` and `composeAuditTemplate`
- [X] Verify `npm run build` and `npm run typecheck` pass

**PR Outcome**: `templates.ts` exports composition functions that can assemble a complete audit template from source templates. Tested but not yet wired into `init`.

---

## Slice 3: Rewrite audit template and wire composition into init

**Goal**: The audit template is rewritten as a composable shell with forge-branch mode, and `init` calls `composeAuditTemplate()` before deploying.

**Justification**: With checklists in source templates (Slice 1) and composition logic ready (Slice 2), this slice connects everything and delivers the working audit command.

**Addresses**: FR-012, FR-013, FR-005; Acceptance Scenarios 7.1–7.7

### Tasks

- [X] Rewrite `smithy.audit.md` template:
  - Add `command: true` to frontmatter
  - Add input handling: accept a file path, detect artifact type by extension (FR-005), no flags needed
  - Add `<!-- composed-checklists -->` placeholder where per-extension checklists get injected
  - Add forge-branch mode: when no file argument and on a forge branch, parse `<NNN>/us-<NN>-<slug>/slice-<N>` to discover context, review code diff against slice + spec (FR-013)
  - Add read-only enforcement: findings are presented but artifact is NOT modified (AS 7.7)
  - Add fallback: if on a forge branch with no upstream spec artifacts, audit code but note missing context
  - Remove old terminology (journeys, Feature Plans, coding-standards.md)
- [X] Update `init` deploy flow to call `composeAuditTemplate()` before deploying the audit template to any agent
- [X] Verify the composed audit template contains all 5 extension-specific checklists when deployed
- [X] Verify `npm run build` and `npm run typecheck` pass

**PR Outcome**: Running `/smithy.audit path/to/file.spec.md` produces an extension-aware review. Running `/smithy.audit` on a forge branch reviews code against upstream context. Audit never modifies artifacts.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — Checklists must exist in source templates before they can be extracted
2. **Slice 2** — Composition logic must exist before init can use it
3. **Slice 3** — Connects everything: rewritten audit template + init wiring

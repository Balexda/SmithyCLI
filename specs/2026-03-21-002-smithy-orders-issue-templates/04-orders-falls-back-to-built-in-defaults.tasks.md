# Tasks: Orders Falls Back to Built-in Defaults

**Source**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.spec.md` — User Story 4
**Data Model**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.data-model.md`
**Contracts**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.contracts.md`
**Story Number**: 04

---

## Slice 1: Spec-Compliant Fallback Bodies with Parity Assertion

**Goal**: Make every Phase 5 fallthrough body in `src/templates/agent-skills/commands/smithy.orders.prompt` produce an issue body that matches the spec's "Default Template Content" for its artifact type, with a structural assertion in `src/templates.test.ts` that locks the prompt's fallback bodies to the canonical exports in `src/orders-templates.ts`. After this slice, deleting any `<manifestDir>/templates/orders/<type>.md` (or removing the whole `templates/orders/` subtree) and running `smithy.orders` yields the hybrid (inlined content + repo-relative paths) issue body the spec promises, for all four artifact types, without divergence between prompt-resident defaults and the canonical defaults module.

**Justification**: AS 4.1 ("no templates → defaults") requires all four artifact types to use built-in defaults together in a single run, so any per-type split fragments coherent work. AS 4.2–4.4 exercise the same fallthrough path from different starting conditions; they don't introduce new code surface, only new states of `<manifestDir>/templates/orders/`. The four heredoc bodies, the Phase 3 RFC parser extension (required to populate `{{milestone_success_criteria}}`), and the parity test all touch overlapping regions (`smithy.orders.prompt` Phases 3 and 5; the existing `smithy.orders command delegates GitHub ops to smithy.gh-issue scripts` block in `src/templates.test.ts`); separating them would manufacture artificial PR boundaries and leave intermediate states that ship unresolved placeholders. Stands alone as a working increment: after merge, the fallback story closes end-to-end with a single PR.

**Addresses**: FR-006, FR-010; AS 4.1, AS 4.2, AS 4.3, AS 4.4.

### Tasks

- [ ] **Extend Phase 3 RFC parser to extract milestone success criteria**

  Update the `.rfc.md` parsing section of Phase 3 in `src/templates/agent-skills/commands/smithy.orders.prompt` so each milestone yields its success-criteria text alongside the title and description it already captures. The captured value feeds the `{{milestone_success_criteria}}` placeholder used by the new RFC fallback body. If US2 already added this extraction, leave it in place — the acceptance criterion is the observable parser instruction, not a textual edit.

  _Acceptance criteria:_
  - Phase 3's `.rfc.md` parse block enumerates milestone title, description, and success-criteria as the per-milestone extraction set.
  - The success-criteria extraction targets the `**Success Criteria**` body within each `### Milestone N:` block, not any top-level RFC section.
  - Behavior matches the data-model row `{{milestone_success_criteria}} | rfc | inline | body of **Success Criteria**`.
  - When a milestone has no `**Success Criteria**` block, the variable resolves to empty string per the data-model validation rule.
  - Parsing rules for `.features.md`, `.spec.md`, and `.tasks.md` are unchanged.

- [ ] **Rewrite Phase 5 fallback bodies to match spec Default Template Content for all four types, pinned to `src/orders-templates.ts`**

  Replace the four fallthrough heredoc bodies in Phase 5 of `src/templates/agent-skills/commands/smithy.orders.prompt` (RFC per-milestone child, feature, user story, slice) with the spec's "Default Template Content" sections for each type. The implement agent preserves whatever issue-creation scaffolding currently wraps each body (heredoc + `create-issue.sh` invocation in today's prompt) — only the body content changes. The fallthrough branch is reached only when `<manifestDir>/templates/orders/<type>.md` is absent, so US2's branching for the template-present case (AS 4.4) is unaffected. The RFC parent tracking issue (the `[RFC] <rfc-title>` epic body) remains hardcoded per the spec's Out of Scope section. Pin the prompt fallback bodies to the canonical exports introduced by US1 in `src/orders-templates.ts` via a structural assertion inside the existing `smithy.orders command delegates GitHub ops to smithy.gh-issue scripts` block in `src/templates.test.ts`, so the two surfaces cannot silently drift apart.

  Per-type variable sets the new fallback bodies must render (drawn from the data-model variable table and the spec's "Default Template Content" section):
  - **rfc** (per-milestone child): `{{title}}`, `{{milestone_number}}`, `{{milestone_title}}`, `{{milestone_description}}`, `{{milestone_success_criteria}}`, `{{rfc_path}}`, `{{parent_issue}}`, `{{next_step}}`.
  - **features**: `{{title}}`, `{{feature_description}}`, `{{milestone_number}}`, `{{parent_issue}}`, `{{features_path}}`, `{{next_step}}`.
  - **spec** (per–user-story): `{{title}}`, `{{priority}}`, `{{user_story_number}}`, `{{user_story}}`, `{{acceptance_scenarios}}`, `{{spec_path}}`, `{{data_model_path}}`, `{{contracts_path}}`, `{{next_step}}`, `{{spec_folder}}`.
  - **tasks** (per-slice): `{{title}}`, `{{slice_number}}`, `{{slice_goal}}`, `{{slice_tasks}}`, `{{tasks_path}}`, `{{parent_issue}}`, `{{next_step}}`.

  _Acceptance criteria:_
  - All four Phase 5 fallback bodies follow the structure shown in the spec's "Default Template Content" section for their type — H1 `# {{title}}` heading, hybrid pattern (inline actionable content + Source/Context section with repo-relative paths).
  - Every variable named in the per-type list above appears at least once in the corresponding fallback body.
  - The spec-type fallback's `{{next_step}}` line includes the parenthetical the spec shows alongside the spec-type next step, naming `{{spec_folder}}` and `{{user_story_number}}` — resolves the scope-edge drift between the prior heredoc's example-style parenthetical and the spec default.
  - The RFC parent tracking issue body (the `[RFC] <rfc-title>` epic) is unchanged.
  - Whatever issue-creation scaffolding currently surrounds each fallback body in the prompt is preserved; only the body content is rewritten.
  - The US2 branching (template file present → use file; absent → fallthrough) is unchanged; only the fallthrough body content is rewritten.
  - The `smithy.orders command delegates GitHub ops to smithy.gh-issue scripts` block in `src/templates.test.ts` is extended with a parity assertion that imports the canonical default templates from `src/orders-templates.ts` (the module produced by US1) and, for each of the four artifact types (`rfc`, `features`, `spec`, `tasks`), verifies that the composed `smithy.orders.md` prompt's fallback region contains the substance of the corresponding canonical default — at minimum the variables named for that type in the data-model table and the hybrid section structure (Source/Context with repo-relative paths).
  - The parity assertion fails if a canonical variable disappears from either the prompt fallback or `src/orders-templates.ts`, or if the two surfaces diverge structurally.
  - The parity assertion lives inside the existing `smithy.orders command delegates GitHub ops to smithy.gh-issue scripts` block — no new test file is added.
  - No exact line numbers, pasted prompt text, or full body strings are baked into the assertion body.

**PR Outcome**: Running `smithy.orders` against any artifact type with `<manifestDir>/templates/orders/<type>.md` absent (or with `<manifestDir>` missing the `templates/orders/` subtree entirely) produces an issue body that follows the spec's "Default Template Content" for that type, satisfying AS 4.1, AS 4.2, and AS 4.3. With templates present, the US2 branching still wins (AS 4.4) — that path is unchanged. A new structural assertion pins the prompt and `src/orders-templates.ts` so the two cannot silently diverge.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|

_None — all ambiguities resolved._

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Spec-Compliant Fallback Bodies with Parity Assertion | — | — |

S1 is the only slice. Its internal tasks are sequenced by data flow (Phase 3 parser → Phase 5 body rewrites → parity test) within a single PR.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Provision orders templates during init | depends on | `src/orders-templates.ts` (introduced by US1 Slice 2 Task 1) must exist for Task 3's parity assertion to import its canonical default exports. |
| User Story 2: Orders uses templates when creating issues | depends on | US2 introduces the manifest-load phase (US2 Slice 1) and the template-check-first / fallthrough-to-heredoc branching in Phase 5 for all four artifact types — spec in US2 Slice 1, rfc per-milestone child and tasks per-slice in US2 Slice 2, features in US2 Slice 3. US4 Task 2 rewrites all four fallthrough body contents within that branching, so it depends on the full US2 trio (Slices 1, 2, and 3) being merged — without them there is no fallthrough branch in three of the four mappings to update. |

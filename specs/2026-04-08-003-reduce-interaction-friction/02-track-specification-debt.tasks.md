# Tasks: Track Specification Debt

**Source**: `specs/2026-04-08-003-reduce-interaction-friction/reduce-interaction-friction.spec.md` — User Story 2
**Data Model**: `specs/2026-04-08-003-reduce-interaction-friction/reduce-interaction-friction.data-model.md`
**Contracts**: `specs/2026-04-08-003-reduce-interaction-friction/reduce-interaction-friction.contracts.md`
**Story Number**: 02

---

## Slice 1: Clarify Triage Engine — Introduce Debt Category

**Goal**: Replace the Questions triage category in smithy-clarify with a Specification Debt category, producing a two-category split (assumptions + debt) and an updated return contract that parent commands can consume.

**Justification**: The clarify sub-agent is the source of all debt items in the pipeline. Until it produces a `debt_items` list, no artifact template can be populated and no inheritance chain can be wired. This is the foundational behavioral change — every other slice depends on it.

**Addresses**: FR-003, FR-004; Acceptance Scenario 2.1

### Tasks

Primary changes are in `src/templates/agent-skills/agents/smithy.clarify.prompt`; the final task adds a test assertion in `src/templates.test.ts`.

- [ ] Update the frontmatter `description` field (line 3) to remove the reference to "questions". Change from `"triages findings into assumptions (including Critical Assumptions) and questions with confidence/impact scoring"` to `"triages findings into assumptions (including Critical Assumptions) and specification debt with confidence/impact scoring"`.
- [ ] In Step 3 (Triage), replace the `### Questions` section (lines 99–107) with `### Specification Debt`. The new triage rule is a binary split: Confidence is **High** → assumption (with `[Critical Assumption]` annotation for Critical-impact items, as established by Story 1); Confidence is **Medium or Low** → debt item. There is no Questions category — it is eliminated.
- [ ] In Step 3, update the edge case section (lines 109–113). Remove the "convert lowest-impact assumption back into a question" fallback rule — it is no longer valid because there is no Questions category to convert to. Replace with: "If triage produces zero debt items (all candidates are High confidence), return only assumptions and an empty debt list. This is a valid and expected outcome when the feature description is clear."
- [ ] Remove Step 5 (Present Questions one at a time) in its entirety (lines 136–151). Questions no longer exist as a triage category; there is nothing to present. Step 4 (Present Assumptions with its STOP gate) is retained unchanged — removing that STOP gate is Story 3's responsibility.
- [ ] Add explicit triage examples in Step 3 after the edge case section (before the `---` separator) covering three cases: (a) all candidates High confidence → zero debt items, pipeline proceeds normally; (b) all candidates Medium or Low confidence → zero assumptions, bail-out assessment triggered; (c) mixed → assumptions block + non-empty debt list.
- [ ] Update the return contract in the Rules section (lines 162–170). Replace the current return structure (assumptions + Q&A + decisions) with the new structure: (1) `assumptions` — final list of assumptions including `[Critical Assumption]` annotations; (2) `debt_items` — structured table with columns: ID (SD-NNN sequential), Description, Source Category, Impact, Confidence, Status (`open`), Resolution (`—` for unresolved items); (3) `bail_out` — boolean, true if debt scope exceeds threshold; (4) `bail_out_summary` — string, populated only when `bail_out` is true.
- [ ] Add a Tier 2 test assertion in `src/templates.test.ts` (after the existing clarify agent test at line 236) that verifies the composed `smithy.clarify.md` template no longer contains `### Questions` as a triage heading. This catches accidental regression if the triage replacement is reverted.

**PR Outcome**: smithy-clarify produces a two-category triage output (assumptions + debt) with structured metadata. Parent commands receive `debt_items`, `bail_out`, and `bail_out_summary` in the return summary. No interactive questions exist in clarify after this PR.

---

## Slice 2: Primary Artifact Templates — Spec and Tasks

**Goal**: Add `## Specification Debt` sections to the mark spec template and cut tasks template, and instruct each command to populate those sections from clarify's returned `debt_items`.

**Justification**: Mark and cut form the primary spec-to-tasks pipeline. Adding the debt section to both in one slice means the end-to-end pipeline (feature description → spec with debt → tasks with debt) is coherent after a single PR, enabling early integration testing before the remaining templates land in Slice 3.

**Addresses**: FR-005, FR-006; Acceptance Scenario 2.2 (mark and cut)

### Tasks

- [ ] In `src/templates/agent-skills/commands/smithy.mark.prompt`, insert a `## Specification Debt` section into the Phase 3 spec template between `## Assumptions` (line 239) and `## Out of Scope` (line 243). Use this structure:
  ```markdown
  ## Specification Debt

  | ID | Description | Source Category | Impact | Confidence | Status | Resolution |
  |----|-------------|-----------------|--------|------------|--------|------------|
  | SD-001 | <what is unresolved> | <clarify scan category> | High | Medium | open | — |

  _If no debt items, write: "None — all ambiguities resolved."_
  ```
- [ ] In mark's Phase 3 spec guidelines (the bulleted list after the template code fence), add: "Populate the `## Specification Debt` section from clarify's returned `debt_items`. Assign sequential SD-NNN identifiers starting at SD-001. Carry the description, source_category, impact, confidence, and status fields directly from clarify's return. Leave Resolution as `—` for all `open` items."
- [ ] In `src/templates/agent-skills/commands/smithy.cut.prompt`, insert a `## Specification Debt` section into the Phase 4 tasks template before `## Dependency Order` (after the last `## Slice N` block). The tasks template has no `## Assumptions` or `## Out of Scope` sections, so placement before `## Dependency Order` brackets the operational content. Use the same table structure as in mark, but add an inline origin annotation for inherited items (see Slice 4 for inheritance wiring).
- [ ] In cut's Phase 4 guidelines, add: "Populate the `## Specification Debt` section with debt items from cut's own clarify run. Assign SD-NNN identifiers. Inherited items from the upstream spec are added by Slice 4 — do not duplicate them here until that slice lands."
- [ ] Add two Tier 2 test assertions in `src/templates.test.ts`:
  - Verify the mark template contains `## Specification Debt`, and that its `indexOf('## Specification Debt')` falls between `indexOf('## Assumptions')` and `indexOf('## Out of Scope')`.
  - Verify the cut template contains `## Specification Debt` and that its `indexOf('## Specification Debt')` falls before `indexOf('## Dependency Order')`.

**PR Outcome**: Mark produces specs with a `## Specification Debt` section populated from clarify's output. Cut produces tasks files with a debt section ready for inheritance wiring. The two-artifact pipeline has visible debt tracking.

---

## Slice 3: Remaining Artifact Templates — Strike, Ignite, Render

**Goal**: Add `## Specification Debt` sections to the strike, ignite, and render artifact templates so that all five planning artifact types satisfy FR-005.

**Justification**: This slice is independent of Slice 2 and can be merged in any order relative to it. Separating it prevents Slice 2 from becoming too large and keeps each PR's diff reviewable. After this slice, SC-003 (every planning artifact contains a debt section) is satisfied.

**Addresses**: FR-005; Acceptance Scenario 2.2 (completing all 5 templates), SC-003

### Tasks

- [ ] In `src/templates/agent-skills/commands/smithy.strike.prompt`, insert `## Specification Debt` into the Phase 4 strike document template between `## Decisions` and `## Single Slice` (around line 134). The strike document has no `## Assumptions` section; positioning debt after Decisions is the structural analogue — Decisions are resolved ambiguities, Specification Debt is unresolved ones. Use the same debt table structure as in Slice 2.
- [ ] In `src/templates/agent-skills/commands/smithy.ignite.prompt`, insert `## Specification Debt` into the Phase 3 RFC template between `## Open Questions` and `## Milestones` (around line 209). RFCs use Open Questions rather than Assumptions; debt is conceptually adjacent to open questions. Use the same debt table structure.
- [ ] In `src/templates/agent-skills/commands/smithy.render.prompt`, insert `## Specification Debt` into the Phase 3 feature map template before `## Cross-Milestone Dependencies` (after the last `### Feature N` entry, around line 247). Feature maps have neither `## Assumptions` nor `## Out of Scope` sections. This placement is a documented variant of FR-006's ordering rule for templates that do not follow the Assumptions → Debt → Out of Scope structure. Add a brief inline comment in the template: `<!-- Specification Debt appears here for templates without ## Assumptions sections -->`.
- [ ] Add Tier 2 test assertions in `src/templates.test.ts` verifying each of strike, ignite, and render templates contains `## Specification Debt`.

**PR Outcome**: All five planning artifact templates (spec, tasks, strike, RFC, feature map) contain a `## Specification Debt` section. FR-005 and SC-003 are satisfied.

---

## Slice 4: Debt Inheritance in Cut and Scope-Based Bail-Out

**Goal**: Wire debt inheritance from mark's spec into cut's tasks (FR-007/FR-008), and implement the scope-based bail-out in clarify and the parent commands that consume it (FR-009/FR-010).

**Justification**: Inheritance and bail-out are logically distinct capabilities but both depend on Slice 1's `debt_items` and `bail_out` return fields existing. Combining them in one slice avoids an intermediate state where clarify produces `bail_out` but no parent command acts on it.

**Addresses**: FR-007, FR-008, FR-009, FR-010; Acceptance Scenarios 2.3, 2.5

### Tasks

- [ ] In `src/templates/agent-skills/agents/smithy.clarify.prompt`, add scope-based bail-out logic to Step 3 (Triage), after the debt items are categorized. Instruction text: "Assess whether debt scope would hollow out the artifact. If the majority of Key Entities would remain undefined, or the majority of user stories cannot be meaningfully specified due to debt items, set `bail_out: true`. Treat 50% as a rough calibration, not a hard threshold — apply judgment about whether the artifact would be load-bearing without the missing information. When bail_out is true, populate `bail_out_summary` with the full debt table and append: 'These unresolved ambiguities cover too much scope to produce a reliable artifact. Continue anyway, or provide more information?'"
- [ ] In `src/templates/agent-skills/commands/smithy.mark.prompt`, Phase 2 (Clarify), add a bail-out check after the smithy-clarify invocation: "If clarify returns `bail_out: true`, output the `bail_out_summary` to the terminal. Do not write any artifact files. Stop and wait for the user to provide expanded information or narrow the scope, then re-run."
- [ ] In `src/templates/agent-skills/commands/smithy.cut.prompt`, Phase 3 (Clarify), add the same bail-out check.
- [ ] In `src/templates/agent-skills/commands/smithy.cut.prompt`, Phase 1 (Intake), add instructions for debt inheritance: "After reading the source spec's three artifact files (spec, data model, contracts), also read the spec's `## Specification Debt` section. Extract all items with `status: open` or `status: inherited`. Carry them forward into the tasks file's `## Specification Debt` table with status `inherited` and a description prefixed with `inherited from spec: <original SD-NNN description>`. Leave the Resolution column as `—`." If the upstream section is absent, empty, or the table is malformed, treat this as a non-blocking warning: record `(Could not parse upstream spec debt — inheritance skipped)` as a note in the tasks file's debt section and continue.
- [ ] In cut's Phase 4 (Slice) guidelines, update the debt section instruction (added in Slice 2) to: "Populate the `## Specification Debt` section with both (1) inherited items from the source spec (carried over in Phase 1) and (2) new items from cut's own clarify run. Inherited items use status `inherited`; new items use status `open`. Assign new SD-NNN identifiers to cut's own items, continuing from where the inherited list left off."

**PR Outcome**: Cut tasks files inherit upstream spec debt, properly flagged with origin annotations. When clarify determines that debt would hollow out an artifact, the pipeline stops and prompts the user rather than producing a low-quality output.

---

## Slice 5: Phase 0 Debt Resolution, Audit Checklists, and Tests

**Goal**: Complete the debt lifecycle by enabling resolution in Phase 0 review loops (FR-004), add debt awareness to all audit checklist snippets, and add the full suite of Tier 2 and A-series tests.

**Justification**: This slice closes the loop on the debt lifecycle — items can now be opened (Slice 1), rendered in artifacts (Slices 2–3), inherited (Slice 4), and resolved (this slice). All prior slices land behavioral changes; this slice adds the audit and test infrastructure that verifies them. Tests are included in the same slice as the code they verify for the Phase 0 changes (rather than deferred to a sixth slice).

**Addresses**: FR-004 (status lifecycle); Acceptance Scenario 2.4; SC-002 (clarify produces two-category output), SC-003 (all artifacts contain debt section)

### Tasks

- [ ] In `src/templates/agent-skills/agents/smithy.refine.prompt`, add a `Specification Debt` row to the audit categories table (wherever it is invoked from mark or cut Phase 0):
  `| **Specification Debt** | Are there open debt items that can now be resolved based on new information or user answers? Are all debt items structured with required metadata columns? Are inherited items attributed to their source artifact? |`
- [ ] In `src/templates/agent-skills/commands/smithy.mark.prompt`, Phase 0 section (0c. Apply Refinements), add: "When the refine sub-agent identifies debt items that can now be resolved, update those items in the spec's `## Specification Debt` table: change status from `open` to `resolved` and populate the Resolution column with a note describing how and when the item was addressed (e.g., 'Resolved 2026-04-10 — user confirmed webhooks are HTTP-only')."
- [ ] In `src/templates/agent-skills/commands/smithy.cut.prompt`, Phase 0 section (0c. Apply Refinements), add the same debt resolution instruction.
- [ ] In `src/templates/agent-skills/snippets/audit-checklist-spec.md`, add a row:
  `| **Specification Debt** | Does the spec contain a \`## Specification Debt\` section between \`## Assumptions\` and \`## Out of Scope\`? Are debt items structured with ID, Description, Source Category, Impact, Confidence, Status, and Resolution columns? Are any previously-open items now resolvable? |`
- [ ] In `src/templates/agent-skills/snippets/audit-checklist-tasks.md`, add a row:
  `| **Specification Debt** | Does the tasks file contain a \`## Specification Debt\` section before \`## Dependency Order\`? Are inherited items properly attributed to the source spec? Are any open items resolvable given the current codebase state? |`
- [ ] In `src/templates/agent-skills/snippets/audit-checklist-strike.md`, add a row:
  `| **Specification Debt** | Does the strike document contain a \`## Specification Debt\` section? Are debt items structured with required metadata? |`
- [ ] In `src/templates/agent-skills/snippets/audit-checklist-rfc.md`, add a row:
  `| **Specification Debt** | Does the RFC contain a \`## Specification Debt\` section? Are debt items structured with required metadata? |`
- [ ] In `src/templates/agent-skills/snippets/audit-checklist-features.md`, add a row:
  `| **Specification Debt** | Does the feature map contain a \`## Specification Debt\` section? Are debt items structured with required metadata? |`
- [ ] Add Tier 2 test assertions in `src/templates.test.ts`:
  - Verify the composed `smithy.clarify.md` template does not contain `### Questions` as a triage heading.
  - Verify the composed `smithy.clarify.md` template contains `debt_items` in the return contract.
  - Verify the composed `smithy.mark.md` template's `## Specification Debt` appears between `## Assumptions` and `## Out of Scope` (using `indexOf` ordering checks, following the pattern from the existing ignite section-ordering test at lines 355–381).
  - Verify the composed `smithy.cut.md` template contains `## Specification Debt` and that it appears before `## Dependency Order`.
  - Verify each of `smithy.strike.md`, `smithy.ignite.md`, and `smithy.render.md` contains `## Specification Debt`.
- [ ] Add A-series agent tests in `tests/Agent.tests.md` (after the existing A6 test):
  - **A7** — smithy-clarify produces debt items for Medium/Low-confidence candidates. Steps: invoke clarify with a context producing candidates at mixed confidence levels. Expected: High-confidence items appear as assumptions; Medium/Low-confidence items appear in `debt_items` with structured metadata (ID, Description, Source Category, Impact, Confidence, Status: open); no Questions section appears.
  - **A8** — mark spec artifact contains a populated `## Specification Debt` section. Steps: invoke smithy-mark with a feature description that includes at least one ambiguous domain term (Medium-confidence candidate). Expected: the produced spec file contains a `## Specification Debt` section between `## Assumptions` and `## Out of Scope` with at least one structured debt item.
  - **A9** — cut tasks artifact inherits debt from the upstream spec. Steps: use a spec that contains a `## Specification Debt` section with one open item; invoke smithy-cut on that spec. Expected: the produced tasks file contains a `## Specification Debt` section with the inherited item annotated as `inherited from spec: <original description>` and status `inherited`.

**PR Outcome**: The debt lifecycle is complete — items can be opened (Slice 1), rendered (Slices 2–3), inherited (Slice 4), and resolved (this slice). All audit checklists verify debt section presence. Tier 2 tests catch structural regressions; A-series tests validate end-to-end behavior.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Render template debt section placement deviates from FR-006. FR-006 requires debt "after Assumptions and before Out of Scope," but the feature map template has neither section. Slice 3 places debt before `## Cross-Milestone Dependencies` with a documented exception comment. If strict FR-006 compliance is required, the feature map template would also need an `## Assumptions` section added — which is a scope expansion beyond Story 2. | Scope Edges | Medium | Medium | open | — |
| SD-002 | Bail-out heuristic framing: The spec says "scope-based, not count-based" but the reconciled plan introduced a 50% figure. Slice 4 implements this as qualitative language with 50% as a rough calibration, not a hard count. If the agent interpretation proves inconsistent in practice, the heuristic may need further grounding (e.g., explicit examples of what "majority of Key Entities undefined" looks like for small vs. large specs). | Scope Edges | High | Medium | open | — |
| SD-003 | Debt inheritance rendering format: The tasks template uses a flat list with inline `inherited from spec:` annotation rather than a `### Inherited` subsection. If future tooling needs to distinguish inherited from new debt programmatically (e.g., auto-close inherited items when the upstream spec resolves them), the flat-list approach may be insufficient. | Scope Edges | Medium | Medium | open | — |
| SD-004 | Tasks template debt section placement: Slice 2 places debt before `## Dependency Order`. If forge's slice-parsing logic is ever extended to scan for section headings positionally (rather than by heading text), an H2 section before the slice list could interfere. The current prompt-based parsing is resilient, but the placement choice should be re-evaluated if forge is refactored. | Slice Boundaries | High | Medium | open | — |

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — The clarify triage engine must produce `debt_items` and `bail_out` fields before any parent command can consume them. This is the foundational change.
2. **Slice 2** — Mark and cut get their debt sections and population instructions. These are the primary consumers of Slice 1's output and the most important pipeline to validate early.
3. **Slice 3** — Remaining templates (strike, ignite, render) can land in parallel with or after Slice 2; they are independent of it. Recommended after Slice 2 to let the mark/cut debt section format stabilize first.
4. **Slice 4** — Debt inheritance and bail-out require both Slice 1 (the `bail_out` field) and Slice 2 (the tasks template debt section structure) to be complete before wiring inheritance into cut.
5. **Slice 5** — Phase 0 resolution, audit checklists, and tests depend on all prior slices. Tests added here validate changes from Slices 1–4.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Relax Critical Decision Blocking | depends on | Story 1 already landed. It established the `[Critical Assumption]` annotation and updated the triage rule for Critical+High items. Slice 1 of Story 2 builds directly on that — it replaces the Questions category that Story 1 left intact. The two-category triage rule (High=assumption, not-High=debt) supersedes Story 1's three-category world. |
| User Story 3: One-Shot Planning Workflows | depended upon by | Story 3 removes the interactive STOP gate from Step 4 of clarify (presenting assumptions), making clarify fully non-interactive. Story 2 retains that STOP gate — it is Story 3's boundary. Story 3 also removes the interactive review gates from parent planning commands. Story 2's bail-out prompt ("Continue anyway or provide more information?") will become part of the one-shot output format in Story 3. |
| User Story 4: Unified Review Pattern | none | Story 4 introduces smithy-plan-review, which produces findings that become debt items. Story 2 establishes the debt section format that Story 4's findings will populate. No direct dependency — Story 4 can reference the debt table schema defined here. Do not reference smithy-implementation-review (the Story 4 rename) in any Story 2 changes. |

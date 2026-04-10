# Tasks: Shared Smithy-Prose Sub-Agent

**Source**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.spec.md` — User Story 2
**Data Model**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.data-model.md`
**Contracts**: `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.contracts.md`
**Story Number**: 02

---

## Slice 1: Create smithy-prose Agent Definition and Tests

**Goal**: Create `src/templates/agent-skills/agents/smithy.prose.prompt` with correct frontmatter and prose-drafting instructions, and update `src/templates.test.ts` so the automated test suite recognizes and validates the new agent.

**Justification**: The new file is the entire deliverable of this user story. The test updates are inseparable — without them the `toHaveLength(8)` assertion fails immediately and no CI passes. Together they constitute a complete, independently mergeable increment: the agent exists, compiles cleanly through the template system, and its frontmatter is machine-verified.

**Addresses**: FR-007, FR-007b; Acceptance Scenarios US2-1, US2-2, US2-3

### Tasks

- [ ] Read `src/templates/agent-skills/agents/smithy.plan.prompt` and `src/templates/agent-skills/agents/smithy.clarify.prompt` to confirm the exact YAML frontmatter schema used by read-only agents (YAML array format for `tools`, `model: opus`).
- [ ] Read `specs/2026-04-07-003-refactor-ignite-workflow/refactor-ignite-workflow.contracts.md` (Smithy-Prose Sub-Agent Interface section) to extract all five input parameters, the output format, and the two error conditions (partial-output fallback and halt-on-empty).
- [ ] Create `src/templates/agent-skills/agents/smithy.prose.prompt` with:
  - **Frontmatter**: `name: smithy-prose`, `description` (narrative/persuasive prose drafting for planning artifact sections), `tools` as YAML array (`- Read`, `- Grep`, `- Glob`), `model: opus`.
  - **Input section**: document all five parameters — `section_assignment` (required, text), `idea_description` (required, text), `clarify_output` (required, text), `rfc_file_path` (optional, path to accumulating RFC for context), `tone_directives` (optional, specific prose guidance). Include an instruction to read `rfc_file_path` if provided, so prior sections inform the current draft.
  - **Drafting protocol**: step-by-step instructions for producing persuasive narrative prose — open with the impact of not solving the problem, establish urgency, articulate stakeholder value, then move to concrete description. Include at least one concrete stylistic example and one anti-pattern (e.g., "write 'Teams lose 3 hours per sprint to manual reconciliation' rather than '- Manual reconciliation is slow'").
  - **Section-specific guidance**: instructions covering all three section types smithy-prose handles — Summary (2-3 sentence pitch, what and why it matters), Motivation / Problem Statement (impact of not solving, why now, stakeholder pain), and Personas (named role + how they benefit, narrative style rather than bullet enumeration).
  - **Output format**: return the drafted section(s) as Markdown `section_content`. When context is insufficient to produce a complete draft, return the best partial draft possible and append a `## Gaps / Missing Context` section listing specific missing facts. When no meaningful content can be produced, halt and return an error rather than placeholder text.
  - **Rules**: non-interactive — return output to the parent agent only; do not ask the user questions. Read-only — use only `Read`, `Grep`, `Glob` tools to gather codebase context; do not write or edit any files. Generic design — the `section_assignment` parameter drives what section(s) to draft; do not hardcode ignite-specific section names so the agent remains reusable by any parent command.
- [ ] Update `src/templates.test.ts`, line 144: change `expect(byCategory.agents).toHaveLength(8)` to `toHaveLength(9)`.
- [ ] Update `src/templates.test.ts`, lines 166–174 (the `agents includes clarify, refine, implement, review, plan, and reconcile` block): add `expect(agents).toContain('smithy.prose.md')` alongside the existing `toContain` assertions. Leave the `it(...)` description string unchanged (existing convention omits a full roster from the description).
- [ ] Add a new `it` block in `src/templates.test.ts` inside the `getComposedTemplates` describe block (after the `reconcile agent retains frontmatter` test, following the same pattern as lines 294–303 and 305–314):
  ```
  it('prose agent retains frontmatter with read-only tools', () => {
    const prose = composed.agents.get('smithy.prose.md')!;
    expect(prose).toBeDefined();
    expect(prose).toMatch(/^---\s*\n/);
    expect(prose).toContain('name: smithy-prose');
    expect(prose).toMatch(/tools:\s*\n\s+-\s+Read/);
    expect(prose).not.toContain('Edit');
    expect(prose).not.toContain('Write');
    expect(prose).not.toContain('Bash');
    expect(prose).not.toContain('{{>');
  });
  ```
- [ ] Run `npm test` and confirm all assertions pass with no regressions.

**PR Outcome**: The `smithy-prose` sub-agent exists as a deployable template, is auto-discovered by the template system, and has its frontmatter and tool constraints verified by the automated test suite. The story's acceptance scenarios 1, 2, and 3 are satisfied at the artifact level — the agent is ready to be dispatched by any parent command.

---

## Slice 2: Update Documentation

**Goal**: Add smithy-prose to the sub-agent roster in `CLAUDE.md` and `src/templates/agent-skills/README.md` so the project's documentation accurately reflects all deployed agents.

**Justification**: The project documentation (CLAUDE.md sub-agents table, README.md roles table) serves as the canonical index of sub-agents for developers reading the codebase. A new agent that exists in source but is absent from these tables creates a discoverable inconsistency. This slice is a pure doc change with no code implications — independently mergeable after Slice 1.

**Addresses**: FR-007 (agent must exist and be documented); Acceptance Scenario US2-3 (designed as a shared sub-agent — explicit documentation in CLAUDE.md makes the shared-agent design intent visible to future command authors)

### Tasks

- [ ] Update `CLAUDE.md` — in the "Sub-Agents (not user-invocable)" section (after the `smithy-maid` line, currently line 52), add: `- **smithy-prose** — Narrative/persuasive prose drafting for RFC sections and planning artifacts (used by ignite for Summary, Motivation, Personas; designed for reuse by other commands)`.
- [ ] Update `src/templates/agent-skills/README.md` — in the Sub-Agent Roles table, add a new row after `smithy-maid`: `| smithy-prose | Narrative/persuasive section drafting | ignite (sub-phases 3a, 3b) |`.

**PR Outcome**: CLAUDE.md and the agents README accurately list smithy-prose alongside the other sub-agents. Developers reading either file can discover the agent, understand its role, and know which commands invoke it — making it straightforward to dispatch from other future commands without modifying the agent itself.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — creates the agent file and passes automated tests; must be merged before the orchestrator (Story 4) can reference smithy-prose in the ignite prompt
2. **Slice 2** — documentation updates; depends on Slice 1 being merged so the file being documented actually exists

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 4: Piecewise RFC Generation | depended upon by | Story 4 wires the ignite orchestrator to dispatch smithy-prose for sub-phases 3a and 3b. Story 2 must be merged first so the agent definition exists when the orchestrator references it. |
| User Story 5: Mandatory Personas Section | depended upon by | Story 5's pipeline relies on smithy-prose handling sub-phase 3b (Personas). The agent must exist before Story 5's orchestrator changes can produce Persona content. |

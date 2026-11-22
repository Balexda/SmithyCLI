# Tasks: Locate and Manage User-Level Smithy State

**Source**: `specs/2026-11-21-014-reviewer-baseline-deployment-and-setup-skill/reviewer-baseline-deployment-and-setup-skill.spec.md` — User Story 7
**Data Model**: `specs/2026-11-21-014-reviewer-baseline-deployment-and-setup-skill/reviewer-baseline-deployment-and-setup-skill.data-model.md`
**Contracts**: `specs/2026-11-21-014-reviewer-baseline-deployment-and-setup-skill/reviewer-baseline-deployment-and-setup-skill.contracts.md`
**Story Number**: 07

---

## Slice 1: Expose User-Level Smithy State Through Setup
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Ship a setup skill that inventories user-level state and routes requested changes through the mechanism that owns each surface.

**Justification**: The skill and its bundled reference give users a complete inventory workflow on all supported agents.

**Addresses**: FR-021, FR-022, FR-025, FR-026 and AS 7.1–7.3.

### Tasks

- [ ] **Author the user-level state reference**

  Add a bundled reference to the setup skill under `src/templates/agent-skills/skills/`. Use data model §9 as the inventory and verify its locations and change mechanisms against the CLI. Cover AS 7.1–7.3.

  _Acceptance criteria:_
  - Lookup reports presence or absence for every surface in §9, including project engraved stores and external artifact stores, even when the user-location manifest is absent.
  - Each surface identifies its location and owning change mechanism. Deployment changes go through the CLI, and orders body changes go through the template file.
  - Lookup leaves user state untouched. A request for a user config file gets an explanation that none exists and never creates one.

- [ ] **Deploy the setup skill with the inventory route**

  Add the C7 skill entry point and link to the bundled reference from its user-state route. Use the existing skill bundle deployment for Claude, Gemini, and Codex.

  _Acceptance criteria:_
  - Each agent receives a model-invocable setup skill and can open the bundled reference from its deployed location.
  - The description fits the skill budget and satisfies SC-007.
  - The skill body tells the agent when to load the reference and keeps the inventory procedure in that reference.
  - The US7 independent test exercises the deployed route and confirms that a mixed inventory reports both present and absent surfaces.

**PR Outcome**: Users can ask their agent where Smithy keeps user-level state and learn how to change each surface.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

_None — no specification debt was recorded._

## Open Implementation Questions
<!-- audience: builder; mode: reference; length: one table row per question; diagram: optional; examples: discouraged -->

_None — no open implementation questions._

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Expose User-Level Smithy State Through Setup | — | — |

### Cross-Story Dependencies

None — this story is self-contained. US5 and US6 extend the same C7 setup skill with their own routes.

# Tasks: Share the Implementation Procedure

**Source**: `specs/2026-11-22-015-shared-procedure-with-forge-parity/shared-procedure-with-forge-parity.spec.md` — User Story 1
**Data Model**: `specs/2026-11-22-015-shared-procedure-with-forge-parity/shared-procedure-with-forge-parity.data-model.md`
**Contracts**: `specs/2026-11-22-015-shared-procedure-with-forge-parity/shared-procedure-with-forge-parity.contracts.md`
**Story Number**: 01

---

## Slice 1: Compose the Shared Implementation Procedure
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Forge composes a reusable implementation procedure through the caller input contract.

**Justification**: Extracting the stages and wiring Forge in one slice gives the shared procedure a working caller and avoids parallel definitions.

**Addresses**: FR-001, FR-002, AS 1.1, AS 1.2, SC-001

### Tasks

- [ ] **Extract and compose the shared procedure**

  Move the four stages from the Forge command into shared template composition under `src/templates/agent-skills/` and bind the inputs from the Shared Implementation Procedure contract. Preserve Forge's lifecycle checks and runtime routing during extraction, with template coverage for AS 1.1 and AS 1.2 in `src/templates.test.ts`.

  _Acceptance criteria:_
  - Forge renders implementation, review, documentation checks, and validation from one canonical procedure. Existing shared protocols remain composed, and the same boundary is available for Strike to compose.
  - The procedure consumes the caller's task brief, progress record, review targets, and execution context. Forge supplies its tracked checklist, review range, planning context, and finding destinations for either supported plan format.
  - The shared instructions use the supplied progress and review inputs independently of the caller's artifact type. Forge retains its stage order, review routing, HEAD completion gate before validation, and story completion cascade.
  - Template lint and render checks pass for Claude, Gemini, and Codex. Rendered instructions are portable and include the applicable sub-agent or inline path.

**PR Outcome**: Forge uses one reusable definition of its four execution stages with caller-supplied inputs.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

_None — no specification debt was recorded._

## Open Implementation Questions
<!-- audience: builder; mode: reference; length: one table row per question; diagram: optional; examples: discouraged -->

_None — no open implementation questions._

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Compose the Shared Implementation Procedure | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Preserve Existing Forge Runs | depended upon by | Uses the shared procedure and verifies rendered parity, legacy plan delivery, and the completion gate against the baseline. |

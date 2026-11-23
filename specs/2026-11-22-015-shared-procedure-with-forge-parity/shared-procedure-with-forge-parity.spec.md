# Feature Specification: Shared Procedure With Forge Parity

**Spec Folder**: `2026-11-22-015-shared-procedure-with-forge-parity`
**Branch**: `feature/smithy/mark/strike-redesign-m1-f1`
**Created**: 2026-11-22
**Status**: Draft
**Input**: [Strike Redesign RFC](../../docs/rfcs/2026-003-strike-redesign/strike-redesign.rfc.md#milestone-1-shared-implementation-procedure)
**Source Feature Map**: `docs/rfcs/2026-003-strike-redesign/01-shared-implementation-procedure.features.md` — Feature 1: Shared Procedure With Forge Parity

## Clarifications
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

### Session 2026-11-22

- Forge's current source-rendered instructions and tracked-plan behavior define the parity baseline.

## Artifact Hierarchy
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

RFC → Milestone → Feature → User Story → Slice → Tasks

## User Scenarios & Testing
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: optional -->

### User Story 1: Share the Implementation Procedure (Priority: P1)

As a template author, I want one procedure for implementation, review, documentation checks, and validation so that forge and strike can use the same rules.

**Why this priority**: A single definition prevents the commands' execution rules from drifting apart.

**Independent Test**: Inspect source composition and run template lint.

**Acceptance Scenarios**:

1. **Given** the four stages currently used by forge, **when** the templates are linted and rendered, **then** forge composes one canonical definition and that definition is available for strike to compose.
2. **Given** a caller's progress record and review targets, **when** it supplies those inputs, **then** the procedure uses the supplied record and targets without requiring a particular plan artifact type.

### User Story 2: Preserve Existing Forge Runs (Priority: P1)

As a team with existing task slices and strike plans, I want forge to use the shared procedure while preserving its current behavior so that I can finish work from either plan format.

**Why this priority**: Both formats are already used to ship changes and report completion.

**Independent Test**: Compare source-rendered forge instructions before and after extraction on all three runtimes and exercise forge on existing examples of both plan formats.

**Acceptance Scenarios**:

1. **Given** the pre-extraction forge instructions, **when** an automated check compares them with the deployed output after extraction on Claude, Gemini, and Codex, **then** each runtime retains its instructions, including sub-agent and inline execution as applicable.
2. **Given** an existing `.tasks.md` slice or legacy `.strike.md` plan, **when** forge completes it, **then** the pull request covers the same slice with the same commit behavior and tracked checklist flips as before.
3. **Given** a task in the target slice is unchecked at branch HEAD, **when** forge checks completion, **then** it blocks delivery until the work is complete and the checkbox flip is committed.

### Edge Cases

- A checkbox flipped only in the working tree still reads unchecked at HEAD.
- An unchecked task in another slice does not block delivery of a completed target slice, but the story remains incomplete.
- Forge retains its existing review routing for typed UI work and its inline fallback on runtimes without sub-agents.

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Share the Implementation Procedure | — | specs/2026-11-22-015-shared-procedure-with-forge-parity/01-share-the-implementation-procedure.tasks.md |
| US2 | Preserve Existing Forge Runs | US1 | — |

## Requirements
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: recommended -->

### Functional Requirements

- **FR-001**: Implementation, review, documentation checks, and validation MUST have one canonical definition under INV-1. Forge MUST compose it, and strike MUST be able to compose it through the same contract.
- **FR-002**: The procedure MUST accept the caller's progress record and review targets as inputs. Deployed instructions MUST remain portable under INV-2.
- **FR-003**: Forge MUST retain stage ordering, runtime-specific execution, review routing, stop conditions, commit behavior, and pull request behavior for both supported plan formats.
- **FR-004**: Forge MUST retain ownership of the slice completion check and story completion cascade. The slice gate MUST read the tracked checklist at HEAD, and completion MUST remain derived from committed task checkboxes without writes to parent dependency tables.

## Assumptions
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- Forge continues to supply a tracked checklist for both plan formats.

## Specification Debt
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

_None — no specification debt was recorded._

## Out of Scope
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

- Strike command integration and rewrite.
- Untracked-plan modes for the implementation, review, and documentation agents.
- Changes to forge behavior or migration of existing plans.

## Success Criteria
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

### Measurable Outcomes

- **SC-001**: Template lint passes and source inspection finds exactly one definition of the shared procedure, composed by forge.
- **SC-002**: An automated before-and-after comparison passes for forge instructions on Claude, Gemini, and Codex.
- **SC-003**: Regression runs for an existing `.tasks.md` slice and an existing `.strike.md` plan verify pull request creation, slice selection, commit behavior, and checklist flips against the baseline.
- **SC-004**: A completion check with an unchecked tracked row at HEAD blocks delivery even if the working tree shows it checked.

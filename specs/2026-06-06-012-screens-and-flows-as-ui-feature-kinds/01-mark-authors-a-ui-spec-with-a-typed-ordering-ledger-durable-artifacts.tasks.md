# Tasks: Mark Authors a UI Spec With a Typed Ordering Ledger + Durable Artifacts

**Source**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.spec.md` — User Story 1
**Data Model**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.data-model.md`
**Contracts**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.contracts.md`
**Story Number**: 01

---

## Slice 1: Add UI Kind Branching to Mark

**Goal**: `smithy.mark` can recognize `kind: ui` feature-map input and route it through a UI-specific planning path while preserving the existing backend spec-triad path.

**Justification**: The kind branch is the minimum standalone increment because it creates the routing surface every later UI ledger and artifact-writing change uses. It is reviewable without durable artifact generation because `kind: backend` compatibility and UI feature detection are independently observable.

**Addresses**: FR-001; AS 1.4

### Tasks

- [x] **Branch mark on feature kind**

  Update `src/templates/agent-skills/commands/smithy.mark.prompt` so `.features.md` routing carries the selected feature's `kind` metadata into Phase 1 and explicitly selects the backend or UI authoring path. Preserve the current backend spec-triad behavior for `kind: backend` and absent kind input, satisfying AS 1.4.

  _Acceptance criteria:_
  - `kind: backend` and absent-kind feature inputs keep the existing spec-triad flow
  - `kind: ui` feature inputs enter a named UI authoring path
  - The selected feature's UI metadata is available to later mark phases
  - Existing feature-number and auto-selection routing semantics remain unchanged

- [x] **Document UI mark routing**

  Update the relevant template documentation in `src/templates/agent-skills/README.md` or adjacent command/template docs so maintainers can see that `mark` owns UI ledger and durable artifact authoring. Keep the documentation scoped to routing and ownership; AS 1.1-1.3 details remain in the later ledger and artifact slices.

  _Acceptance criteria:_
  - Documentation states that `mark` branches on feature kind
  - Documentation states that `mark` authors UI durable design truth
  - Documentation does not describe `forge` as the author of `.design.md` or `.flow.md`
  - Backend feature documentation remains accurate

**PR Outcome**: `smithy.mark` has an additive UI branch point and continues to produce backend specs as before. Later slices can add ledger and durable-file emission without changing routing again.

---

## Slice 2: Emit the Typed UI Ordering Ledger

**Goal**: The UI mark path writes a `.spec.md` whose `## Dependency Order` is a typed node graph with screen, flow, and backend story rows, each carrying ordering and artifact pointers without layout prose.

**Justification**: The typed ledger is independently useful as the single ordering and parallelism surface, even before the durable files are emitted. It satisfies the core spec-shape acceptance scenarios and gives `cut` and status tooling a stable table to consume later.

**Addresses**: FR-002, FR-003, FR-004, FR-005; AS 1.1, AS 1.3, AS 1.5

### Tasks

- [ ] **Author the UI dependency ledger**

  Extend the UI path in `src/templates/agent-skills/commands/smithy.mark.prompt` to write a `## Dependency Order` table shaped as the UI Spec Ledger in the data model. The table must support `SC<N>`, `FL<N>`, and `US<N>` rows, same-table dependencies, a `Design` column for screen rows, and an `Artifact` column for every row, satisfying AS 1.1 and AS 1.3.

  _Acceptance criteria:_
  - UI specs include `ID`, `Kind`, `Title`, `Depends On`, `Design`, and `Artifact` columns
  - Screen rows use `SC<N>` IDs and `Kind` `screen`
  - Flow rows use `FL<N>` IDs and `Kind` `flow`
  - Backend story rows use `US<N>` IDs and `Kind` `story`
  - Each row has `Depends On` set to `—` or same-table IDs
  - Every row's `Artifact` cell is `—` in mark's output — it holds the `cut`-produced `tasks.md` only after `cut` runs (data model Entity 2); mark never pre-fills a path

- [ ] **Keep ledger rows pointer-only**

  Constrain the UI ledger instructions in `src/templates/agent-skills/commands/smithy.mark.prompt` so row titles point to durable screen and flow files but never carry layout, state, or step prose. Reference the UI Spec Ledger and Screen/Flow node entities from the data model rather than duplicating artifact body schemas, satisfying AS 1.2 and FR-004.

  _Acceptance criteria:_
  - Ledger titles may name `design/screens/<ScreenId>.design.md` and `design/flows/<FlowId>.flow.md`
  - Ledger rows contain no layout prose
  - Flow rows are first-class table rows, not values inside a `flows: [...]` list
  - The prompt directs artifact intent into the durable files, not the spec row

- [ ] **Allow minimal single-node UI ledgers**

  Add UI ledger guidance for features with no internal ordering so `mark` may emit a minimal single-node graph when that honestly represents the work. Keep the same table shape and node typing even when only one row exists, satisfying AS 1.5.

  _Acceptance criteria:_
  - A single pass-through screen can produce one `SC<N>` row
  - Minimal ledgers still include the full UI ledger column set
  - No artificial flow or backend rows are required when absent from the feature
  - Backend specs do not gain UI-only columns

**PR Outcome**: `kind: ui` specs have a typed ordering ledger that captures screen, flow, and backend story ordering in one table. The ledger is pointer-only and keeps implementation sequencing separate from durable design intent.

---

## Slice 3: Author Durable Screen and Flow Artifacts at Mark

**Goal**: The UI mark path writes the durable screen and flow artifacts referenced by the ledger, and records that `mark`, not `forge`, owns those files.

**Justification**: Durable artifact authoring is the observable output that closes the story's independent test. It depends on Slice 2 because the `.spec.md` ledger must point at the files `mark` writes.

**Addresses**: FR-006, FR-007, FR-021; AS 1.2

### Tasks

- [ ] **Emit screen design artifacts**

  Extend `src/templates/agent-skills/commands/smithy.mark.prompt` so the UI path writes one `design/screens/<ScreenId>.design.md` artifact for each screen node. The artifacts should follow `smithy.helper-screen-design` ownership and rationale-only rules, satisfying AS 1.2.

  _Acceptance criteria:_
  - Each `SC<N>` row has a matching `design/screens/<ScreenId>.design.md`
  - Screen artifacts contain rationale-only design intent
  - Screen artifacts name a `component-path` for the owning UI component (per `smithy.helper-screen-design`); the framework-neutral stack-detection generalization is FR-010/C6, owned by User Story 2, and is out of scope here
  - Missing `ScreenId` or `design_system` remains an abort condition per contracts C1

- [ ] **Emit flow intent artifacts**

  Extend `src/templates/agent-skills/commands/smithy.mark.prompt` so the UI path writes one `design/flows/<FlowId>.flow.md` artifact for each flow node **and the paired stub test body** at the `.flow.md`'s `test-body` path, so the 1:1 flow↔test-body pairing exists immediately after `mark` (contracts C1 lists `.flow.md (+ stub test body)` as a mark output). The `.flow.md` follows `smithy.helper-flow-definition` intent-only rules and avoids enumerating steps; the stub is an empty/placeholder test that `forge` later fills with executable behavior (data model Entity 4), so mark must not author executable assertions. Satisfies AS 1.2.

  _Acceptance criteria:_
  - Each `FL<N>` row has a matching `design/flows/<FlowId>.flow.md`
  - Each `FL<N>` row also has a matching stub test body written at the `.flow.md`'s `test-body` path, so no flow is left an orphan for `flow-lint` (contracts C1; data model Entity 4/5)
  - The stub test body is a placeholder only — mark writes no executable assertions; `forge` emits the real behavior during flow-wire
  - Flow artifacts name their screen references and the paired `test-body` path
  - Flow artifact bodies remain intent-only
  - Flow artifacts do not contain step lists or layout-position guidance

- [ ] **Record mark ownership of durable design truth**

  Update `src/templates/agent-skills/commands/smithy.mark.prompt` and any directly conflicting source-template docs so the durable `.design.md` and `.flow.md` files are authored at `mark` and only consumed downstream. Keep `.claude/` snapshots untouched, per repository guidance.

  _Acceptance criteria:_
  - Mark output list includes the UI spec, screen artifacts, flow artifacts, and the paired stub test bodies
  - Downstream prompt text does not direct `forge` to author `.design.md` or `.flow.md` from scratch
  - Source-template edits do not regenerate `.claude/` or `.smithy/` snapshots
  - The resulting UI artifact set is self-sufficient enough for a non-forge build method to consume

**PR Outcome**: Running `mark` on a `kind: ui` feature can produce the typed UI spec plus the durable screen and flow files the ledger points at. Durable design intent originates at `mark`, closing the ownership correction in FR-007.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-005 | inherited from spec: Fidelity of `import`-mode structure derivation: how reliably `render` can extract screens/flows/behavior from a prototype/bundle, and how much human confirmation the derived structure needs. | Integration | Medium | Low | inherited | Owned by User Story 5; not addressed by this story. |
| SD-006 | inherited from spec: Whether `SC`/`FL` nodes are always atomic or can be sub-sliced (and whether `flow-scaffold` #410 is in scope, which the epic recommends holding). | Constraints | Low | Medium | inherited | Owned by User Story 3 cut/forge behavior; this story only authors the ledger and durable artifacts. |
| SD-007 | inherited from spec: Build-phase coverage honesty: a build screen can be "done" with a missing brief state and no executable gate until its flows wire. | Edge Cases | Medium | Low | inherited | Owned by downstream screen-build and flow-wire implementation; not addressed by this mark-authoring story. |
| SD-008 | inherited from spec: Visual-intent honesty under the non-blocking gate: how a `brief`-mode node that never received a bundle surfaces its unrealized prototype rather than silently shipping skill-only. | Interaction & UX | Medium | Medium | inherited | Owned by User Story 4; not addressed by this story. |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Add UI kind branching to mark | — | — |
| S2 | Emit the typed UI ordering ledger | S1 | — |
| S3 | Author durable screen and flow artifacts at mark | S2 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Tool-agnostic screen/flow generation from the project's own stack | depended upon by | This story introduces the mark-owned UI ledger and durable artifacts. User Story 2 generalizes the helper contracts and stack detection expectations across frameworks and drivers. |
| User Story 3: render → mark → cut → forge is identical for UI and backend nodes | depended upon by | Cut and forge need this story's typed ledger and durable artifacts before they can slice and build `SC` and `FL` nodes. |
| User Story 4: A non-blocking visual-design gate with import / brief / none modes | depended upon by | This story records the `Design` column and durable brief artifacts. User Story 4 completes bundle and gate behavior. |
| User Story 6: flow-lint validates the screen/flow/test graph in app CI | depended upon by | Flow-lint needs the screen and flow artifact graph authored here before it can validate cross-references. |
| User Story 7: UI work is visible to status, dependency, and audit tooling | depended upon by | Status, dependency, and audit tooling consume the typed ledger and durable files this story establishes. |

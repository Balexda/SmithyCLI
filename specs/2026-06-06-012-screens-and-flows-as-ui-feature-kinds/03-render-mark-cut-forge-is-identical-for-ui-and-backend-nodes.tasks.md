# Tasks: Render Mark Cut Forge Is Identical for UI and Backend Nodes

**Source**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.spec.md` — User Story 3
**Data Model**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.data-model.md`
**Contracts**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.contracts.md`
**Story Number**: 03

---

## Slice 1: Slice Typed UI Ledger Nodes

**Goal**: `smithy.cut` can consume a typed UI ledger and produce one `.tasks.md` artifact for each `SC`, `FL`, and `US` node while preserving the existing backend-story path.

**Justification**: This is the minimum load-bearing increment for the uniform pipeline. The ledger remains inert until `cut` can turn every node kind into forgeable task plans and write each node's `Artifact` pointer.

**Addresses**: FR-013; AS 3.1, AS 3.6

### Tasks

- [ ] **Route cut by ledger node kind**

  Update `src/templates/agent-skills/commands/smithy.cut.prompt` so a typed UI ledger is parsed as node work, not as a backend-only user-story list. `SC`, `FL`, and `US` rows should each be selectable by node ID or by the existing numbered input where applicable, while ordinary backend specs keep today's story slicing behavior for AS 3.6.

  _Acceptance criteria:_
  - UI ledgers with `SC`, `FL`, and `US` IDs are recognized as valid cut input
  - `SC` rows route to screen-build task planning
  - `FL` rows route to flow-wire task planning
  - `US` rows route to the existing backend-story task planning behavior
  - Backend-only specs keep their current `US<N>` story slicing behavior

- [ ] **Write per-node task artifacts**

  Extend cut output rules so each selected UI ledger node writes a node-specific `.tasks.md` file and records the file path back into that row's `Artifact` cell. Keep `SC` and `FL` slice counts PR-sized rather than inherently atomic, defaulting to a single slice only when the node can be built coherently in one PR.

  _Acceptance criteria:_
  - Every sliced `SC`, `FL`, and `US` node receives a `.tasks.md`
  - The matching ledger row's `Artifact` cell is populated with that tasks path
  - Screen-build tasks cite the screen `.design.md` and design metadata
  - Flow-wire tasks cite the `.flow.md` and paired `test-body`
  - `SC` and `FL` planning allows multiple slices when needed for PR size

- [ ] **Guard ledger dependency integrity**

  Add cut validation for typed UI ledger dependencies so dangling `Depends On` IDs abort before tasks are written, and cross-node dependencies are represented in the generated tasks file's dependency notes. This keeps cut's output usable by forge without creating hidden manual ordering.

  _Acceptance criteria:_
  - Missing dependency IDs fail before any new task artifact is emitted
  - Same-table dependencies are preserved in generated task context
  - Mock-satisfiable flow nodes can depend only on their screen
  - Real-data flow nodes can depend on their screen plus backend `US` nodes
  - Existing backend dependency-order validation remains accurate

**PR Outcome**: `smithy.cut` can turn a typed UI ledger into forgeable task files for every node kind and update the ledger artifact pointers without forking the pipeline.

---

## Slice 2: Build Screen Nodes Through Forge

**Goal**: `smithy.forge` can implement `SC` screen-build task plans by consuming mark-owned screen intent, the committed design skill, optional bundles, feature flags, and mock data.

**Justification**: Screen-build behavior is the first UI forge profile because flows depend on screens. It is independently reviewable through flagged mock-data components and confirms that forge consumes, rather than authors, durable design truth.

**Addresses**: FR-007, FR-014, FR-016, FR-017; AS 3.2, AS 3.3, AS 3.4

### Tasks

- [ ] **Add the screen-build forge profile**

  Update `src/templates/agent-skills/commands/smithy.forge.prompt` so tasks produced for an `SC` node preload the referenced `.design.md` and committed design skill, then build the component behind the feature `flag` against mock data. The profile must consume the mark-owned artifact and refuse to create durable `.design.md` truth downstream.

  _Acceptance criteria:_
  - `SC` task plans select a screen-build forge profile
  - Forge reads the referenced `.design.md` as implementation context
  - Forge preloads the committed design skill named by the screen artifact
  - Generated screen work is gated behind the feature `flag`
  - Forge does not author a new `.design.md` from scratch

- [ ] **Require token-only brief-state rendering**

  Strengthen the screen-build profile so every brief state named by the durable screen intent is represented in the implementation using the project's design-system tokens and reusable components. Keep data mocked at this stage so backend availability does not block screen construction.

  _Acceptance criteria:_
  - Every brief state from the screen intent is represented
  - Styles use design-system tokens rather than hardcoded colors
  - Existing project component conventions are reused where available
  - Screen-build work can run with mock data
  - Backend story implementation is not required for the screen-build slice

- [ ] **Honor bundles without blocking**

  Add bundle handling to the screen-build profile so an attached bundle is translated into the project framework under the conflict rule, while a bundle-less `brief` or `none` screen still builds from the design skill. Keep the design skill loaded as implementation dialect context in all modes.

  _Acceptance criteria:_
  - Attached bundles are honored for layout and visual intent
  - The design skill remains authoritative for implementation dialect
  - `brief` mode without a bundle does not block
  - `none` mode does not require a bundle
  - Bundle handling does not modify `.design.md` or `.flow.md` files

**PR Outcome**: Forge can build screen nodes from mark-owned screen intent, producing flagged mock-data UI with token-only styling and non-blocking bundle support.

---

## Slice 3: Build Flow and Backend Nodes Through Forge

**Goal**: `smithy.forge` can implement `FL` flow-wire task plans by wiring real behavior and executable test bodies, while `US` nodes in UI ledgers continue through the backend forge path unchanged.

**Justification**: Flow wiring is separate from screen build because it turns mock-satisfiable or backend-dependent paths into executable behavior. It also proves that backend story nodes embedded in a UI ledger do not require a special pipeline.

**Addresses**: FR-007, FR-013, FR-019; AS 3.5, AS 3.6

### Tasks

- [ ] **Add the flow-wire forge profile**

  Update `src/templates/agent-skills/commands/smithy.forge.prompt` so tasks produced for an `FL` node preload the referenced `.flow.md`, paired `test-body`, and dependent screen/backend context. The profile should connect the real data path represented by the flow's dependencies and honor or flip the feature `flag` as required by the task plan.

  _Acceptance criteria:_
  - `FL` task plans select a flow-wire forge profile
  - Forge reads the referenced `.flow.md` as intent context
  - Forge reads or creates behavior in the paired `test-body`
  - Real-data dependencies from the ledger are respected
  - The feature `flag` is honored or flipped as part of the flow-wire work

- [ ] **Emit executable flow behavior only in test bodies**

  Constrain flow-wire implementation so the executable user actions and assertions are emitted or updated in the paired test body, not in the `.flow.md`. The generated behavior must run as the slice validation gate and remain keyed to the driver-neutral selector contract from User Story 2.

  _Acceptance criteria:_
  - Flow actions are written to the paired executable test body
  - Guard assertions from the `.flow.md` are represented in the test body
  - Traversal assertions are represented in the test body
  - `.flow.md` remains mark-owned and intent-only
  - The flow test body is run as a validation gate when supported by the repo

- [ ] **Preserve backend-story forge behavior**

  Ensure `US` nodes that appear inside a UI ledger enter the same backend-story forge path as ordinary backend tasks. UI ledger context may explain ordering, but it must not change backend implementation mechanics or make forge author screen/flow durable artifacts.

  _Acceptance criteria:_
  - `US` nodes in UI ledgers use existing backend forge mechanics
  - Backend tasks still read their spec, data model, and contracts context
  - UI ordering context does not force UI-specific implementation steps
  - Backend forge work does not author `.design.md` or `.flow.md`
  - Existing backend task-file inputs remain supported

**PR Outcome**: Forge can wire flow nodes into real executable behavior and continues to process backend story nodes without a parallel UI-specific pipeline.

---

## Slice 4: Add Structural UI Review Profile

**Goal**: The forge review path can evaluate UI node work structurally without judging visual fidelity.

**Justification**: The uniform pipeline needs a reviewer profile that protects Smithy's contracts while leaving visual taste and pixel iteration to the visual-design boundary. This is independently shippable after screen and flow build profiles exist.

**Addresses**: FR-020; AS 3.7

### Tasks

- [ ] **Route UI slices to structural review**

  Update the forge review instructions and shared review protocol references so `SC` and `FL` slices request a UI structural review profile. The profile should stay read-only/plan-only in the same way as existing implementation review, and should focus on contract conformance rather than visual preference.

  _Acceptance criteria:_
  - `SC` slices request the UI structural review profile
  - `FL` slices request the UI structural review profile
  - The reviewer remains read-only and plan/no-write
  - Visual fidelity and taste judgments are out of scope
  - Existing backend review routing remains unchanged

- [ ] **Define structural UI review checks**

  Add the review checklist for UI node work to the relevant source templates or snippets. The checklist should verify token-only styling, component reuse, project conventions, stable selector usage, touch-target and contrast roles where applicable, and representation of every brief state.

  _Acceptance criteria:_
  - Screen review checks token-only styling
  - Screen review checks component reuse and project conventions
  - Screen review checks every brief state is represented
  - Flow review checks stable selector usage
  - Accessibility roles such as touch targets and contrast are checked structurally

- [ ] **Keep reviewer output actionable**

  Ensure UI structural findings route through forge's existing review triage so high-confidence fixes are applied by forge and lower-confidence concerns become debt only when they meet the existing debt criteria. The reviewer should not propose pixel-matching or visual-diff work.

  _Acceptance criteria:_
  - UI review findings use the existing severity/confidence triage
  - High-confidence structural fixes can be applied by forge
  - Low-confidence qualifying concerns can be recorded as debt
  - Pixel-fidelity findings are not requested
  - Visual-diff work is not introduced by this story

**PR Outcome**: UI forge work receives structural contract review without turning Smithy into a visual-fidelity judge.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-005 | inherited from spec: Fidelity of `import`-mode structure derivation: how reliably `render` can extract screens/flows/behavior from a prototype/bundle, and how much human confirmation the derived structure needs. | Integration | Medium | Low | inherited | Owned by User Story 5; this story honors bundles after mark/render provide them. |
| SD-006 | inherited from spec: Whether `SC`/`FL` nodes are always atomic or can be sub-sliced (and whether `flow-scaffold` #410 is in scope, which the epic recommends holding). | Constraints | Low | Medium | resolved | Resolved 2026-06-24 — Slice 1 makes `SC` and `FL` nodes PR-sized task artifacts that may contain multiple slices when needed; default single-slice is a planning convenience, not an invariant. `flow-scaffold` remains out of scope. |
| SD-007 | inherited from spec: Build-phase coverage honesty: a build screen can be "done" with a missing brief state and no executable gate until its flows wire. | Edge Cases | Medium | Low | inherited | Partially mitigated by Slice 2 brief-state checks and Slice 4 structural review; executable flow coverage remains owned by Slice 3 and User Story 6. |
| SD-008 | inherited from spec: Visual-intent honesty under the non-blocking gate: how a `brief`-mode node that never received a bundle surfaces its unrealized prototype rather than silently shipping skill-only. | Interaction & UX | Medium | Medium | inherited | Owned by User Story 4; this story only ensures forge does not block when no bundle is attached. |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Slice typed UI ledger nodes | — | — |
| S2 | Build screen nodes through forge | S1 | — |
| S3 | Build flow and backend nodes through forge | S1, S2 | — |
| S4 | Add structural UI review profile | S2, S3 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: mark authors a UI spec with a typed ordering ledger + durable artifacts | depends on | This story consumes the typed UI ledger and mark-owned `.design.md`/`.flow.md` artifacts produced by User Story 1. |
| User Story 2: Tool-agnostic screen/flow generation from the project's own stack | depends on | Screen-build and flow-wire profiles consume the neutral `component-path`, `test-body`, and selector contracts established by User Story 2. |
| User Story 4: A non-blocking visual-design gate with import / brief / none modes | depended upon by | This story adds non-blocking forge behavior for bundle presence/absence; User Story 4 completes render/mark mode semantics and surfacing for unrealized prototypes. |
| User Story 6: flow-lint validates the screen/flow/test graph in app CI | depended upon by | Flow-wire tasks emit or update executable test bodies that flow-lint later validates as part of the screen/flow/test graph. |
| User Story 7: UI work is visible to status, dependency, and audit tooling | depended upon by | Status, dependency, and audit tooling consume the per-node task artifacts and structural review conventions introduced here. |

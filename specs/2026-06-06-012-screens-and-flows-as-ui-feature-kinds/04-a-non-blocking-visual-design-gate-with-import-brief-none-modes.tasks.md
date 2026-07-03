# Tasks: A Non-Blocking Visual-Design Gate With Import Brief None Modes

**Source**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.spec.md` — User Story 4
**Data Model**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.data-model.md`
**Contracts**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.contracts.md`
**Story Number**: 04

---

## Slice 1: Define the Design Mode and Bundle Contract

**Goal**: Smithy's deployable UI templates describe `none`, `import`, and `brief` as screen-node design modes with `bundle` as the optional terminal-to-visual boundary object.

**Justification**: The gate semantics need a single shared vocabulary before mark, render, or forge can apply mode-specific behavior consistently. This slice is independently reviewable through prompt/schema text and does not require implementing prototype ingestion itself.

**Addresses**: FR-015, FR-017, FR-021; AS 4.1, AS 4.2, AS 4.5

### Tasks

- [ ] **Document per-screen design modes**

  Update `src/templates/agent-skills/snippets/feature-kinds.md`, `src/templates/agent-skills/commands/smithy.mark.prompt`, and directly related source-template documentation so `Design` mode is described as a screen-node field with exactly `none`, `import`, and `brief`. Keep backend feature behavior and backend spec output unchanged.

  _Acceptance criteria:_
  - `none`, `import`, and `brief` are the only valid screen-node design modes
  - `none` is described as no visual loop
  - `import` is described as prototype-first with a supplied bundle
  - `brief` is described as mark-authored intent for a visual tool
  - Backend feature and backend spec-triad behavior remains unchanged

- [ ] **Generalize bundle boundary language**

  Update the screen helper, feature-kind snippet, and command templates that describe `bundle` so it is a tool-neutral prototype reference rather than a Claude Design-only export. Preserve the existing conflict rule: the bundle wins layout and visual intent, while the committed design skill wins implementation dialect.

  _Acceptance criteria:_
  - `bundle` is framed as a visual prototype boundary object
  - Figma, Claude Design, and equivalent visual-tool exports can fit the wording
  - A bundle remains optional on screen artifacts
  - A screen with a bundle still requires `design_system`
  - The conflict rule is stated consistently where bundle handling is described

- [ ] **Keep import structure derivation scoped to render**

  Align the shared design-gate text with `smithy.render` ownership so `import` mode may carry a bundle from render for downstream honoring, while detailed prototype-to-screen/flow derivation remains owned by User Story 5. This story should make the boundary clear without implementing render's full import ingestion.

  _Acceptance criteria:_
  - `import` mode records that the bundle can enter at render
  - Downstream prompts know the bundle rides to forge as visual source context
  - Detailed prototype structure derivation is not pulled into this story's implementation
  - SD-005 remains attributed to User Story 5
  - Existing render typed-feature output remains compatible

**PR Outcome**: Smithy's UI templates share one design-gate contract: every screen node has a valid mode, bundles are tool-neutral boundary objects, and import-mode ingestion remains cleanly separated from later build behavior.

---

## Slice 2: Surface Brief Mode Without Blocking Mark

**Goal**: `smithy.mark` can author brief-mode screen and flow intent, record that a prototype is intended, and recommend the visual gate without halting the pipeline.

**Justification**: Brief mode is the point where Smithy steps out to a visual medium. Mark must produce usable intent either way: with a recommendation for a bundle when helpful, but with durable artifacts that are already sufficient for forge or another builder to consume.

**Addresses**: FR-016, FR-018, FR-021; AS 4.3, AS 4.6

### Tasks

- [ ] **Mark brief-mode intent explicitly**

  Extend the UI authoring path in `src/templates/agent-skills/commands/smithy.mark.prompt` so `brief` screen nodes are marked as intending a prototype while still writing self-sufficient `.design.md` and `.flow.md` intent. The durable artifacts should be usable as the prototyping brief without adding layout prose to the spec ledger.

  _Acceptance criteria:_
  - `brief` screen rows remain valid in the typed UI ledger
  - Brief-mode durable artifacts are usable as the visual-tool brief
  - The spec ledger stays pointer-only
  - `.design.md` and `.flow.md` remain mark-owned durable truth
  - Mark does not require a bundle before writing brief-mode artifacts

- [ ] **Recommend gating for complex bundle-less screens**

  Add mark guidance for the mark-initiated `brief` case: when no bundle is supplied and the screen is complex enough to benefit from visual prototyping, mark authors the brief and recommends gating for a bundle. The recommendation should be visible to the developer but must not stop artifact generation.

  _Acceptance criteria:_
  - Mark can select `brief` when no bundle is present
  - Complex bundle-less screens can produce a non-blocking gate recommendation
  - The recommendation leaves the developer free to supply a bundle and re-run
  - The recommendation also leaves the developer free to pass through without a bundle
  - Artifact writing continues after the recommendation is recorded

- [ ] **Preserve none-mode pass-through behavior**

  Tighten mark guidance so `Design: none` remains valid for simple pass-through screens and does not trigger bundle, prototype, or brief ceremony. This keeps AS 4.1 from being implemented as a special case in forge only.

  _Acceptance criteria:_
  - `Design: none` requires no bundle
  - `Design: none` produces ordinary durable screen intent
  - No visual-tool recommendation is required for simple pass-through screens
  - Minimal single-node UI ledgers still work with `Design: none`
  - Backend specs do not gain visual-gate text

**PR Outcome**: Mark can express brief and none modes honestly: it emits durable, self-sufficient UI intent, surfaces optional visual prototyping where appropriate, and never creates a hard gate.

---

## Slice 3: Build All Design Modes Without a Pipeline Stall

**Goal**: `smithy.forge` builds `none`, `import`, and bundle-less `brief` screens without blocking, honoring any bundle that is present under the established conflict rule.

**Justification**: This slice closes the user story's independent test. It depends on the shared mode contract and mark's brief-mode surfacing, then makes the build path observable across all three modes without pulling visual iteration into the terminal.

**Addresses**: FR-016, FR-017, FR-018; AS 4.1, AS 4.4, AS 4.5

### Tasks

- [ ] **Route screen builds by design mode**

  Update `src/templates/agent-skills/commands/smithy.forge.prompt` so `SC` task plans read the screen node's design mode and select the correct non-blocking build behavior. `none` and bundle-less `brief` should build from the committed design skill; `import` should expect a bundle when one was supplied upstream.

  _Acceptance criteria:_
  - `Design: none` builds from the committed design skill
  - Bundle-less `Design: brief` builds from the committed design skill
  - `Design: import` carries supplied bundle context into the build
  - Missing bundle context never creates a hard stop for brief mode
  - Existing backend forge routing remains unchanged

- [ ] **Honor bundles whenever present**

  Strengthen forge bundle handling so any attached bundle is honored at build time regardless of whether it entered through import mode or post-mark brief mode. Keep the design skill loaded as implementation-dialect context, and do not modify mark-owned `.design.md` or `.flow.md` files.

  _Acceptance criteria:_
  - Import-mode bundles are honored for layout and visual intent
  - Post-mark brief-mode bundles are honored for layout and visual intent
  - The committed design skill remains authoritative for implementation dialect
  - Bundle handling does not author or rewrite `.design.md` or `.flow.md`
  - Bundle absence falls back to the design skill rather than stopping the slice

- [ ] **Surface unrealized prototypes in forge output**

  Add forge guidance so a `brief` node with no bundle records the missing prototype as surfaced context, not as an implementation failure. This resolves the visual-intent honesty gap without introducing a visual-diff or pixel-fidelity review requirement.

  _Acceptance criteria:_
  - Bundle-less brief work reports that no prototype bundle was attached
  - The report is informational and does not fail the build
  - The screen still builds from the design skill
  - The reviewer is not asked to judge visual fidelity
  - SD-008 has an implementation path through this surfacing behavior

**PR Outcome**: Forge can build all three design modes in one non-blocking pipeline, honoring bundles when present and surfacing missing brief prototypes without treating them as failures.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-005 | inherited from spec: Fidelity of `import`-mode structure derivation: how reliably `render` can extract screens/flows/behavior from a prototype/bundle, and how much human confirmation the derived structure needs. | Integration | Medium | Low | inherited | Owned by User Story 5; this story only defines the boundary object and downstream honoring behavior. |
| SD-006 | inherited from spec: Whether `SC`/`FL` nodes are always atomic or can be sub-sliced (and whether `flow-scaffold` #410 is in scope, which the epic recommends holding). | Constraints | Low | Medium | inherited | Owned by User Story 3 cut/forge behavior; this story consumes whatever task shape cut produces. |
| SD-007 | inherited from spec: Build-phase coverage honesty: a build screen can be "done" with a missing brief state and no executable gate until its flows wire. | Edge Cases | Medium | Low | inherited | Partially related to Slice 3 build reporting, but executable flow coverage remains owned by User Story 3 and User Story 6. |
| SD-008 | inherited from spec: Visual-intent honesty under the non-blocking gate: how a `brief`-mode node that never received a bundle surfaces its unrealized prototype rather than silently shipping skill-only. | Interaction & UX | Medium | Medium | inherited | Owned by this story; Slice 3 provides the implementation path by surfacing bundle-less brief mode as informational build context. |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Define the design mode and bundle contract | — | — |
| S2 | Surface brief mode without blocking mark | S1 | — |
| S3 | Build all design modes without a pipeline stall | S1, S2 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: mark authors a UI spec with a typed ordering ledger + durable artifacts | depends on | This story relies on the typed UI ledger, durable `.design.md`/`.flow.md` artifacts, and the `Design` column introduced by User Story 1. |
| User Story 3: render → mark → cut → forge is identical for UI and backend nodes | depends on | Forge design-mode behavior plugs into the `SC` screen-build profile and bundle handling established by User Story 3. |
| User Story 5: render is a clean, UI-aware entry point with prototype ingestion | depended upon by | This story defines and honors the `import` boundary; User Story 5 owns deriving candidate screens/flows from the supplied prototype at render. |
| User Story 7: UI work is visible to status, dependency, and audit tooling | depended upon by | Status and audit tooling can later report or inspect design modes and bundle-less brief surfacing without changing this story's build behavior. |

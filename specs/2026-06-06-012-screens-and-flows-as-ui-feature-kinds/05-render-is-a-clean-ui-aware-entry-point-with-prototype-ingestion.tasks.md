# Tasks: Render Is a Clean UI-Aware Entry Point With Prototype Ingestion

**Source**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.spec.md` — User Story 5
**Data Model**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.data-model.md`
**Contracts**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.contracts.md`
**Story Number**: 05

---

## Slice 1: Tighten Rendered UI Feature Metadata

**Goal**: `smithy.render` emits complete, internally consistent typed UI feature metadata and preserves backend feature-map behavior.

**Justification**: This is the smallest standalone improvement because render already owns feature typing. Before import-mode structure derivation can be useful, the normal no-bundle path must reliably show backend versus UI work, design mode, phase, flag, and build/wire ordering.

**Addresses**: FR-022, FR-024; AS 5.1, AS 5.3

### Tasks

- [x] **Require complete UI feature metadata in render output**

  Update `src/templates/agent-skills/commands/smithy.render.prompt` and the shared `feature-kinds` snippet it consumes so every rendered UI feature carries the complete UI metadata needed by downstream `mark`: `kind`, `phase`, `design_system`, per-node design mode, `flag` when flag-gated, and the screen/flow identifiers appropriate to the feature's phase. Keep backend features typed as backend without UI-only fields.

  _Acceptance criteria:_
  - Rendered UI features include all metadata required by the feature-kind contract
  - Rendered backend features remain visibly backend and do not gain UI-only fields
  - Each UI feature exposes its design mode without relying on title inference
  - Feature-map prose makes backend-to-spec versus UI-to-screen/flow fan-out evident
  - Existing legacy backend rendering behavior remains supported

- [x] **Express the build/wire seam in Dependency Order**

  Strengthen render's feature-map instructions so flag-gated UI work is split into a build feature and a wire feature sharing one `flag`, with ordering captured only in the feature map's `## Dependency Order` table. The build feature should be able to run ahead of backend work; the wire feature depends on the build feature and any backend prerequisite.

  _Acceptance criteria:_
  - Flag-gated UI work is represented as a build + wire pair
  - The build and wire features share exactly one `flag` value
  - The wire feature depends on its build feature in `## Dependency Order`
  - Backend prerequisites are attached to the wire feature, not the build feature
  - The seam is visible from metadata and dependency rows, not naming convention alone

**PR Outcome**: Rendered feature maps are a dependable typed fan-out surface for ordinary UI and backend work, with build/wire ordering explicit before prototype ingestion is added.

---

## Slice 2: Add Import-Mode Prototype Ingestion

**Goal**: `smithy.render` can accept an import-mode prototype or bundle and derive confirmable candidate screens and flows while recording the bundle reference for downstream honoring.

**Justification**: Import ingestion is the user story's prototype-first workflow. It is separable from baseline metadata because it only applies when a bundle is supplied, and the derived structure is explicitly a starting point for human confirmation rather than durable design truth.

**Addresses**: FR-023; AS 5.2

### Tasks

- [x] **Route supplied bundles through render**

  Update render intake and drafting guidance so a supplied import-mode bundle is treated as a boundary object available to the feature map. Render should record the bundle reference in the relevant UI feature metadata without implying that smithy calls the visual tool inline or that the bundle replaces the committed design skill.

  _Acceptance criteria:_
  - Import-mode bundle input is accepted by render as feature-map context
  - The rendered UI feature records the bundle reference for downstream commands
  - Bundle metadata keeps the committed `design_system` as the implementation dialect source
  - Render does not describe inline visual-tool calls as part of the workflow
  - No-bundle render runs keep the existing non-import path

- [x] **Derive candidate screens and flows from the bundle**

  Add import-mode drafting instructions so render uses the supplied prototype to propose candidate `ScreenId` and `FlowId` entries for the feature metadata. The output should frame those candidates as confirmable structure that `mark` will later turn into the typed ledger and durable files, not as authoritative implementation detail.

  _Acceptance criteria:_
  - Import-mode output includes candidate screen identifiers derived from the prototype
  - Import-mode output includes candidate flow identifiers derived from the prototype
  - Derived screen and flow structure is presented as a human-confirmable starting point
  - Render does not author `.design.md`, `.flow.md`, or executable test-body files
  - Ambiguous derivation is surfaced as specification debt rather than hidden

**PR Outcome**: Prototype-first UI work has a defined render entry point: the bundle rides forward, candidate screens and flows appear in the feature map, and downstream commands retain ownership of durable artifacts.

---

## Slice 3: Align Feature-Map Review and Documentation

**Goal**: Feature-map audit surfaces validate the UI metadata, design modes, import bundle references, and build/wire seam that render now emits.

**Justification**: Once render can emit richer UI metadata and import-derived structure, review and maintainer documentation need the same contract so maps do not drift silently before `mark` consumes them.

**Addresses**: FR-022, FR-023, FR-024; AS 5.1, AS 5.2, AS 5.3

### Tasks

- [x] **Update feature-map audit checks**

  Extend `src/templates/agent-skills/snippets/audit-checklist-features.md` so audits check UI design mode visibility, import bundle references when present, and build/wire seam consistency. Keep the checklist focused on feature-map structure rather than downstream screen or flow artifact bodies.

  _Acceptance criteria:_
  - Audits check that UI features expose a valid design mode
  - Audits check bundle references for import-mode UI features
  - Audits keep build/wire flag and dependency checks aligned with render output
  - Audits continue to distinguish backend and UI features without title inference
  - Audits do not require `.design.md` or `.flow.md` files at render time

- [x] **Refresh source documentation for render entry behavior**

  Update `src/templates/agent-skills/README.md` or adjacent source-template documentation so maintainers can see how render handles typed UI features, import-mode bundles, and the build/wire seam. Keep documentation source-only and avoid regenerating deployed snapshots.

  _Acceptance criteria:_
  - Documentation describes render as the typed UI feature-map entry point
  - Documentation explains import-mode bundle recording and confirmable derivation
  - Documentation keeps `mark` as the owner of durable screen/flow artifacts
  - Documentation states backend feature maps remain unchanged except for feature typing
  - `.claude/` and `.smithy/` snapshots are not regenerated

**PR Outcome**: Render's richer UI feature-map contract is enforced by audit guidance and documented for maintainers without changing downstream ownership.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-005 | inherited from spec: Fidelity of `import`-mode structure derivation: how reliably `render` can extract screens/flows/behavior from a prototype/bundle, and how much human confirmation the derived structure needs. | Integration | Medium | Low | inherited | Owned by Slice 2; import output must label derived structure as confirmable and route unresolved ambiguity to debt. |
| SD-006 | inherited from spec: Whether `SC`/`FL` nodes are always atomic or can be sub-sliced (and whether `flow-scaffold` #410 is in scope, which the epic recommends holding). | Constraints | Low | Medium | inherited | Owned by User Story 3; render only emits feature-map metadata and does not decide node slice granularity. |
| SD-007 | inherited from spec: Build-phase coverage honesty: a build screen can be "done" with a missing brief state and no executable gate until its flows wire. | Edge Cases | Medium | Low | inherited | Owned by downstream screen-build, flow-wire, and lint work; render only preserves the build/wire seam. |
| SD-008 | inherited from spec: Visual-intent honesty under the non-blocking gate: how a `brief`-mode node that never received a bundle surfaces its unrealized prototype rather than silently shipping skill-only. | Interaction & UX | Medium | Medium | inherited | Owned by User Story 4; this story records design mode and import bundles at render but does not define bundle-less brief surfacing. |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Tighten rendered UI feature metadata | — | — |
| S2 | Add import-mode prototype ingestion | S1 | — |
| S3 | Align feature-map review and documentation | S1, S2 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: mark authors a UI spec with a typed ordering ledger + durable artifacts | depended upon by | Mark consumes the typed UI feature metadata and screen/flow identifiers render emits, then owns the typed spec ledger and durable files. |
| User Story 3: render → mark → cut → forge is identical for UI and backend nodes | depended upon by | Cut and forge consume downstream artifacts created from render's typed feature-map fan-out. |
| User Story 4: A non-blocking visual-design gate with import / brief / none modes | depends on | This story records import-mode bundle references and design modes at the feature-map entry point; User Story 4 completes the non-blocking gate semantics. |
| User Story 7: UI work is visible to status, dependency, and audit tooling | depended upon by | Feature-map audit and status tooling consume the typed kind, design mode, flag, and bundle metadata this story standardizes. |

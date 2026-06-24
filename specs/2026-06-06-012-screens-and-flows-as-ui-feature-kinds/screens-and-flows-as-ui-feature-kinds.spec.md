# Feature Specification: Screens and Flows as UI Feature Kinds

**Spec Folder**: `2026-06-06-012-screens-and-flows-as-ui-feature-kinds`
**Branch**: `feature/epic-404-ui-specs` *(pre-staged linked worktree; branch preserved per branch policy)*
**Created**: 2026-06-06
**Status**: Draft
**Input**: User description — "add implementation of EPIC #404 and its sub-issues to the smithy system": let a `.features.md` produce durable `.screen.md`/`.flow.md` artifacts alongside `.spec.md`, decide the command path from feature → screen/flow → built output, decide screen/flow/spec dependency handling, and adjust `render` to be a cleaner UI-aware entry point.
**Source EPIC**: [#404 — Screens & flows as first-class Smithy feature kinds](https://github.com/Balexda/SmithyCLI/issues/404) (sub-issues #405–#410)

## Clarifications

### Session 2026-06-06

- _The durable screen/flow artifacts are authored in the **planning layer** (at `smithy.mark`), **above** `forge` — `forge` consumes them and never authors durable design truth. This explicitly reverses the "forge emits them" direction recorded in issue #408, which the product owner identified as a mistake._ `[Critical Assumption]`
- _`smithy.mark` is the authoring command: it gains a `kind` branch rather than spawning a new command, so the pipeline stays `render → mark`. `kind: backend` is unchanged; `kind: ui` authors durable screen/flow artifacts **and** a UI spec._ `[Critical Assumption]`
- _**UI-to-implementation runs through a typed ordering ledger** (resolves SD-001). A `kind: ui` feature gets a `.spec.md` whose `## Dependency Order` table is a **typed node graph**: screen-build nodes (`SC<N>`), flow-wire nodes (`FL<N>`), and backend user-story nodes (`US<N>`) are first-class rows, interleaved, each pointing at its durable artifact. One file controls all sequencing and parallelism. The spec rows are **pointers + ordering, never layout prose** — the layout/intent lives in the durable `.design.md`/`.flow.md`, so the spec cannot drift against the code. `forge` routes by node kind._ `[Critical Assumption]`
- _**Flows are first-class, individually-ordered nodes**, not a `flows: [...]` list hanging off the feature. Each flow has its own `Depends On` (e.g. a "success" flow depends on the store user story; a "cancel" flow depends only on the screen)._ `[Critical Assumption]`
- _**A visual-design gate models the break to highly-visual iterative tools** (claude.ai/design, Figma). Smithy never iterates pixels in the terminal; it defines a boundary and resumes across it. Three modes — `import` (prototype-first: a bundle enters at `render`, which derives structure from it), `brief` (mark-first: the `.design.md`/`.flow.md` intent **is** the design brief handed to the visual tool), `none` (pass-through, no visual loop). The **`bundle` is the boundary object**. The gate is **non-blocking**: `mark` always proceeds; `forge` honors a bundle if present and otherwise builds from the committed design skill._ `[Critical Assumption]`
- _Smithy templates are **tool-agnostic**: the AI detects and uses whatever UI framework and test driver the target project actually uses (Jetpack Compose + Maestro + `story-spider-design` are illustrative examples only). An Electron/React project gets React components + Playwright/Cypress._ `[Critical Assumption]`
- _`.flow.md` stays **intent-only** (why, guards, entry/exit) and **never** enumerates steps; the ordered "series of user actions and UI responses" the user described lives in the **executable test body** (Maestro yaml or the project's equivalent)._
- _The screen annotation filename is `<ScreenId>.design.md` (it signals "annotation about the code," not a parallel spec) — confirmed by the owner 2026-06-07, closing SD-002._
- _Building blocks already landed (closed sub-issues): `feature-kinds.md` typed-feature metadata + `render` emission (#405), `smithy.helper-screen-design` (#407), `smithy.helper-flow-definition` (#406). This feature wires those blocks into the command pipeline and generalizes them — including driver-neutral field renames such as `composable`→`component-path` and `maestro`→`test-body` — but does not redefine the screen/flow artifact families wholesale._

## Resolved Architectural Model

UI work is shaped by **two orthogonal axes**, decided independently:

**Axis 1 — the ordering ledger (resolves SD-001).** A `kind: ui` feature's `.spec.md`
holds a typed `## Dependency Order` graph where screens, flows, and backend stories are
first-class interleaved nodes. This keeps smithy's "one file controls ordering and
parallelism" consistency and sidesteps drift because rows are pointers, not layout
descriptions. *(History: this is a refinement of the earlier "Model A vs B" question —
Model A's spec layer was chosen, but reframed so the spec is an orchestration index, not
a re-description of the screens, which was Model A's failure mode.)* Every node — `SC`,
`FL`, and `US` alike — then passes to `cut` (which produces a `tasks.md`) and `forge`
(which builds the PR(s)), so **`render → mark → cut → forge` is identical for UI and
backend**; only the per-kind slicing and build profile differ.

Worked example — greenfield **Add Title** (no library-storage or title-fetch backend yet):

| ID | Kind | Title (→ mark's durable file) | Depends On | Design | Artifact |
|----|------|-------------------------------|-----------|--------|----------|
| SC1 | screen | Add Title screen → `screens/AddTitle.design.md` | — | brief | — |
| FL1 | flow | Add Title — cancel → `flows/AddTitleCancel.flow.md` | SC1 | — | — |
| FL2 | flow | Add Title — not found → `flows/AddTitleNotFound.flow.md` | SC1 | — | — |
| FL3 | flow | Add Title — no connectivity → `flows/AddTitleNoConnectivity.flow.md` | SC1 | — | — |
| US1 | story | Fetch title from URL | — | — | — |
| US2 | story | Parse title metadata | US1 | — | — |
| US3 | story | Store title into library | US2 | — | — |
| FL4 | flow | Add Title — failed to parse → `flows/AddTitleFailedParse.flow.md` | SC1, US2 | — | — |
| FL5 | flow | Add Title — success → `flows/AddTitleSuccess.flow.md` | SC1, US3 | — | — |
| FL6 | flow | Add Title — already exists → `flows/AddTitleAlreadyExists.flow.md` | SC1, US3 | — | — |

*The `Artifact` cell tracks the `cut`-produced `tasks.md` (`—` until `cut` runs) for every
node kind, exactly as a backend spec does; mark's durable `.design.md`/`.flow.md` is shown
after the `→` in the Title cell. Each SC/FL/US node then passes through `cut` and `forge`.*

The table expresses: build the screen → the three **mock-satisfiable** flows
(cancel/not-found/no-connectivity) wire in parallel against the flagged mock → the backend
chain (US1→US2→US3) runs **in parallel** with those flows → the three **real-data** flows
wire once their backend deps land. In the *existing-backend* variant the US rows drop out
and every flow depends only on `SC1` — same feature, ordering adapts to what already exists.

**Axis 2 — the visual-design gate.** Independent of ordering: does a node need a step out to
a visual prototyping tool? Modeled by a per-node `Design` mode, with the `bundle` as the
boundary object, **non-blocking**:

| Mode | Meaning | Bundle enters at | forge behavior |
|------|---------|------------------|----------------|
| `none` | Pass-through; no visual loop (e.g. add a font-family option). | never | Build from the committed design skill. |
| `import` | Prototype-first / designer-led. A prototype already exists; `render` may derive structure from it. | `render` (rides to forge) | Honor the bundle (bundle wins layout/visual, skill wins dialect). |
| `brief` | Mark-first / engineer-led. The `.design.md`/`.flow.md` intent **is** the brief handed to the visual tool. | optionally, after `mark` | Honor the bundle if attached; otherwise build from the skill. |

Smithy never iterates pixels inline: it emits a brief (intent-out) or ingests a prototype
(bundle-in), and the human runs the visual loop in the visual medium. Because the gate is
non-blocking, a `brief`-mode screen that never receives a bundle still builds from the
design skill — the prototype is advisory, not a hard stop (intent-honesty tracked as SD-008).

`brief` mode can be **developer-declared** or **mark-initiated**: when no bundle was
provided and `mark` judges a screen complex enough to benefit from one, `mark` authors the
brief itself and **recommends gating here** — surfacing the suggestion so the developer can
either supply a bundle and re-run, or accept what `mark` produced and pass it through. The
recommendation never hard-stops the pipeline.

## Artifact Hierarchy

RFC → Milestone → Feature → UI Spec (`## Dependency Order` typed node graph) → cut (`tasks.md` per node) → forge (PR(s)). Each node also carries a mark-authored durable file: `SC` → `.design.md`, `FL` → `.flow.md` + test body, `US` → (none). The `render → mark → cut → forge` chain is identical for UI and backend.

## User Scenarios & Testing *(mandatory)*

### User Story 1: mark authors a UI spec with a typed ordering ledger + durable artifacts (Priority: P1)

As a developer running the smithy pipeline, I want `smithy.mark` to recognize a `kind: ui` feature and produce a `.spec.md` whose `## Dependency Order` is a typed node graph (screens, flows, backend stories interleaved) plus the durable `.design.md`/`.flow.md` artifacts the nodes point at, so that all ordering and parallelism for the feature live in one file and the durable design intent lives beside the code.

**Why this priority**: This is the load-bearing change. Every other UI story consumes the ledger or the artifacts it produces.

**Independent Test**: Run `mark` against a `kind: ui` feature; confirm it writes a `.spec.md` with a typed `## Dependency Order` table (SC/FL/US rows), one `.design.md` per screen node, the `.flow.md` per flow node, and updates the feature's `Artifact` cell.

**Acceptance Scenarios**:

1. **Given** a `kind: ui` feature, **When** `mark` runs, **Then** it writes a `.spec.md` whose `## Dependency Order` table has a `Kind` column and rows typed `SC<N>` (screen), `FL<N>` (flow), and `US<N>` (backend story), each with its own `Depends On` and an `Artifact` pointer (or `—`).
2. **Given** the ledger, **When** `mark` authors content, **Then** screen rows point at `design/screens/<ScreenId>.design.md` (rationale-only) and flow rows point at `design/flows/<FlowId>.flow.md`, and **no** spec row contains layout prose.
3. **Given** flows in the feature, **When** the ledger is built, **Then** each flow is its own `FL<N>` node with individual `Depends On` (a flow may depend only on its screen, or also on backend `US` nodes), not a `flows: [...]` list.
4. **Given** a `kind: backend` feature, **When** `mark` runs, **Then** behavior is the existing spec-triad flow unchanged — the `kind` branch is additive.
5. **Given** a `kind: ui` feature with no internal ordering and `Design: none` (e.g. a single pass-through screen), **When** `mark` runs, **Then** it MAY emit a minimal single-node ledger rather than forcing multiple rows.

---

### User Story 2: Tool-agnostic screen/flow generation from the project's own stack (Priority: P1)

As a developer on any UI project (Compose, React, Electron, SwiftUI, …), I want smithy to generate UI components and flow tests in the framework and test driver my project already uses, so that the artifacts are usable as-is rather than hardcoded to Jetpack Compose + Maestro.

**Why this priority**: Without generality the capability only serves Compose apps; the owner requires the AI to "use the UI that exists in the project."

**Independent Test**: Point the UI path at a React/Electron fixture; confirm the screen annotation's component-path field resolves to a `.tsx`/`.jsx` component and the flow's executable body is a Playwright/Cypress (not Maestro) test.

**Acceptance Scenarios**:

1. **Given** a target repo with no Compose, **When** the UI path runs, **Then** the screen annotation's `component-path` names a framework-appropriate component file for the project's actual stack.
2. **Given** a repo whose tests use Playwright (or Cypress/Detox/XCUITest), **When** a flow is emitted, **Then** the executable body is authored in that driver, keyed to stable test IDs, asserting traversal **and** guards — never visible text or layout position.
3. **Given** the generalized templates, **When** a maintainer reads `feature-kinds.md` and the helper skills, **Then** Compose/Maestro/`story-spider-design` are framed as worked examples and the normative contract is driver-neutral.

---

### User Story 3: render → mark → cut → forge is identical for UI and backend nodes (Priority: P1)

As a developer, I want every ledger node — `SC`, `FL`, and `US` — to flow through the same `cut` → `tasks.md` → `forge` → PR pipeline as backend work, with `cut`/`forge` only varying the per-kind slicing and build profile, so that UI and non-UI work share one consistent flow and `forge` never authors durable design truth.

**Why this priority**: The ledger is inert until `cut` slices it and `forge` builds it. Keeping the pipeline identical is the consistency the owner explicitly requires. Pairs with US1 as the minimum end-to-end path.

**Independent Test**: Hand `cut` a UI feature whose ledger mixes SC/FL/US nodes; confirm it produces a `tasks.md` for each node, `forge` builds those tasks into PR(s) — screen behind the flag on mock data, flows emitting their test bodies, backend stories as today — and zero `.design.md`/`.flow.md` are authored downstream of `mark`.

**Acceptance Scenarios**:

1. **Given** a typed ledger, **When** `cut` runs, **Then** it slices **every** node kind (SC/FL/US) into a `.tasks.md`, branching by kind for the slice shape (screen-build tasks, flow-wire tasks, backend-story tasks), and populates each node's `Artifact` cell with the tasks file.
2. **Given** an `SC` (screen-build) node's tasks, **When** `forge` runs them, **Then** it generates the component from the `.design.md` + the committed design skill, renders every brief state with design-system tokens only (no hardcoded colors), behind the feature `flag`, on mock data.
3. **Given** an `SC`/`FL` node whose screen has a bundle attached, **When** `forge` runs, **Then** it translates the bundle into the project framework applying the conflict rule (bundle wins layout/visual; skill wins dialect), with the skill preloaded as implementer context.
4. **Given** an `SC`/`FL` node in `brief` mode with **no** bundle attached, **When** `forge` runs, **Then** it builds from the committed design skill without blocking (the gate is non-blocking).
5. **Given** an `FL` (flow-wire) node, **When** `forge` runs its tasks, **Then** definition-of-done includes connecting real data for that path, flipping/honoring the `flag`, and emitting/updating the **executable test body** for that flow (the `.flow.md` was authored at `mark` and is not modified by `forge`), run as a validation gate.
6. **Given** a `US` node in a UI feature's ledger, **When** it is processed, **Then** it flows through `cut` → `.tasks.md` → `forge` exactly as a backend story does today.
7. **Given** any `kind: ui` node, **When** the reviewer profile is selected, **Then** it checks structural conformance only (tokens-only, component reuse, conventions, every brief state present, touch-target/contrast roles) and never judges visual fidelity, staying in plan/no-write mode.

---

### User Story 4: A non-blocking visual-design gate with import / brief / none modes (Priority: P1)

As a developer, I want each screen node to declare a design mode — `none` (no visual loop), `import` (a prototype already exists), or `brief` (smithy's intent is the brief I take to a visual tool) — with the `bundle` as the hand-off object and no hard pipeline stop, so that I can cleanly step out to a highly-visual tool and back without smithy trying to iterate pixels in the terminal, and so simple pass-through screens incur no prototyping ceremony.

**Why this priority**: The visual break is the scenario the owner flagged as unhandled; the build path is incomplete without a defined terminal↔visual boundary.

**Independent Test**: Process three screens — one `none`, one `import` (bundle supplied), one `brief` (no bundle) — and confirm forge builds all three (the `import` one honoring its bundle, the other two from the design skill) with no pipeline stall.

**Acceptance Scenarios**:

1. **Given** a screen node with `Design: none`, **When** the feature is built, **Then** no bundle is involved and forge builds from the committed design skill.
2. **Given** `Design: import` with a bundle supplied to `render`, **When** the pipeline runs, **Then** `render` may derive screen/flow structure from the prototype and the bundle rides to forge as the visual source of truth.
3. **Given** `Design: brief`, **When** `mark` authors the node, **Then** the `.design.md`/`.flow.md` intent is usable verbatim as a prototyping brief, the node is marked as intending a prototype, and `mark` proceeds without blocking.
4. **Given** a `brief`-mode node that never receives a bundle, **When** forge runs, **Then** it builds from the design skill (the gate is non-blocking; the missing prototype is surfaced, not enforced).
5. **Given** any mode, **When** a bundle is present at build time, **Then** forge honors it under the conflict rule regardless of how it entered (import or post-mark brief).
6. **Given** no bundle was provided and `mark` judges a screen complex enough to benefit from one, **When** `mark` runs, **Then** it authors the brief itself and recommends gating for a bundle, leaving the developer to either supply one and re-run or accept what `mark` produced and pass it through — without a hard stop.

---

### User Story 5: render is a clean, UI-aware entry point with prototype ingestion (Priority: P2)

As a developer starting UI work, I want `smithy.render` to emit typed features with complete, consistent metadata and, in `import` mode, to derive screen/flow structure from a supplied prototype/bundle, so that the feature map is a dependable single fan-out point and a prototype-first workflow has a defined entry.

**Why this priority**: render already emits typed features (#405); this adds import ingestion and polish. Not blocking the core build path.

**Independent Test**: Run render on a milestone with UI work, once without a bundle and once with an `import` bundle; confirm typed features with complete metadata in both, and derived screen/flow structure in the import case.

**Acceptance Scenarios**:

1. **Given** a milestone containing UI work, **When** render drafts the feature map, **Then** every UI feature has complete `feature-kinds` metadata and flag-gated work is split into a build + wire pair sharing one `flag`.
2. **Given** an `import`-mode prototype/bundle supplied to render, **When** it runs, **Then** it derives the candidate screens/flows from the prototype and records the bundle reference for downstream honoring.
3. **Given** a rendered map, **When** a developer reads it, **Then** it is evident which features are backend (→ specs) versus UI (→ screens/flows), and which UI nodes carry a design mode.

---

### User Story 6: flow-lint validates the screen/flow/test graph in app CI (Priority: P2)

As a maintainer of an app repo, I want a deterministic, smithy-state-free `flow-lint` check that fails CI when any screen/flow/test cross-reference dangles, so that a severed product path is caught as a signal rather than rotting silently. *(EPIC sub-issue #409.)*

**Why this priority**: The durable artifacts form a graph; without a checker, broken references accumulate. Independent of forge, runnable in any app's CI.

**Independent Test**: Run flow-lint against a fixture with a dangling `screens:` reference and a fully resolved fixture; confirm the first fails naming the severed path and the second passes.

**Acceptance Scenarios**:

1. **Given** a `.flow.md` whose `screens:` entry has no matching screen annotation, **When** flow-lint runs, **Then** it fails naming the specific severed reference.
2. **Given** a `.flow.md` with no paired executable test body (or a test body with no `.flow.md`), **When** flow-lint runs, **Then** it reports the orphan.
3. **Given** duplicate or reused flat `ScreenId`/`FlowId`s, **When** flow-lint runs, **Then** it fails on the uniqueness violation.
4. **Given** a fully resolved tree, **When** flow-lint runs, **Then** it exits success with no agent calls.

---

### User Story 7: UI work is visible to status, dependency, and audit tooling (Priority: P3)

As a developer tracking progress, I want screen/flow/story nodes in the ledger to participate in `smithy.status`, dependency ordering, and `smithy.audit`, so that UI work is tracked and auditable with the same granularity as backend work.

**Why this priority**: Important for parity but not blocking the build path.

**Independent Test**: With a partially built UI ledger, confirm `smithy.status` reports per-node progress, the dependency graph resolves SC/FL/US edges, and `smithy.audit` can check a `.design.md`/`.flow.md` against the helper-skill checklists.

**Acceptance Scenarios**:

1. **Given** a UI ledger, **When** `smithy.status` runs, **Then** it reports per-node progress (which SC/FL/US nodes are built) distinct from "unstarted."
2. **Given** the typed ledger, **When** the dependency graph is reconstructed, **Then** SC/FL/US nodes and their edges resolve (no node invisible to the scanner).
3. **Given** a `.design.md` or `.flow.md`, **When** `smithy.audit` targets it, **Then** it evaluates against the review checklist in the corresponding helper skill.
4. **Given** the plan-review machinery, **When** a UI artifact set is reviewed, **Then** `smithy-plan-review` has a screen/flow artifact-type mode (or a documented reason it is out of scope).

---

### Edge Cases

- A flow is mock-satisfiable (cancel/not-found/no-connectivity) versus real-data-dependent (success/already-exists/failed-to-parse); the ledger expresses this purely through each flow node's `Depends On` (screen-only vs screen + backend `US`), with no per-flow phase field.
- The same feature has different internal ordering depending on what already exists (greenfield vs existing-backend AddTitle); the ledger must be regenerable/adjustable without restructuring the feature.
- A `brief`-mode screen ships without ever receiving a bundle — built from the design skill; the unrealized visual intent must be surfaced, not silently dropped (SD-008).
- `import`-mode structure derivation from a prototype is lossy/ambiguous — render's derived screens/flows are a starting point a human confirms, not authoritative (SD-005).
- A build-phase screen is "done" with a missing brief state and no executable gate until its flows wire — coverage honesty gap (SD-007; mirrors the epic's audio-service caveat).
- A developer renames a test ID or `ScreenId`/`FlowId` — a breaking change to every referencing artifact; treated like an API rename.
- A feature map mixes backend and UI features; `cut`/`forge` fan out by node kind without cross-contamination.

## Dependency Order

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| US1 | mark authors a UI spec with a typed ordering ledger + durable artifacts | — | specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/01-mark-authors-a-ui-spec-with-a-typed-ordering-ledger-durable-artifacts.tasks.md |
| US2 | Tool-agnostic screen/flow generation from the project's own stack | — | specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/02-tool-agnostic-screen-flow-generation-from-the-projects-own-stack.tasks.md |
| US3 | render → mark → cut → forge is identical for UI and backend nodes | US1 | specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/03-render-mark-cut-forge-is-identical-for-ui-and-backend-nodes.tasks.md |
| US4 | A non-blocking visual-design gate with import / brief / none modes | US1 | — |
| US5 | render is a clean, UI-aware entry point with prototype ingestion | — | — |
| US6 | flow-lint validates the screen/flow/test graph in app CI | US1 | — |
| US7 | UI work is visible to status, dependency, and audit tooling | US1 | — |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `smithy.mark` MUST branch on the selected feature's `kind`; `kind: backend` (or absent) MUST retain the existing spec-triad behavior unchanged.
- **FR-002**: On `kind: ui`, `mark` MUST write a `.spec.md` whose `## Dependency Order` table is a typed node graph with a `Kind` column and rows typed `SC<N>` (screen-build), `FL<N>` (flow-wire), and `US<N>` (backend story).
- **FR-003**: Each ledger node MUST carry its own `Depends On` (same-table IDs) and an `Artifact` pointer (`—` until created); the table MUST express all intra-feature ordering and parallelism in one file.
- **FR-004**: Spec ledger rows MUST be pointers + ordering only and MUST NOT contain layout prose; screen/flow content lives in the durable `.design.md`/`.flow.md`.
- **FR-005**: Flows MUST be modeled as first-class `FL<N>` nodes with individual dependencies, not as a `flows: [...]` list on the feature.
- **FR-006**: On `kind: ui`, `mark` MUST author one `design/screens/<ScreenId>.design.md` per screen node (per `smithy.helper-screen-design`) and one `design/flows/<FlowId>.flow.md` per flow node (per `smithy.helper-flow-definition`), with rationale-only / intent-only bodies.
- **FR-007**: The durable screen/flow artifacts MUST be authored at `mark`; `forge` MUST NOT author them. (Corrects #408.)
- **FR-008**: Screen/flow generation MUST be framework- and driver-agnostic: artifacts are emitted in the target project's existing UI framework and test driver (the AI adapts to the project's stack inherently, the same way it does for backend code — no explicit detection sweep); Compose/Maestro/`story-spider-design` MUST appear only as illustrative examples.
- **FR-009**: ~~When the project stack cannot be confidently detected, the system MUST surface the ambiguity rather than default silently.~~ *(Withdrawn 2026-06-08 — superseded by the inherent-adaptation decision; there is no explicit detection step whose confidence could be surfaced. See SD-009.)*
- **FR-010**: The screen annotation's component-path field MUST be a repo-relative path to the owning UI component file (framework-neutral), not a framework-specific symbol name.
- **FR-011**: Flow executable bodies MUST be keyed to stable test IDs / accessibility IDs / semantic tags — never visible text or layout position — and MUST assert traversal **and** guards.
- **FR-012**: `.flow.md` bodies MUST remain intent-only and MUST NOT enumerate steps.
- **FR-013**: The `render → mark → cut → forge` pipeline MUST be identical for UI and backend: `cut` MUST slice **every** ledger node (SC/FL/US) into a `.tasks.md` (branching by node kind for the slice shape) and populate each node's `Artifact` cell; `forge` MUST build those tasks into PR(s). Neither command forks the pipeline by kind — only the per-kind slice/build profile differs.
- **FR-014**: UI screen build MUST render every brief state with design-system tokens only (no hardcoded colors), behind the `flag`, against mock data.
- **FR-015**: Each screen node MUST carry a `Design` mode ∈ {`none`, `import`, `brief`}; the build path MUST honor it.
- **FR-016**: The design gate MUST be **non-blocking**: `mark` MUST always proceed, and `forge` MUST build a node from the committed design skill when no bundle is attached, regardless of mode.
- **FR-017**: When a `bundle` is attached at build time (entered via `import` at render or post-`mark` in `brief` mode), `forge` MUST honor it under the conflict rule (bundle wins layout/visual; skill wins implementation dialect), with the skill preloaded as implementer context.
- **FR-018**: In `brief` mode the `.design.md`/`.flow.md` intent MUST be usable verbatim as a prototyping brief, and the node MUST be marked as intending a prototype so an unrealized one is surfaced (not silently dropped). `brief` mode MAY be developer-declared **or** mark-initiated: when no bundle is provided and `mark` judges a screen sufficiently complex, `mark` MUST author the brief itself and recommend gating for a bundle, leaving the developer to supply one (and re-run) or accept it and pass through — a non-blocking recommendation, never a hard stop.
- **FR-019**: A flow-wire node's definition-of-done MUST include connecting real data for that path, honoring/flipping the `flag`, and emitting/updating the **executable test body** (not the `.flow.md`, which `mark` owns — keeping `forge` consistent with FR-007/SC-003), run as a gate.
- **FR-020**: The `kind: ui` reviewer profile MUST check structural conformance only and MUST NOT judge visual fidelity, remaining in plan/no-write mode.
- **FR-021**: A `.design.md`/`.flow.md` MUST be a self-sufficient brief usable by a non-forge build method.
- **FR-022**: `smithy.render` MUST emit complete, internally consistent `feature-kinds` metadata for every UI feature, splitting flag-gated work into a build + wire pair sharing one `flag`, and MUST express the build/wire seam in its `## Dependency Order` (wire depends on build and any backend; build does not depend on the backend).
- **FR-023**: In `import` mode, `smithy.render` MUST be able to derive candidate screens/flows from a supplied prototype/bundle and record the bundle reference for downstream honoring; the derived structure is a confirmable starting point, not authoritative.
- **FR-024**: A feature map MUST make a feature's kind (backend → spec vs UI → screens/flows) evident without title inference.
- **FR-025**: `flow-lint` MUST resolve every `screens:` reference to an existing screen annotation, every `.flow.md` to a paired test body and vice versa, and enforce flat `ScreenId`/`FlowId` uniqueness across the repo.
- **FR-026**: `flow-lint` MUST fail naming the specific severed reference, run with no agent calls, and be invocable outside a forge run.
- **FR-027**: `smithy.status` MUST report per-node (SC/FL/US) progress for UI features distinct from "unstarted."
- **FR-028**: The dependency tooling MUST resolve SC/FL/US nodes and their edges from the typed ledger (no UI node invisible to the scanner).
- **FR-029**: `smithy.audit` MUST be able to evaluate a `.design.md`/`.flow.md` against the corresponding helper-skill review checklist.
- **FR-030**: `smithy-plan-review` MUST gain a screen/flow artifact-type mode, or document why screen/flow artifacts are reviewed by `smithy.audit`/`flow-lint` instead.
- **FR-031**: On `kind: ui`, `mark` MUST abort with a message when a screen node names no `ScreenId` or a UI feature names no `design_system` (a UI feature must own ≥1 screen and a design system).

### Key Entities *(include if feature involves data)*

- **Typed Feature**: a `### Feature N` carrying `feature-kinds` metadata (`kind`, and for UI `phase`/`design_system`/`bundle`/`flag`). The fan-out point.
- **UI Spec Ledger**: the `.spec.md` `## Dependency Order` typed node graph (SC/FL/US rows) — the single ordering/parallelism surface for one UI feature.
- **Screen-Build Node (`SC<N>`)**: a ledger row that builds one screen; points at its `.design.md`; carries a `Design` mode.
- **Flow-Wire Node (`FL<N>`)**: a first-class ledger row that wires one flow; points at its `.flow.md`; its `Depends On` encodes mock-satisfiable vs real-data.
- **Backend Story Node (`US<N>`)**: a ledger row built through cut→tasks→forge as today.
- **Screen Annotation (`<ScreenId>.design.md`)**: thin durable intent record colocated with the UI component; doubles as the `brief`-mode design brief.
- **Flow Pair (`<FlowId>.flow.md` + executable test body)**: 1:1 by flat `FlowId`; `.flow.md` owns intent/guards, the test body owns behavior (test-ID-keyed).
- **Design Mode + Bundle (boundary object)**: per-node mode (`none`/`import`/`brief`) and the optional `bundle` that crosses the terminal↔visual boundary; honored by forge if present, non-blocking.
- **Build/Wire Seam**: the shared `flag` linking a `build` feature to its `wire` feature.
- **ScreenId / FlowId**: flat, stable, repo-namespaced identifiers; never reused; the join keys across the graph.

## Assumptions

- The closed sub-issues' artifacts (`feature-kinds.md`, the two helper skills, render typing) are authoritative inputs; this feature consumes and generalizes them (e.g. driver-neutral field renames) rather than redefining the artifact families from scratch.
- "Tool-agnostic" means the AI adapts to the project's existing stack at generation time; smithy ships no per-framework generators.
- Smithy never performs visual iteration inline; the `bundle` is the only object crossing the terminal↔visual boundary.
- `cut` slices every node kind (SC/FL/US) into a `tasks.md`; the per-kind slice shape differs (a screen-build or flow-wire node may be a single slice, a backend story several). Whether SC/FL nodes ever need multi-slicing is open (SD-006).
- The `.claude/` snapshot is NOT regenerated as part of implementing this spec (source PRs edit `src/templates/` only).
- The reviewer never judges pixels; visual taste iteration happens in the visual tool, behavioral iteration in forge's reviewer + PR.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Pipeline model for UI work. | Functional Scope | High | High | resolved | Resolved 2026-06-06 — adopt the typed ordering ledger (SC/FL/US first-class nodes in the spec's `## Dependency Order`); spec rows are pointers+ordering, not layout prose. See `## Resolved Architectural Model`. |
| SD-002 | Screen annotation filename: keep landed `<ScreenId>.design.md` or adopt the user's `.screen.md`. | Terminology | Low | High | resolved | Resolved 2026-06-07 — owner decision: use `<ScreenId>.design.md`. |
| SD-003 | Which test drivers are officially supported and how `forge` detects the driver; generalizing the flow skill's Maestro-specific yaml grammar and the bundle (claude.ai/design, Figma) export shape to driver/tool-neutral contracts. | Integration | Medium | High | resolved | Resolved 2026-06-07 — owner decision: smithy does not own or select the test driver. The repo configures its own testing and smithy leverages whatever exists (`FR-008` stack adaptation); there is no official driver matrix, and the artifact contract is driver-neutral by construction (`FR-008`/`FR-011`, contracts C6). |
| SD-004 | Multi-screen / multi-flow intra-feature ordering. | Domain & Data Model | Medium | High | resolved | Resolved 2026-06-06 — the typed ledger orders SC/FL/US nodes in one file; superseded by SD-001's resolution. |
| SD-005 | Fidelity of `import`-mode structure derivation: how reliably `render` can extract screens/flows/behavior from a prototype/bundle, and how much human confirmation the derived structure needs. | Integration | Medium | Low | open | — |
| SD-006 | Whether `SC`/`FL` nodes are always atomic or can be sub-sliced (and whether `flow-scaffold` #410 is in scope, which the epic recommends holding). | Constraints | Low | Medium | open | — |
| SD-007 | Build-phase coverage honesty: a build screen can be "done" with a missing brief state and no executable gate until its flows wire. | Edge Cases | Medium | Low | open | — |
| SD-008 | Visual-intent honesty under the non-blocking gate: how a `brief`-mode node that never received a bundle surfaces its unrealized prototype rather than silently shipping skill-only. | Interaction & UX | Medium | Medium | open | — |
| SD-009 | Whether smithy command prompts should encode an explicit UI stack/test-driver **detection** pass before generating screen/flow artifacts. | Functional Scope | Medium | High | resolved | Resolved 2026-06-08 — owner decision: **no explicit detection prose**. The agent adapts to the project's existing stack inherently when it writes code (as backend `forge` does without a language-detection sweep); the neutral `component-path`/`test-body` contracts (Slice 1) already carry the behavior. Stack conventions live in `CLAUDE.md`/`AGENTS.md`, not the prompts. Withdraws Slice 2, FR-009, and AS 2.4; rewords FR-008/AS 2.1 to keep the framework-agnostic outcome without the detection mechanism. |

## Out of Scope

- `flow-scaffold` generator (#410) — held per the epic until flows prove load-bearing; tracked under SD-006.
- Authoring the `story-spider-design` (or any specific) design system; smithy references a committed design skill, it does not create one.
- Performing visual/pixel iteration inside smithy, or calling claude.ai/design / Figma inline; smithy only emits briefs and ingests bundles at the boundary.
- Visual-diff / pixel-fidelity scoring in the reviewer (explicitly deferred by the epic).
- Instrumentation-level tests for sub-UI behaviors (audio service, background work); the spec only requires the coverage caveat be stated.
- Regenerating the `.claude/` snapshot or the manifest.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A `kind: ui` feature with interleaved screens, flows, and backend stories (e.g. greenfield Add Title) flows end to end — `render` → `mark` (typed ledger + durable artifacts) → `cut` (`tasks.md` per SC/FL/US node) → `forge` (PR(s)) — with all ordering controlled from the one `.spec.md` and no undocumented manual step.
- **SC-002**: The same templates produce framework-appropriate artifacts for at least two distinct stacks (e.g. Compose+Maestro and React+Playwright) without template edits.
- **SC-003**: `forge` authors zero durable design artifacts; 100% of `.design.md`/`.flow.md` files originate at `mark`.
- **SC-004**: All three design modes build without a pipeline stall: `none` and bundle-less `brief` build from the design skill; `import` (and bundle-attached `brief`) honor the bundle under the conflict rule.
- **SC-005**: `flow-lint` fails on a dangling reference (naming the severed path) and passes on a resolved tree, in CI, with zero agent calls.
- **SC-006**: The same feature regenerates a correct ledger in both its greenfield and existing-backend variants (US rows present vs absent; flow dependencies adjust) without restructuring.
- **SC-007**: Backend features in a mixed feature map are byte-for-byte unaffected by the UI changes (existing tests green).

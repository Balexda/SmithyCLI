# Feature Specification: Screens and Flows as UI Feature Kinds

**Spec Folder**: `2026-06-06-012-screens-and-flows-as-ui-feature-kinds`
**Branch**: `feature/epic-404-ui-specs` *(pre-staged linked worktree; branch preserved per branch policy)*
**Created**: 2026-06-06
**Input**: User description — "add implementation of EPIC #404 and its sub-issues to the smithy system": let a `.features.md` produce durable `.screen.md`/`.flow.md` artifacts alongside `.spec.md`, decide the command path from feature → screen/flow → built output, decide screen/flow/spec dependency handling, and adjust `render` to be a cleaner UI-aware entry point.
**Source EPIC**: [#404 — Screens & flows as first-class Smithy feature kinds](https://github.com/Balexda/SmithyCLI/issues/404) (sub-issues #405–#410)

## Clarifications

### Session 2026-06-06

- _The durable screen/flow artifacts are authored in the **planning layer** (at `smithy.mark`), **above** `forge` — `forge` consumes them and never authors durable design truth. This explicitly reverses the "forge emits them" direction recorded in issue #408, which the product owner identified as a mistake._ `[Critical Assumption]`
- _`smithy.mark` is the authoring command: it gains a `kind` branch rather than spawning a new command, so the pipeline stays `render → mark`. `kind: backend` is unchanged; `kind: ui` authors durable screen/flow artifacts._ `[Critical Assumption]`
- _UI-to-implementation routing defaults to **Model B (direct)** — a `kind: ui` feature reaches built output through `forge` (or another developer-chosen method) pointed at the feature / its screen-and-flow artifacts, with **no** mandatory `.spec.md` / `cut` / `.tasks.md` layer — and reserves a **Model A spec escape hatch** for features that bundle multiple ordered screens/flows or require a coverage ledger. See `## Architectural Consideration` below. The product owner is torn between the models; this default is recorded as debt SD-001 for ratification._ `[Critical Assumption]`
- _Smithy templates are **tool-agnostic**: the AI detects and uses whatever UI framework and test driver the target project actually uses (Jetpack Compose + Maestro + `story-spider-design` are illustrative examples only, not requirements). An Electron/React project gets React components + Playwright/Cypress; a Compose project gets composables + Maestro._ `[Critical Assumption]`
- _`.flow.md` stays **intent-only** (why, guards, entry/exit) and **never** enumerates steps; the ordered "series of user actions and UI responses" the user described lives in the **executable test body** (Maestro yaml or the project's equivalent), not the prose. This resolves the framing tension between the user's description and the landed `smithy.helper-flow-definition` contract in favor of the landed contract._
- _The screen annotation filename is undecided between the landed `<ScreenId>.design.md` and the user's `.screen.md`; this spec keeps `.design.md` (it signals "annotation about the code," not a parallel spec) and records the rename as low-impact debt SD-002._
- _Building blocks already landed (closed sub-issues): `feature-kinds.md` typed-feature metadata + `render` emission (#405), `smithy.helper-screen-design` (#407), `smithy.helper-flow-definition` (#406). This feature wires those blocks into the command pipeline; it does not re-author the schemas._

## Architectural Consideration: How a UI Feature Reaches Built Output

The product owner asked for a detailed consideration of two pipelines (and is torn between them). Both share the settled decisions above (mark authors screen/flow above forge; tool-agnostic; forge consumes). They differ only in **what sits between a `kind: ui` feature and built code**.

| Dimension | **Model A — spec-mediated** | **Model B — direct** |
|-----------|------------------------------|-----------------------|
| Pipeline | `feature → screen.md/flow.md + .spec.md → cut → tasks.md → forge` | `feature → screen.md/flow.md → forge (or other) → output` |
| `.spec.md` for UI | Yes — user stories phrased as UI build/wire work ("Build the Library screen") | No — the `.design.md` (intent) + flow test body (behavior) are the spec-equivalent |
| forge target | `.tasks.md` (unchanged) | a feature, or a `.design.md`/`.flow.md` directly |
| Downstream code change | `cut`/`forge` change **zero** lines; mark gains one branch | `cut` is bypassed for UI; `forge` gains a screen/flow target mode |
| Traceability | Full: PR → slice → user story → FR, uniform with backend | Coarse: PR → feature artifact; no FR-level checklist for UI |
| Sub-feature ordering & coverage ledger | First-class (`US1, US2` ordering; acceptance scenarios enumerate states) | None below the feature — multi-screen ordering must split into separate features |
| Drift risk | **High** — the spec's acceptance scenarios re-narrate screen behavior the composable + test body already own (contradicts the anti-redescription premise of the landed skills) | **Low** — durable artifacts are the only source of truth, colocated with code |
| Ceremony for a trivial screen | Heavy — a full spec folder (often two `N/A` files) + a degenerate "build the screen" user story | Light — `render → mark → forge` (two passes) |
| Executable acceptance | Narrated (Given/When/Then prose) | Runnable (the flow test's guard assertions ARE acceptance) |

**Recommended resolution — Model B default with a Model-A escape hatch.** For the common case (one screen, or one screen + one flow per feature — which `render`'s feature-level build/wire decomposition already produces), Model B is strictly better: it deletes a guaranteed-to-drift redescription layer, keeps the prototype-behind-a-flag seam fast, makes acceptance executable, and stays framework-agnostic for free. When — and only when — a single UI feature bundles several screens/flows that need ordering, or needs an enumerated state/coverage ledger, `mark` additionally emits a **thin** `.spec.md` whose user stories only *sequence and reference* the durable artifacts (never re-describe layout), reusing `cut`/`forge` unchanged. The escape hatch is Model A applied surgically, not the default.

This default is **recorded as Critical debt SD-001** for the owner to ratify (pure-B, hybrid, or pure-A). Stories below are written so the settled scope (US1–US3, US5–US7) holds under any choice; only US4 (the routing rule itself) is contingent on ratification.

> The table writes the screen record as `screen.md` for readability; the **settled suffix is `<ScreenId>.design.md`** (the landed annotation), with the rename to `.screen.md` tracked as low-impact debt SD-002. The normative entities in `data-model.md` and Key Entities use `.design.md`.

## Artifact Hierarchy

RFC → Milestone → Feature → { (backend) User Story → Slice → Tasks | (ui) Screen / Flow durable artifacts }

## User Scenarios & Testing *(mandatory)*

### User Story 1: mark authors durable UI design artifacts on `kind: ui` (Priority: P1)

As a developer running the smithy pipeline, I want `smithy.mark` to recognize a `kind: ui` feature and produce its durable screen (and, at `phase: wire`, flow) design artifacts, so that UI intent is captured in the planning layer — above `forge` — colocated with where the code will live.

**Why this priority**: This is the load-bearing change. Every other UI story depends on mark emitting these artifacts; without it there is no UI lane.

**Independent Test**: Run `mark` against a `.features.md` whose selected feature carries `kind: ui, phase: build, screens: [X]`; confirm a `design/screens/X.design.md` is written to the schema in `smithy.helper-screen-design`, the feature's `Artifact` cell is updated, and no backend `.spec.md` triad is forced where it doesn't apply.

**Acceptance Scenarios**:

1. **Given** a `.features.md` whose auto-selected feature has `kind: ui` and `phase: build`, **When** `mark` runs, **Then** it lazy-loads `smithy.helper-screen-design`, authors one `design/screens/<ScreenId>.design.md` per `screens:` entry (rationale-only body, front-matter carried from the feature yaml), and emits **no** flow artifacts.
2. **Given** a feature with `kind: ui` and `phase: wire`, **When** `mark` runs, **Then** it additionally lazy-loads `smithy.helper-flow-definition` and authors the `design/flows/<FlowId>.flow.md` + paired executable test body for each `flows:` entry.
3. **Given** a feature with `kind: backend`, **When** `mark` runs, **Then** behavior is byte-for-byte the existing spec-triad flow — the `kind` branch is additive, not a regression.
4. **Given** a `kind: ui` feature, **When** `mark` writes back to the `.features.md` `## Dependency Order` table, **Then** the feature's `Artifact` cell points at the produced design artifact(s) (per the routing rule resolved in US4), not a stale `—`.

---

### User Story 2: Tool-agnostic screen/flow generation from the project's own stack (Priority: P1)

As a developer on any UI project (Compose, React, Electron, SwiftUI, …), I want smithy to generate UI components and flow tests in the framework and test driver my project already uses, so that the artifacts are usable as-is rather than hardcoded to Jetpack Compose + Maestro.

**Why this priority**: Without generality the capability only serves Compose apps; the owner explicitly requires the AI to "use the UI that exists in the project."

**Independent Test**: Point the UI path at a React/Electron fixture; confirm the screen annotation's component-path field resolves to a `.tsx`/`.jsx` component and the flow's executable body is a Playwright/Cypress (not Maestro) test, with Compose/Maestro appearing only as illustrative examples in the templates.

**Acceptance Scenarios**:

1. **Given** a target repo with no Compose, **When** the UI path runs, **Then** the AI detects the project's UI framework from the codebase and names a framework-appropriate component file in the screen annotation's path field (the field is "the file that owns this screen," not a Kotlin-specific name).
2. **Given** a target repo whose tests use Playwright (or Cypress/Detox/XCUITest), **When** a flow is emitted at `phase: wire`, **Then** the executable body is authored in that driver, keyed to stable test IDs, asserting traversal **and** guards — never visible text or layout position.
3. **Given** the generalized templates, **When** a maintainer reads `feature-kinds.md` and the two helper skills, **Then** Compose/Maestro/`story-spider-design` are framed as worked examples and the normative contract is driver-neutral (test-ID-keyed, intent-only prose, 1:1 flow↔test-body).
4. **Given** the AI cannot confidently detect the stack, **When** it would otherwise guess, **Then** it surfaces the ambiguity rather than silently defaulting to Compose/Maestro.

---

### User Story 3: forge builds UI from screen/flow artifacts by kind/phase (Priority: P1)

As a developer, I want `smithy.forge` to build a UI screen or wire a flow by reading the feature's `kind`/`phase` and the durable design artifacts, so that the existing implementer → tester → reviewer → PR pipeline serves UI work without forking and without forge authoring durable design truth.

**Why this priority**: forge is the build engine; UI is unbuildable until forge routes on kind/phase. Pairs with US1 as the minimum end-to-end path.

**Independent Test**: Hand forge a UI build target; confirm it generates the component behind the feature flag against mock data using the design skill, runs the project's component tests, opens a PR, and does **not** write any `.design.md`/`.flow.md`.

**Acceptance Scenarios**:

1. **Given** a UI **build** target (no bundle), **When** forge runs, **Then** it generates the component from prose + the committed design skill, renders every brief state with design-system tokens only (no hardcoded colors), behind the feature `flag`, on mock data.
2. **Given** a UI **build** target **with** a bundle, **When** forge runs, **Then** it translates the bundle into the project's framework applying the conflict rule (bundle wins on layout/visual intent; design skill wins on implementation dialect), with the skill preloaded as implementer context.
3. **Given** a UI **wire** target, **When** forge runs, **Then** definition-of-done includes connecting real data, flipping the flag, and emitting/updating the executable flow test + `flow.md` for each participating flow, with the flow test run as a validation gate.
4. **Given** any `kind: ui` target, **When** the reviewer profile is selected, **Then** it checks structural conformance only (tokens-only, component reuse, conventions, every brief state present, touch-target/contrast roles) and **never** judges visual fidelity, staying in plan/no-write mode.
5. **Given** a `kind: backend` target, **When** forge runs, **Then** the backend path is unchanged.

---

### User Story 4: A predictable, ratified path from UI feature to built output (Priority: P1)

As a developer, I want one documented routing rule for how a `kind: ui` feature reaches built output — whether forge targets the feature directly, the screen/flow artifacts directly, or a thin spec's tasks — so that I (and the AI) know exactly what to invoke and the choice is consistent across the repo.

**Why this priority**: US1 and US3 are only end-to-end once the connective routing is fixed. This story carries the Model A/B decision and is contingent on SD-001 ratification.

**Independent Test**: Following only the documented routing rule, take a worked `kind: ui` build+wire pair from `mark` output to a built, flagged screen with a passing flow test, with no undocumented manual step.

**Acceptance Scenarios**:

1. **Given** the recommended default (Model B), **When** a single-screen `kind: ui` feature is processed, **Then** the path is `mark` (authors design artifacts) → `forge` pointed at the feature or its `.design.md`/`.flow.md` → output, with no `.spec.md`/`cut`/`.tasks.md` required.
2. **Given** a `kind: ui` feature that bundles multiple ordered screens/flows or needs a coverage ledger, **When** it is processed, **Then** `mark` additionally emits a thin `.spec.md` that only sequences and references the durable artifacts (no layout redescription), and `cut`/`forge` run unchanged.
3. **Given** a developer who prefers a non-forge build method, **When** they read a `.design.md`/`.flow.md`, **Then** the artifact is a self-sufficient human brief (names its component path, design system, screens, and test body) usable without forge.
4. **Given** the routing rule, **When** it is documented, **Then** it lives in the agent-skills README so all UI-aware commands reference one source of truth.

---

### User Story 5: render is a clean, UI-aware entry point (Priority: P2)

As a developer starting UI work, I want `smithy.render` to be a coherent entry point that emits typed features whose `screens:`/`flows:`/`flag:` metadata is complete and consistent, so that the downstream `mark` UI branch has everything it needs and a feature map reads as the single fan-out point for specs, screens, and flows.

**Why this priority**: render largely emits typed features already (#405); this is polish to make it a dependable entry point and to surface that one feature map yields a mix of backend specs and UI screens/flows.

**Independent Test**: Run render on a milestone with UI work; confirm each UI feature carries a complete, internally consistent yaml block (flat `ScreenId`/`FlowId`s, shared `flag` across a build/wire pair) and the feature map documents that downstream artifacts span specs + screens + flows.

**Acceptance Scenarios**:

1. **Given** a milestone containing UI work, **When** render drafts the feature map, **Then** every UI feature has a complete `feature-kinds` yaml block and flag-gated work is split into a build + wire pair sharing one `flag`.
2. **Given** a build/wire pair, **When** render writes the `## Dependency Order` table, **Then** the wire feature lists the build feature (and any backend dependency) in `Depends On`, while the build feature does not depend on the backend (the flag seam).
3. **Given** a rendered map, **When** a developer reads it, **Then** it is evident which features are backend (→ specs) versus UI (→ screens/flows), without inferring from titles.

---

### User Story 6: flow-lint validates the screen/flow/test graph in app CI (Priority: P2)

As a maintainer of an app repo, I want a deterministic, smithy-state-free `flow-lint` check that fails CI when any screen/flow/test cross-reference dangles, so that a severed product path is caught as a signal rather than rotting silently. *(EPIC sub-issue #409.)*

**Why this priority**: The durable artifacts form a graph; without a checker, broken references accumulate. It is independent of forge and runnable in any app's CI.

**Independent Test**: Run flow-lint against a fixture tree with a deliberately dangling `screens:` reference and a fixture tree that is fully resolved; confirm the first fails naming the severed path and the second passes.

**Acceptance Scenarios**:

1. **Given** a `flow.md` whose `screens:` entry has no matching screen annotation, **When** flow-lint runs, **Then** it fails and names the specific severed reference.
2. **Given** a `flow.md` with no paired executable test body (or a test body with no `flow.md`), **When** flow-lint runs, **Then** it reports the orphan.
3. **Given** duplicate or reused flat `ScreenId`/`FlowId`s across the repo, **When** flow-lint runs, **Then** it fails on the uniqueness violation.
4. **Given** a fully resolved tree, **When** flow-lint runs, **Then** it exits success with no agent calls (pure, fast lint).

---

### User Story 7: UI work is visible to status, dependency, and audit tooling (Priority: P3)

As a developer tracking progress, I want screen/flow artifacts to participate in dependency ordering, `smithy.status`, and `smithy.audit` so that UI work is not invisible or unauditable relative to backend work.

**Why this priority**: Important for parity but not blocking the build path; can follow the core lanes.

**Independent Test**: With a mixed backend+UI feature map partially built, confirm `smithy.status` reports UI feature progress, the dependency graph resolves UI nodes, and `smithy.audit` can check a screen/flow artifact against the helper-skill review checklists.

**Acceptance Scenarios**:

1. **Given** a mixed feature map, **When** `smithy.status` runs, **Then** UI features report a defined progress signal (built/unbuilt, and partial credit where a spec escape hatch exists) distinct from "unstarted."
2. **Given** screen/flow artifacts referenced from a feature, **When** the dependency graph is reconstructed, **Then** the screen↔flow↔feature edges resolve (or their citation-edge limitation is documented, mirroring engraved roots).
3. **Given** a `.design.md` or `.flow.md`, **When** `smithy.audit` targets it, **Then** it evaluates against the review checklist in the corresponding helper skill and reports findings.
4. **Given** the spec/plan-review machinery, **When** a UI artifact set is reviewed, **Then** `smithy-plan-review` has a screen/flow artifact-type mode (or a documented reason it is out of scope).

---

### Edge Cases

- A `kind: ui` feature lists multiple `screens:` with an implied build order, but pure Model B has no sub-feature dependency table (SD-004) — the escape-hatch spec or a render-time feature split must carry the order.
- A build-phase screen is "done" with a missing brief state and no executable gate exists until wire — coverage honesty gap (SD-007; mirrors the epic's audio-service caveat).
- The AI mis-detects the project stack (e.g., a repo with both Compose and a React webview); detection must surface ambiguity, not guess.
- A flow's executable test body references test IDs the build-phase component has not yet exposed (the artifacts are authored above the code) — flow-lint and the wire-phase forge run must reconcile this drift window.
- A developer renames a test ID — a breaking change to every flow test referencing it; treated like an API rename.
- A feature map mixes backend and UI features — `cut`/`forge` must fan out by `kind` without cross-contamination.

## Dependency Order

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| US1 | mark authors durable UI design artifacts on `kind: ui` | — | — |
| US2 | Tool-agnostic screen/flow generation from the project's own stack | — | — |
| US4 | A predictable, ratified path from UI feature to built output | US1 | — |
| US3 | forge builds UI from screen/flow artifacts by kind/phase | US1, US4 | — |
| US5 | render is a clean, UI-aware entry point | — | — |
| US6 | flow-lint validates the screen/flow/test graph in app CI | US1 | — |
| US7 | UI work is visible to status, dependency, and audit tooling | US1, US4 | — |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `smithy.mark` MUST branch on the selected feature's `kind`; `kind: backend` (or absent) MUST retain the existing spec-triad behavior unchanged.
- **FR-002**: On `kind: ui`, `mark` MUST author one `design/screens/<ScreenId>.design.md` per `screens:` entry, conforming to the `smithy.helper-screen-design` schema, with front-matter carried from the feature yaml and a rationale-only body.
- **FR-003**: On `kind: ui, phase: wire`, `mark` MUST additionally author the `design/flows/<FlowId>.flow.md` + paired executable test body for each `flows:` entry, conforming to `smithy.helper-flow-definition`.
- **FR-004**: `mark` MUST update the feature's `## Dependency Order` `Artifact` cell to point at the produced design artifact(s) per the resolved routing rule.
- **FR-005**: The durable screen/flow artifacts MUST be authored in the planning layer (at `mark`); `forge` MUST NOT author them. (Corrects #408.)
- **FR-006**: Screen/flow generation MUST be framework- and driver-agnostic: the AI MUST detect the target project's UI framework and test driver and emit artifacts in that stack; Compose/Maestro/`story-spider-design` MUST appear only as illustrative examples.
- **FR-007**: When the project stack cannot be confidently detected, the system MUST surface the ambiguity rather than default silently.
- **FR-008**: The screen annotation's component-path field MUST be a repo-relative path to the owning UI component file (framework-neutral), not a framework-specific symbol name.
- **FR-009**: Flow executable bodies MUST be keyed to stable test IDs / accessibility IDs / semantic tags — never visible text or layout position — and MUST assert traversal **and** guards.
- **FR-010**: `.flow.md` bodies MUST remain intent-only (intent/guards/entry-exit/coverage caveat) and MUST NOT enumerate steps.
- **FR-011**: `smithy.forge` MUST route UI work by `kind`/`phase`, reading `design_system`, optional `bundle`, and `flag` from the feature.
- **FR-012**: UI **build** MUST render every brief state with design-system tokens only (no hardcoded colors), behind the `flag`, against mock data.
- **FR-013**: UI **build with bundle** MUST translate the bundle to the project framework applying the conflict rule (bundle wins layout/visual; skill wins dialect).
- **FR-014**: UI **wire** definition-of-done MUST include connecting real data, flipping the flag, and emitting/updating the flow test + `flow.md` for participating flows, running the flow test as a gate.
- **FR-015**: The `kind: ui` reviewer profile MUST check structural conformance only and MUST NOT judge visual fidelity, remaining in plan/no-write mode.
- **FR-016**: The system MUST define one documented routing rule (default Model B + Model-A escape hatch per SD-001) for how a `kind: ui` feature reaches built output, recorded in the agent-skills README.
- **FR-017**: Under the default routing, a single-screen `kind: ui` feature MUST be buildable without a `.spec.md`/`cut`/`.tasks.md` layer.
- **FR-018**: When the escape hatch applies, the emitted `.spec.md` MUST only sequence and reference durable artifacts and MUST NOT re-describe layout; `cut`/`forge` MUST run unchanged against it.
- **FR-019**: A `.design.md`/`.flow.md` MUST be a self-sufficient human brief usable by a non-forge build method.
- **FR-020**: `smithy.render` MUST emit complete, internally consistent `feature-kinds` yaml for every UI feature, splitting flag-gated work into a build + wire pair sharing one `flag`.
- **FR-021**: `render`'s `## Dependency Order` MUST express the build/wire seam (wire depends on build and any backend; build does not depend on the backend).
- **FR-022**: A feature map MUST make a feature's kind (backend → spec vs UI → screens/flows) evident without title inference.
- **FR-023**: `flow-lint` MUST resolve every `screens:` reference to an existing screen annotation, every `flow.md` to a paired test body and vice versa, and enforce flat `ScreenId`/`FlowId` uniqueness across the repo.
- **FR-024**: `flow-lint` MUST fail naming the specific severed reference, run with no agent calls, and be invocable outside a forge run.
- **FR-025**: `smithy.status` MUST report a defined progress signal for UI features distinct from "unstarted," including partial credit where a Model-A escape-hatch spec exists.
- **FR-026**: `smithy.audit` MUST be able to evaluate a `.design.md`/`.flow.md` against the corresponding helper-skill review checklist.
- **FR-027**: The dependency tooling MUST resolve screen↔flow↔feature edges, or document the citation-edge limitation consistent with engraved roots.
- **FR-028**: `smithy-plan-review` MUST gain a screen/flow artifact-type mode, or document why screen/flow artifacts are reviewed by `smithy.audit`/`flow-lint` instead.
- **FR-029**: On `kind: ui`, `mark` MUST abort with a message when `screens:` is empty or `design_system` is absent (a UI feature must own ≥1 screen and name a design system).

### Key Entities *(include if feature involves data)*

- **Typed Feature**: a `### Feature N` in a `.features.md` carrying a `feature-kinds` yaml block (`kind`, and for UI `phase`/`design_system`/`bundle`/`flag`/`screens`/`flows`). The fan-out point for backend specs and UI screens/flows.
- **Screen Annotation (`<ScreenId>.design.md`)**: thin durable intent record colocated with the UI component; front-matter `id`/`component-path`/`design_system`/optional `bundle`; rationale-only body.
- **Flow Pair (`<FlowId>.flow.md` + executable test body)**: 1:1 by flat `FlowId`; `.flow.md` owns intent/guards, the test body owns behavior (test-ID-keyed).
- **ScreenId / FlowId**: flat, stable, repo-namespaced identifiers; never reused; the join keys across feature → screen → flow → test.
- **Build/Wire Seam**: the shared `flag` linking a `build` feature to its `wire` feature; the dependency contract of record.
- **Routing Rule**: the documented mapping from `kind: ui` feature to build path (Model B default / Model-A escape hatch).

## Assumptions

- The closed sub-issues' artifacts (`feature-kinds.md`, the two helper skills, render typing) are authoritative inputs; this feature consumes and generalizes them rather than redefining their schemas.
- "Tool-agnostic" means the AI adapts to the project's existing stack at generation time; smithy does not ship per-framework generators.
- The `.claude/` snapshot is NOT regenerated as part of implementing this spec (source PRs edit `src/templates/` only).
- The reviewer never judges pixels; visual taste iteration happens upstream (e.g., a design canvas), behavioral iteration in forge's reviewer + PR.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Ratify the UI-to-implementation pipeline: pure Model B (direct), the recommended hybrid (B default + Model-A escape hatch), or pure Model A (always spec-mediated). The owner is torn; the recommended hybrid is the working default. | Functional Scope | High | Medium | open | — |
| SD-002 | Screen annotation filename: keep landed `<ScreenId>.design.md` or adopt the user's `.screen.md`. | Terminology | Low | Medium | open | — |
| SD-003 | Which test drivers are officially supported and how `forge` detects the driver from a bare `.design.md`/`.flow.md`; generalizing the flow skill's Maestro-specific yaml grammar to a driver-neutral contract. | Integration | Medium | Low | open | — |
| SD-004 | If pure Model B is chosen, where multi-screen sub-ordering within one UI feature is expressed (screen/flow artifacts have no `## Dependency Order` table). | Domain & Data Model | Medium | Medium | open | — |
| SD-005 | How `smithy.status` and the dependency graph treat screen/flow nodes (coarse feature-leaf vs. fine-grained), given they are citation roots, not Dependency-Order rows. | Integration | Medium | Low | open | — |
| SD-006 | Whether `flow-scaffold` (#410) is in scope now or held until the pattern proves itself (the epic recommends holding). | Constraints | Low | Medium | open | — |
| SD-007 | Build-phase coverage honesty: a build screen can be "done" with a missing brief state and no executable gate until wire — whether to add a build-phase state-coverage check. | Edge Cases | Medium | Low | open | — |

## Out of Scope

- `flow-scaffold` generator (#410) — held per the epic until flows prove load-bearing; tracked as SD-006.
- Authoring the `story-spider-design` (or any specific) design system; smithy references a committed design skill, it does not create one.
- Visual-diff / pixel-fidelity scoring in the reviewer (explicitly deferred by the epic).
- Instrumentation-level tests for sub-UI behaviors (audio service, background work); the spec only requires the coverage caveat be stated, not that smithy author those tests.
- Regenerating the `.claude/` snapshot or the manifest.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A `kind: ui` build+wire pair flows end to end — `render` (typed features) → `mark` (durable screen/flow artifacts) → `forge` (flagged screen on mock data, then wired with a passing flow test) — with no undocumented manual step.
- **SC-002**: The same templates produce framework-appropriate artifacts for at least two distinct stacks (e.g., a Compose+Maestro repo and a React+Playwright repo) without template edits.
- **SC-003**: `forge` authors zero durable design artifacts; 100% of `.design.md`/`.flow.md` files originate at `mark`.
- **SC-004**: `flow-lint` fails on a dangling reference (naming the severed path) and passes on a resolved tree, in CI, with zero agent calls.
- **SC-005**: A single-screen UI feature reaches built output in two planning passes (`mark`, then `forge`) under the default routing — no `.spec.md`/`cut`/`.tasks.md` required.
- **SC-006**: Backend features in a mixed feature map are byte-for-byte unaffected by the UI changes (existing tests green).

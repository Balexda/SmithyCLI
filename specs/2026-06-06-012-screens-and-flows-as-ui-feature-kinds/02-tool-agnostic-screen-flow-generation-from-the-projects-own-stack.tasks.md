# Tasks: Tool-Agnostic Screen/Flow Generation From the Project's Own Stack

**Source**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.spec.md` — User Story 2
**Data Model**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.data-model.md`
**Contracts**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.contracts.md`
**Story Number**: 02

---

## Slice 1: Generalize Screen and Flow Artifact Contracts

**Goal**: The durable screen and flow helper contracts use framework-neutral field names and describe Compose, Maestro, and `story-spider-design` only as examples.

**Justification**: The helper contracts are the lowest-risk standalone increment because every generator and reviewer consumes their vocabulary. Once the durable artifact schemas are neutral, later prompt routing can detect the project stack without fighting hardcoded field names.

**Addresses**: FR-008, FR-010, FR-012; AS 2.3

### Tasks

- [ ] **Rename screen component contract**

  Update `src/templates/agent-skills/skills/smithy.helper-screen-design/SKILL.prompt` so screen annotations require `component-path` instead of the Compose-specific field. Keep Compose as a worked example only, and preserve the rationale-only body rules for AS 2.3.

  _Acceptance criteria:_
  - Required screen front matter uses `component-path`
  - The component path is repo-relative and framework-neutral
  - Compose references are framed as examples, not normative requirements
  - Review checklist validates `component-path`
  - Rationale-only screen body rules remain intact

- [ ] **Rename flow test-body contract**

  Update `src/templates/agent-skills/skills/smithy.helper-flow-definition/SKILL.prompt` so flow annotations require `test-body` instead of the Maestro-specific field. Keep Maestro as one executable-body example while preserving the intent-only `.flow.md` rule for AS 2.3.

  _Acceptance criteria:_
  - Required flow front matter uses `test-body`
  - The test body path is repo-relative and driver-neutral
  - Maestro references are framed as examples, not normative requirements
  - Review checklist validates `test-body`
  - `.flow.md` bodies remain intent-only with no step enumeration

- [ ] **Align feature-kind documentation**

  Update `src/templates/agent-skills/snippets/feature-kinds.md` and `src/templates/agent-skills/README.md` so UI feature metadata points to neutral screen and flow artifacts. The docs should make backend versus UI output visible without implying a fixed framework or driver, satisfying AS 2.3.

  _Acceptance criteria:_
  - UI docs describe framework-neutral screen and flow artifacts
  - Compose, Maestro, and `story-spider-design` appear only as examples
  - Wire-phase documentation names executable test bodies, not only Maestro flows
  - Existing backend feature-kind documentation remains accurate

**PR Outcome**: Smithy's durable UI artifact contracts no longer encode Compose or Maestro as the default stack. Screen annotations and flow definitions expose neutral path fields that downstream prompts can populate from the target repo.

---

## Slice 2: Detect the Target UI Stack Before Generation

**Goal**: The UI authoring and build prompts inspect the target project's existing UI framework and test driver before naming component paths or executable flow bodies.

**Justification**: Stack detection is independently useful once the artifact fields are neutral. It lets Smithy produce framework-appropriate paths and driver-appropriate flow bodies while keeping the no-guessing failure mode explicit.

**Addresses**: FR-008, FR-009, FR-010; AS 2.1, AS 2.4

### Tasks

- [ ] **Add UI stack detection guidance**

  Update `src/templates/agent-skills/commands/smithy.mark.prompt` and `src/templates/agent-skills/commands/smithy.forge.prompt` so UI work includes a target-repo stack detection pass before screen or flow generation. The prompts should use existing project files and conventions to infer the framework and test driver for AS 2.1.

  _Acceptance criteria:_
  - UI generation inspects the target repo before selecting framework-specific outputs
  - Screen annotations receive framework-appropriate component paths
  - Flow work receives driver-appropriate executable test-body paths
  - Backend paths do not gain UI stack-detection requirements

- [ ] **Surface uncertain stack detection**

  Update the same command prompts so low-confidence or conflicting stack signals are treated as an ambiguity to surface, not a reason to default to Compose or Maestro. This satisfies AS 2.4 and keeps generated artifacts from pretending a stack was detected.

  _Acceptance criteria:_
  - Missing framework signals surface an ambiguity
  - Missing test-driver signals surface an ambiguity
  - Conflicting framework or driver signals surface an ambiguity
  - Prompts do not silently fall back to Compose or Maestro
  - The ambiguity path remains specific to UI work

**PR Outcome**: UI planning and implementation prompts choose component and flow outputs from the target repository's actual stack, and they stop when the stack cannot be determined confidently enough to generate usable artifacts.

---

## Slice 3: Make Flow Execution Driver-Neutral

**Goal**: Flow executable bodies are generated in the project's own test driver with stable selectors and guard assertions, while helper and forge text avoid Maestro-only semantics.

**Justification**: Flow execution is a distinct standalone increment because the screen component path can be neutral while flow behavior is still tied to Maestro. This slice completes the user story's independent test by making React/Electron-style Playwright or Cypress fixtures valid outputs.

**Addresses**: FR-008, FR-011, FR-012; AS 2.2, AS 2.3

### Tasks

- [ ] **Generalize executable flow guidance**

  Update `src/templates/agent-skills/skills/smithy.helper-flow-definition/SKILL.prompt` so executable flow bodies are described as driver-specific test files rather than Maestro yaml only. Preserve the 1:1 `FlowId` to test-body relationship and keep AS 2.2 as the behavior source.

  _Acceptance criteria:_
  - Driver-specific examples include non-Maestro-friendly language
  - Each flow still maps to exactly one executable test body
  - The `.flow.md` remains intent-only
  - Flow body guidance supports Playwright, Cypress, Detox, XCUITest, and equivalent project drivers

- [ ] **Require stable selector-based flows**

  Update the flow helper and `src/templates/agent-skills/commands/smithy.forge.prompt` so generated flow bodies use stable test IDs, accessibility IDs, or semantic tags and assert traversal plus guards for AS 2.2. Keep visible text and layout position out of the normative selector contract.

  _Acceptance criteria:_
  - Flow selector guidance is driver-neutral
  - Visible text selectors are disallowed as the normative path
  - Layout-position selectors are disallowed as the normative path
  - Traversal assertions are required
  - Guard assertions are required

- [ ] **Update generated examples and reviews**

  Refresh directly affected examples and review checklist text in `src/templates/agent-skills/skills/smithy.helper-flow-definition/SKILL.prompt`, `src/templates/agent-skills/commands/smithy.forge.prompt`, and adjacent template docs so maintainers read the driver-neutral contract consistently. Keep example-specific language clearly marked as illustrative for AS 2.3.

  _Acceptance criteria:_
  - Examples do not imply Maestro is the only supported driver
  - Review text checks the neutral `test-body` contract
  - Forge does not ask implementers to emit Maestro when another driver is detected
  - Compose/Maestro examples remain valid as examples

**PR Outcome**: Flow generation can emit usable executable bodies for the target project's test driver, including React/Electron fixtures, while keeping `.flow.md` as durable intent and enforcing stable selector and guard behavior.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-005 | inherited from spec: Fidelity of `import`-mode structure derivation: how reliably `render` can extract screens/flows/behavior from a prototype/bundle, and how much human confirmation the derived structure needs. | Integration | Medium | Low | inherited | Owned by User Story 5; not addressed by this story. |
| SD-006 | inherited from spec: Whether `SC`/`FL` nodes are always atomic or can be sub-sliced (and whether `flow-scaffold` #410 is in scope, which the epic recommends holding). | Constraints | Low | Medium | inherited | Owned by User Story 3 cut/forge behavior; this story only generalizes stack-specific artifact generation. |
| SD-007 | inherited from spec: Build-phase coverage honesty: a build screen can be "done" with a missing brief state and no executable gate until its flows wire. | Edge Cases | Medium | Low | inherited | Owned by downstream screen-build and flow-wire implementation; not addressed by this story. |
| SD-008 | inherited from spec: Visual-intent honesty under the non-blocking gate: how a `brief`-mode node that never received a bundle surfaces its unrealized prototype rather than silently shipping skill-only. | Interaction & UX | Medium | Medium | inherited | Owned by User Story 4; not addressed by this story. |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Generalize screen and flow artifact contracts | — | — |
| S2 | Detect the target UI stack before generation | S1 | — |
| S3 | Make flow execution driver-neutral | S2 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: mark authors a UI spec with a typed ordering ledger + durable artifacts | depended upon by | User Story 1 can emit initial durable artifacts using the helper contracts. This story generalizes those contracts so the emitted artifacts work beyond Compose and Maestro. |
| User Story 3: render → mark → cut → forge is identical for UI and backend nodes | depended upon by | Cut and forge consume the neutral `component-path` and `test-body` fields when slicing and building `SC` and `FL` nodes. |
| User Story 6: flow-lint validates the screen/flow/test graph in app CI | depended upon by | Flow-lint validates `test-body` references and selector-stable flow bodies after this story removes Maestro-only assumptions. |
| User Story 7: UI work is visible to status, dependency, and audit tooling | depended upon by | Audit and review tooling need the neutral helper contracts to evaluate screen and flow artifacts across different UI stacks. |

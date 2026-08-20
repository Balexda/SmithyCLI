# Tasks: UI Work Is Visible to Status, Dependency, and Audit Tooling

**Source**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.spec.md` — User Story 7
**Data Model**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.data-model.md`
**Contracts**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.contracts.md`
**Story Number**: 07

---

## Slice 1: Surface Typed UI Nodes in Status and Dependency Graphs

**Goal**: `smithy.status` and dependency graph tooling can parse typed UI ledgers, preserve `SC`/`FL`/`US` rows as individual nodes, and report each node's progress from its own task artifact.

**Justification**: Status and dependency visibility are the shared foundation for the rest of the tooling. This slice is independently useful because a UI ledger becomes visible to the deterministic scanner before audit-specific behavior is added.

**Addresses**: FR-027, FR-028; AS 7.1, AS 7.2

### Tasks

- [x] **Parse typed UI ledger rows for status**

  Extend the status artifact scanner so a spec `## Dependency Order` table with `ID`, `Kind`, `Title`, `Depends On`, `Design`, and `Artifact` columns is accepted as a UI ledger. Each `SC<N>`, `FL<N>`, and `US<N>` row should produce a distinct status record whose progress derives from its own `Artifact` task file when present and remains visible when no artifact exists.

  _Acceptance criteria:_
  - UI ledger tables are accepted without being rewritten to backend-only shape
  - `SC<N>` rows produce distinct status records
  - `FL<N>` rows produce distinct status records
  - `US<N>` rows inside UI ledgers continue to produce distinct status records
  - Rows with `Artifact` set to `—` are reported as unstarted rather than hidden

- [x] **Resolve UI dependency edges**

  Update dependency graph reconstruction so typed UI ledger `Depends On` cells resolve same-table `SC`, `FL`, and `US` IDs. Preserve existing backend graph behavior while ensuring screen, flow, and story nodes participate in ordering and blocked/unblocked calculations for AS 7.2.

  _Acceptance criteria:_
  - `SC` dependencies resolve to screen nodes in the same ledger
  - `FL` dependencies resolve to flow nodes in the same ledger
  - `US` dependencies resolve to story nodes in the same ledger
  - Dangling UI dependency IDs surface as graph warnings or failures consistent with existing dependency behavior
  - Backend-only dependency parsing remains unchanged

- [x] **Render per-node UI progress**

  Update status output rendering so UI node identity is visible without relying on title inference. The human and JSON status surfaces should expose enough node metadata for developers and automation to distinguish screen-build, flow-wire, and backend-story progress for AS 7.1.

  _Acceptance criteria:_
  - Human-readable status distinguishes screen, flow, and story nodes
  - JSON status includes stable identifiers for `SC`, `FL`, and `US` nodes
  - Completed versus unstarted UI nodes are distinguishable
  - Mixed UI/backend status output remains readable
  - Existing status filters continue to work for backend artifacts

**PR Outcome**: UI ledger nodes are first-class records in status and dependency output, including unstarted rows and same-table dependency edges.

---

## Slice 2: Audit Screen and Flow Durable Artifacts

**Goal**: `smithy.audit` can target `.design.md` and `.flow.md` artifacts and evaluate them against the helper-skill checklists that own those artifact contracts.

**Justification**: Audit support is separable from status because it operates on durable screen and flow files rather than the planning graph. This slice closes the developer workflow for checking UI design intent and flow intent outside forge.

**Addresses**: FR-029; AS 7.3

### Tasks

- [x] **Add screen artifact audit support**

  Extend audit artifact classification and guidance so `design/screens/<ScreenId>.design.md` files are valid audit targets. The audit should apply the `smithy.helper-screen-design` review checklist and keep screen bodies rationale-only rather than evaluating visual fidelity.

  _Acceptance criteria:_
  - `.design.md` screen files are recognized as valid audit targets
  - Screen audit checks the helper screen-design contract
  - Missing or invalid `component-path` is reported
  - Missing or invalid `design_system` is reported
  - Layout prose and state inventories are flagged as out of contract

- [x] **Add flow artifact audit support**

  Extend audit artifact classification and guidance so `design/flows/<FlowId>.flow.md` files are valid audit targets. The audit should apply the `smithy.helper-flow-definition` checklist, including driver-neutral `test-body`, screen references, and intent-only body constraints for AS 7.3.

  _Acceptance criteria:_
  - `.flow.md` files are recognized as valid audit targets
  - Flow audit checks the helper flow-definition contract
  - Missing or invalid `screens` references are reported
  - Missing or invalid `test-body` is reported
  - Step lists and executable behavior inside `.flow.md` are flagged as out of contract

- [x] **Document UI audit routing**

  Update source-template documentation adjacent to `smithy.audit` and the helper skills so maintainers can see which checker owns screen and flow artifact review. Keep the guidance self-contained in deployable templates and avoid source-tree-only path references.

  _Acceptance criteria:_
  - Audit documentation names screen artifacts as supported targets
  - Audit documentation names flow artifacts as supported targets
  - Helper-skill checklist ownership is clear
  - Visual fidelity remains out of audit scope
  - Deployable templates do not point readers at source-only documentation

**PR Outcome**: Developers can run audit directly against mark-authored screen and flow artifacts and receive helper-contract findings.

---

## Slice 3: Define Plan-Review Handling for UI Artifact Sets

**Goal**: `smithy-plan-review` has an explicit screen/flow artifact-type mode or a documented, contractually consistent reason that UI durable artifacts are reviewed by `smithy.audit` and `flow-lint` instead.

**Justification**: The spec allows either implementation path for plan-review, so this slice isolates that decision from audit mechanics. It prevents ambiguous reviewer behavior while keeping plan-review focused on planning artifacts if that remains the chosen boundary.

**Addresses**: FR-030; AS 7.4

### Tasks

- [x] **Choose the plan-review UI artifact boundary**

  Update `smithy-plan-review` guidance to either accept `screen` and `flow` artifact types or explicitly route durable UI artifact review to `smithy.audit` and `flow-lint`. The chosen boundary should be consistent with the review categories plan-review already owns and with AS 7.4.

  _Acceptance criteria:_
  - The plan-review prompt has an explicit stance for screen artifacts
  - The plan-review prompt has an explicit stance for flow artifacts
  - The chosen stance satisfies AS 7.4
  - Plan-review remains read-only and non-interactive
  - Existing planning artifact review modes remain supported

- [x] **Align callers and docs with the plan-review boundary**

  Update any command or template text that invokes plan-review so UI artifact sets are routed according to the chosen boundary. If screen/flow modes are added, callers can pass those artifact types; if audit/flow-lint own them, callers should not imply plan-review will inspect durable UI files.

  _Acceptance criteria:_
  - Caller guidance does not contradict the plan-review stance
  - Screen/flow artifacts have one clear review route
  - Planning artifact review still runs where it already did
  - No new PR-creation or write behavior is introduced in plan-review
  - Documentation remains accurate for both backend and UI workflows

**PR Outcome**: UI artifact review has an explicit plan-review boundary, either through new screen/flow modes or through documented delegation to audit and flow-lint.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-005 | inherited from spec: Fidelity of `import`-mode structure derivation: how reliably `render` can extract screens/flows/behavior from a prototype/bundle, and how much human confirmation the derived structure needs. | Integration | Medium | Low | inherited | Owned by User Story 5; status and audit tooling consume the resulting artifacts rather than deriving import structure. |
| SD-006 | inherited from spec: Whether `SC`/`FL` nodes are always atomic or can be sub-sliced (and whether `flow-scaffold` #410 is in scope, which the epic recommends holding). | Constraints | Low | Medium | inherited | Owned by User Story 3; this story reports whatever task artifacts cut produces. |
| SD-007 | inherited from spec: Build-phase coverage honesty: a build screen can be "done" with a missing brief state and no executable gate until its flows wire. | Edge Cases | Medium | Low | inherited | Status can surface per-node progress, but coverage semantics remain owned by forge and flow-lint behavior. |
| SD-008 | inherited from spec: Visual-intent honesty under the non-blocking gate: how a `brief`-mode node that never received a bundle surfaces its unrealized prototype rather than silently shipping skill-only. | Interaction & UX | Medium | Medium | inherited | Audit may flag contract drift, but unrealized prototype surfacing is owned by User Story 4. |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Surface typed UI nodes in status and dependency graphs | — | — |
| S2 | Audit screen and flow durable artifacts | S1 | — |
| S3 | Define plan-review handling for UI artifact sets | S2 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: mark authors a UI spec with a typed ordering ledger + durable artifacts | depends on | This story consumes the typed ledger and durable `.design.md`/`.flow.md` artifacts that mark authors. |
| User Story 2: Tool-agnostic screen/flow generation from the project's own stack | depends on | Audit checks the framework-neutral `component-path`, `test-body`, and helper-skill contracts established by this story. |
| User Story 3: render → mark → cut → forge is identical for UI and backend nodes | depends on | Status reports per-node progress from the task artifacts and forge completion conventions introduced by this story. |
| User Story 6: flow-lint validates the screen/flow/test graph in app CI | depended upon by | Plan-review may delegate graph-pair validation to flow-lint, and audit/status output should remain consistent with flow-lint's graph findings. |

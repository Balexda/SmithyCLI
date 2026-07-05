# Tasks: Flow-Lint Validates the Screen/Flow/Test Graph in App CI

**Source**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.spec.md` — User Story 6
**Data Model**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.data-model.md`
**Contracts**: `specs/2026-06-06-012-screens-and-flows-as-ui-feature-kinds/screens-and-flows-as-ui-feature-kinds.contracts.md`
**Story Number**: 06

---

## Slice 1: Resolve the Screen/Flow/Test Artifact Graph

**Goal**: Add a deterministic `flow-lint` graph resolver that can discover durable screen annotations, flow definitions, and paired executable test bodies, then validate the cross-reference rules without relying on smithy runtime state.

**Justification**: The resolver is the load-bearing behavior behind the command. It is independently reviewable through fixture-level failures for dangling `screens:` references, missing test-body files, orphan test bodies, and duplicate flat IDs before CLI and CI ergonomics are added.

**Addresses**: FR-025, FR-026; AS 6.1, AS 6.2, AS 6.3, AS 6.4

### Tasks

- [x] **Discover durable UI artifacts from the repo tree**

  Add a pure graph-discovery path that walks the selected repository root and reads `design/screens/*.design.md` and `design/flows/*.flow.md` artifacts using their YAML front matter. The discovery result should record each screen `id`, flow `id`, flow `screens` references, and flow `test-body` path, while treating the repo filesystem as the source of truth instead of any smithy session state.

  Define the **candidate test-body universe** explicitly. Because `test-body` is a driver-neutral repo-relative path that may live anywhere in the project's test tree (`maestro/flows/AddTitle.yaml`, `tests/e2e/add-title.spec.ts`, …), the authoritative universe of flow test bodies is the set of `test-body:` paths declared across all `design/flows/*.flow.md` files — the declared path is the contract (per `smithy.helper-flow-definition`). Flow-lint MUST NOT blind-scan the project's test directories, which would flag unrelated tests as orphans. The reverse "test body without `.flow.md`" (orphan) direction is therefore evaluated only against files under an explicitly supplied flow-test root (or the conventional stub location `mark` emits), never against the whole repo; when no such root is available the reverse scan is reported as not-run rather than guessed. This scoping is the driver-neutral answer to FR-025's "and vice versa" and its residual openness is tracked as SD-010.

  _Acceptance criteria:_
  - Screen annotations are discovered from `design/screens/*.design.md`
  - Flow definitions are discovered from `design/flows/*.flow.md`
  - Flow discovery reads `id`, `screens`, and `test-body` fields
  - The candidate test-body universe is the set of `test-body:` paths declared by `design/flows/*.flow.md`, not a blind scan of project test directories
  - Orphan (test-body-without-`.flow.md`) detection is scoped to an explicitly supplied flow-test root or conventional stub location, so unrelated project tests are never flagged
  - Discovery can run from an arbitrary repo root or subpath
  - Discovery performs no agent, network, or forge-specific calls

- [x] **Validate graph references and uniqueness**

  Implement the `flow-lint` validation rules over the discovered graph. A `.flow.md` must fail when any `screens:` entry has no matching screen annotation, when its `test-body` file is missing, when an executable test body exists without a matching `.flow.md`, or when a flat `ScreenId` or `FlowId` is reused in the repo.

  _Acceptance criteria:_
  - Missing `screens:` targets fail with the severed `ScreenId` and flow named
  - Missing paired `test-body` files fail with the owning `.flow.md` named
  - Orphan executable test bodies (within the scoped flow-test root per Slice 1's discovery rule) fail with the orphan path named
  - Duplicate `ScreenId` values fail with every conflicting artifact named
  - Duplicate `FlowId` values fail with every conflicting artifact named

- [x] **Cover resolved and broken graph fixtures**

  Add focused tests for the graph resolver and validator using minimal fixture trees. The fixtures should include one fully resolved graph and separate broken graphs for dangling screen references, missing or orphaned test bodies, and duplicate IDs so the user story's independent test can be run without a real app.

  _Acceptance criteria:_
  - A fully resolved fixture reports no findings
  - A dangling `screens:` fixture reports a failure
  - A missing `test-body` fixture reports a failure
  - An orphan test-body fixture reports a failure
  - Duplicate `ScreenId` and `FlowId` fixtures report failures

**PR Outcome**: Smithy has a deterministic artifact-graph validator that enforces the screen/flow/test pairing rules and can prove both failure and success cases without invoking an agent.

---

## Slice 2: Expose `flow-lint` as a Fast CLI Check

**Goal**: Wire the graph validator into a user-facing `smithy flow-lint` command that exits nonzero on findings, prints precise human-readable diagnostics, and exits cleanly for a fully resolved tree.

**Justification**: The user story requires an invocable app-CI check, not only internal validation code. This slice turns the resolver into a command surface with stable exit behavior and clear diagnostics while keeping implementation separate from CI template examples.

**Addresses**: FR-026; AS 6.1, AS 6.2, AS 6.3, AS 6.4

### Tasks

- [ ] **Register the flow-lint command**

  Add `flow-lint` to the Smithy CLI alongside the existing subcommands. The command should accept an optional path argument or root option, default to the current working directory, and pass the resolved path to the validator without requiring a smithy manifest or forge run.

  _Acceptance criteria:_
  - `smithy flow-lint` runs against the current working directory by default
  - A supplied path scopes the check to that repo tree
  - The command is available in CLI help output
  - The command does not require initialized smithy artifacts
  - The command does not dispatch or mention agent work

- [ ] **Return CI-friendly exit codes**

  Make the command return success only when the validator reports no graph findings, and failure when references, pairings, or uniqueness checks fail. Invalid input paths should use the CLI's existing invalid-argument failure pattern rather than being reported as graph findings.

  _Acceptance criteria:_
  - Resolved graphs exit 0
  - Dangling screen references exit nonzero
  - Missing or orphaned test bodies exit nonzero
  - Duplicate screen or flow IDs exit nonzero
  - Nonexistent input paths are reported as command input errors

- [ ] **Print specific severed-reference diagnostics**

  Format validator findings so maintainers can identify exactly which artifact or path needs repair. Diagnostics should distinguish dangling screen references, missing paired test bodies, orphan test bodies, and duplicate IDs rather than collapsing all failures into a generic lint error.

  _Acceptance criteria:_
  - Dangling screen output names the flow and missing `ScreenId`
  - Missing test-body output names the `.flow.md` and path
  - Orphan test-body output names the orphan path
  - Duplicate ID output names the reused ID and conflicting files
  - Success output is quiet or minimal enough for CI logs

**PR Outcome**: App repositories can run `smithy flow-lint` directly in CI and get deterministic exit codes plus actionable diagnostics for broken UI artifact graphs.

---

## Slice 3: Document CI Adoption and Template Boundaries

**Goal**: Document `flow-lint` as an app-repo CI check and align source-template guidance so durable screen/flow helper contracts point users to the command for cross-reference validation without making forge own linting state.

**Justification**: The command only becomes useful when app maintainers know where it belongs. This slice keeps adoption guidance source-side, avoids regenerating deployed snapshots, and protects the architectural boundary that `flow-lint` is stateless and independent of forge.

**Addresses**: FR-025, FR-026; AS 6.4

### Tasks

- [ ] **Add flow-lint usage documentation**

  Update source documentation for Smithy commands or agent skills to describe `flow-lint` as the deterministic check for UI screen/flow/test graph integrity. The documentation should state what artifacts it scans, what failures it catches, and how it fits into app CI.

  _Acceptance criteria:_
  - Documentation names `smithy flow-lint`
  - Documentation states it validates screen annotations, flow definitions, and paired test bodies
  - Documentation lists dangling screens, missing/orphan test bodies, and duplicate IDs as failures
  - Documentation frames the command as suitable for app CI
  - Documentation does not require forge to run first

- [ ] **Align helper-skill validation references**

  Refresh the screen and flow helper source templates only where needed so their audit/checklist text points to `flow-lint` as the cross-reference validator. Keep helper bodies self-contained and avoid source-tree-only path references in deployable text.

  _Acceptance criteria:_
  - Screen helper text points cross-reference checks at `flow-lint`
  - Flow helper text points pairing and uniqueness checks at `flow-lint`
  - Deployable prompt text remains self-contained
  - No source-only README path is referenced from deployable templates
  - `.claude/` snapshots and `.smithy/` manifests are not regenerated

- [ ] **Provide CI wiring examples without owning app configuration**

  Add a minimal CI invocation example or command note in source documentation so app maintainers can adopt the check in their own pipeline. Keep the example generic enough for different CI providers and avoid adding generated workflow files to target apps.

  _Acceptance criteria:_
  - A CI-safe invocation is documented
  - The example uses the CLI command rather than a forge-only hook
  - The guidance remains provider-neutral or clearly illustrative
  - No app-repo workflow file is generated by Smithy
  - The command remains usable outside CI for local validation

**PR Outcome**: `flow-lint` is documented as a stateless app-CI guard for durable UI artifact graphs, with helper guidance aligned and no generated snapshot churn.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-005 | inherited from spec: Fidelity of `import`-mode structure derivation: how reliably `render` can extract screens/flows/behavior from a prototype/bundle, and how much human confirmation the derived structure needs. | Integration | Medium | Low | inherited | Owned by User Story 5; flow-lint validates the confirmed artifact graph after it exists. |
| SD-006 | inherited from spec: Whether `SC`/`FL` nodes are always atomic or can be sub-sliced (and whether `flow-scaffold` #410 is in scope, which the epic recommends holding). | Constraints | Low | Medium | inherited | Owned by User Story 3; this story validates artifacts regardless of how the producing tasks were sliced. |
| SD-007 | inherited from spec: Build-phase coverage honesty: a build screen can be "done" with a missing brief state and no executable gate until its flows wire. | Edge Cases | Medium | Low | inherited | Partially related but not resolved; flow-lint checks graph integrity, not whether every intended brief state has executable coverage. |
| SD-008 | inherited from spec: Visual-intent honesty under the non-blocking gate: how a `brief`-mode node that never received a bundle surfaces its unrealized prototype rather than silently shipping skill-only. | Interaction & UX | Medium | Medium | inherited | Owned by User Story 4; flow-lint does not validate visual-intent fulfillment. |
| SD-010 | new (this story): Fully driver-neutral enumeration of orphan test bodies (a test body whose `.flow.md` was removed or renamed) is reliable only within the declared `test-body:` set or an explicitly supplied flow-test root; blind-scanning arbitrary driver layouts risks false positives on unrelated tests. A general convention or machine-readable stub marker for detecting stray test bodies anywhere in the repo is deferred. | Edge Cases | Medium | Medium | open | Scoped in Slice 1: the candidate universe is the declared `test-body:` paths; orphan detection runs only against a supplied flow-test root / conventional stub location, never a whole-repo scan. |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Resolve the screen/flow/test artifact graph | — | — |
| S2 | Expose `flow-lint` as a fast CLI check | S1 | — |
| S3 | Document CI adoption and template boundaries | S2 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: mark authors a UI spec with a typed ordering ledger + durable artifacts | depends on | Flow-lint validates the screen and flow artifact graph authored by mark. |
| User Story 2: Tool-agnostic screen/flow generation from the project's own stack | related | Flow-lint consumes the driver-neutral `test-body` field and stable ID conventions, but these come from the helper contracts (authoritative inputs per the spec's Assumptions), not from US2's generation work — so US6 does not gate on US2. This matches the spec ledger's authoritative `Depends On: US1` for US6. |
| User Story 3: render → mark → cut → forge is identical for UI and backend nodes | related | Forge fills executable test bodies for flow-wire work, but flow-lint remains independently invocable and smithy-state-free. |
| User Story 7: UI work is visible to status, dependency, and audit tooling | depended upon by | Status and audit can rely on flow-lint for deterministic cross-reference validation rather than duplicating graph-integrity checks. |

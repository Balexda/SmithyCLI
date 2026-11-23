# Tasks: Verify Gemini and Codex Execution

**Source**: `specs/2026-11-15-013-per-runtime-permission-probe/per-runtime-permission-probe.spec.md` — User Story 2
**Data Model**: `specs/2026-11-15-013-per-runtime-permission-probe/per-runtime-permission-probe.data-model.md`
**Contracts**: `specs/2026-11-15-013-per-runtime-permission-probe/per-runtime-permission-probe.contracts.md`
**Story Number**: 02

---

## Slice 1: Run the Gemini permission matrix
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Produce live Gemini evidence using a candidate matrix and disposable fixture that Codex can reuse.

**Justification**: The Gemini run validates the shared candidate shapes against a live runtime and produces independently reviewable evidence.

**Addresses**: FR-001–FR-003, FR-005–FR-006, FR-009. AS 2.1, 2.4–2.5.

### Tasks

- [ ] **Extend the disposable fixture for the shared candidate matrix**

  Extend the US1 fixture and reproduction procedure to support the candidates in AS 2.1–2.2 while preserving the recorded Claude control's invocation behavior.

  _Acceptance criteria:_
  - The matrix enumerates query and write candidates with positional and flag-based store selection and tilde and absolute spellings. It includes literal and shell-expanded tilde cases, including a home path with spaces, and crosses the write candidates with message and whole-store/selected-path variants.
  - Fixture setup supports independent Git baselines for each candidate and two disposable stores, including stores under the real home directory's `~/.smithy/` outside the checkout. Writes are confined to fixture repositories and produce verifiable changes for each write mode.
  - Reproduction records the evidence fields from US1 and the exact received tokens when the stand-in runs. It preserves the checkout's HEAD and index, existing stores, and deployed permissions.

- [ ] **Record live Gemini authorization and execution**

  Run the shared matrix through Gemini CLI using isolated settings and narrow path-free query and write grants. Record results for AS 2.1 and AS 2.4–2.5.

  _Acceptance criteria:_
  - Every candidate has a dated outcome with separate matching and execution observations. Capture the unrelated-subcommand negative control and rule out ambient grants.
  - Every claimed supported combination returns the expected query result and produces a verified fixture commit without approval. An approval request or filesystem denial fails even when the rule matches. Missing execution evidence remains incomplete.
  - For each winning query/write combination, repeat both operations with a second disposable store using identical grants and verify the new query result and commit.

**PR Outcome**: Reviewers can reproduce the Gemini matrix and inspect the observations for each candidate.

## Slice 2: Run the Codex permission matrix
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Produce live Codex evidence for prefix matching and sandboxed execution against external home-directory stores.

**Justification**: Codex needs separate evidence for prefix authorization and sandbox filesystem access. The shared matrix keeps its candidate shapes comparable to Gemini's.

**Addresses**: FR-002–FR-006, FR-009. AS 2.2–2.5.

### Tasks

- [ ] **Record live Codex authorization and sandbox execution**

  Run the same candidate matrix through Codex from a disposable code checkout with isolated native token-prefix rules. Apply the shared evidence procedure to AS 2.2–2.5.

  _Acceptance criteria:_
  - Every candidate has a dated outcome with literal command text, the exact tokens evaluated by the matcher, its decision, and the tokens received by the stand-in when it runs. Distinguish literal tilde from shell expansion and record the unrelated-subcommand negative control.
  - A passing combination returns the expected query result and creates a real commit containing the expected fixture changes under the real `~/.smithy/` outside the checkout. Record effective sandbox settings and verify unchanged checkout HEAD and index. A pass requires unattended execution under the sandbox without a bypass or store-specific writable path.
  - A matching prefix with an approval request or filesystem denial fails. Record authorization and execution separately, preserve both operation results, and classify missing execution evidence as incomplete.
  - For each winning query/write combination, repeat both operations against a second disposable Smithy store and verify the commit with the same path-free rules and sandbox settings.

**PR Outcome**: Reviewers can reproduce the Codex matrix and determine which matching candidates, if any, executed successfully in the sandbox.

---

## Specification Debt

_None — no specification debt was recorded._

## Open Implementation Questions

_None — no open implementation questions._

## Dependency Order

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Run the Gemini permission matrix | — | — |
| S2 | Run the Codex permission matrix | S1 | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Establish a Reproducible Probe | depends on | Supplies the fixture, evidence procedure, and Claude control. |
| User Story 3: Publish the Decision Evidence | depended upon by | Uses the dated Gemini and Codex observations in the final report. |

# Tasks: Establish a Reproducible Probe

**Source**: `specs/2026-11-15-013-per-runtime-permission-probe/per-runtime-permission-probe.spec.md` — User Story 1
**Data Model**: `specs/2026-11-15-013-per-runtime-permission-probe/per-runtime-permission-probe.data-model.md`
**Contracts**: `specs/2026-11-15-013-per-runtime-permission-probe/per-runtime-permission-probe.contracts.md`
**Story Number**: 01

---

## Slice 1: Establish and Run the Claude Control
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Deliver a repeatable permission probe with a recorded Claude control.

**Justification**: The disposable fixture, evidence procedure, and control run together give the next runtime experiments a baseline they can reproduce.

**Addresses**: FR-001, FR-002, FR-005 (grant scope), FR-006 (probe evidence and Claude control), FR-009. AS 1.1–1.4.

### Tasks

- [ ] **Build the disposable probe fixture**

  Add a fixture and setup instructions alongside the source spec. Provide a disposable code checkout and a separate Git store, plus a stand-in callable as `smithy` for AS 1.1 and AS 1.3.

  _Acceptance criteria:_
  - Setup and reruns work independently of both production commands.
  - The query identifies the selected store and the write commits the expected fixture change in that store.
  - An unrelated subcommand is available for the negative control.
  - Fixture setup supplies local Git identity and isolates hooks. Runs preserve the code checkout's HEAD and index, deployed grants, and existing stores.

- [ ] **Record the isolated permission controls**

  Document the run and evidence procedure alongside the fixture, then record the Claude control against AS 1.2–1.4. Capture each operation separately and keep the procedure reusable for US2.

  _Acceptance criteria:_
  - Each run records runtime version, platform, executable identity, working directory, effective permission and sandbox settings, literal command and received argument tokens, output, rule decision, approval observations, and before/after commit IDs.
  - Isolated configuration excludes ambient grants that could mask the negative control. The evidence includes the unrelated command's rule decision and observed outcome.
  - Both Claude operations are attempted under narrow path-free grants and retain their observed outcomes, including failures.
  - The procedure distinguishes authorization from execution. It records a pass only when both operations complete unattended and Git verifies the expected fixture change in a new external-store commit. Missing execution remains incomplete.

**PR Outcome**: Maintainers can rerun the fixture and inspect the recorded Claude control using the evidence fields needed by the runtime matrix.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

_None — no specification debt was recorded._

## Open Implementation Questions
<!-- audience: builder; mode: reference; length: one table row per question; diagram: optional; examples: discouraged -->

_None — no open implementation questions._

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Establish and Run the Claude Control | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Verify Gemini and Codex Execution | depended upon by | Reuses the fixture and evidence procedure. |
| User Story 3: Publish the Decision Evidence | depended upon by | Uses the recorded Claude control in the final report. |

### Cross-Repo Notes

None — single repo.

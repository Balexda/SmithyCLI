# Tasks: Commit the Forge-JVM Token Baseline

**Source**: `specs/2026-06-06-012-forge-jvm-eval-scenario-m1-baseline-set-completeness-gate/forge-jvm-eval-scenario-m1-baseline-set-completeness-gate.spec.md` — User Story 2
**Data Model**: `specs/2026-06-06-012-forge-jvm-eval-scenario-m1-baseline-set-completeness-gate/forge-jvm-eval-scenario-m1-baseline-set-completeness-gate.data-model.md`
**Contracts**: `specs/2026-06-06-012-forge-jvm-eval-scenario-m1-baseline-set-completeness-gate/forge-jvm-eval-scenario-m1-baseline-set-completeness-gate.contracts.md`
**Story Number**: 02

---

## Slice 1: Capture and Compare the Forge-JVM Baseline
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Subsequent Forge-JVM eval runs compare their structure and token usage against a committed baseline.

**Justification**: Capturing the reference data and verifying the comparison together gives downstream work a usable baseline.

**Addresses**: FR-006, FR-007, FR-008, FR-015, and AS 2.1–2.4

### Tasks

- [ ] **Capture and commit the Forge-JVM baseline**

  Run the `forge-tdd-slice-jvm` case against the committed JVM fixture and use its successful result to create `evals/baselines/forge-tdd-slice-jvm.json`. Follow the Forge-JVM Baseline Contract for AS 2.1 and AS 2.4.

  _Acceptance criteria:_
  - The source run passes the JVM case's structural and helper checks and records input and output token usage.
  - The committed baseline loads under the canonical case name with stable structural expectations and input and output envelope bounds derived from measured usage.
  - The JSON contains only schema-owned fields, including the capture timestamp.

- [ ] **Expose Forge-JVM baseline comparisons in eval reports**

  Use the existing loader, comparator, and reporting path in `evals/run-evals.ts` to surface the JVM comparison. Add focused regression coverage for the committed baseline and its report behavior for AS 2.2 and AS 2.3.

  _Acceptance criteria:_
  - `npm run eval -- --case forge-tdd-slice-jvm` reports a passing baseline comparison when the rerun matches the committed structure and token envelope.
  - The normal eval output shows structural compatibility and token-envelope status for the JVM case, with token deltas readable against the committed baseline without manually supplying historical values.
  - Regression coverage loads the committed JSON and demonstrates a passing comparison and distinct reporting of structural drift and out-of-envelope usage.

**PR Outcome**: The committed Forge-JVM baseline supports structural and token comparisons through the normal eval command.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

| ID | Title | Source Category | Impact | Confidence | Origin |
|----|-------|-----------------|--------|------------|--------|
| SD-001 | Baseline-set audit surface unpinned | Integration | Medium | Medium | spec:SD-001 |
| SD-002 | JVM scenario: separate vs parameterized | Functional Scope | Low | Medium | spec:SD-002 |

---

## Open Implementation Questions
<!-- audience: builder; mode: reference; length: one table row per question; diagram: optional; examples: discouraged -->

| ID | Question | Slice | Settled By | Origin |
|----|----------|-------|------------|--------|
| IQ-001 | What input and output envelope bounds does a successful Forge-JVM run support? | S1 | testing | local |

---

## Dependency Order
<!-- audience: builder; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Capture and Compare the Forge-JVM Baseline | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Add the Forge-JVM Eval Scenario | depends on | The baseline uses a successful run of the committed JVM scenario. |
| User Story 3: Audit M1 Baseline-Set Completeness | depended upon by | The audit requires the committed JVM baseline. |

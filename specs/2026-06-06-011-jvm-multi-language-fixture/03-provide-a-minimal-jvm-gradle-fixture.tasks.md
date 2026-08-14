# Tasks: Provide a Minimal JVM Gradle Fixture

**Source**: `specs/2026-06-06-011-jvm-multi-language-fixture/jvm-multi-language-fixture.spec.md` — User Story 3
**Data Model**: `specs/2026-06-06-011-jvm-multi-language-fixture/jvm-multi-language-fixture.data-model.md`
**Contracts**: `specs/2026-06-06-011-jvm-multi-language-fixture/jvm-multi-language-fixture.contracts.md`
**Story Number**: 03

---

## Slice 1: Add the JVM Gradle Fixture
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: `evals/fixture/jvm/` contains a documented minimal Gradle Java project with a deterministic failing test and repository guards that keep generated output out of the committed fixture.

**Justification**: User Story 3 is filesystem-scoped and does not depend on scenario loading or runner fixture resolution. A single PR can add the fixture files, document the intended failure, and cover the committed shape without touching current JavaScript fixture behavior.

**Addresses**: FR-009, FR-010, FR-011, FR-012, FR-014; AS 3.1, AS 3.2, AS 3.3, AS 3.4

### Tasks

- [x] **Add the minimal Gradle project**

  Create the JVM fixture under `evals/fixture/jvm/` with Gradle settings, build configuration, Java source, and Java test source. Keep the project intentionally small and aligned with the JVM Fixture Layout contract so future eval agents can inspect it quickly.

  _Acceptance criteria:_
  - The fixture root contains settings, build configuration, source, and test files required by AS 3.1.
  - The chosen Gradle wrapper or system-Gradle approach is reflected by the committed files.
  - The project can compile with the documented command when required JVM tooling is available.
  - Existing JavaScript fixture files remain unmoved and semantically unchanged.
  - Fixture presence coverage verifies the committed JVM project shape.

- [x] **Plant the deterministic forge failure**

  Add a simple source behavior and corresponding test in the JVM fixture so the test suite has one intentional, deterministic failure. The failure must be suitable for a future `smithy.forge` slice to repair without requiring runner or scenario changes in this story.

  _Acceptance criteria:_
  - The planted failure satisfies AS 3.3 and is isolated to the JVM fixture.
  - Passing tests, if any, do not obscure which behavior is intentionally broken.
  - The fixture still compiles before the planted failing assertion runs.
  - No JVM scenario YAML or baseline file is added.

- [x] **Document fixture operation and boundaries**

  Add `evals/fixture/jvm/README.md` and any fixture-local ignore rules needed to match the committed Gradle approach. Document how maintainers run the build and tests, which failure is intentional, required local tooling or first-run dependency resolution, and which files are fixture-owned.

  _Acceptance criteria:_
  - The README satisfies AS 3.4 and resolves the Gradle wrapper choice called out by SD-002.
  - Generated Gradle output directories are absent from the committed fixture or ignored.
  - Maintenance boundaries distinguish JVM fixture files from the existing JavaScript fixture.
  - The documentation does not claim F1.7 scenario or baseline support exists.

**PR Outcome**: The repository contains a documented JVM Gradle fixture at `evals/fixture/jvm/` with a deterministic forge-ready failure and tests or guards that preserve its committed shape.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: The fixture selector is specified as `fixture:` with relative paths under `evals/fixture/`, resolving feature-map SD-002 for F1.6. If implementation discovers a current CLI flag path assumption that makes this precedence hard to preserve, update this debt row with the exact compatibility tradeoff before changing the contract. | Integration Points | Medium | High | inherited | — |
| SD-002 | inherited from spec: The Gradle wrapper choice is left to implementation. Including a wrapper improves reproducibility but adds binary/script files; requiring system Gradle keeps the fixture smaller but depends on developer tooling. The fixture README must document whichever option is chosen. | Non-Functional Quality | Medium | Medium | inherited | — |
| SD-003 | inherited from spec: F1.5 and F1.6 both touch `evals/lib/runner.ts`. F1.5 owns git setup around temp-copy initialization; F1.6 owns fixture path resolution before the copy. Second-to-land implementation must rebase and keep both contracts intact. | Integration | Medium | High | inherited | — |

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Add the JVM Gradle Fixture | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 4: Preserve Existing Fixture Behavior | depended upon by | US4 verifies existing JavaScript fixture behavior and generated-output boundaries after the JVM fixture is added. |
| User Story 2: Resolve Fixture Paths in the Runner | depended upon by | US2 eventually makes `fixture: jvm` selectable at runtime, but this story only provides the filesystem fixture it will resolve. |

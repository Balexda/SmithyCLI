# Tasks: Preserve Existing Fixture Behavior

**Source**: `specs/2026-06-06-011-jvm-multi-language-fixture/jvm-multi-language-fixture.spec.md` — User Story 4
**Data Model**: `specs/2026-06-06-011-jvm-multi-language-fixture/jvm-multi-language-fixture.data-model.md`
**Contracts**: `specs/2026-06-06-011-jvm-multi-language-fixture/jvm-multi-language-fixture.contracts.md`
**Story Number**: 04

---

## Slice 1: Regression Guard Default Fixture Behavior
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Existing JavaScript fixture scenarios continue to load and run through the default fixture path, checksum validation still watches the selected source fixture, and generated JVM build output remains outside committed fixture state.

**Justification**: User Story 4 verifies compatibility after US1-US3 rather than adding a new runtime capability. A single PR can tighten regression coverage around default fixture selection, existing fixture boundaries, checksum behavior, and JVM generated-output hygiene without changing scenario semantics or authoring the future JVM eval scenario.

**Addresses**: FR-013, FR-014; AS 4.1, AS 4.2, AS 4.3, AS 4.4

### Tasks

- [ ] **Lock existing scenario default loading behavior**

  Extend existing scenario-loader coverage so current scenario YAML files that omit `fixture` still load with the same scenario names, ordering, required fields, optional fields, and structural expectations they had before fixture selection support. Keep the checks focused on compatibility for AS 4.1 and do not require current scenarios to declare fixture metadata.

  _Acceptance criteria:_
  - Existing scenario YAML files that omit `fixture` load successfully.
  - Loaded scenarios without fixture metadata do not gain a scenario-level fixture selector.
  - Scenario sorting and duplicate-name handling remain unchanged.
  - Existing `model`, `timeout`, structural expectation, and sub-agent evidence fields remain compatible.
  - Coverage fails if a current scenario is moved, renamed, or semantically altered to satisfy the JVM fixture work.

- [ ] **Exercise default-fixture runner and checksum compatibility**

  Extend runner coverage around a default-fixture scenario so omitted fixture metadata continues to select the existing JavaScript fixture path and checksum validation still hashes the same selected source directory before and after execution. Preserve F1.5 temp-copy and git-initialization behavior while proving AS 4.2.

  _Acceptance criteria:_
  - A scenario without `fixture` uses the global fixture path when one is supplied.
  - A scenario without `fixture` uses the repository default fixture when no override is supplied.
  - Checksum validation watches the selected source fixture directory.
  - Source fixture mutation detection still fails for the default JavaScript fixture.
  - Existing temp-copy cleanup and git initialization behavior remain intact.

- [ ] **Guard fixture filesystem boundaries**

  Add regression checks or repository guards that confirm the existing JavaScript fixture README and planted artifacts remain in place, while JVM fixture generated output is absent from committed state or ignored by fixture-local rules. Keep the guard limited to fixture filesystem boundaries for AS 4.3 and AS 4.4.

  _Acceptance criteria:_
  - Existing JavaScript fixture files and README-documented planted artifacts are not moved, renamed, or cleaned up.
  - Current scenario YAML files are not rewritten only to accommodate the JVM fixture.
  - Generated JVM build output directories are absent from committed fixture files or covered by ignore rules.
  - The guard does not add the out-of-scope JVM scenario YAML or baseline.
  - Fixture-shape coverage continues to recognize the committed JVM Gradle project.

**PR Outcome**: Existing JavaScript eval scenarios keep default fixture behavior after JVM fixture support lands, checksum validation remains tied to the selected source fixture, and generated JVM build output stays out of committed fixture state.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

| ID | Title | Source Category | Impact | Confidence | Origin |
|----|-------|-----------------|--------|------------|--------|
| SD-001 | Fixture selector path form | Integration Points | Medium | High | spec:SD-001 |
| SD-002 | Gradle wrapper choice | Non-Functional Quality | Medium | Medium | spec:SD-002 |
| SD-003 | Runner ownership split with F1.5 | Integration | Medium | High | spec:SD-003 |

---

## Open Implementation Questions
<!-- audience: builder; mode: reference; length: one table row per question; diagram: optional; examples: discouraged -->

_None — no open implementation questions._

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Regression Guard Default Fixture Behavior | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Declare Per-Scenario Fixture Selection | depends on | US4 verifies scenarios that omit the optional `EvalScenario.fixture` selector preserve existing loaded shapes. |
| User Story 2: Resolve Fixture Paths in the Runner | depends on | US4 verifies runner default and global fixture behavior after per-scenario resolution is introduced. |
| User Story 3: Provide a Minimal JVM Gradle Fixture | depends on | US4 verifies the JVM fixture does not disturb existing JavaScript fixture files and keeps generated Gradle output out of committed state. |

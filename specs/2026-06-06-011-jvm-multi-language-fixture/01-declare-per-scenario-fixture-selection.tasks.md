# Tasks: Declare Per-Scenario Fixture Selection

**Source**: `specs/2026-06-06-011-jvm-multi-language-fixture/jvm-multi-language-fixture.spec.md` — User Story 1
**Data Model**: `specs/2026-06-06-011-jvm-multi-language-fixture/jvm-multi-language-fixture.data-model.md`
**Contracts**: `specs/2026-06-06-011-jvm-multi-language-fixture/jvm-multi-language-fixture.contracts.md`
**Story Number**: 01

---

## Slice 1: Load and Validate Fixture Metadata
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Scenario YAML can optionally declare a fixture selector, valid selectors are preserved on `EvalScenario`, and malformed selectors are rejected through the existing loader skip-or-throw paths.

**Justification**: User Story 1 is entirely bounded by the scenario model and loader. A single PR can add the additive type field, loader validation, and regression coverage without touching runner path resolution or authoring the JVM fixture.

**Addresses**: FR-001, FR-002, FR-003, FR-004, FR-005; AS 1.1, AS 1.2, AS 1.3

### Tasks

- [x] **Expose optional fixture metadata on scenarios**

  Extend the eval scenario model in `evals/lib/types.ts` and loader output in `evals/lib/scenario-loader.ts` so valid scenario YAML may carry an optional fixture selector. Preserve omitted fixture metadata as the existing default behavior for AS 1.1, and keep validation for all existing fields unchanged.

  _Acceptance criteria:_
  - `EvalScenario` supports an optional `fixture` string without requiring current scenarios to set it.
  - Loaded scenarios that omit `fixture` are unchanged except for the field remaining absent.
  - A scenario with a valid relative fixture selector exposes that selector to callers.
  - Existing scenario ordering, duplicate-name handling, `model`, `timeout`, structural expectations, and sub-agent evidence behavior are unchanged.
  - Focused loader coverage exercises omitted and valid fixture metadata.

- [x] **Reject malformed fixture selectors in the loader**

  Add fixture selector validation to `evals/lib/scenario-loader.ts` using the contract's scenario fixture declaration rules. Invalid fixture metadata must follow the existing loader policy: `loadScenarios` skips only the offending file with one stderr line naming `fixture`, while `loadScenarioFromFile` throws for the same invalid content.

  _Acceptance criteria:_
  - Empty, non-string, absolute, parent-traversing, and escaping fixture values are invalid per AS 1.3.
  - `loadScenarios` continues loading other valid files when one fixture value is malformed.
  - `loadScenarioFromFile` reports validation failure for malformed fixture metadata.
  - The stderr path for skipped files names the `fixture` field once per offending file.
  - Unit coverage includes both directory loading and exact-file loading failure paths.

**PR Outcome**: Scenario loading accepts `fixture: jvm` as additive metadata, keeps existing scenarios on default fixture behavior when the field is omitted, and rejects malformed fixture selectors through the established skip-or-throw loader contract.

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
| S1 | Load and Validate Fixture Metadata | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Resolve Fixture Paths in the Runner | depended upon by | US2 consumes the optional `EvalScenario.fixture` selector introduced by this story and applies fixture precedence in the runner. |
| User Story 4: Preserve Existing Fixture Behavior | depended upon by | US4 verifies existing scenarios that omit `fixture` remain compatible after loader and runner support land. |

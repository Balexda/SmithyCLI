# Tasks: Scanner Classifies Without Relying on Dependency-Order Checkboxes

**Source**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md` — User Story 9
**Data Model**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.data-model.md`
**Contracts**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.contracts.md`
**Story Number**: 09

---

## Slice 1: Migration-Pointer Warning and No-Checkbox Invariant Lock-In

**Goal**: `src/status/parser.ts` emits a `format_legacy` warning whose body satisfies FR-028's "suggest the migration path" requirement, and explicit AS 9.5 / AS 9.6 regression tests lock in the architectural invariant that classification never consults checkboxes inside a `## Dependency Order` section.

**Justification**: This slice ships a standalone PR that closes the one concrete FR-028 wording gap left by US1 and anchors the "no checkbox counting in the dep-order section" invariant with tests tagged to the US9 acceptance scenarios. The production change is a single named constant; the rest of the slice is pure test-lock-in. Landing this before Slice 2 keeps the code change independently reviewable and ensures Slice 2's scanner assertions can reference the final warning text without churn.

**Addresses**: FR-006, FR-025, FR-028; AS 9.5, AS 9.6

### Tasks

- [x] **Add migration-pointer text to the `format_legacy` warning**

  Define a module-level string constant in `src/status/parser.ts` holding the `format_legacy` warning and reference it from the legacy-detection branch of `parseDependencyTable`. The constant's body must satisfy FR-028 by pointing authors at the canonical 4-column schema documentation so a user encountering a legacy section has a concrete migration reference.

  _Acceptance criteria:_
  - A named constant in `parser.ts` holds the full legacy warning text.
  - `parseDependencyTable`'s legacy-detection branch emits that constant unchanged.
  - The warning body points at where the canonical 4-column schema is documented (the agent-skills template README).
  - The `format_legacy:` prefix is preserved so downstream consumers keyed off it continue to match.

- [x] **Lock AS 9.5 via tagged legacy-format assertions in parser and scanner tests**

  Update the existing legacy-detection test in `src/status/parser.test.ts` and the legacy-format test in `src/status/scanner.test.ts` to reference AS 9.5 in their descriptions and assert both the `format_legacy:` prefix and the new migration-pointer body text propagate from the parser constant through to the scanner's `ArtifactRecord.warnings`.

  _Acceptance criteria:_
  - Test descriptions name AS 9.5 as the scenario being verified.
  - Assertions cover both the `format_legacy:` prefix and the migration-pointer body.
  - The scanner-side test confirms the legacy spec record carries `status: 'unknown'` and the updated warning text flows through unchanged.
  - No tolerant parsing of the legacy format is introduced — the record's `rows` remain empty per FR-028.

- [x] **Add an AS 9.6 parser regression test for checkboxes inside `## Dependency Order`**

  Add a `parseDependencyTable` unit test in `src/status/parser.test.ts` that feeds the parser a valid 4-column table followed by freestanding `- [ ]` / `- [x]` lines inside the same `## Dependency Order` section. The test pins the invariant that such checkboxes are semantically meaningless for classification: the parsed result remains `format: 'table'` with the valid rows preserved, and no `format_legacy` warning is emitted.

  _Acceptance criteria:_
  - Test description references AS 9.6.
  - Fixture contains a valid 4-col header, separator, and at least one data row, followed by one or more freestanding checkbox lines inside the same section.
  - Assertions confirm `format === 'table'`, the emitted rows match the valid table rows only, and no `format_legacy` warning is present.
  - Test comment notes that interleaved-checkbox tolerance is out of scope and tracked as specification debt.

**PR Outcome**: The `format_legacy` warning satisfies FR-028's migration-pointer requirement, and AS 9.5 + AS 9.6 are locked as named regression tests. Production code change is one named constant; the rest of the slice is traceability-bearing tests.

---

## Slice 2: AS 9.1–9.4 Rollup Attestation Tests

**Goal**: `src/status/scanner.test.ts` gains four scenario-tagged regression tests — AS 9.1 through AS 9.4 — exercising single-hop rollup from each parent artifact type to its child. Each fixture drives classification exclusively from the parent's `## Dependency Order` `Artifact` column so the "no checkbox counting in dep-order" invariant is demonstrated end-to-end by construction.

**Justification**: US1's leaf-to-root integration tests already cover these rollup behaviors under US1-scenario labels, but US9 is a distinct contract requiring traceable evidence that each rollup hop works under the new table-only format. Single-hop fixtures isolate the contract under test from multi-hop chains, making future failures easy to localize. No production code change is expected — if any test fails, that is a scanner regression.

**Addresses**: FR-005, FR-006, FR-025; AS 9.1, AS 9.2, AS 9.3, AS 9.4

### Tasks

- [x] **Add AS 9.1 and AS 9.2 spec→tasks rollup tests**

  Add two `it(...)` blocks in `src/status/scanner.test.ts`, each tagged with its AS ID. AS 9.1 covers a spec row whose `Artifact` column points at an existing tasks file and whose rolled-up classification must derive from that tasks file's slice-body state. AS 9.2 covers a spec row whose `Artifact` is `—` and whose scanner output must include a single virtual not-started tasks record at a naming-convention path.

  _Acceptance criteria:_
  - Two new `it(...)` blocks whose descriptions reference AS 9.1 and AS 9.2.
  - AS 9.1 fixture uses a spec with one populated `Artifact` row and a tasks file whose slice-body state drives classification; spec's status matches the tasks file's rolled-up status.
  - AS 9.2 fixture uses a spec with one `—` `Artifact` row; exactly one virtual tasks record is emitted with `virtual: true`, `status: 'not-started'`, and a naming-convention-derived path.
  - Neither fixture places any checkbox lines inside `## Dependency Order` sections.
  - Tests pass against the current scanner without production code changes.

- [x] **Add AS 9.3 and AS 9.4 feature→spec and RFC→features rollup tests**

  Add two `it(...)` blocks in `src/status/scanner.test.ts` covering the remaining rollup hops. AS 9.3 uses a feature map whose row points at an existing spec folder. AS 9.4 uses an RFC whose row points at an existing `.features.md`. Each test isolates a single rollup hop — not a full RFC→features→spec→tasks chain — so regressions can be localized to the exact hop under test.

  _Acceptance criteria:_
  - Two new `it(...)` blocks whose descriptions reference AS 9.3 and AS 9.4.
  - AS 9.3 fixture has a feature map row referencing a real spec folder; the feature record's status equals the spec's rolled-up status.
  - AS 9.4 fixture has an RFC row referencing a real `.features.md`; the RFC record's status equals the feature map's rolled-up status.
  - Each fixture is single-hop (one parent, one directly-resolved child).
  - No checkbox lines appear inside any `## Dependency Order` section of any fixture file.
  - Tests pass against the current scanner without production code changes.

**PR Outcome**: `scanner.test.ts` carries four AS-tagged tests providing direct traceability from US9's acceptance scenarios to the scanner integration suite. Any future refactor that regresses a rollup hop fails a specifically-named US9 test, making the contract violation immediately visible in CI.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Exact ANSI color palette and tree-connector characters are not specified — will be resolved during implementation by matching existing smithy CLI output conventions. | Interaction & UX | Low | High | inherited | — |
| SD-002 | inherited from spec: The handling of `specs/strikes/` folder contents (lightweight strike artifacts that don't follow the full RFC → tasks hierarchy) is unspecified — are they rendered as a flat list, ignored, or promoted into the tree as orphans? | Functional Scope | Medium | Medium | inherited | — |
| SD-003 | inherited from spec: Whether the scanner should respect `.gitignore` / `.smithyignore` when walking the repo is undefined. | Functional Scope | Low | Medium | inherited | — |
| SD-004 | inherited from spec: Whether `smithy status --watch` (continuous refresh) is in scope is undefined — leaning out-of-scope for v1 but not stated. | Interaction & UX | Low | High | inherited | — |
| SD-005 | inherited from spec: A one-time migration tool or script to convert legacy checkbox-based `## Dependency Order` sections to the new table format is implied by FR-020/FR-028 but not specified. Open question: manual edit, dedicated `smithy migrate` command, or a one-off script in `scripts/`? | Functional Scope | Medium | Medium | inherited | — |
| SD-006 | inherited from spec: The exact ASCII rendering for the `--graph` dependency layer view (plain indented list vs. tree connectors vs. Mermaid-style) is not pinned down. | Interaction & UX | Low | High | inherited | — |
| SD-007 | inherited from spec: Whether the `DependencyGraph` spans only the current scan root or can cross repository boundaries (mono-repo vs. multi-repo) is unaddressed. Leaning single-root but not stated. | Functional Scope | Low | High | inherited | — |
| SD-008 | inherited from spec: The interaction between `--graph` and `--status` / `--root` / `--type` filters is unspecified — does filtering prune the graph before layering, or does it hide filtered nodes within the full graph? | Interaction & UX | Medium | Medium | inherited | — |
| SD-009 | inherited from spec: The documentation mirror required by FR-029 lives in two places (CLAUDE.md and `src/templates/agent-skills/README.md`). If those two drift from each other or from the spec, there is no automated check to catch it. A lint rule or doc-generation step is implied but not designed. | Integration | Medium | Medium | inherited | — |
| SD-010 | AS 9.6 is scoped to "trailing checkboxes after the data rows" within a valid 4-column `## Dependency Order` table. Interleaved-checkbox behavior (a freestanding `- [x]` between two valid table rows) inherits the parser's current row-loop termination, which silently drops subsequent rows. This is fail-fast rather than classification drift, so it does not violate the US9 contract, but a stricter tolerance (skip non-pipe lines and warn) may be desirable. Proposed resolution: either tighten the parser to skip non-pipe lines inside a valid table body and append a warning, or document the fail-fast behavior in `parseDependencyTable`'s JSDoc. | Testing Strategy | Low | High | open | — |
| SD-011 | The migration-pointer text in the new legacy-warning constant references `src/templates/agent-skills/README.md`'s 4-column table schema as a stable, already-canonical artifact. SD-005 leaves the eventual migration tooling (`smithy migrate` vs. a one-off script) unresolved; when that lands, the constant should be updated to reference the new tool alongside or in place of the README pointer. Tracked here so the update is not forgotten when SD-005 resolves. | Integration | Low | High | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Migration-Pointer Warning and No-Checkbox Invariant Lock-In | — | — |
| S2 | AS 9.1–9.4 Rollup Attestation Tests | S1 | — |

1. **Slice 1** — lands the one production change (the named warning constant) and anchors the AS 9.5 / AS 9.6 invariants. Reviewers can verify the FR-028 wording in isolation.
2. **Slice 2** — purely additive scanner integration tests tagged to AS 9.1–9.4. Sequenced after Slice 1 so the scanner-side AS 9.5 assertion reflects the final warning text without churn.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Scan Artifacts and Classify Status | depends on | US1's `classifier.ts` and `scanner.ts` already implement rollup from resolved children, virtual-record emission for `—` `Artifact` cells, and legacy-format → `unknown` classification. US9 is an attestation-and-wording layer on top — no scanner or classifier code change is expected. |
| User Story 8: Deterministic Dependency Order Format Across All Artifacts | depends on | US9's classification rules assume the 4-column `## Dependency Order` table is the sole format emitted by authoring commands. The `format_legacy` warning path serves migration repos during US8's rollout and the clean-break stance (no tolerant parsing) mirrors US8's template migration. |
| User Story 10: Visualize the Dependency Graph for Parallel Work | depended upon by | US10's dependency-graph view consumes the same classification output US9 attests to; any regression caught by a US9 test also protects US10's graph layering. |

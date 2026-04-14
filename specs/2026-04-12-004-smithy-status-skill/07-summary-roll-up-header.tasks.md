# Tasks: Summary Roll-up Header

**Source**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md` — User Story 7
**Data Model**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.data-model.md`
**Contracts**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.contracts.md`
**Story Number**: 07

---

## Slice 1: Text-Mode Summary Roll-up Header

**Goal**: `smithy status` text mode opens with a per-type roll-up header — one line covering `RFCs`, `Features`, `Specs`, and `Tasks` with their done / in-progress / not-started counts — rendered above the existing flat listing whenever the scan finds at least one artifact. `--format json` behavior is confirmed unchanged and guarded by an extended per-type counts assertion on the existing JSON integration test.

**Justification**: The only outstanding work for US7 is the text-mode header — AS 7.2 (the JSON `summary` key) was delivered with US1 Slice 3 and requires nothing more than a regression guard. Both concerns sit on the same `statusAction` code path and the same integration-test file, so bundling them keeps the story atomic without bloating the PR. The slice ships a user-visible improvement in one round-trip and leaves `ScanSummary`, `summarize()`, and the JSON payload shape untouched.

**Addresses**: FR-016; Acceptance Scenarios 7.1, 7.2

### Tasks

- [ ] **Render per-type summary header above text-mode listing**

  Add a pure `formatSummaryHeader(summary: ScanSummary): string` helper co-located with `summarize()` in `src/commands/status.ts`, and invoke it from the text-mode path of `statusAction` after the empty-repo early-return and before the flat records loop. The header must render AS 7.1 verbatim from `ScanSummary.counts` without touching `ArtifactRecord[]` or coupling to any future tree renderer.

  _Acceptance criteria:_
  - Text-mode output on a non-empty repo begins with a summary header line followed by the existing flat listing; empty-repo output is unchanged (friendly hint only, no header).
  - Header covers all four artifact types in the canonical order `RFCs`, `Features`, `Specs`, `Tasks` using plural labels regardless of count.
  - Within each type, status segments whose count is zero are suppressed; a type with every count at zero still appears with a stable `0 done` placeholder so the four-type structure is preserved (satisfies AS 7.1 against the contracts example, resolves SD-011).
  - `unknown`-status counts and the `orphan_count` / `broken_link_count` / `parse_error_count` summary fields are not surfaced in the header (resolves SD-012).
  - `formatSummaryHeader` is a pure function of `ScanSummary → string`, takes no filesystem or I/O dependency, and imports nothing from future tree-rendering modules.
  - `--format json` output is byte-identical to the pre-change payload; `ScanSummary` and `summarize()` are unmodified.
  - An integration test under the `CLI status` describe block in `src/cli.test.ts` exercises a fixture containing records of multiple types and asserts the header appears above the flat listing with the four type labels present (references AS 7.1 by ID).
  - The existing empty-repo integration test remains green without modification.

- [ ] **Guard AS 7.2 with a full per-type JSON counts assertion**

  Extend the existing `--format json` integration test in `src/cli.test.ts` so its fixture contains at least one record of each artifact type and the assertions cover every key under `payload.summary.counts`. This task touches no production source — it locks down AS 7.2's current (already-correct) behavior as US7's acceptance boundary.

  _Acceptance criteria:_
  - Fixture exercises at least one record of each artifact type (`rfc`, `features`, `spec`, `tasks`) so every `counts[type][status]` slot is observable.
  - Assertion covers all four artifact type keys under `payload.summary.counts`, not just the two spot-checked today.
  - Each per-type object is asserted to carry the four status fields defined by the data-model `ScanSummary` entity.
  - Test description references AS 7.2 by ID.
  - No production source files are modified.

**PR Outcome**: Running `smithy status` against a populated repo prints a per-type roll-up summary line above the flat listing; empty repos continue to print only the friendly hint; `--format json` output is unchanged and now has a per-type regression guard covering all four type/status slots.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Exact ANSI color palette and tree-connector characters are not specified — will be resolved during implementation by matching existing smithy CLI output conventions. | Interaction & UX | Low | High | inherited | — |
| SD-002 | inherited from spec: The handling of `specs/strikes/` folder contents (lightweight strike artifacts that don't follow the full RFC → tasks hierarchy) is unspecified — are they rendered as a flat list, ignored, or promoted into the tree as orphans? | Functional Scope | Medium | Medium | inherited | — |
| SD-003 | inherited from spec: Whether the scanner should respect `.gitignore` / `.smithyignore` when walking the repo is undefined. | Functional Scope | Low | Medium | inherited | — |
| SD-004 | inherited from spec: Whether `smithy status --watch` (continuous refresh) is in scope is undefined — leaning out-of-scope for v1 but not stated. | Interaction & UX | Low | High | inherited | — |
| SD-005 | inherited from spec: A one-time migration tool or script to convert legacy checkbox-based `## Dependency Order` sections to the new table format is implied by FR-020/FR-028 but not specified. | Functional Scope | Medium | Medium | inherited | — |
| SD-006 | inherited from spec: The exact ASCII rendering for the `--graph` dependency layer view (plain indented list vs. tree connectors vs. Mermaid-style) is not pinned down. | Interaction & UX | Low | High | inherited | — |
| SD-007 | inherited from spec: Whether the `DependencyGraph` spans only the current scan root or can cross repository boundaries (mono-repo vs. multi-repo) is unaddressed. Leaning single-root but not stated. | Functional Scope | Low | High | inherited | — |
| SD-008 | inherited from spec: The interaction between `--graph` and `--status` / `--root` / `--type` filters is unspecified — does filtering prune the graph before layering, or does it hide filtered nodes within the full graph? | Interaction & UX | Medium | Medium | inherited | — |
| SD-009 | inherited from spec: The documentation mirror required by FR-029 lives in two places (CLAUDE.md and `src/templates/agent-skills/README.md`). If those two drift from each other or from the spec, there is no automated check to catch it. | Integration | Medium | Medium | inherited | — |
| SD-010 | The exact text format for the summary header is underspecified in AS 7.1: plural labels (`RFCs` / `Features` / `Specs` / `Tasks` regardless of count), `·` (U+00B7) separator with a single space either side between types, ` / ` with spaces between status segments within a type, and a single trailing newline before the flat listing. Locked in here so TDD against `formatSummaryHeader` produces a stable regression test; revisit if US2's tree renderer or a future rendering-conventions decision needs a different shape. | Testing Strategy / Technical Risk | High | Medium | open | Resolved here: plural labels, `·` with surrounding spaces, ` / ` within type, one trailing newline. Reopen if US2's rendering conventions require a different format. |
| SD-011 | Zero-count suppression semantics for a type whose every status count is zero is unstated — the contracts example has at least one non-zero segment per type. Resolved here: the type still appears with a stable `0 done` placeholder so the four-type column structure is preserved and parsers / eyeballs can always locate every type label. Suppress only in-type segments that are zero alongside at least one non-zero sibling. | Scope Edges / Testing Strategy | High | Medium | open | Resolved in Slice 1 Task 1 acceptance criterion: all-zero types render as `<Type>: 0 done`. |
| SD-012 | Whether `unknown`-status counts (and the `orphan_count` / `broken_link_count` / `parse_error_count` summary fields) are surfaced in the text header is unstated. Spec US7 prose and FR-016 enumerate only "done / in-progress / not-started". Resolved here: the header omits `unknown` and the three non-count fields for US7 to match FR-016's literal enumeration. Silent drop risk is acknowledged; a future story can add a `(N unknown)` trailing marker or a parse-error banner if user feedback demands it. | Scope Edges | High | Medium | open | Resolved in Slice 1 Task 1 acceptance criterion: only `done / in-progress / not-started` appear in the header. |
| SD-013 | One-line vs multi-line header is ambiguous: AS 7.1 shows a single line joined by `·`, the user-story sentence says "one-line", but the Independent Test says "a summary line **or block**". Resolved here: single line in the style of the contracts example, matching the two prose clauses against the single outlier. A realistic mature repo with many artifacts may exceed 120 columns; acceptable trade for US7. Revisit if terminal-width complaints arise or if US2's tree renderer establishes a multi-line summary convention. Non-ASCII `·` (U+00B7) may display as mojibake on legacy non-UTF-8 terminals; no explicit encoding guarantee in the contracts today. | Technical Risk / Scope Edges | High | Medium | open | Resolved in Slice 1 Task 1: single line. Reopen if terminal-width feedback or a US2 convention contradicts. |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Text-Mode Summary Roll-up Header | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Scan Artifacts and Classify Status | depends on | US7 consumes the `ScanSummary` already produced by US1's `summarize()` / `statusAction` wiring. No change to the scan or summarization layers is required. |
| User Story 2: Render a Hierarchical Status View | depended upon by | US2's tree renderer will eventually replace the flat listing beneath the summary header. `formatSummaryHeader` is intentionally a pure function of `ScanSummary` so US2 can keep, move, or wrap the call site without touching the helper. The natural moment to extract a dedicated `src/status/renderer.ts` module is when US2 lands. |
| User Story 3: Collapse Completed Items | depended upon by | US3 may later fold the summary header into a collapsed-view preamble; no US7 change required because the helper is pure and substitutable. |

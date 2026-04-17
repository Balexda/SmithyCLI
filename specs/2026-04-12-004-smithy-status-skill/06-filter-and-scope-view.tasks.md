# Tasks: Filter and Scope the View

**Source**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md` — User Story 6
**Data Model**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.data-model.md`
**Contracts**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.contracts.md`
**Story Number**: 06

---

## Slice 1: Wire `--status`, `--type`, `--root` Filters via a Pure Filter Module

**Goal**: Ship end-to-end filter behavior for `smithy status` so users can narrow the report by status, artifact type, and scan root. Introduce `src/status/filter.ts` as a pure, unit-tested module — matching the sibling pattern of `parser.ts`, `classifier.ts`, `tree.ts`, and `render.ts` — that applies `--status` (retain matching records plus ancestors for context), `--type` (retain matching records; descendants hidden, ancestors surface as headers), and intersection semantics when both are supplied. Wire the module into `statusAction` between `scan()` and `buildTree()` so both text and JSON output reflect the filtered record set, while `ScanSummary` and `formatSummaryHeader` continue to report pre-filter totals.

**Justification**: The filter's ancestor-walk logic is non-trivial and deserves isolated unit coverage — every peer module in `src/status/` follows that pattern. Splitting the module into a standalone PR ahead of the wiring would ship scaffolding with no user-visible behavior, so a single slice delivers the module, the wiring, and the integration tests together. `--root` is already functional as the scan root (US1 Slice 3), so AS 6.2 becomes a verification concern captured in the integration test rather than new code. The one remaining open conflict — whether summary counts reflect pre-filter or post-filter records — is resolved in favor of pre-filter to preserve the JSON contract's aggregate-summary framing; the UX trade-off is acknowledged (see Risks) and cheap to revisit if the spec is tightened.

**Addresses**: FR-017, FR-001 (confirm `--root` already wired); Acceptance Scenarios 6.1, 6.2, 6.3

### Tasks

- [ ] **Create pure `filterRecords` module with ancestor-aware status and type projection**

  Add `src/status/filter.ts` exporting `filterRecords(records, opts)` where `opts` accepts optional `status: Status`, `type: ArtifactType`, and `root: string` fields; re-export it (plus its options type) from `src/status/index.ts`. The function is pure — no I/O, no input mutation, stable output for stable input — and operates on the flat `ArtifactRecord[]` produced by `scan()` before `buildTree()` synthesizes any sentinel group nodes. When `opts.status` is set, keep records whose `status` matches plus every ancestor reachable via recursive `parent_path` walks through the input set, so AS 6.1's "ancestors still rendered for context" holds. When `opts.type` is set, keep records whose `type` matches plus those same ancestor-by-`parent_path` records (the renderer's existing rules surface them as AS 6.3 headers; no new rendering behavior is introduced here). When both fields are set, apply intersection — a record must satisfy both predicates (or be an ancestor of a record that does) to survive. When `opts.root` is set, treat it as a no-op inside the filter: `statusAction` already narrows the scan via `scan(resolvedRoot)`, so the field is accepted for signature symmetry only. Virtual records (`virtual === true`, `status: 'not-started'`) are treated identically to real records of the same `type` and `status`. Co-locate `src/status/filter.test.ts` and exercise every branch against synthetic `ArtifactRecord[]` fixtures built in-memory.

  _Acceptance criteria:_
  - Pure function contract: no filesystem or network access, no mutation of input records, stable output for stable input.
  - Identity behavior: no filter fields set → the returned array equals the input array (same records, same order).
  - `--status` ancestor retention: setting `status` keeps records whose `status` matches, plus every record reachable by walking `parent_path` back toward roots across the input set (AS 6.1).
  - `--type` projection: setting `type` keeps records whose `type` matches, plus the same ancestor-by-`parent_path` records so the renderer can surface them as AS 6.3 headers.
  - Intersection semantics: when both `status` and `type` are set, a record survives only if it satisfies both predicates (or is an ancestor of a record that does).
  - Virtual records are filtered on the same rules as real records of the same `type` and `status` — no special-casing.
  - `opts.root` is accepted and has no effect inside the filter; the scan root is already honored upstream.
  - Output preserves input order and contains no duplicate records when a record is both a predicate match and an ancestor of another match.
  - Unit tests in `src/status/filter.test.ts` cover identity, each single-flag case, intersection, virtual-record handling, and the empty-input case — all in-memory, no disk fixtures.
  - `filterRecords` and its options type are re-exported from `src/status/index.ts`.

- [ ] **Wire `filterRecords` into `statusAction`, keep `ScanSummary` pre-filter, refresh stub comments, add CLI integration tests**

  In `src/commands/status.ts`, call `filterRecords(records, { status: opts.status, type: opts.type, root: resolvedRoot })` after `scan(resolvedRoot)` and feed the filtered record set into both `buildTree()` and the JSON payload's `records` / `tree` fields. `summarize()` and `formatSummaryHeader()` continue to consume the unfiltered `records` so `ScanSummary.counts` and the rendered summary line remain aggregate over the full scan (satisfies the contracts' aggregate-summary framing; see Risks). Delete the "stub — wired in US6" annotations on the `StatusOptions.status` / `StatusOptions.type` JSDoc (around lines 53–56) and the stub mention in the file-level doc block at the top of `src/commands/status.ts`; likewise remove the matching "(stub — wired in US6)" suffixes on the `--status` and `--type` options in `src/cli.ts`. Extend `src/cli.test.ts` with integration tests that drive the built CLI against a synthetic temp-dir fixture covering every US6 acceptance scenario plus the summary-stability assumption called out in the plan. Confirm the existing "accepts all downstream option stubs without error" test remains green.

  _Acceptance criteria:_
  - `smithy status --status in-progress` renders only in-progress records and their ancestors (AS 6.1).
  - `smithy status --type spec` renders only spec-level records plus their ancestors as headers (AS 6.3).
  - `smithy status --root <subpath>` renders only artifacts under that subpath (AS 6.2); the existing scan-root wiring is preserved and verified end-to-end.
  - `smithy status --status in-progress --type spec` produces the intersection — matches both predicates plus their shared ancestors.
  - `--format json` emits the filtered record set under `records` and the filtered tree under `tree`.
  - The `summary` block in JSON output and the text-mode `formatSummaryHeader` line are byte-identical with and without filter flags against the same fixture (pre-filter counts locked in; see Risks).
  - Invalid `--status` and invalid `--type` values still exit 2 with the existing stderr message (regression guard).
  - Empty-repo hint and non-existent `--root` error paths still exit per the existing contracts (regression guard).
  - Stub-wording comments in `src/commands/status.ts` JSDoc and `src/cli.ts` option descriptions are removed or updated to reflect that US6 is wired.
  - Integration tests live alongside the existing `CLI status` block in `src/cli.test.ts`, follow the existing `spawnSync` / temp-dir fixture pattern, and cover each single flag, the intersection case, the summary-stability assertion, and the regression guards above.

**PR Outcome**: `smithy status --status`, `--type`, and `--root` are fully functional for both text and JSON output. A pure `filter` module ships alongside the existing `src/status/` siblings with isolated unit coverage; `statusAction` wiring is proven by CLI integration tests; the summary header remains pre-filter. No downstream story changes are required.

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
| SD-008 | inherited from spec: The interaction between `--graph` and `--status` / `--root` / `--type` filters is unspecified — does filtering prune the graph before layering, or does it hide filtered nodes within the full graph? Directly relevant to this story: US6 wires the three filter flags but the `--graph` interaction remains deferred to US10. | Interaction & UX | Medium | Medium | inherited | — |
| SD-009 | inherited from spec: The documentation mirror required by FR-029 lives in two places (CLAUDE.md and `src/templates/agent-skills/README.md`). If those two drift from each other or from the spec, there is no automated check to catch it. A lint rule or doc-generation step is implied but not designed. | Integration | Medium | Medium | inherited | — |
| SD-010 | Summary counts reflect the full pre-filter scan, not the filtered view. The contracts describe `summary` as aggregate counts over the scan, so pre-filter is the safer default for JSON consumers; users may find the header counts and the visible tree inconsistent under a heavy `--status` filter. A follow-up UX pass (e.g., a `--summary-matches-view` flag or a second "filtered:" line under the header) is out of scope for US6. | Interaction & UX | Medium | High | open | — |
| SD-011 | Ancestor retention under `--status` and `--type` is implemented by walking `parent_path` chains across the flat record set — the spec's "ancestors for context" phrasing does not define depth, so this story locks in full recursive ancestor inclusion. Virtual records with populated `parent_path` participate in the walk identically to real records. If a future spec clarification introduces a depth limit or an "immediate parent only" rule, the filter signature will need to grow. | Scope Edges | Low | High | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Wire `--status`, `--type`, `--root` Filters via a Pure Filter Module | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Scan Artifacts and Classify Status | depends on | `filterRecords` consumes the classified `ArtifactRecord[]` produced by `scan()`. US1's Slice 3 already wires `--root` as the scan root, which this story verifies end-to-end for AS 6.2 without adding new root-filter code. |
| User Story 2: Render a Hierarchical Status View | depends on | `statusAction` feeds the filtered record set into `buildTree()` / `renderTree()` from US2. No API change to either; filtering happens strictly upstream. |
| User Story 7: Summary Roll-up Header | depends on | `formatSummaryHeader` (US7 Slice 1) continues to consume the unfiltered `ScanSummary` — this story deliberately preserves pre-filter summary counts so US7's contract is unchanged. |
| User Story 3: Collapse Completed Items | — | US3 has no tasks file yet. US6 does not take a position on collapsing behavior; the filtered record set is passed to `buildTree` / `renderTree` unchanged, so whatever collapse logic US3 lands will layer on naturally. |
| User Story 10: Visualize the Dependency Graph for Parallel Work | depended upon by | US10's `--graph` interaction with `--status` / `--type` / `--root` is the explicit subject of SD-008 and remains out of scope here. |

# Tasks: Suggest the Next Command

**Source**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md` — User Story 4
**Data Model**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.data-model.md`
**Contracts**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.contracts.md`
**Story Number**: 04

---

## Slice 1: Deterministic Next-Action Rule Engine, Scanner Wiring, and Text Rendering

**Goal**: Every non-done `ArtifactRecord` returned by `scan()` carries a populated `next_action: NextAction | null` computed by a deterministic rule table, with ancestor-suppression applied so only the topmost actionable item in a chain is surfaced. `smithy status` text mode prints each surfaced suggestion on the matching record's flat-listing line as ` → <command> <arguments>`, and the `--format json` payload already shapes per-record `next_action` without a separate wiring step.

**Justification**: The rule table is six short cases, the suppression pass is one bottom-up walk, and both feed a single rendering change — splitting them into multiple slices would leave a dead pure module with no runnable consumer (the US1 Slice 1 "types-only" anti-pattern the existing tasks files explicitly called out). This mirrors US7's single-slice shape: one small addition to `src/status/` plus one call site in `src/commands/status.ts`, landing as a self-contained PR. TDD on the pure rule + suppression functions locks down every acceptance scenario before any rendering code is touched.

**Addresses**: FR-010, FR-011; Acceptance Scenarios 4.1, 4.2, 4.3, 4.4, 4.5

### Tasks

- [ ] **Implement the deterministic next-action rule table in `src/status/suggestions.ts`**

  Add a new module `src/status/suggestions.ts` exporting a pure function `computeNextAction(record: ArtifactRecord): NextAction | null` that maps a single already-classified record to a suggested `NextAction` per the data-model rule table, with no knowledge of other records. Export it through `src/status/index.ts` alongside the existing public surface (`scan`, `classifyRecord`, `parseArtifact`, etc.).

  The rule table is exactly:

  1. `record.status === 'done'` → `null`.
  2. `record.status === 'unknown'` → `null` (the scanner cannot infer an action from a parse-failed record; US9 / US8 tooling is the correct path).
  3. `record.type === 'tasks'` and `record.virtual === true` → `smithy.cut` with arguments `[<parent-spec-path>, '<N>']` where `<parent-spec-path>` is `record.parent_path` and `<N>` is the numeric portion of the parent spec row's ID (e.g., `US3` → `3`) recovered from whichever parent row referenced this virtual child. Reason: `"Spec has no tasks file for story <N> yet"`.
  4. `record.type === 'tasks'` and `record.virtual !== true` and status is `not-started` or `in-progress` → `smithy.forge` with arguments `[record.path]`. Reason: `"Tasks file has <completed>/<total> slices done"` (use concrete numbers when both are defined).
  5. `record.type === 'spec'` and `record.virtual === true` → `smithy.mark` with arguments `[<parent-features-path>, '<N>']` where `<parent-features-path>` is `record.parent_path` and `<N>` is the numeric portion of the parent feature row's ID. Reason: `"Feature map row <F-id> has no spec folder yet"`.
  6. `record.type === 'features'` and `record.virtual === true` → `smithy.render` with arguments `[<parent-rfc-path>]`. Reason: `"RFC has no feature map for milestone <M-id> yet"`.
  7. `record.type === 'rfc'` and status is `not-started` → `smithy.render` with arguments `[record.path]`. Reason: `"RFC has no feature maps yet"`.
  8. All other cases (real `spec` / `features` records that are `in-progress` or `not-started`; `rfc` records that are `in-progress`) → `null`. These records are not themselves the actionable unit — their actionable state lives on a descendant, which rule 3 / 4 / 5 / 6 will have already populated. This keeps the renderer's topmost-actionable logic (FR-011) simple: the decision is already baked into which records ever carry a non-null suggestion.

  Computing rules 3, 5, and 6 requires knowing which parent row referenced a given virtual child, which the scanner already knows at virtual-emission time. Rather than re-deriving it here, extend `makeVirtualRecord` in `src/status/scanner.ts` (next task) to stash the originating row ID onto the virtual record so `computeNextAction` can read it deterministically. The carried field MUST be part of the exported type surface so downstream consumers (and this module's own unit tests) can construct records without reaching into scanner internals.

  _Acceptance criteria:_
  - `computeNextAction` is a pure function of a single `ArtifactRecord`: same input produces the same output, no filesystem or global state access, no mutation of the input record.
  - Every non-done / non-unknown branch of the rule table is covered by a unit test in `src/status/suggestions.test.ts` that constructs a synthetic `ArtifactRecord` directly (no disk fixtures) and asserts the returned `command`, `arguments`, and a non-empty `reason` string.
  - A `done` record and an `unknown` record both return `null`.
  - Rule 3 (virtual tasks) covers AS 4.2: the returned command is `smithy.cut`, the first argument is the parent spec path, and the second argument is the story number derived from the carried row ID.
  - Rule 4 (real tasks with open slices) covers AS 4.3: the returned command is `smithy.forge` and the argument is the tasks file path.
  - Rule 5 (virtual spec) covers AS 4.1: the returned command is `smithy.mark`, the first argument is the parent features path, and the second argument is the feature number from the carried row ID.
  - Rule 6 / 7 (virtual features or empty-RFC) covers AS 4.4: the returned command is `smithy.render` pointing at the RFC path.
  - Real `spec` / `features` records in any non-done state return `null` (their actionable state lives on a descendant).
  - The module compiles under `npm run typecheck` with no `any` escape hatches and re-exports cleanly through `src/status/index.ts`.

- [ ] **Carry originating dependency-row ID on virtual records in `src/status/scanner.ts`**

  Extend the scanner's virtual-record emission path so every virtual `ArtifactRecord` records the parent dependency-row ID it was created from. Add a new optional field (e.g., `source_row_id?: string`) to `ArtifactRecord` in `src/status/types.ts`, set it inside `makeVirtualRecord`, and leave it `undefined` on real records. No existing scanner consumer should change behavior — this is additive metadata consumed exclusively by `computeNextAction`.

  _Acceptance criteria:_
  - `ArtifactRecord` gains a single new optional field carrying the parent row ID that produced a virtual record. The field is documented in `types.ts` and the data-model's `Identity & Uniqueness` or equivalent section is updated to mention it (see SD-014 below).
  - `makeVirtualRecord` populates the field from the `DependencyRow` argument it already receives.
  - Real records produced by `parseArtifact` never set the field (absence preserved by the existing record constructors).
  - Existing scanner unit / integration tests remain green without modification — the field is additive.
  - Serialization through `JSON.stringify` emits the field on virtual records only (undefined fields are naturally omitted), so `--format json` output for real records is byte-identical.

- [ ] **Populate `next_action` in `scan()` as a post-classification pass**

  After Phase 3 (classification) in `src/status/scanner.ts`, add a Phase 4 pass that walks every record in the scanner's `records` map and assigns `record.next_action = computeNextAction(record)`. This pass MUST run after classification so `record.status` is final, and before `scan()` returns its array so every consumer observes populated suggestions. Then apply FR-011 suppression: walk the linked parent chain for each record whose `next_action` is non-null; if any ancestor also carries a non-null `next_action`, set the descendant's `suppressed_by_ancestor` flag to `true`. The suggestion object remains on the record (JSON consumers keep it); only the `suppressed_by_ancestor` flag changes. Topmost-only surfacing in text mode keys off this flag, not a separate list.

  _Acceptance criteria:_
  - `scan()` returns records where every `done` / `unknown` record has `next_action: null` (explicitly set, not omitted — downstream consumers can depend on the key's presence).
  - Every non-done / non-unknown record eligible under the rule table has a non-null `next_action`.
  - When a virtual tasks record's parent spec is itself virtual (so the spec carries its own `next_action` via rule 5), the tasks record's `next_action.suppressed_by_ancestor` is `true` and the spec's is either absent or `false`.
  - When a real in-progress tasks record sits under a real in-progress spec, the tasks record's `next_action` is surfaced (`suppressed_by_ancestor` not set to `true`) because the spec itself carries no `next_action` per rule 8.
  - Covers AS 4.5 via an integration test in `src/status/scanner.test.ts` that constructs a temp-dir fixture with a virtual features → virtual spec → virtual tasks chain and asserts only the features record's suggestion surfaces.
  - Classification order (Phase 3) is unchanged — the suggestion pass runs strictly after and does not read or mutate `record.status`.

- [ ] **Render next-action suggestions in text mode of `statusAction`**

  Update the flat-listing loop in `src/commands/status.ts` so each non-done record's line is appended with ` → <command> <arguments joined by space>` when the record carries a surfaced `next_action` (i.e., `next_action !== null` and `suppressed_by_ancestor !== true`). Records with null / suppressed suggestions print unchanged. The existing summary header and empty-repo hint paths are untouched, and the `--format json` payload is byte-identical to the pre-change output (the `next_action` field was already part of the `ArtifactRecord` contract).

  _Acceptance criteria:_
  - On a populated repo, each non-done record whose `next_action` is non-null and not suppressed prints the trailing ` → <command> <args>` suffix; `done`, `unknown`, null-suggestion, and suppressed records print without a suffix.
  - The arrow separator is a single-space ` → ` (Unicode `→`, U+2192) to match existing Smithy CLI conventions and distinguish it visually from the tab-separated prefix columns (resolves SD-015).
  - Empty-repo output is unchanged (friendly hint, no listing).
  - `--format json` output is asserted byte-identical to the pre-change payload on a fixture that exercises at least one `null`, one surfaced, and one suppressed suggestion (the `next_action` key already serializes correctly because US1 declared it in the type surface).
  - An integration test under the `CLI status` describe block in `src/cli.test.ts` asserts the surfaced suffix appears for a real tasks-with-open-slices record (references AS 4.3 by ID) and for a virtual tasks record (references AS 4.2 by ID), and that a done record has no suffix.
  - Rendering reads `record.next_action` only; it does not re-invoke `computeNextAction` or re-derive suppression — both already happened inside `scan()`.

**PR Outcome**: Running `smithy status` on a populated repo prints next-command suggestions next to each actionable artifact — `smithy.forge <tasks>` for real tasks with open slices, `smithy.cut <spec> <N>` for virtual tasks records, `smithy.mark <features> <N>` for virtual specs, `smithy.render <rfc>` for virtual features or empty RFCs — with topmost-only surfacing via `suppressed_by_ancestor`. `--format json` output gains populated `next_action` fields on every record. No change to the summary header, empty-repo hint, or tree-mode scaffolding.

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
| SD-014 | The data model lists `next_action` and `suppressed_by_ancestor` on every record but does not specify how the scanner recovers the originating dependency-row ID for a virtual child at suggestion time. Resolved here: virtual records carry a new optional `source_row_id` field populated inside `makeVirtualRecord` from the `DependencyRow` already in scope; real records leave it `undefined`. Revisit if a future story needs the same provenance field on non-virtual records. | Functional Scope | Medium | High | open | Resolved in Slice 1 Task 2: `ArtifactRecord.source_row_id?: string` added to the type surface and populated inside `makeVirtualRecord`. |
| SD-015 | The text-mode separator between the flat listing and the next-action suggestion is unspecified. Resolved here: ` → ` (space, U+2192 right arrow, space) appended to the existing tab-separated listing line for each surfaced suggestion. Revisit if US2's tree renderer establishes a different convention for attaching per-record annotations, or if non-UTF-8 terminal display complaints arise (fallback candidate: ` -> `). | Interaction & UX | Medium | Medium | open | Resolved in Slice 1 Task 4 acceptance criterion. |
| SD-016 | FR-011's "topmost actionable in the chain" does not specify whether ancestor suppression keys off the ancestor's own `next_action` being non-null, or off the ancestor's `status` being `not-started` / `in-progress`. Resolved here: suppression keys strictly off an ancestor carrying a non-null `next_action`, because per rule 8 only records that are themselves the actionable unit ever carry a suggestion. This makes the suppression pass a single linked-parent walk with no re-classification. Revisit if a future UX decision requires suppressing descendants of any in-progress ancestor regardless of that ancestor's own suggestion state. | Scope Edges / Interaction & UX | Medium | Medium | open | Resolved in Slice 1 Task 3 acceptance criterion. |
| SD-017 | AS 4.1 states the suggestion for an unchecked feature-map row is `smithy.mark <features-file> <N>` but does not define `<N>`. Resolved here: `<N>` is the numeric portion of the row's canonical `F<N>` ID (e.g., `F3` → `3`), which matches the argument form `smithy.mark` already accepts as a feature number. The same rule extends to `smithy.cut <spec> <N>` (where `<N>` is the `US` row number). Revisit if the authoring commands change their argument conventions. | Functional Scope | Low | High | open | Resolved in Slice 1 Task 1 acceptance criteria for rules 3 and 5. |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Deterministic Next-Action Rule Engine, Scanner Wiring, and Text Rendering | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Scan Artifacts and Classify Status | depends on | US4 consumes the classified `ArtifactRecord[]` produced by `scan()` and the `NextAction` type already declared in `src/status/types.ts` during US1 Slice 1. No change to the parser, classifier, or discovery phases is required — US4 adds a post-classification Phase 4 pass. |
| User Story 2: Render a Hierarchical Status View | depended upon by | US2's tree renderer will replace the flat listing this slice augments. The suggestion-rendering code is intentionally confined to the flat-listing loop in `statusAction` so US2 can move it into the tree node formatter without touching `computeNextAction` or the scanner pass. |
| User Story 3: Collapse Completed Items | depended upon by | US3 hides children of fully-done subtrees; since `done` records carry `next_action: null`, collapsing them removes nothing visible. No coordination required beyond honoring `suppressed_by_ancestor` where US3's renderer decides what to show. |
| User Story 9: Scanner Classifies Without Relying on Dependency-Order Checkboxes | depends on | US4's rule 2 (`status === 'unknown'` → `null`) trusts US9's classifier to have settled whether legacy / malformed records land in `unknown`. No code dependency — just a sequencing expectation. |

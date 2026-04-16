# Tasks: Suggest the Next Command

**Source**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md` — User Story 4
**Data Model**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.data-model.md`
**Contracts**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.contracts.md`
**Story Number**: 04

---

## Slice 1: Suggestion Engine and Scanner Integration

**Goal**: Every classified `ArtifactRecord` returned by `scan()` receives a resolved `next_action` outcome: a deterministic non-null `NextAction` derived from the record's type and status for actionable records, `null` for `done` and `unknown` records, and `suppressed_by_ancestor: true` on returned `NextAction` objects when any ancestor in the record's parent chain is itself `not-started`. Records skipped from classification because they carry a `read_error:` warning continue to leave `next_action` omitted. The JSON output (`--format json`) immediately reflects these per-record outcomes on `records[]` with no command-layer changes.

**Justification**: The suggestion logic is a pure per-record derivation that depends only on the already-classified record set plus upward parent traversal. It mirrors the existing `classifier.ts` pattern (pure module + dedicated test file) and keeps `scanner.ts` focused on orchestration. Landing the engine first delivers a working increment for JSON consumers (CI, the `smithy.status` skill) independent of any text-mode display work.

**Addresses**: FR-010, FR-011; Acceptance Scenarios 4.1, 4.2, 4.3, 4.4, 4.5

### Tasks

- [ ] **Add pure `suggestNextAction` module in `src/status/suggester.ts`**

  Introduce a new pure module following the `classifier.ts` precedent: a dedicated file with a single exported function that derives a `NextAction | null` from an already-classified `ArtifactRecord` plus a boolean flag indicating whether any ancestor in the record's parent chain is `not-started`. No filesystem I/O, no network, no mutation of the input record. Re-export from `src/status/index.ts`. Apply the deterministic rule table from FR-010 (AS 4.1–4.4): `rfc` → `smithy.render`, `features` → `smithy.mark`, `spec` → `smithy.cut`, `tasks` → `smithy.forge`. Done records always return `null`. Records classified as `unknown` (parse failures) also return `null` — the data model treats `unknown` as not actionable. When the ancestor-not-started flag is `true`, the returned `NextAction` carries `suppressed_by_ancestor: true` so FR-011 suppression is visible to JSON consumers.

  _Acceptance criteria:_
  - A `features` record whose `dependency_order.rows` contains at least one row whose resolved child is `not-started` returns a `NextAction` with `command: 'smithy.mark'` and `arguments` equal to `[record.path, <first-not-started-row-numeric-id>]`, where the numeric id is the digits of the row's `F<N>` id (e.g., row `F2` → `"2"`). Resolves SD-014.
  - A `spec` record whose `dependency_order.rows` contains at least one row whose resolved child is `not-started` returns a `NextAction` with `command: 'smithy.cut'` and `arguments` equal to `[path.dirname(record.path), <first-not-started-row-numeric-id>]` — the spec's parent directory, not the `.spec.md` file path — where the numeric id is the digits of the row's `US<N>` id (e.g., `US3` → `"3"`). This matches `smithy.cut`'s input convention (`specs/<folder> <N>`). Resolves SD-015.
  - A `tasks` record whose `status` is `not-started` or `in-progress` returns a `NextAction` with `command: 'smithy.forge'` and `arguments: [record.path]`.
  - An `rfc` record whose `status` is `not-started` or `in-progress` returns a `NextAction` with `command: 'smithy.render'` and `arguments: [record.path]`.
  - A `done` record returns `null` regardless of type.
  - An `unknown`-status record (one that was classified but whose status resolved to `unknown` — e.g., parse failures) returns `null` regardless of type. Note: this is distinct from read-error records that the scanner skips entirely (Task 2) — those leave `next_action` omitted rather than set to `null`.
  - A `virtual` record (inferred not-started placeholder) is treated like any other `not-started` record for its type.
  - When the ancestor-not-started flag is `true`, the returned `NextAction` object sets `suppressed_by_ancestor: true`; otherwise the field is absent (not `false`) so the JSON payload remains sparse. Applies to AS 4.5.
  - The `reason` field is a single non-empty human-readable sentence explaining the suggestion (e.g., "Spec exists but no tasks file for User Story 3"). The exact wording is not asserted in tests — presence and non-emptiness are.
  - The module exports are visible via `import { suggestNextAction } from '../status/index.js'`.
  - The function does not read, write, or stat any file, and does not mutate the `ArtifactRecord` argument.

- [ ] **Wire `suggestNextAction` into `scan()` as a post-classification pass in `src/status/scanner.ts`**

  After the existing Phase 3 leaf-to-root classification loop, add a new pass that populates `next_action` on every record. Build an upward-walk helper keyed on `parent_path` (which Phase 2 already populates) so each record can detect whether any ancestor has `status: 'not-started'`. Call `suggestNextAction` for each record with the derived flag and assign the result to `record.next_action`. The pass must run after all statuses are finalized so ancestor classification is stable. Update the scanner module JSDoc to document the new phase. Records carrying a `read_error:` warning continue to be skipped by classification and suggestion alike — leave their `next_action` omitted (not set to `null`) so the field's absence signals "never evaluated" to JSON consumers, matching the scanner's existing skip-on-read-error behavior.

  _Acceptance criteria:_
  - After `scan()` returns, every record whose `status` is `done` has `next_action === null`.
  - After `scan()` returns, every record whose `status` is `not-started` or `in-progress` and whose type is one of `rfc | features | spec | tasks` has a non-null `next_action` whose `command` matches the rule table.
  - For any record whose nearest `parent_path` chain contains at least one ancestor with `status: 'not-started'`, `next_action.suppressed_by_ancestor === true`. Satisfies AS 4.5 and FR-011.
  - A record whose ancestors are all `done` or `in-progress` (or who has no ancestors) has `next_action.suppressed_by_ancestor` absent/falsy.
  - A top-level `rfc` record with no feature-map children has `next_action.command === 'smithy.render'` and no suppression flag.
  - Records with a `read_error:` warning do not have `next_action` set (the field remains omitted, signalling "never evaluated" — distinct from `null` which means "evaluated, no action").
  - The upward-ancestor walk terminates on `parent_path: null`, `parent_path: undefined`, and cycle detection (a seen-set prevents infinite loops if a malformed record set produces a self-reference).
  - An existing scanner integration test covers at least one multi-level suppression chain (grandparent `not-started` → parent `not-started` → child `not-started`, verifying only the grandparent's suggestion is un-suppressed) and at least one non-suppressed leaf (all ancestors `in-progress` or `done`).
  - `--format json` output (exercised via `src/cli.test.ts`) shows `records[].next_action` populated for at least one non-done record in the fixture, without any command-layer changes to `src/commands/status.ts` for this task. JSON for done records shows `next_action: null`.
  - Scanner module JSDoc is updated to describe the new pass alongside the existing three phases.

**PR Outcome**: `smithy status --format json` emits `records[].next_action` populated per the deterministic rule table, with ancestor suppression applied. Text-mode output is unchanged — display work lives in Slice 2. JSON consumers (CI, `smithy.status` skill) can read and act on next-action data immediately.

---

## Slice 2: Surface Next-Action Hints in Text-Mode Output

**Goal**: The `smithy status` text-mode output renders a copy-pasteable next-action hint beneath every in-progress or not-started record whose `next_action` is non-null and not suppressed. Suppressed suggestions and done records emit no hint line. The hint formatter is a pure function reusable by the future US2 hierarchical tree renderer.

**Justification**: Slice 1 populates the data; this slice makes it user-visible in the default `smithy status` invocation. The change is confined to `src/commands/status.ts` (plus the formatter helper) and is independently reviewable. Because the text output is still the flat US1/US7 placeholder, the work must not assume the US2 tree renderer has landed — instead it produces a reusable formatter that the tree renderer can call directly when it arrives.

**Addresses**: FR-010, FR-011; Acceptance Scenarios 4.1, 4.2, 4.3, 4.4, 4.5

### Tasks

- [ ] **Add pure `formatNextAction` helper and render hints in the text-mode flat listing**

  Introduce a small pure formatter (in `src/status/suggester.ts` alongside `suggestNextAction` so related logic stays colocated) that takes a `NextAction` and returns a one-line string of the form `→ <command> <arg1> <arg2>...` with the command and space-separated arguments. Update the text-mode branch of `statusAction` in `src/commands/status.ts` so that, after printing each record's existing flat line, it also emits an indented continuation line containing the formatted hint when `record.next_action` is non-null and `record.next_action.suppressed_by_ancestor` is not `true`. Done records and suppressed records emit no hint line. The indentation is a single leading two-space pad so the hint visually attaches to its record in both the current flat listing and the eventual tree view. `--format json` output remains untouched. Resolves SD-016.

  _Acceptance criteria:_
  - `formatNextAction` is exported from `src/status/index.ts`, is pure, and produces exactly one line (no embedded newlines) of the form `→ <command> <arg1> <arg2>...` when arguments are present, or `→ <command>` when arguments is empty.
  - In text mode, a fixture record with `next_action.command === 'smithy.forge'` produces an indented hint line beneath its record line containing `smithy.forge` and the tasks file path (satisfies AS 4.3).
  - In text mode, a fixture features record with a not-started child produces a hint line containing `smithy.mark`, the features path, and the resolved numeric row id (satisfies AS 4.1).
  - In text mode, a fixture spec record with a not-started story produces a hint line containing `smithy.cut`, the spec path, and the resolved numeric story id (satisfies AS 4.2).
  - In text mode, a fixture rfc record with no features child produces a hint line containing `smithy.render` and the rfc path (satisfies AS 4.4).
  - In text mode, a fixture record whose `next_action.suppressed_by_ancestor === true` emits no hint line beneath it, while its topmost not-started ancestor's hint line IS emitted (satisfies AS 4.5).
  - In text mode, a done record emits no hint line.
  - `--format json` output on the same fixture is byte-identical to Slice 1's output — this task introduces no JSON changes.
  - The existing empty-repo text-mode hint and the US7 summary header are unchanged.
  - An integration test in `src/cli.test.ts` under the existing `CLI status` describe block exercises a multi-record fixture containing at least one actionable record, one suppressed record, and one done record, and asserts that the hint appears exactly where expected.

**PR Outcome**: Running `smithy status` against a repo with in-flight artifacts prints an indented `→ smithy.<cmd> <args>` hint beneath every actionable record, with suppressed suggestions correctly omitted so only the topmost actionable item in each chain is surfaced. The feature is complete end-to-end for all five acceptance scenarios.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-014 | AS 4.1 specifies `smithy.mark <features-file> <N>` but does not define what `<N>` is — a feature-row `F<N>` id, a 1-based ordinal, or the raw id token. The `NextAction.arguments` field is a flat `string[]` with no dedicated slot for row-scope context. | Scope Edges | High | Medium | open | Resolved in Slice 1 Task 1: `arguments` = `[features-path, <first-not-started-row-numeric-id>]` where the numeric id is the digit suffix of the row's canonical `F<N>` id. Deterministic because dep-order row ordering is stable. Revisit if user feedback prefers the full `F<N>` token or multiple rows per suggestion. |
| SD-015 | AS 4.2 says `smithy.cut <spec-path>` "scoped to that story" but does not define how story scope is encoded in `NextAction.arguments` (positional number, `US<N>` token, or a second flag argument). | Scope Edges | High | Medium | open | Resolved in Slice 1 Task 1: `arguments` = `[spec-folder-path, <first-not-started-story-numeric-id>]` where `spec-folder-path` is `path.dirname(record.path)` (the spec's parent directory, not the `.spec.md` file), matching the existing `smithy.cut` input convention (`specs/<folder> 3`). Numeric id is the digit suffix of the row's canonical `US<N>` id. |
| SD-016 | Text-mode hint line format is unspecified: single-line vs multi-line, inline trailing vs indented continuation, prefix character, spacing. | Interaction & UX | Medium | High | open | Resolved in Slice 2 Task 1: two-space indented continuation line beneath the record line, prefix `→ `, command and arguments space-separated, one line per hint, no ANSI color. Chosen so the same formatter works for the current flat listing and the future US2 tree renderer without rewrites. Revisit if the US2 tree renderer establishes a different convention. |

---

## Dependency Order

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| S1 | Suggestion Engine and Scanner Integration | — | — |
| S2 | Surface Next-Action Hints in Text-Mode Output | S1 | — |

Recommended implementation sequence:

1. **Slice 1** first — it introduces `suggester.ts`, populates `next_action` on every scanned record, and applies ancestor suppression. Slice 2 has no data to render until this lands. JSON consumers benefit immediately.
2. **Slice 2** next — purely additive text-mode rendering that consumes Slice 1's data via a reusable formatter helper. Safe to land and revert independently.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Scan Artifacts and Classify Status | depends on | US4 consumes the fully-classified `ArtifactRecord[]` produced by `scan()` and the pure `classifier.ts` precedent guides the `suggester.ts` shape. No US1 changes required. |
| User Story 2: Render a Hierarchical Status View | depended upon by | US2's tree renderer (`renderTree`, Slice 2) will eventually replace the flat listing. The `formatNextAction` helper from US4 Slice 2 is intentionally pure so US2 can reuse it verbatim to attach hints beneath tree nodes. |
| User Story 3: Collapse Completed Items | depended upon by | US3 may hide done subtrees; done records already have `next_action: null` so collapsing cannot accidentally reveal suppressed hints. No coordination needed. |
| User Story 5: Invoke Status via the smithy.status Skill | depended upon by | The skill is a pass-through, so as soon as US4 populates `records[].next_action` the skill surfaces it for free. No US5 changes required. |
| User Story 6: Filter and Scope the View | depended upon by | Filtering flags are applied inside the script; filtered-out records do not affect suppression chains because suppression is computed during `scan()` before filtering. No ordering constraint. |

# Tasks: Scan Artifacts and Classify Status

**Source**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md` — User Story 1
**Data Model**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.data-model.md`
**Contracts**: `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.contracts.md`
**Story Number**: 01

---

## Slice 1: Deterministic Artifact Parser and Types

**Goal**: Ship a pure, typed `src/status/` module that turns a Smithy artifact file's Markdown contents into a structured record — title, parsed `DependencyOrderTable`, slice-body completion counts, and non-fatal `warnings[]` — without touching the filesystem or performing status classification. The module is directly importable and exhaustively unit-tested against synthetic Markdown strings.

**Justification**: The parser is the foundation every downstream layer consumes. Landing it as a self-contained PR with pure-function unit tests locks down every table-parsing edge case (well-formed, `—` cells, legacy checkboxes, missing sections, malformed rows, dangling deps) before any I/O or classification logic is added. Types are folded into this slice rather than shipped as a types-only PR because a types-only PR is scaffolding with no runnable consumer — here the types are exercised immediately by `parseArtifact` and its tests.

**Addresses**: FR-002, FR-003, FR-004, FR-020, FR-021, FR-022, FR-023, FR-025, FR-028; Acceptance Scenarios 1.2, 1.3, 1.6 (via parser behavior observable through downstream slices)

### Tasks

- [x] **Define status scanner types in `src/status/types.ts`**

  Create `src/status/types.ts` declaring the TypeScript entities specified in `smithy-status-skill.data-model.md`: `ArtifactType`, `Status`, `ArtifactRecord`, `DependencyRow`, `DependencyOrderTable`, `NextAction`, and `ScanSummary`. Re-export through `src/status/index.ts` so downstream modules and tests have a single import surface.

  _Acceptance criteria:_
  - Every entity listed in the data model has a corresponding exported type or interface.
  - `ArtifactType` is `'rfc' | 'features' | 'spec' | 'tasks'` and `Status` is `'done' | 'in-progress' | 'not-started' | 'unknown'`.
  - `DependencyOrderTable.format` is `'table' | 'legacy' | 'missing'`; `ArtifactRecord.dependency_order` is always a `DependencyOrderTable` (non-nullable) — absence is signalled by `format: 'missing'` with `rows: []`, not by a null field, so every consumer has a single code path.
  - `parent_path` distinguishes `null` (no parent) from an omitted field (unknown) per the data model's JSON guidance.
  - `ArtifactRecord` carries `type`, `path`, `title`, `status`, optional `completed`, `total`, `parent_path`, `parent_missing`, `virtual`, `next_action`, `dependency_order`, `warnings`.
  - `DependencyRow` fields match `id`, `title`, `depends_on`, `artifact_path` exactly.
  - The module compiles under `npm run typecheck` with no `any` escape hatches.

- [x] **Implement pure `parseDependencyTable` in `src/status/parser.ts`**

  Add a named export `parseDependencyTable(markdown, artifactType)` that locates the `## Dependency Order` section, parses the 4-column table with regex / string splitting (no new npm dependency), and returns a `DependencyOrderTable`. Derive `id_prefix` from `artifactType`. Normalize `—` cells to an empty `depends_on` array or `null` `artifact_path`. Validate each row's `id` against `^(M|F|US|S)[1-9][0-9]*$`. Drop dangling `depends_on` IDs (IDs that do not appear elsewhere in the same table) and append a warning describing each drop. Coerce absolute paths in the `Artifact` column to `null` with a warning. When the section is absent, return `format: 'missing'` with empty rows. When the section contains any `- [ ]` / `- [x]` line and no 4-column header, return `format: 'legacy'` with empty rows.

  _Acceptance criteria:_
  - Well-formed tables round-trip to ordered `DependencyRow[]` preserving source order.
  - `Depends On` cell of `—` yields an empty array; a cell like `US1, US3` yields `['US1', 'US3']`.
  - `Artifact` cell of `—` yields `null`; a repo-relative path yields that path unchanged.
  - A row ID that fails the canonical regex is dropped and a warning is recorded.
  - A dangling `depends_on` reference is dropped from the row's `depends_on` and a warning is recorded on the result.
  - An absolute path in the `Artifact` column is coerced to `null` with a warning.
  - Missing `## Dependency Order` section → `format: 'missing'`, empty rows.
  - Legacy checkbox section (any `- [ ]` or `- [x]` line inside `## Dependency Order` with no 4-column header) → `format: 'legacy'`, empty rows. Must distinguish cleanly from `format: 'table'` on synthetic fixtures representing both.
  - `id_prefix` is derived from `artifactType` (rfc→M, features→F, spec→US, tasks→S); a row whose actual prefix disagrees produces a warning.

- [x] **Implement `parseArtifact` in `src/status/parser.ts` covering title, slice counts, and warnings**

  Add `parseArtifact(filePath, content)` that extracts the artifact's title from its first H1 (handling the canonical `# Feature Specification: <Title>` prefix and arbitrary H1s, with fallback to the filename stem when absent), calls `parseDependencyTable` with an artifact type derived from the filename extension, and for `.tasks.md` files counts `completed` / `total` checkboxes found inside `## Slice N:` body sections only. Collects every non-fatal issue into `warnings[]`; never throws on malformed input.

  _Acceptance criteria:_
  - Title extraction handles both the specification-prefixed H1 pattern and an unadorned H1, and falls back to the filename stem when no H1 exists.
  - Tasks files produce accurate `completed` / `total` counts derived solely from `- [x]` / `- [ ]` items inside `## Slice <N>:` sections — checkboxes elsewhere in the file (appendices, dependency-order section) must not affect the count.
  - Non-tasks files omit both `completed` and `total`.
  - Malformed sections append descriptive warning strings but never raise — the function always returns a record.
  - Artifact type is derived from the filename suffix (`.rfc.md`, `.features.md`, `.spec.md`, `.tasks.md`) and passed through to `parseDependencyTable`.
  - Unit tests cover well-formed, legacy, missing-section, and malformed synthetic Markdown inputs entirely in-memory — no disk fixtures.

**PR Outcome**: `src/status/` exports `parseArtifact`, `parseDependencyTable`, and the scanner type surface. Pure-function unit tests lock down parsing edge cases against synthetic Markdown strings. No CLI or filesystem behavior yet, but downstream slices can depend on a stable typed interface.

---

## Slice 2: Scanner — Discovery, Record Building, and Classification

**Goal**: Ship `scan(root): ArtifactRecord[]` as the single entry point that produces the fully-classified record set described in `smithy-status-skill.data-model.md`. The scanner walks `specs/`, `docs/rfcs/`, and `specs/strikes/` under the root, calls `parseArtifact` per discovered file, resolves each record's `parent_path` by scanning parent tables' `Artifact` columns, emits virtual `not-started` records for `—` rows and parent-referenced files missing from disk, and classifies every record leaf-to-root so parents consume their children's finalized status. Tested end-to-end against synthetic temp-directory fixtures.

**Justification**: Discovery, record construction, and classification form one cohesive I/O-bounded workflow. Splitting them into separate PRs leaves intermediate states that do not produce a usable scan result. Keeping them in one slice lets the temp-dir fixture tests assert complete `ArtifactRecord[]` outputs that match the data-model contract exactly — the same shape the CLI wiring in Slice 3 consumes.

**Addresses**: FR-001, FR-002, FR-003, FR-005, FR-006, FR-018, FR-025, FR-026; Acceptance Scenarios 1.1, 1.2, 1.3, 1.4, 1.5, 1.6

### Tasks

- [x] **Implement pure `classifyRecord` in `src/status/classifier.ts`**

  Add a pure function `classifyRecord(record, resolvedChildren)` that returns a `Status` derived from the record's type per the data-model validation rules. For `tasks` records, derive status from `completed` / `total`: `completed === total && total > 0` → `done`; `0 < completed < total` → `in-progress`; `total === 0` or `completed === 0` → `not-started`. For parent record types (`spec`, `features`, `rfc`), roll up the resolved children per the data model: every row `done` → `done`; any child `in-progress` or a mix of `done` and not-done rows → `in-progress`; every row `not-started` (or the row's `Artifact` is `—`) → `not-started`. A record carrying any parse-failure warning that prevents classification (missing required `## Dependency Order` section for a parent type, or `format: 'legacy'`) must resolve to `unknown`. Virtual records always resolve to `not-started`.

  _Acceptance criteria:_
  - Tasks: `completed=3, total=6` → `in-progress` (AS 1.2); `completed=6, total=6` → `done` (AS 1.3); `completed=0, total=6` → `not-started`.
  - Spec with two `done` tasks children and one virtual `not-started` child → `in-progress` (AS 1.1).
  - Spec / features / rfc with every child `done` → `done`.
  - Spec / features / rfc with every child `not-started` → `not-started`.
  - A record whose `dependency_order.format` is `'legacy'` or `'missing'` (for a parent type) resolves to `unknown`, and the outcome never depends on children for such a record.
  - `virtual === true` always produces `not-started` regardless of children.
  - Implementation is a pure function: same input always produces same output, no filesystem access, no I/O.
  - Unit tests exercise every branch with synthetic `ArtifactRecord` inputs in memory.

- [x] **Implement `scan(root)` in `src/status/scanner.ts` with discovery, parent resolution, virtual emission, and leaf-to-root classification**

  Add `scan(root)` that walks `specs/`, `docs/rfcs/`, and `specs/strikes/` under `root` using `node:fs` (no new dependencies; mirror the recursive-walk pattern already in `src/utils.ts`). Discover files by extension suffix (`.rfc.md`, `.features.md`, `.spec.md`, `.tasks.md`). Do not follow symlinks that resolve outside `root`. For each discovered file, call `parseArtifact` to build a partial record. Then, in a second pass, resolve `parent_path` for every record by scanning each candidate parent's `dependency_order.rows` for a row whose `artifact_path` resolves to the child's repo-relative `path` after normalization. Resolution rules match the data model's lineage: an RFC milestone row points at a `.features.md` file (exact match); a feature-map feature row points at a **spec folder**, and resolution locates the `.spec.md` file inside that folder by the naming convention (`<folder>/<slug>.spec.md`); a spec user-story row points at a `.tasks.md` file (exact match). Exact matches and folder-to-spec matches are both valid — no directory-structure heuristics beyond the documented lineage are permitted. Set `parent_missing: true` on records whose declared parent path cannot be resolved to an existing file. For every parent row whose `artifact_path` is `null` or resolves to a file that does not exist on disk, emit a virtual `ArtifactRecord` with `virtual: true`, `status: 'not-started'`, and the row's declared or naming-convention-expected path. On a virtual / real collision at the same path, the real record wins and the virtual is discarded. Finally, classify records leaf-to-root (tasks first, then spec, then features, then rfc) so every parent sees already-classified children when `classifyRecord` runs. Individual file read or parse failures produce a record with `status: 'unknown'` and a descriptive warning — scanning continues without aborting.

  _Acceptance criteria:_
  - Discovery covers `.rfc.md`, `.features.md`, `.spec.md`, and `.tasks.md` under each of the three default root directories, relative to `root`.
  - Unrelated `.md` files (e.g., `README.md`) and files outside the three root directories are not discovered.
  - Symlinks whose real path escapes `root` are not traversed.
  - A spec with two `done` tasks children and one row with `Artifact: —` emits exactly: 1 real spec record (`in-progress`), 2 real tasks records (`done`), 1 virtual tasks record (`not-started`) (AS 1.1).
  - A spec row whose `Artifact` column points at `01-foo.tasks.md` that does not exist on disk emits a virtual tasks record with the declared path and `virtual: true` (AS 1.4).
  - A feature-map row `| F3 | Webhooks | — | — |` emits a virtual spec record whose path is derived from the feature slug per the naming convention (AS 1.5).
  - `parent_path` is set from a parent's `dependency_order` `artifact_path` entry — resolved per the documented lineage (RFC → features file, feature-map row → spec folder → `<folder>/<slug>.spec.md`, spec row → tasks file), never from ad-hoc directory-structure or filename heuristics beyond that lineage.
  - When a declared parent path references a file absent from disk, the child record's `parent_missing` is `true`.
  - On a virtual / real path collision the real record remains and the virtual is discarded silently; no duplicate records are returned for the same `path`.
  - A file that raises a read error or produces a completely unparseable record is emitted with `status: 'unknown'` and a warning — other records are unaffected (AS 1.6).
  - Leaf-to-root classification ordering is a guaranteed invariant: every parent record's children are resolved to their final `Status` before the parent is classified.
  - Integration tests use `tests/status/fixtures/<scenario>/` synthetic temp-directory layouts exercising: a fully-done feature chain, an in-progress feature chain, a not-started feature chain, legacy-format artifacts, broken parent links, and a malformed artifact file.
  - `scan()` never throws on an individual artifact failure and never performs network I/O.

**PR Outcome**: `scan(root)` produces a fully-classified `ArtifactRecord[]` matching the data-model contract, driven by synthetic temp-directory fixtures. Virtual records, parent links, broken-link flags, and leaf-to-root classification are all exercised end-to-end. The CLI remains unchanged; the scanner module is now feature-complete for US1.

---

## Slice 3: `smithy status` Subcommand Wiring

**Goal**: Register `smithy status` with Commander, wire it to `scan()`, and surface the scan result as contract-shaped JSON (via `--format json`) plus a placeholder flat text listing. Honor the `--root` argument and the empty-repo hint from the contracts file. Parse but do not wire `--status`, `--type`, `--all`, `--graph`, and `--no-color` — those belong to downstream stories. This is the first slice where end users see new behavior.

**Justification**: US1 is not complete until its scanner is reachable from the command line. Keeping this slice thin — a Commander registration, a delegating action, an integration test — prevents US2's rendering work from leaking into US1. Landing the option stubs here means downstream stories can wire their behavior without touching the CLI entry point again.

**Addresses**: FR-001, FR-018; Contracts §`smithy status` CLI signature, inputs, outputs (JSON shape), and error conditions

### Tasks

- [x] **Create `src/commands/status.ts`, register `smithy status` in `src/cli.ts`, and add an integration test**

  Create `src/commands/status.ts` exporting a `statusAction(opts)` function that composes the scanner: call `scan(opts.root ?? process.cwd())`, derive a `ScanSummary` from the returned records, and emit either (a) a contract-shaped JSON object with `summary`, `records`, and empty-stub `tree` / `graph` keys when `--format json` is passed, or (b) a minimal flat text listing (one line per record showing type, path, title, status) otherwise. Handle the three error conditions from the contracts table: `--root` pointing at a nonexistent path exits with code 2 and a stderr message; an empty repo (no discovered artifacts) exits 0 with the friendly hint pointing at `smithy.ignite` / `smithy.mark`; individual artifact parse failures are surfaced in the record set with `status: 'unknown'` without aborting. Register the subcommand in `src/cli.ts` using Commander, mirroring the existing `init` / `update` registration pattern. Declare option stubs for `--status`, `--type`, `--all`, `--graph`, and `--no-color` so downstream stories can wire them without re-touching the entry file — this slice does not need to make them functional beyond Commander parsing. Add an integration test in `src/cli.test.ts` that drives the built CLI against a synthetic temp-dir fixture and asserts (at minimum) the JSON output shape, the empty-repo hint exit path, and the nonexistent-`--root` error exit.

  _Acceptance criteria:_
  - `smithy status --help` lists the subcommand and every declared option without error.
  - `smithy status --format json` against a synthetic fixture directory emits a JSON object whose `records` array matches the data-model `ArtifactRecord` shape (including `dependency_order` sub-objects) and whose `summary` counts match the records rendered.
  - `smithy status --root <nonexistent-path>` exits with code 2 and writes an explanatory message to stderr.
  - `smithy status --root <empty-dir>` exits 0 with a single friendly hint mentioning `smithy.ignite` or `smithy.mark`.
  - Individual artifact parse failures appear in the output as records with `status: 'unknown'` and populated `warnings`; the command still exits 0.
  - `--status`, `--type`, `--all`, `--graph`, `--no-color` are accepted by Commander without error, but their behavioral effect is explicitly out of scope for this story; downstream stories wire them.
  - Integration test lives in `src/cli.test.ts` (no per-command test file is created) and follows the existing `execFileSync` / `spawnSync` pattern used by other CLI tests.
  - The action file mirrors the existing `src/commands/init.ts` pattern (exported action function + typed options interface).

**PR Outcome**: `smithy status` is a runnable CLI subcommand that produces contract-shaped JSON output and a placeholder text listing. Rendering and filter behaviors remain owned by US2 / US3 / US6, but the scan contract is now accessible to both the CLI and (later) the `smithy.status` agent skill.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Feature-map virtual spec records have no deterministic expected-path rule. The spec folder's `YYYY-MM-DD-NNN` prefix cannot be derived from a feature row alone, but AS 1.5 requires a "naming-convention-expected spec folder path". Proposed resolution: use the feature slug as a best-effort placeholder (e.g., `specs/<feature-slug>/` with date / NNN marked unknown) and document this in the scanner module. | Technical Risk | High | Medium | open | — |
| SD-002 | The boundary between "emit warnings and keep classifying" and "give up and emit `status: 'unknown'`" is not crisply specified for partially-malformed artifacts. Proposed resolution: `unknown` only when (a) a parent-type artifact lacks a `## Dependency Order` section entirely, (b) the dependency-order section's 4-column header cannot be matched, or (c) the section is detected as legacy checkbox format. Every other per-row issue is a non-fatal warning. | Scope Edges | Medium | Medium | open | — |
| SD-003 | The test-fixture strategy for Slice 2 integration tests — real on-disk temp directories under `tests/status/fixtures/` versus an in-memory `memfs` mock — is not specified in the spec. Proposed resolution: real on-disk temp directories for Slice 2 (matches the deterministic-script spirit and exercises the recursive walk path), with in-memory synthetic strings only for the Slice 1 parser unit tests. | Testing Strategy | Medium | Medium | open | — |

---

## Dependency Order

| ID | Title                                                         | Depends On | Artifact |
|----|---------------------------------------------------------------|------------|----------|
| S1 | Deterministic Artifact Parser and Types                       | —          | —        |
| S2 | Scanner — Discovery, Record Building, and Classification     | S1         | —        |
| S3 | `smithy status` Subcommand Wiring                             | S2         | —        |

Recommended implementation sequence:

1. [x] **Slice 1** — the pure parser and its type surface have no runtime prerequisites and are the import foundation every downstream slice needs.
2. [x] **Slice 2** — the scanner consumes the parser from Slice 1 to produce a fully-classified record set; this is the first slice whose output matches the US1 acceptance contract end-to-end.
3. [x] **Slice 3** — the CLI subcommand composes the finished scanner, exposing US1 to end users and matching the contracts file's JSON shape.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 8: Deterministic Dependency Order Format Across All Artifacts | depends on | US1's scanner is built against the 4-column `## Dependency Order` table format US8 migrates every authoring command to emit. Until US8 lands, real repo artifacts produced by pre-migration templates will classify as `unknown` with a `format_legacy` warning. US1 is implemented and tested against synthetic fixtures conforming to the new format; no code change is needed when US8 merges. |
| User Story 2: Render a Hierarchical Status View | depended upon by | US2 consumes the `ArtifactRecord[]` from US1's `scan()` to render the tree view; US1 intentionally leaves text-mode rendering as a placeholder flat listing. |
| User Story 3: Collapse Completed Items | depended upon by | US3 consumes the classified records from US1 to collapse `done` subtrees; no API change to `scan()` required. |
| User Story 4: Suggest the Next Command | depended upon by | US4 attaches `next_action` suggestions to the non-done records produced by `scan()`. |
| User Story 5: Invoke Status via the smithy.status Skill | depended upon by | US5 deploys the `smithy.status` skill that shells out to `smithy status`; the CLI entry wired in this story's Slice 3 is the shell target. |
| User Story 6: Filter and Scope the View | depended upon by | US6 wires the `--status`, `--type`, and `--root` filter behaviors whose option stubs are registered in this story's Slice 3. |
| User Story 7: Summary Roll-up Header | depended upon by | US7 renders a human-readable summary header from the `ScanSummary` aggregated by this story's Slice 3. |
| User Story 9: Scanner Classifies Without Relying on Dependency-Order Checkboxes | depended upon by | US9 is the classification-rules counterpart to US8's format migration; this story implements the classifier against the new format rules directly and carries no checkbox-based logic. |

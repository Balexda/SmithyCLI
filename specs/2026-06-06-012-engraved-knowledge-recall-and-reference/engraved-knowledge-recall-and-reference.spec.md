# Feature Specification: Engraved Knowledge Recall and Reference

**Spec Folder**: `2026-06-06-012-engraved-knowledge-recall-and-reference`
**Branch**: `feature/epic-412-engraving-decisions` *(pre-staged linked worktree on the epic branch; preserved per the branch-selection policy rather than auto-named)*
**Created**: 2026-06-06
**Status**: Draft
**Input**: User feature description + GitHub EPIC #412 ("Engraved durable knowledge — decisions/invariants/principles") and its open sub-issues #415, #416, #417, #418. The authoring half (#413 schema, #414 `smithy.engrave`) is already shipped. This spec covers the entire *remaining* epic — making engraved knowledge discoverable, recallable during planning, referenced in agent-context files, and audited.

## Clarifications

### Session 2026-06-06

- _Scope: this single spec covers the entire remaining epic — #415 (recall), #416 (status discovery), #417 (graph/surface/stale-ref), #418 (orders/audit) — plus a new engrave→agent-context projection capability not tracked by any sub-issue._ `[Critical Assumption]`
- _Recall is a planning-time **sub-agent** (`smithy-recall`), not a user-invocable command. Ad-hoc catalog lookup is exposed as a mode/flag on `smithy.engrave`. (User-confirmed; the `smithy.engrave` flag vs. a separate `smithy.engraved` command is unresolved — see SD-001.)_
- _The Agents.md/Claude.md reference capability is a new **projection step on `smithy.engrave`** that refreshes a managed, regenerable block when a record is engraved or superseded. (User-confirmed.)_
- _Recall reads engraved record files directly (Grep/Glob/Read, modeled on `smithy-scout`); it does **not** consume the status scanner's output, so recall does not depend on #416._ `[Critical Assumption]`
- _The deterministic TS status subsystem is the sole authority for lifecycle, citation/supersedes/establishes edges, and stale-reference detection. The recall sub-agent owns only semantic relevance ranking and conflict-with-proposed-work judgment; it treats record lifecycle as read-only ground truth and never recomputes the graph._ `[Critical Assumption]`
- _Engraved records sit on a separate **alignment** axis (`aligned` / `drifting`) plus decision lifecycle (`proposed`/`accepted`/`superseded`/`deprecated`) and principle `active`; they are excluded from the build/status completion rollup and never appear as `## Dependency Order` rows._
- _The engraved-knowledge frontmatter schema (kinds, fields, suffixes, ledger column order) is **frozen** and owned by `src/templates/agent-skills/commands/smithy.engrave.prompt`. This spec references it as the source of truth and does not redefine it._

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

This feature is the recall/reference half of EPIC #412. The engraved records it operates on are **roots** in the planning graph — they participate via citation / supersedes / establishes edges, never as Dependency Order rows.

## User Scenarios & Testing *(mandatory)*

### User Story 1: Status Recognizes Engraved Records as a First-Class Type (Priority: P1)

As a developer running `smithy status`, I want decisions, invariants, and principles discovered and reported as a first-class artifact family so that durable commitments are visible alongside planning artifacts instead of being invisible to tooling.

**Why this priority**: This is the foundation #417 (US4) builds on, and it is the smallest increment that makes engraved records exist in tooling. Maps to sub-issue #416, the status-side anchor of the remaining epic.

**Independent Test**: Place sample `*.decision.md`, `*.invariant.md`, and a constitution principle file in the canonical directories, run `smithy status --format json`, and confirm each record appears with `type: "engraved"`, its `kind`, and its alignment/lifecycle — without any planning-artifact dependency-order error.

**Acceptance Scenarios**:

1. **Given** a repo containing `docs/decisions/x.decision.md`, `docs/invariants/y.invariant.md`, and `docs/constitution/z.md`, **When** the scanner runs, **Then** all three are discovered as `type: 'engraved'` records carrying `kind` (`decision`/`invariant`/`principle`), and none is reported as a malformed dependency-order artifact.
2. **Given** an invariant whose Known-Exceptions ledger contains at least one `Temporary:` row, **When** the record is classified, **Then** its alignment is `drifting`; **Given** a ledger with only `Accepted:` rows or the single em-dash placeholder row, **Then** its alignment is `aligned`.
3. **Given** a decision with `status: accepted` / `superseded` / `deprecated`, **When** classified, **Then** the decision lifecycle is reported and the record is **excluded** from the build/completion rollup (it does not affect any parent's `completed/total`).
4. **Given** `ArtifactType` now includes `'engraved'`, **When** the project type-checks and tests run, **Then** every exhaustive `switch (type)` and every `Record<ArtifactType, …>` (notably `ScanSummary.counts`) compiles and behaves correctly, and existing 4-type enumeration tests are updated to account for the new member.
5. **Given** an invariant with the canonical empty ledger (one row of `—` in every column), **When** parsed, **Then** it yields zero exceptions (no phantom exception) and alignment `aligned`.

---

### User Story 2: Planning Commands Recall Relevant Engraved Knowledge (Priority: P1)

As a developer (or arbitrary agent) running a smithy planning command, I want the command to surface the decisions, invariants, and principles relevant to the work at hand — and to flag when my new work conflicts with an invariant or cites a superseded decision — so that durable commitments actively steer new plans instead of being silently ignored.

**Why this priority**: This is the headline value of the epic and the user's primary ask ("update the various smithy skills to reference these engraved pieces of information"). Maps to sub-issue #415.

**Independent Test**: With a few engraved records present, invoke a planning command's scan phase against a feature description whose topics overlap one invariant and cite a superseded decision; confirm the command receives a ranked list of relevant records plus a conflict flag and a superseded-citation flag, and folds them into clarification.

**Acceptance Scenarios**:

1. **Given** engraved records exist and a planning context with topic/scope hints, **When** the `smithy-recall` sub-agent is dispatched, **Then** it returns decisions/invariants/principles ranked by relevance computed from `domain`/`topics`/`scope`/`applies_to` overlap, each with a one-line relevance basis.
2. **Given** the proposed work would contradict an invariant's `## Rule`, **When** recall runs, **Then** it returns that invariant as a **candidate new exception** (a soft flag, not a hard block) — unless an existing `Accepted:` ledger row already covers that divergence, in which case it is not re-flagged.
3. **Given** the planning artifact or proposed work cites a decision whose `status` is `superseded` or `deprecated`, **When** recall runs, **Then** it reports a superseded/deprecated-citation hazard, reading lifecycle from the record frontmatter (or the deterministic status output) as ground truth — it does not independently re-derive supersession.
4. **Given** a feature that spans both `system` and `design` work, **When** recall runs, **Then** it queries both domain partitions; **Given** single-domain work, **Then** it filters to that domain.
5. **Given** no engraved records exist in the repo, **When** recall runs, **Then** it returns a well-formed empty result ("no engraved knowledge in repo") and the planning command proceeds normally — it does not error.
6. **Given** the `{{>consult-engraved-knowledge}}` snippet is wired into the scan phase of `strike`, `ignite`, `render`, `mark`, and `cut`, **When** any of those commands runs under Claude, **Then** it dispatches `smithy-recall`; **When** run under Gemini or Codex (which have no sub-agents), **Then** the inlined snippet's degraded path reads the engraved scan roots directly so engraved knowledge is still consulted.

---

### User Story 3: Engrave Projects Engraved Knowledge into Agent-Context Files (Priority: P1)

As a developer who just engraved or superseded a record, I want `smithy.engrave` to refresh a managed, regenerable block in the repo's agent-context files (CLAUDE.md / AGENTS.md) listing the current durable commitments so that arbitrary agents — not just smithy commands — see the engraved knowledge without any extra tooling.

**Why this priority**: The user's explicit second ask ("ask it to update some Agents.md/Claude.md file to reference said decisions"). New capability with no sub-issue; additive scope flagged as such.

**Independent Test**: Engrave a decision in a repo whose CLAUDE.md has hand-written prose but no markers; confirm a marked block is appended listing the live records, the hand-written prose is untouched, and re-running with no record change leaves the file byte-identical.

**Acceptance Scenarios**:

1. **Given** an agent-context file with no managed markers, **When** a record is engraved/superseded, **Then** a fresh block delimited by `<!-- smithy:engraved:begin -->` / `<!-- smithy:engraved:end -->` is appended at a defined anchor, and no content outside the markers is modified.
2. **Given** a file that already contains the marker pair, **When** projection runs, **Then** only the content between the markers is replaced; **Given** no record has changed since the last run, **Then** the file is byte-identical (idempotent; records sorted deterministically by `id`).
3. **Given** the set of live records, **When** the block is generated, **Then** it lists `accepted` decisions, `aligned`/`drifting` invariants, and `active` principles (each with id, kind, title, status) and **excludes** `superseded`/`deprecated` decisions so agents see only live commitments.
4. **Given** a configured agent-context target file that does not exist on disk, **When** projection runs, **Then** that target is skipped (projection manages existing files only and never creates new ones); present targets are each updated.
5. **Given** a file whose markers are malformed or duplicated, **When** projection runs, **Then** it aborts the projection for that file with a warning rather than guessing where the block belongs, and the engrave operation itself still succeeds.

---

### User Story 4: Status Surfaces Engraved Graph Edges and Stale References (Priority: P2)

As a developer reviewing repository health, I want `smithy status` to show the citation/supersedes/establishes relationships for engraved records, group them under a "Decisions & Invariants" heading, and warn when an artifact cites a superseded decision or deprecated invariant so that drift and stale references are caught deterministically.

**Why this priority**: Builds directly on US1's type surface and completes the status-side story (#417). Valuable but secondary to discovery (US1) and recall (US2).

**Independent Test**: With a spec that cites a superseded decision and a drifting invariant present, run `smithy status` and confirm the engraved group renders with alignment/lifecycle, a stale-ref warning is emitted, and a next-action is suggested.

**Acceptance Scenarios**:

1. **Given** engraved records and artifacts that reference them, **When** the graph is built, **Then** it contains `citation` edges (spec/RFC/decision → invariant/principle), `supersedes` edges (decision → decision), and `establishes` edges (decision → invariant).
2. **Given** an artifact citing a decision whose `status` is `superseded`, **When** the stale-ref check runs, **Then** that reference is flagged as a stale reference extending the existing dangling-reference machinery. (A deprecated-invariant stale-ref class is pending SD-007.)
3. **Given** engraved records exist, **When** the tree renders, **Then** a "Decisions & Invariants" group appears showing each record's alignment (`aligned`/`drifting`) and decision lifecycle.
4. **Given** a `drifting` invariant, **When** next-actions are computed, **Then** the suggester recommends reviewing the exceptions ledger; **Given** an artifact citing a superseded decision, **Then** it recommends reviewing/updating the citation.

---

### User Story 5: Orders Scaffolds Tickets for Engraved Records (Priority: P2)

As a developer using `smithy.orders`, I want to scaffold GitHub issues for decisions and invariants from their files so that engraved work can be tracked with the same issue-creation flow as planning artifacts.

**Why this priority**: Additive, low-risk, independent of all other stories; maps to the orders half of #418. Useful polish, not core capability.

**Independent Test**: Run `smithy.orders` against a `*.decision.md` and a `*.invariant.md` and confirm structured issue bodies are produced, and the orders-template parity test passes.

**Acceptance Scenarios**:

1. **Given** a `*.decision.md` or `*.invariant.md` file, **When** `smithy.orders` auto-detects its type by suffix, **Then** it scaffolds a ticket body from the corresponding engraved orders template.
2. **Given** new `decision`/`invariant` entries added to `ORDERS_DEFAULT_TEMPLATES`/`ORDERS_TEMPLATE_TYPES`, **When** the `smithy.orders.prompt` heredoc parity test runs, **Then** both surfaces match and the parity assertion in `src/templates.test.ts` passes (extended to cover the new types).
3. **Given** a principle file (no suffix), **When** orders runs, **Then** behavior follows the resolution of SD-004 (principle template included, or principles excluded from orders auto-detection with a documented note).

---

### User Story 6: Audit Validates Engraved Record Quality (Priority: P3)

As a developer auditing a durable-knowledge record, I want `smithy.audit` to check engraved records against a dedicated checklist so that decisions, invariants, and principles stay well-formed as they proliferate.

**Why this priority**: A safety net rather than core capability; deferrable. Maps to the audit half of #418.

**Independent Test**: Run `smithy.audit` against an invariant missing its citations and confirm the engraved checklist flags it.

**Acceptance Scenarios**:

1. **Given** an engraved record path, **When** `smithy.audit` selects a checklist by artifact type, **Then** it uses the new `audit-checklist-engraved` snippet (the audit type-selection mechanism is extended to recognize engraved records).
2. **Given** a decision, **When** audited, **Then** the checklist verifies it states a desired invariant where applicable, that `establishes`/`established_by` reciprocity holds, and that no citation points at a superseded decision.
3. **Given** an invariant, **When** audited, **Then** the checklist verifies it cites its establishing decisions, keeps a Known-Exceptions ledger with the load-bearing column order, and exposes no silent divergence.
4. **Given** any engraved record, **When** audited, **Then** the checklist applies the inclusion test (is the record genuinely pivot-level?).

---

### User Story 7: Ad-Hoc Engraved Catalog Lookup (Priority: P3)

As a developer, I want to list and filter existing engraved records on demand so that I can browse durable commitments without running a full planning command.

**Why this priority**: Convenience over a capability already covered indirectly by recall; the exact surface is unresolved (SD-001). Deferrable.

**Independent Test**: Invoke the engrave catalog mode with a topic/domain filter and confirm it lists matching records with id, kind, title, and status.

**Acceptance Scenarios**:

1. **Given** engraved records exist, **When** the catalog lookup mode is invoked (e.g. `smithy.engrave --list` with optional `--domain`/`--topic` filters), **Then** it returns matching records with id, kind, title, status, and path.
2. **Given** no records match the filter, **When** the mode runs, **Then** it returns an explicit empty result rather than an error.

### Edge Cases

- **Recall vs. deterministic authority overlap**: recall must not emit a cites-superseded finding that contradicts the TS stale-ref check; lifecycle is read-only ground truth for recall (see SD-005 for whether recall consumes status JSON or reads frontmatter directly).
- **Already-accepted exceptions**: recall must suppress a conflict flag when an `Accepted:` ledger row already covers the divergence.
- **`deprecated` vs `superseded` decisions**: retired-without-replacement vs replaced-by-new-decision drive different next-action guidance.
- **Scan-root expansion side effects**: adding engraved roots to `SCAN_ROOTS` must not change the canonical-layout fast-path/fallback detection for repos that have only planning artifacts.
- **Principle discovery without a suffix**: principles are found by directory walk of the constitution dir, not by a `SUFFIX_TYPES` entry — a distinct discovery code path.
- **Projection coexisting with hand-written prose**: the root CLAUDE.md already has a hand-written "Engraved Knowledge" section with no markers; projection must add its managed block as a distinct region and never overwrite that prose.
- **Cross-domain `design` roots**: `docs/design/{decisions,invariants,constitution}` discovery is optional per #416 (see SD-003).
- **Empty repo / zero matches**: recall, projection, catalog lookup, and status all behave gracefully when no engraved records exist.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| US1 | Status Recognizes Engraved Records as a First-Class Type | — | — |
| US2 | Planning Commands Recall Relevant Engraved Knowledge | — | — |
| US3 | Engrave Projects Engraved Knowledge into Agent-Context Files | — | — |
| US4 | Status Surfaces Engraved Graph Edges and Stale References | US1 | — |
| US5 | Orders Scaffolds Tickets for Engraved Records | — | — |
| US6 | Audit Validates Engraved Record Quality | — | — |
| US7 | Ad-Hoc Engraved Catalog Lookup | — | — |

US1, US2, US3, US5, US6, and US7 have no upstream dependency on one another — six independent entry points enabling parallel start. Only US4 (graph/surface/stale-ref) has a true data-flow prerequisite on US1's type surface. Recall (US2) deliberately reads engraved files directly and therefore does **not** depend on the status work (US1/US4).

## Requirements *(mandatory)*

### Functional Requirements

**Status discovery & classification (US1, #416)**

- **FR-001**: The system MUST add `'engraved'` to the `ArtifactType` union and audit every exhaustive `switch (type)` and `Record<ArtifactType, …>` site (including `ScanSummary.counts`) so the new member is handled.
- **FR-002**: The scanner MUST discover engraved records by suffix (`.decision.md`, `.invariant.md`) and by directory walk of the constitution directory (principles have no suffix), adding `docs/decisions`, `docs/invariants`, and `docs/constitution` to the scan roots.
- **FR-003**: The system MUST parse engraved frontmatter (`kind`, `domain`, `status`, `topics`, `scope`, `applies_to`, `supersedes`, `superseded_by`, `establishes`, `established_by`) and the Known-Exceptions ledger into a structured record, using a parser that bypasses the `## Dependency Order` grammar.
- **FR-004**: The system MUST classify invariants on an alignment axis: `drifting` when the ledger has ≥1 `Temporary:` row, otherwise `aligned`; the canonical empty (em-dash) ledger row MUST yield zero exceptions and `aligned`.
- **FR-005**: Engraved records MUST be excluded from the build/completion rollup and MUST NOT be assigned `M<N>`/`F<N>`/`US<N>`/`S<N>` IDs or appear as Dependency Order rows.
- **FR-006**: Engraved records MUST appear in `smithy status --format json` with their type, kind, lifecycle/alignment, and citation/supersedes/establishes fields.

**Recall (US2, #415)**

- **FR-007**: The system MUST provide a read-only `smithy-recall` sub-agent (tools `Read`, `Grep`, `Glob`; non-interactive; modeled on `smithy-scout`) that reads engraved record files directly and returns records ranked by relevance computed from `domain`/`topics`/`scope`/`applies_to` overlap with the planning context.
- **FR-008**: Recall MUST flag proposed work that conflicts with an invariant `## Rule` as a candidate new exception (soft flag), suppressing the flag when an existing `Accepted:` ledger row already covers the divergence.
- **FR-009**: Recall MUST flag citations to `superseded` or `deprecated` records, treating record lifecycle as read-only ground truth and never independently recomputing the supersession/establishes graph.
- **FR-010**: Recall MUST be domain-aware: it queries `system`, `design`, or both partitions according to the planning context's domain, and MUST return a well-formed empty result when no records exist or none match.
- **FR-011**: The system MUST provide a `consult-engraved-knowledge` snippet wired into the scan phase of `strike`, `ignite`, `render`, `mark`, and `cut`. The snippet MUST be self-sufficient: a Claude fast-path that dispatches `smithy-recall`, plus an inline degraded path (read the scan roots directly) for Gemini/Codex, which have no sub-agents. It MUST be registered in `snippets/README.md`.
- **FR-012**: Planning commands MUST fold recall's conflict and superseded-citation findings into their clarification/debt handling.

**Projection (US3, new)**

- **FR-013**: `smithy.engrave` MUST, after engraving or superseding a record, refresh a managed block delimited by `<!-- smithy:engraved:begin -->` / `<!-- smithy:engraved:end -->` in the repo's agent-context files.
- **FR-014**: The managed block MUST list live records only — `accepted` decisions, `aligned`/`drifting` invariants, and `active` principles — each with id, kind, title, and status, sorted deterministically by `id`, excluding `superseded`/`deprecated` decisions.
- **FR-015**: Projection MUST be idempotent (a no-change re-run produces a byte-identical file), MUST replace only content between the markers, MUST never modify content outside the markers, and MUST append a fresh block at a defined anchor when no markers exist.
- **FR-016**: Projection MUST manage only agent-context files that already exist (never create missing ones) and MUST abort projection for a file whose markers are malformed/duplicated, with a warning, without failing the underlying engrave operation.

**Graph, surface & stale-ref (US4, #417)**

- **FR-017**: The graph MUST add `citation` (spec/RFC/decision → invariant/principle), `supersedes` (decision → decision), and `establishes` (decision → invariant) edges derived from engraved frontmatter.
- **FR-018**: The stale-ref check MUST flag any artifact that cites a `superseded` decision, extending the existing dangling-reference machinery. (Whether invariants can themselves be `deprecated` — and thus produce a second stale-ref class — is unresolved against the frozen schema; see SD-007.)
- **FR-019**: The status render MUST present a "Decisions & Invariants" group showing alignment and decision lifecycle, and the suggester MUST emit next-actions for drifting invariants (review exceptions) and superseded citations (review/update).

**Orders & audit (US5/US6, #418)**

- **FR-020**: `smithy.orders` MUST support `decision` and `invariant` (and optionally `principle`, per SD-004) by adding entries to `ORDERS_DEFAULT_TEMPLATES`/`ORDERS_TEMPLATE_TYPES` and the `smithy.orders.prompt` heredoc in lockstep, with the `src/templates.test.ts` parity assertion extended to cover them.
- **FR-021**: The system MUST provide an `audit-checklist-engraved` snippet wired into `smithy.audit`'s type-selection mechanism, checking: decision states its desired invariant; invariant cites its decisions and keeps a ledger; no citation to a superseded decision; record is genuinely pivot-level.

**Catalog lookup (US7, #415 standalone)**

- **FR-022**: The system MUST provide an ad-hoc engraved catalog lookup mode (surface unresolved — SD-001) that lists records filtered by domain/topic and returns id, kind, title, status, and path, with an explicit empty result when nothing matches.

### Key Entities *(include if feature involves data)*

- **Engraved Record**: a decision, invariant, or principle file. On-disk schema is owned by `smithy.engrave.prompt`; this feature adds its in-memory representation to the status subsystem. See `engraved-knowledge-recall-and-reference.data-model.md`.
- **Known Exception**: a row in an invariant's ledger (`where`, `what diverges`, disposition `Accepted`/`Temporary`, tracking issue, severity) that drives alignment.
- **Graph Edge**: `citation` / `supersedes` / `establishes` relationships among records and artifacts.
- **Stale Reference**: an artifact citing a superseded decision or deprecated invariant.
- **Recall Result**: the transient, prompt-layer ranked relevance + conflict/superseded findings returned by `smithy-recall` (not persisted).
- **Projection Block**: the managed, marker-delimited region written into agent-context files.

## Assumptions

- This single spec covers the entire remaining epic plus the new projection capability. `[Critical Assumption]`
- Recall reads engraved files directly (Grep/Glob), so #415 does not depend on #416 and the two can be built in parallel. `[Critical Assumption]`
- The deterministic TS subsystem owns lifecycle/edges/stale-refs; recall owns only semantic relevance and conflict-with-draft, treating lifecycle as ground truth. `[Critical Assumption]`
- The `consult-engraved-knowledge` snippet is self-sufficient with a Claude sub-agent fast-path and an inline degraded path for Gemini/Codex. `[Critical Assumption]`
- `Alignment` is modeled as a separate axis from the existing `Status` union; engraved records are excluded from the completion rollup.
- The projection block lists a deterministic full live index sorted by `id` (not an LLM-curated subset), so idempotency holds.
- Projection manages only existing agent-context files and never creates missing ones; the exact default target set (CLAUDE.md, AGENTS.md, possibly `.github/copilot-instructions.md`) is unresolved — see SD-002.
- The engraved frontmatter schema is frozen and owned by `smithy.engrave.prompt`; this spec references it rather than redefining it.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Unresolved choice for the ad-hoc catalog-lookup surface: a `--list`/query flag on `smithy.engrave` vs. a separate `smithy.engraved` command (the latter expands the deploy surface across all three agents). | Functional Scope | Medium | Medium | open | — |
| SD-002 | Which agent-context files projection manages by default (CLAUDE.md only, also AGENTS.md, also `.github/copilot-instructions.md`) and whether the target set is configurable. | Integration | Medium | Medium | open | — |
| SD-003 | Whether the optional `design`-domain scan roots (`docs/design/{decisions,invariants,constitution}`) are in scope for this spec or deferred (#416 marks them optional). | Functional Scope | Low | Medium | open | — |
| SD-004 | Whether `principle` gets an orders template, given principles have no suffix for `smithy.orders` auto-detection (#418 says "optionally"). | Domain & Data Model | Low | Medium | open | — |
| SD-005 | Whether recall consumes the deterministic stale-ref output via `smithy status --format json` (a physically enforced ownership boundary) or reads record frontmatter directly (looser coupling, lighter dependency). | Integration | Medium | Medium | open | — |
| SD-006 | How spec/RFC artifacts declare citations to engraved records — the `citation` edge (FR-017) and stale-ref predicate (FR-018) both depend on a citation source that the frozen frontmatter schema does not define (engraved records carry outbound edges, but the planning-artifact side has no defined citation field/syntax). | plan-review:Logical gap | Important | Low | open | — |
| SD-007 | Whether invariants can be `deprecated` (and thus form a second stale-ref class): #417 wants "deprecated invariant" citations flagged, but the frozen engrave schema gives invariants only the `aligned`/`drifting` alignment axis with no lifecycle/deprecated state. | plan-review:Internal contradiction | Minor | Low | open | — |

## Out of Scope

- Re-specifying or modifying the engraved-knowledge frontmatter schema or the `smithy.engrave` authoring phases (shipped in #413/#414).
- The UI design pipeline (screens/flows, Claude Design, forge-builds-UI) — tracked under EPIC #404.
- A persisted generated engraved-index artifact (e.g. `engraved.index.json`) shared by recall/status/projection — noted as a possible future optimization, not built here.
- Any user-facing standalone `smithy.recall` command (recall is a sub-agent only).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `smithy status --format json` reports every `*.decision.md`, `*.invariant.md`, and constitution principle in the canonical directories as a first-class `engraved` record with correct kind and alignment/lifecycle.
- **SC-002**: Each of the five wired planning commands (`strike`, `ignite`, `render`, `mark`, `cut`) consults engraved knowledge in its scan phase under all three agents (Claude via sub-agent; Gemini/Codex via the degraded inline path).
- **SC-003**: Recall returns relevant records and correctly flags ≥1 invariant conflict and ≥1 superseded citation in a seeded test scenario, with zero conflict flags for divergences already covered by an `Accepted:` ledger row.
- **SC-004**: Engraving a record updates the managed block in every existing target agent-context file; a no-change re-run leaves those files byte-identical; hand-written prose is never altered.
- **SC-005**: `smithy status` shows a "Decisions & Invariants" group and emits a stale-ref warning for an artifact citing a superseded decision, plus a next-action for a drifting invariant.
- **SC-006**: `smithy.orders` scaffolds tickets for decision and invariant files and the templates parity test passes; `smithy.audit` applies the engraved checklist to an engraved record.

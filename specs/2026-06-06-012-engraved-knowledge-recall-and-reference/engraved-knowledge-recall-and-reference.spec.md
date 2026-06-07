# Feature Specification: Engraved Knowledge Recall and Reference

**Spec Folder**: `2026-06-06-012-engraved-knowledge-recall-and-reference`
**Branch**: `feature/epic-412-engraving-decisions` *(pre-staged linked worktree on the epic branch; preserved per the branch-selection policy rather than auto-named)*
**Created**: 2026-06-06
**Status**: Draft
**Input**: User feature description + GitHub EPIC #412 ("Engraved durable knowledge — decisions/invariants/principles"). The authoring half (#413 schema, #414 `smithy.engrave`) is already shipped. This spec covers the **reference** half — surfacing engraved knowledge during planning (recall, #415), pointing arbitrary agents at it (projection, new), and tooling it for orders/audit (#418). Status-subsystem integration (#416/#417) was scoped **out** during PR review (see Out of Scope).

## Clarifications

### Session 2026-06-06

- _Scope (post PR-review): this spec covers recall (#415), a new engrave→agent-context projection pointer, and orders/audit tooling (#418). Status-subsystem integration (#416 scanner/parser/classifier, #417 graph/surface/stale-ref) is **deferred** — engraved knowledge does not belong in the build-status rollup ("status is about work to be done"). It is surfaced via recall and the projection pointer instead._ `[Critical Assumption]`
- _Recall is a planning-time **sub-agent** (`smithy-recall`) dispatched only by planning commands — it is **not** user-invocable and exposes no ad-hoc command surface._
- _Recall reads engraved record files directly (Grep/Glob/Read, modeled on `smithy-scout`); with status integration out of scope, it always reads record frontmatter as the source of truth (no dependency on a status index)._ `[Critical Assumption]`
- _The Agents.md/Claude.md reference capability is a new **projection step on `smithy.engrave`** that maintains a managed, regenerable block containing a **pointer** to the engraved-knowledge locations plus a short applicability note — not a copy of the records. The reading agent decides how much to load._ `[Critical Assumption]`
- _The #418 "orders" half is reinterpreted: engraved records are durable knowledge, not a fan-out work hierarchy, so they do **not** become `smithy.orders` artifact types. The only engraved↔issue seam is a **drift-tracking issue** scaffolded at the engrave exception step when a `Temporary:` exception is added, filling the schema's existing `Tracking Issue` ledger column. (User-confirmed.)_
- _The engraved-knowledge frontmatter schema (kinds, fields, suffixes, ledger column order) is **frozen** and owned by `src/templates/agent-skills/commands/smithy.engrave.prompt`. This spec references it as the source of truth and does not redefine it._

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

Engraved records (decisions, invariants, principles) are **roots** — they participate via citation / supersedes / establishes edges declared in frontmatter, never as `## Dependency Order` rows. This feature only **reads and points at** those records; it does not change the engraved schema.

## User Scenarios & Testing *(mandatory)*

### User Story 1: Planning Commands Recall Relevant Engraved Knowledge (Priority: P1)

As a developer (or arbitrary agent) running a smithy planning command, I want the command to surface the decisions, invariants, and principles relevant to the work at hand — and to flag when my new work conflicts with an invariant or cites a superseded decision — so that durable commitments actively steer new plans instead of being silently ignored.

**Why this priority**: The headline value of the epic and the user's primary ask ("update the various smithy skills to reference these engraved pieces of information"). Maps to sub-issue #415.

**Independent Test**: With a few engraved records present, invoke a planning command's scan phase against a feature description whose topics overlap one invariant and cite a superseded decision; confirm the command receives a ranked list of relevant records plus a conflict flag and a superseded-citation flag, and folds them into clarification.

**Acceptance Scenarios**:

1. **Given** engraved records exist and a planning context with topic/scope hints, **When** the `smithy-recall` sub-agent is dispatched, **Then** it returns decisions/invariants/principles ranked by relevance computed from `domain`/`topics`/`scope`/`applies_to` overlap, each with a one-line relevance basis.
2. **Given** the proposed work would contradict an invariant's `## Rule`, **When** recall runs, **Then** it returns that invariant as a **candidate new exception** (a soft flag, not a hard block) — unless an existing `Accepted:` ledger row already covers that divergence, in which case it is not re-flagged.
3. **Given** the planning artifact or proposed work cites a decision whose `status` is `superseded` or `deprecated`, **When** recall runs, **Then** it reports a superseded/deprecated-citation hazard, reading lifecycle from the record frontmatter as ground truth — it does not independently re-derive supersession.
4. **Given** a feature that spans both `system` and `design` work, **When** recall runs, **Then** it queries both domain partitions; **Given** single-domain work, **Then** it filters to that domain.
5. **Given** no engraved records exist in the repo, **When** recall runs, **Then** it returns a well-formed empty result (`empty: true` with an `empty_reason`) and the planning command proceeds normally — it does not error.
6. **Given** the `{{>consult-engraved-knowledge}}` snippet is wired into the scan phase of `strike`, `ignite`, `render`, `mark`, and `cut`, **When** any of those commands runs under Claude, **Then** it dispatches `smithy-recall`; **When** run under Gemini or Codex (which have no sub-agents), **Then** the inlined snippet's degraded path reads the engraved scan roots directly so engraved knowledge is still consulted.

---

### User Story 2: Engrave Projects an Engraved-Knowledge Pointer into Agent-Context Files (Priority: P1)

As a developer who just engraved or superseded a record, I want `smithy.engrave` to maintain a managed block in the repo's agent-context files (CLAUDE.md / AGENTS.md) that **points** arbitrary agents at the engraved-knowledge locations and tells them to check those for applicability — so that any agent, not just smithy commands, knows durable knowledge exists without the records being copied into the context file.

**Why this priority**: The user's explicit second ask ("ask it to update some Agents.md/Claude.md file to reference said decisions"). New capability with no sub-issue. Deliberately a pointer, not a copy, so the reading agent controls how much it loads into context.

**Independent Test**: Engrave a decision in a repo whose CLAUDE.md has hand-written prose but no markers; confirm a marked pointer block is added referencing the engraved-knowledge directories, the hand-written prose is untouched, and re-running with no record change leaves the file byte-identical.

**Acceptance Scenarios**:

1. **Given** an agent-context file with no managed markers, **When** a record is engraved/superseded, **Then** a block delimited by `<!-- smithy:engraved:begin -->` / `<!-- smithy:engraved:end -->` is added at a defined anchor, and no content outside the markers is modified.
2. **Given** the block, **When** it is generated, **Then** its content is a **pointer**: the engraved-knowledge locations present in the repo (e.g. `docs/decisions/`, `docs/invariants/`, `docs/constitution/`, plus design-domain variants when present) and a short note instructing agents to read those records and judge their applicability to the work at hand. It does **not** inline record bodies or a per-record list.
3. **Given** the file already contains the marker pair, **When** projection runs, **Then** only the content between the markers is replaced; **Given** the present engraved-knowledge locations are unchanged, **Then** the file is byte-identical (idempotent).
4. **Given** a configured agent-context target file that does not exist on disk, **When** projection runs, **Then** that target is skipped (projection manages existing files only and never creates new ones); present targets are each updated.
5. **Given** a file whose markers are malformed or duplicated, **When** projection runs, **Then** it aborts the projection for that file with a warning rather than guessing where the block belongs, and the engrave operation itself still succeeds.

---

### User Story 3: Engrave Scaffolds a Drift-Tracking Issue for Temporary Exceptions (Priority: P2)

As a developer adding a `Temporary:` exception to an invariant, I want `smithy.engrave` to open a GitHub issue for closing that drift and record its number in the ledger so that every known divergence from a durable rule is tracked as real, actionable work with a clear done-condition.

**Why this priority**: This is the one genuine "engraved → work" seam — a `Temporary:` exception is, by definition, drift the team intends to fix. It reinterprets the orders half of #418: rather than treating a decision/invariant as a new `smithy.orders` artifact type (engraved records have no sub-elements, no `## Dependency Order` table, and are durable commitments rather than work to be done — the same reason status integration was dropped), the capability lives at the engrave exception step and fills the schema's existing `Tracking Issue` ledger column.

**Independent Test**: Add a `Temporary:` exception to an invariant via `smithy.engrave <invariant> exception`; confirm a GitHub issue is created describing the drift and citing the invariant, and the new ledger row's `Tracking Issue` cell holds the returned `#NNN`.

**Acceptance Scenarios**:

1. **Given** `smithy.engrave <invariant-path> exception` adds a `Temporary:` row, **When** the row is written, **Then** a GitHub issue is scaffolded (via the `smithy.gh-issue` skill) titled from the divergence and bodied with the invariant id/title, the divergence, and the establishing decision(s), and its `#NNN` is written into that row's `Tracking Issue` column.
2. **Given** an `Accepted:` exception is added (a permanent carve-out, not drift), **When** the row is written, **Then** no issue is created and the row's `Tracking Issue` cell stays `—`.
3. **Given** issue creation fails (auth/network), **When** the exception is added, **Then** the ledger row is still written (with `Tracking Issue` left `—`) and the failure is surfaced — the engrave operation does not roll back.
4. **Given** a `Temporary:` exception is later resolved (drift closed, or converted to `Accepted:`), **When** the ledger is updated, **Then** engrave leaves the linked drift-tracking issue **open** for a human to close — it does not auto-close or comment on the issue (engrave mutates GitHub only on exception creation).

---

### User Story 4: Audit Validates Engraved Record Quality (Priority: P3)

As a developer auditing a durable-knowledge record, I want `smithy.audit` to check engraved records against a dedicated checklist so that decisions, invariants, and principles stay well-formed as they proliferate.

**Why this priority**: A safety net rather than core capability; deferrable. Maps to the audit half of #418.

**Independent Test**: Run `smithy.audit` against an invariant missing its citations and confirm the engraved checklist flags it.

**Acceptance Scenarios**:

1. **Given** an engraved record path, **When** `smithy.audit` selects a checklist by artifact type, **Then** it uses the new `audit-checklist-engraved` snippet (the audit type-selection mechanism is extended to recognize engraved records).
2. **Given** a decision, **When** audited, **Then** the checklist verifies it states a desired invariant where applicable, that `establishes`/`established_by` reciprocity holds, and that no citation points at a superseded decision.
3. **Given** an invariant, **When** audited, **Then** the checklist verifies it cites its establishing decisions, keeps a Known-Exceptions ledger with the load-bearing column order, and exposes no silent divergence.
4. **Given** any engraved record, **When** audited, **Then** the checklist applies the inclusion test (is the record genuinely pivot-level?).

### Edge Cases

- **Already-accepted exceptions**: recall must suppress a conflict flag when an `Accepted:` ledger row already covers the divergence.
- **`deprecated` vs `superseded` decisions**: retired-without-replacement vs replaced-by-new-decision drive different recall guidance.
- **Projection coexisting with hand-written prose**: the root CLAUDE.md already has a hand-written "Engraved Knowledge" section with no markers; the projection pointer block must be a distinct region and never overwrite that prose.
- **No engraved-knowledge directories present**: projection on first engrave creates the directories' pointer based on what exists; recall and projection both behave gracefully when no records/directories exist.
- **Cross-domain `design` locations**: `docs/design/{decisions,invariants,constitution}` handling for recall and the projection pointer is optional (see SD-002).
- **Principle discovery without a suffix**: recall and the projection pointer locate principles by the constitution directory, not by a suffix.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| US1 | Planning Commands Recall Relevant Engraved Knowledge | — | — |
| US2 | Engrave Projects an Engraved-Knowledge Pointer into Agent-Context Files | — | — |
| US3 | Engrave Scaffolds a Drift-Tracking Issue for Temporary Exceptions | — | — |
| US4 | Audit Validates Engraved Record Quality | — | — |

All four user stories are independent — four parallel entry points with no cross-story prerequisites. They share only the frozen engraved-record frontmatter schema as a read-only input.

## Requirements *(mandatory)*

### Functional Requirements

**Recall (US1, #415)**

- **FR-001**: The system MUST provide a read-only `smithy-recall` sub-agent (tools `Read`, `Grep`, `Glob`; non-interactive; modeled on `smithy-scout`; not user-invocable) that reads engraved record files directly and returns records ranked by relevance computed from `domain`/`topics`/`scope`/`applies_to` overlap with the planning context.
- **FR-002**: Recall MUST flag proposed work that conflicts with an invariant `## Rule` as a candidate new exception (soft flag), suppressing the flag when an existing `Accepted:` ledger row already covers the divergence.
- **FR-003**: Recall MUST flag citations (in the planning context or draft artifact) to `superseded` or `deprecated` records, reading record lifecycle from frontmatter as read-only ground truth; it MUST NOT independently recompute the supersession/establishes graph.
- **FR-004**: Recall MUST be domain-aware: it queries `system`, `design`, or both partitions according to the planning context's domain, and MUST return a well-formed empty result (`empty: true` with an `empty_reason` distinguishing "no records exist" from "records exist, none matched") when nothing applies.
- **FR-005**: The system MUST provide a `consult-engraved-knowledge` snippet wired into the scan phase of `strike`, `ignite`, `render`, `mark`, and `cut`. The snippet MUST be self-sufficient: a Claude fast-path that dispatches `smithy-recall`, plus an inline degraded path (read the scan roots directly) for Gemini/Codex, which have no sub-agents. It MUST be registered in `snippets/README.md`.
- **FR-006**: Planning commands MUST fold recall's conflict and superseded-citation findings into their clarification/debt handling.

**Projection (US2, new)**

- **FR-007**: `smithy.engrave` MUST, after engraving or superseding a record, ensure a managed block delimited by `<!-- smithy:engraved:begin -->` / `<!-- smithy:engraved:end -->` exists in the repo's agent-context files, whose content is a **pointer** to the engraved-knowledge locations plus a short note instructing agents to read those records and judge applicability. The block MUST NOT inline record bodies or a per-record list.
- **FR-008**: The pointer MUST reflect the engraved-knowledge directories actually present in the repo (e.g. `docs/decisions/`, `docs/invariants/`, `docs/constitution/`, and design-domain variants when present).
- **FR-009**: Projection MUST be idempotent (a no-change re-run produces a byte-identical file), MUST replace only content between the markers, MUST never modify content outside the markers, and MUST add a fresh block at a defined anchor when no markers exist.
- **FR-010**: Projection MUST manage only agent-context files that already exist (never create missing ones) and MUST abort projection for a file whose markers are malformed/duplicated, with a warning, without failing the underlying engrave operation.

**Drift-tracking issue (US3, reinterprets #418 orders half)**

- **FR-011**: When `smithy.engrave` adds a `Temporary:` exception to an invariant's Known-Exceptions ledger, it MUST scaffold a GitHub issue for closing the drift (via the `smithy.gh-issue` skill's create-issue script — the same tooling `smithy.orders` uses) and write the returned issue number into that ledger row's `Tracking Issue` column. `Accepted:` exceptions MUST NOT create an issue (their `Tracking Issue` stays `—`).
- **FR-012**: The drift-issue body MUST identify the invariant (id, title), state the divergence, and cite the establishing decision(s). The body template lives with the engrave exception phase; engraved records MUST NOT add entries to `ORDERS_TEMPLATE_TYPES` / `ORDERS_DEFAULT_TEMPLATES` (they are not a fan-out work hierarchy).
- **FR-013**: If issue creation fails, engrave MUST still write the ledger row (with `Tracking Issue` left `—`), surface the failure, and not roll back the exception edit.

**Audit (US4, #418 audit half)**

- **FR-014**: The system MUST provide an `audit-checklist-engraved` snippet wired into `smithy.audit`'s type-selection mechanism, checking: decision states its desired invariant; invariant cites its decisions and keeps a ledger with the load-bearing column order; no citation to a superseded decision; record is genuinely pivot-level.

### Key Entities *(include if feature involves data)*

- **Engraved Record** *(reference only)*: a decision, invariant, or principle file. The on-disk schema is **frozen** and owned by `smithy.engrave.prompt`; this feature reads it but does not extend or persist it. See `engraved-knowledge-recall-and-reference.data-model.md`.
- **Known Exception**: a row in an invariant's ledger (`where`, `what diverges`, disposition `Accepted`/`Temporary`, tracking issue, severity) that recall uses to decide whether a conflict is already covered.
- **Recall Result**: the transient, prompt-layer ranked relevance + conflict/superseded findings returned by `smithy-recall` (not persisted).
- **Projection Pointer Block**: the managed, marker-delimited region written into agent-context files — a pointer to the engraved-knowledge locations, not a record copy.
- **Drift-Tracking Issue**: a GitHub issue created to close a `Temporary:` exception; its number is recorded in the ledger row's `Tracking Issue` column.

## Assumptions

- Status-subsystem integration (#416/#417) is out of scope for this spec; engraved knowledge is surfaced via recall and the projection pointer, not `smithy status`. `[Critical Assumption]`
- Recall reads engraved files directly (Grep/Glob) and treats frontmatter as ground truth, so it has no dependency on a status index. `[Critical Assumption]`
- The projection block is a pointer + applicability note, not a record index, so the reading agent controls how much it loads. `[Critical Assumption]`
- The `consult-engraved-knowledge` snippet is self-sufficient with a Claude sub-agent fast-path and an inline degraded path for Gemini/Codex. `[Critical Assumption]`
- Recall is a sub-agent dispatched only by planning commands; it is not user-invocable.
- `smithy.orders` gains no engraved artifact types; the only engraved↔issue interaction is the drift-tracking issue created at the engrave exception step for a `Temporary:` exception, which fills the schema's existing `Tracking Issue` ledger column.
- The engraved frontmatter schema is frozen and owned by `smithy.engrave.prompt`; this spec references it rather than redefining it.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Which agent-context files projection manages by default (CLAUDE.md only, also AGENTS.md, also `.github/copilot-instructions.md`) and whether the target set is configurable. | Integration | Medium | Medium | open | — |
| SD-002 | Whether the optional `design`-domain locations (`docs/design/{decisions,invariants,constitution}`) are in scope for recall and the projection pointer now, or deferred. | Functional Scope | Low | Medium | open | — |
| SD-003 | When a `Temporary:` exception is later resolved (removed or converted to `Accepted:`), whether engrave should auto-close the linked drift-tracking issue, leave it open, or comment-and-leave. | Integration | Low | Medium | resolved | Resolved 2026-06-06 — engrave leaves the linked issue **open** for a human to close. Engrave mutates GitHub only when a `Temporary:` exception is created, never on resolve. |

## Out of Scope

- **Status-subsystem integration (#416 scanner/parser/classifier, #417 graph edges/surface/stale-ref)** — making engraved records a first-class type in `smithy status` and the build rollup. Deferred and reconsidered separately; engraved knowledge "is durable commitment, not work to be done," so it is surfaced via recall and the projection pointer rather than the status rollup.
- Adding engraved artifact types (`decision`/`invariant`/`principle`) to `smithy.orders` / `ORDERS_TEMPLATE_TYPES`. Engraved records are not a fan-out work hierarchy; the only engraved↔issue interaction is the drift-tracking issue at the engrave exception step (US3).
- Re-specifying or modifying the engraved-knowledge frontmatter schema or the existing `smithy.engrave` authoring phases (shipped in #413/#414). US3 *adds* a step to the exception phase but does not change the ledger schema.
- A user-facing standalone `smithy.recall` (or `smithy.engraved`) command and any ad-hoc catalog-lookup surface — recall is a sub-agent only.
- The UI design pipeline (screens/flows, Claude Design, forge-builds-UI) — tracked under EPIC #404.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Each of the five wired planning commands (`strike`, `ignite`, `render`, `mark`, `cut`) consults engraved knowledge in its scan phase under all three agents (Claude via sub-agent; Gemini/Codex via the degraded inline path).
- **SC-002**: Recall returns relevant records and correctly flags ≥1 invariant conflict and ≥1 superseded citation in a seeded test scenario, with zero conflict flags for divergences already covered by an `Accepted:` ledger row.
- **SC-003**: Engraving a record ensures the pointer block in every existing target agent-context file; a no-change re-run leaves those files byte-identical; hand-written prose is never altered.
- **SC-004**: Adding a `Temporary:` exception via `smithy.engrave` creates a drift-tracking GitHub issue and writes its `#NNN` into the ledger row; an `Accepted:` exception creates none; `smithy.audit` applies the engraved checklist to an engraved record.

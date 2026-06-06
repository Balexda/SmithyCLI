# Data Model: Engraved Knowledge Recall and Reference

## Overview

This model describes how engraved records (decisions, invariants, principles) are
represented **in the status subsystem's memory** once discovered, plus the
transient shapes used by recall and projection. The authoritative **on-disk**
frontmatter schema is owned by
[`src/templates/agent-skills/commands/smithy.engrave.prompt`](../../src/templates/agent-skills/commands/smithy.engrave.prompt)
and is **frozen** — this model references it as the source of truth and only adds
the consuming representations. Fields below mirror that schema; they are not a
redefinition.

## Entities

### 1) Engraved Record (`engraved`)

Purpose: the in-memory representation of a durable-knowledge file, added as a new
`ArtifactType` member so the scanner/classifier/graph treat it as first-class.
Unlike planning artifacts, an engraved record has **no** dependency-order table and
**no** completion rollup.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `'engraved'` | Yes | New member of the `ArtifactType` union. |
| `kind` | `EngravedKind` = `'decision' \| 'invariant' \| 'principle'` | Yes | Discriminator. |
| `id` | string | Yes | `D-<N>` / `INV-<N>` / `P-<N>` from frontmatter. |
| `domain` | `'system' \| 'design'` | Yes | Ownership/recall partition; defaults to `system`. |
| `title` | string | Yes | From frontmatter / H1. |
| `path` | string | Yes | Repo-relative file path. |
| `lifecycle` | `DecisionLifecycle` = `'proposed' \| 'accepted' \| 'superseded' \| 'deprecated'` | decisions | Decision status axis. |
| `alignment` | `Alignment` = `'aligned' \| 'drifting'` | invariants | Derived from the ledger. |
| `principleStatus` | `'active'` | principles | Principles have a single status. |
| `supersedes` | string[] | decisions | Decision IDs this record replaces (`[]` if none). |
| `superseded_by` | string[] | decisions | Decision IDs that replaced this one. |
| `establishes` | string[] | decisions | Invariant IDs this decision establishes. |
| `established_by` | string[] | invariants | Decision IDs that established this invariant (≥1). |
| `exceptions` | `KnownException[]` | invariants | Parsed ledger rows; empty for the em-dash placeholder. |
| `topics` | string[] | Yes | Recall/filter metadata (not graph edges). |
| `scope` | string[] | Yes | Recall/filter metadata. |
| `applies_to` | string[] | Yes | Recall/filter metadata. |

Validation rules:
- An engraved record never carries a `dependency_order` table; the parser must not
  emit a `format: 'missing'` / `unknown` classification for it.
- Decisions use `lifecycle`; invariants use `alignment`; principles use
  `principleStatus`. The three are distinct axes — none is the planning `Status`.
- `topics`/`scope`/`applies_to` are opaque carried strings for recall/filtering, not
  promoted into the status graph type surface.

### 2) Known Exception (`KnownException`)

Purpose: one row of an invariant's Known-Exceptions ledger; the unit that drives
alignment.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `where` | string | Yes | Repo-relative path, module, or surface. |
| `what` | string | Yes | What reality does vs. what the rule says. |
| `disposition` | `'Accepted' \| 'Temporary'` | Yes | Canonical capitalized token from the ledger. |
| `why` | string | Yes | Reason text following the disposition token. |
| `tracking_issue` | string \| null | Yes | `#NNN` for `Temporary` rows; `—`/null for `Accepted`. |
| `severity` | `'low' \| 'medium' \| 'high'` | Yes | High rows may block compounding planning artifacts. |

Validation rules:
- The single em-dash placeholder row (`—` in every column) parses to **zero**
  exceptions.
- Alignment derivation: `drifting` iff ≥1 `Temporary:` row is present; `Accepted:`
  rows alone never flip to `drifting`.
- Column order is load-bearing and fixed by the engrave schema:
  `Where | What diverges | Disposition + Why | Tracking Issue | Severity`.

### 3) Recall Result (transient, prompt-layer — not persisted)

Purpose: the structured return of the `smithy-recall` sub-agent.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `relevant` | RelevantRecord[] | Yes | Ranked; each has id, kind, title, path, one-line relevance basis. |
| `conflicts` | ConflictFlag[] | Yes | Proposed work vs. an invariant rule (candidate new exception). |
| `superseded_citations` | SupersededCitation[] | Yes | Citations to superseded/deprecated records (read-only ground truth). |
| `empty` | boolean | Yes | True when no records exist or none match. |

Validation rules:
- Recall never writes files and never recomputes the supersession/establishes graph;
  lifecycle is read-only ground truth.
- A `conflict` is suppressed when an `Accepted:` ledger row already covers the
  divergence.

### 4) Projection Block (transient, prompt-layer — written into agent-context files)

Purpose: the managed, marker-delimited region maintained by `smithy.engrave`.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `beginMarker` | `'<!-- smithy:engraved:begin -->'` | Yes | Opening delimiter. |
| `endMarker` | `'<!-- smithy:engraved:end -->'` | Yes | Closing delimiter. |
| `entries` | ProjectionEntry[] | Yes | Live records (id, kind, title, status), sorted by `id`. |

Validation rules:
- Includes only live records (`accepted` decisions, `aligned`/`drifting` invariants,
  `active` principles); excludes `superseded`/`deprecated` decisions.
- Deterministic sort by `id` so a no-change re-run is byte-identical.
- Only content between markers is regenerated; content outside is never touched.

## Relationships

- Decision 1:N Invariant via `establishes` / `established_by` (an invariant traces
  back to ≥1 establishing decision).
- Decision 1:N Decision via `supersedes` / `superseded_by` (supersession chain).
- Artifact (spec/RFC/decision) N:M Invariant/Principle via `citation` edges.
- Invariant 1:N Known Exception via the ledger.

## State Transitions

### Decision lifecycle

1. `proposed` → `accepted` — decision is ratified; body becomes append-only.
2. `accepted` → `superseded` — a new decision with `supersedes: [<id>]` replaces it; `superseded_by` is appended. Never a rewrite.
3. `accepted` → `deprecated` — retired without replacement.

### Invariant alignment

1. `aligned` → `drifting` — a `Temporary:` exception row is added to the ledger.
2. `drifting` → `aligned` — all `Temporary:` rows are resolved or converted to `Accepted:`.

These transitions are authored by `smithy.engrave`; the status subsystem only
*derives and reports* the current state. The classifier computes `alignment` from
the parsed ledger; it does not mutate records.

## Identity & Uniqueness

- Records are identified by frontmatter `id` (`D-`/`INV-`/`P-` prefixes), unique and
  never reused, stable across renames.
- Discovery is by suffix (`.decision.md`, `.invariant.md`) plus directory walk of the
  constitution directory for principles (which have no suffix).
- Engraved IDs are independent of the planning `M<N>`/`F<N>`/`US<N>`/`S<N>` namespace
  and never collide with it.

## Type-Surface Audit (consumers of `ArtifactType`)

Adding `'engraved'` to `ArtifactType` requires auditing every exhaustive consumer so
none silently mishandles the new member. Known sites to verify (US1, FR-001):

- `ScanSummary.counts: Record<ArtifactType, Record<Status, number>>` (`src/status/types.ts`) — decide engraved's counting surface (recommended: a separate alignment/lifecycle count surface, not folded into the status rollup).
- Suffix/type detection and any `idPrefixForType`-style switch (`src/status/scanner.ts`).
- The classifier's type/rollup handling (`src/status/classifier.ts`).
- Graph/tree/suggester type switches (`src/status/{graph,tree,suggester}.ts`).
- `ORDERS_TEMPLATE_TYPES` and `OrdersTemplateType` (`src/orders-templates.ts`).
- Test enumerations that assume exactly four artifact types.

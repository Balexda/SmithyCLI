# Data Model: Engraved Knowledge Recall and Reference

## Overview

This feature **reads** engraved records and **points** agents at them; it adds no
persisted data structures and does not change the engraved schema. The authoritative
**on-disk** frontmatter schema is owned by
[`src/templates/agent-skills/commands/smithy.engrave.prompt`](../../src/templates/agent-skills/commands/smithy.engrave.prompt)
and is **frozen**. The entities below are (1) a read-only reference to the fields this
feature consumes and (2) the transient shapes recall and projection produce. There is
**no** status-subsystem representation here — status integration (#416/#417) is out of
scope.

## Entities

### 1) Engraved Record (reference only — not persisted by this feature)

Purpose: the fields recall (ranking, conflict, superseded-citation) and the orders/audit
tooling read from an engraved file. Documented here for traceability; **owned** by the
engrave schema, not redefined.

| Field | Type | Used by | Notes |
|-------|------|---------|-------|
| `id` | string | recall, orders, audit | `D-<N>` / `INV-<N>` / `P-<N>`. |
| `kind` | `decision \| invariant \| principle` | all | Discriminator. |
| `domain` | `system \| design` | recall, projection | Recall partition; projection pointer lists present domains. |
| `title` | string | recall, orders | From frontmatter / H1. |
| `status` | decision lifecycle (`proposed`/`accepted`/`superseded`/`deprecated`) · invariant alignment (`aligned`/`drifting`) · principle (`active`) | recall, audit | Read as ground truth; recall flags citations to `superseded`/`deprecated`. |
| `topics` / `scope` / `applies_to` | string[] | recall | Relevance-match metadata. |
| `supersedes` / `superseded_by` | string[] | recall, audit | Decision supersession edges. |
| `establishes` / `established_by` | string[] | audit | Decision↔invariant reciprocity. |
| Known-Exceptions ledger | `KnownException[]` | recall | Recall consults to suppress already-`Accepted:` conflicts. |

This feature MUST NOT add frontmatter fields, alter suffixes, or change the ledger
column order — all are frozen by the engrave schema.

### 2) Known Exception (`KnownException`)

Purpose: one row of an invariant's Known-Exceptions ledger; recall reads it to decide
whether a candidate conflict is already an accepted carve-out.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `where` | string | Yes | Repo-relative path, module, or surface. |
| `what` | string | Yes | What reality does vs. what the rule says. |
| `disposition` | `Accepted \| Temporary` | Yes | Canonical capitalized token from the ledger. |
| `why` | string | Yes | Reason text following the disposition token. |
| `tracking_issue` | string \| null | Yes | `#NNN` for `Temporary` rows; `—`/null for `Accepted`. |
| `severity` | `low \| medium \| high` | Yes | Severity of the divergence. |

Read rules (for recall):
- A divergence covered by an `Accepted:` row MUST NOT be re-flagged as a candidate
  new exception (FR-002).
- The single em-dash placeholder row represents an empty ledger (no exceptions).

### 3) Recall Result (transient, prompt-layer — not persisted)

Purpose: the structured return of the `smithy-recall` sub-agent.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `relevant` | RelevantRecord[] | Yes | Ranked; each has id, kind, title, path, one-line relevance basis. |
| `conflicts` | ConflictFlag[] | Yes | Proposed work vs. an invariant rule (candidate new exception). |
| `superseded_citations` | SupersededCitation[] | Yes | Citations to superseded/deprecated records found in the planning context. |
| `empty` | boolean | Yes | True when there is nothing to return. |
| `empty_reason` | `no_records \| no_match \| null` | Yes | Discriminates "no engraved records exist" from "records exist, none matched"; `null` when `empty` is false. |

Behavior rules:
- Recall never writes files and never recomputes the supersession/establishes graph;
  lifecycle is read-only ground truth from frontmatter.

### 4) Projection Pointer Block (transient, prompt-layer — written into agent-context files)

Purpose: the managed, marker-delimited region maintained by `smithy.engrave`. It is a
**pointer**, not a record copy.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `beginMarker` | `<!-- smithy:engraved:begin -->` | Yes | Opening delimiter. |
| `endMarker` | `<!-- smithy:engraved:end -->` | Yes | Closing delimiter. |
| `locations` | string[] | Yes | Engraved-knowledge directories present in the repo (e.g. `docs/decisions/`, `docs/invariants/`, `docs/constitution/`, design variants when present). |
| `note` | string | Yes | Short instruction: agents should read those records and judge applicability to the work at hand. |

Validation rules:
- The block lists locations only — no record bodies, no per-record list.
- Content is derived deterministically from the present directories so a no-change
  re-run is byte-identical (FR-009).
- Only content between markers is regenerated; content outside is never touched.

## Relationships

These relationships exist in the engraved records (authored by `smithy.engrave`); this
feature only reads them:

- Decision 1:N Invariant via `establishes` / `established_by`.
- Decision 1:N Decision via `supersedes` / `superseded_by`.
- Invariant 1:N Known Exception via the ledger.

## State Transitions

This feature introduces no state transitions. Engraved-record lifecycle
(`proposed → accepted → superseded | deprecated`) and invariant alignment
(`aligned ↔ drifting`) are authored by `smithy.engrave`; recall and audit only read
the current state.

## Identity & Uniqueness

- Records are identified by frontmatter `id` (`D-`/`INV-`/`P-` prefixes).
- Recall and the projection pointer locate records by the canonical directories
  (`docs/decisions`, `docs/invariants`, `docs/constitution`, and design variants),
  and by suffix (`.decision.md`, `.invariant.md`) for decisions/invariants; principles
  are found by the constitution directory (no suffix).

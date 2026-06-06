# Engraved Knowledge — Artifact Model and Frontmatter Schema

This document is the **single source of truth** for the engraved-knowledge
artifact family: **decisions**, **invariants**, and **principles**. Every
downstream sub-issue of the engraved EPIC builds on the schema below.

The canonical machine-readable counterpart lives in
[`src/engraved-templates.ts`](../src/engraved-templates.ts). When this
document changes, that file must change in lockstep (and vice-versa) — a
parity test in `src/engraved-templates.test.ts` enforces the link.

---

## What is engraved knowledge?

Engraved records capture **durable commitments** — the kind of thing that
only a substantial pivot in goals would unseat (e.g. "offline-first", "every
agent call goes through a router layer", "the constitution requires
deterministic parsing for status output").

They are pseudo-specifications: long-lived, narrowly-scoped, and cited by the
planning artifacts that depend on them. They are authored with
`smithy.engrave` (sub-issue #414), cataloged and surfaced by `smithy.recall`
(sub-issue #415), and parsed as a first-class artifact type by the status
scanner (sub-issue #416).

### Inclusion test (engrave-or-not)

Engrave commitments that survive ordinary release-to-release churn. **Do
NOT** engrave things expected to evolve every release — API contracts,
format specifications, sprint-scoped decisions. Those stay as ordinary docs
and are cited (not engraved) when they need durable referents.

### Three kinds, one family

| Kind | Role | Mutability | Status axis |
|------|------|------------|-------------|
| **decision** | Immutable record putting forward a desired rule. Citable. | Append-only; supersession replaces, never edits. | `proposed → accepted → superseded \| deprecated` |
| **invariant** | Lightweight tracker for a rule's *current alignment* with reality, with a Known-Exceptions ledger. | Living; the ledger is updated as drift is added/closed. | `aligned` ↔ `drifting` (derived from the ledger) |
| **principle** | Apex commitment — the project constitution. Cross-domain. Cited by decisions. | Rarely changes. | `active` |

### Relationship to the planning hierarchy

Engraved records are **roots**. They do not appear as rows in any planning
artifact's `## Dependency Order` table (no `M<N>`, `F<N>`, `US<N>`, or
`S<N>` ID is assigned to them). They are discovered by file suffix and
participate in the graph only through **citation edges**:

```
principle
   ↑ cited by
decision  ──establishes──▶  invariant
   ↑                            ↑
   │ cited by                   │ cited by
   │                            │
spec / .rfc.md / .features.md / .tasks.md / strike / fix
```

Edges declared in frontmatter:

- `decision.supersedes` / `decision.superseded_by` — between decisions.
- `decision.establishes` / `invariant.established_by` — decisions → invariants.

All other citation traffic (planning artifacts referencing engraved records,
principles cited by decisions) is captured in body prose, not frontmatter.

---

## Shared frontmatter

Every engraved record carries the same base frontmatter, regardless of kind.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Globally unique within the repo. Conventional prefixes: `D-` (decision), `INV-` (invariant), `P-` (principle). Stable across renames; never reused. |
| `kind` | `decision` \| `invariant` \| `principle` | Yes | Discriminator. Drives validation and the per-kind schema below. |
| `domain` | `system` \| `design` | Yes | Ownership / recall partition. Defaults to `system`. The optional `design` domain separates UI / interaction commitments owned by design; same machinery, separate directory tree. |
| `title` | string | Yes | Human-readable title. Also rendered as the H1 in the body. |
| `topics` | string[] | Yes | Searchable tags consumed by `smithy.recall`. Convention: lowercase-kebab (e.g., `offline-first`, `agent-router`). |
| `scope` | string[] | Yes | Code paths, modules, or architectural layers the record governs. Repo-relative globs or package names. |
| `applies_to` | string[] | Yes | User-visible surfaces or product components the record affects (e.g., `CLI`, `Status JSON`, `init flow`). |

Each kind extends the base with its own fields and lifecycle.

---

## Decision

An immutable record putting forward a desired rule. New facts produce new
decisions; old decisions are **superseded**, not edited.

### Decision frontmatter

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | `proposed` \| `accepted` \| `superseded` \| `deprecated` | Yes | See lifecycle below. |
| `decided_at` | ISO 8601 date (`YYYY-MM-DD`) | Yes | When the decision was first authored. Never updated, even on supersession. |
| `supersedes` | string[] | Yes | Decision IDs this decision replaces. `[]` when none. |
| `superseded_by` | string[] | Yes | Decision IDs that have replaced this one. `[]` while still active; populated when a newer decision supersedes it. |
| `establishes` | string[] | Yes | Invariant IDs this decision establishes. `[]` when none. |

### Decision lifecycle

```
proposed ──accept──▶ accepted ──supersede──▶ superseded
                          │
                          └────deprecate────▶ deprecated
```

- **proposed** — drafted but not yet ratified. Cite-able but not load-bearing.
- **accepted** — ratified; the canonical, load-bearing decision.
- **superseded** — replaced by a newer decision. `superseded_by` lists the
  replacement(s). The body is left intact (immutable record).
- **deprecated** — retired without a replacement (the commitment is no
  longer relevant). No `superseded_by`.

### Suffix and location

- Suffix: `*.decision.md`
- Default location (system domain): `docs/decisions/`
- Default location (design domain): `docs/design/decisions/`

### Body structure

A decision body has these `##` sections, in order:

1. **Context** — what prompted the decision; what was on the table.
2. **Decision** — the rule being put forward, stated in the present tense.
3. **Consequences** — what follows from the decision (good and bad).
4. **Establishes** — when `establishes` is non-empty, prose describing the
   invariants this decision creates. Otherwise the section is "None."
5. **Citations** — inbound principles cited and outbound references this
   decision relies on.

### Example: a decision record

```markdown
---
id: D-014
kind: decision
domain: system
title: Status output must be deterministically parseable from JSON
status: accepted
decided_at: 2026-04-12
topics: [status, deterministic-parsing, tooling]
scope: [src/cli.ts, src/commands/status.ts]
applies_to: [CLI, Status JSON, smithy.status]
supersedes: []
superseded_by: []
establishes: [INV-007]
---
# Status output must be deterministically parseable from JSON

## Context

The `smithy.status` skill answers natural-language questions ("what's
next?", "which user stories are blocked?") by shelling out to the CLI.
We need the JSON output of `smithy status --format json` to be a
complete, lossless description of the planning graph so the skill never
asks an LLM to reconstruct status from prose.

## Decision

Every status surface the CLI emits — slices, stories, features,
milestones, debt rows, engraved records — must appear in the JSON
payload with the same fields the human-readable table renders. The skill
parses the JSON; it does not infer.

## Consequences

- New artifact families (e.g., engraved records, this EPIC) MUST extend
  the JSON schema before they can be surfaced by `smithy.status`.
- Adding a column to a human-readable status table requires a matching
  JSON field; otherwise the skill answers stale.
- Bench tests can assert against the JSON payload directly, no LLM in
  the loop.

## Establishes

INV-007 ("Status JSON is a superset of every human-readable status
table") — derived from this decision and tracked separately so we can
catalog ledger drift if a new table column ships ahead of the JSON
schema.

## Citations

- Principle: P-001 (Constitution) — "tooling never asks an LLM to
  reconstruct deterministic data".
```

---

## Invariant

A lightweight tracker for the *current* alignment between a desired rule
and reality. The rule body is short; the **Known-Exceptions ledger** is the
load-bearing part.

### Invariant frontmatter

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | `aligned` \| `drifting` | Yes | Derived from the ledger. `drifting` whenever the ledger contains at least one `temporary` row; otherwise `aligned`. Recorded in frontmatter for fast catalog queries but the ledger is the primary source of truth. |
| `established_by` | string[] | Yes | Decision IDs that established this invariant. Required (an invariant always traces back to at least one decision). |

### Suffix and location

- Suffix: `*.invariant.md`
- Default location (system domain): `docs/invariants/`
- Default location (design domain): `docs/design/invariants/`

### Body structure

1. **Rule** — the desired rule stated in the present tense (1–2 paragraphs
   max). Mirrors the establishing decision's "Decision" section, condensed.
2. **Rationale** — one paragraph; why this is worth tracking. Pointer to
   the establishing decision(s) for the full argument.
3. **Known Exceptions** — the ledger (table below).
4. **Citations** — establishing decisions and any planning artifacts that
   reference this invariant.

### Known-Exceptions ledger

The ledger is a 5-column Markdown table immediately under the `## Known
Exceptions` heading. It MUST use these exact column headers, in this order:

| Column | Type | Description |
|--------|------|-------------|
| **Where** | string | Repo-relative path, module, or product surface where the divergence exists. |
| **What diverges** | string | What reality does, vs. what the rule says. One sentence. |
| **Disposition + Why** | `Accepted: <reason>` \| `Temporary: <reason>` | `Accepted` is a permanent carve-out the team has chosen to live with; `Temporary` is a known gap with an open tracking issue. |
| **Tracking Issue** | string | Repo-issue reference (`#NNN`) for `Temporary` rows; `—` for `Accepted` rows. |
| **Severity** | `low` \| `medium` \| `high` | Authoring judgment. `high` rows MAY block planning artifacts that would compound the drift. |

**Empty ledger** — write a single row with `—` in every cell. An empty
ledger does NOT mean "no exceptions allowed"; it means none have been
discovered yet.

**Alignment derivation rule** — `status: aligned` when the table contains
zero `Temporary` rows; `status: drifting` when it contains at least one.
`Accepted` rows alone never flip the status to `drifting`.

### Example: an invariant record

```markdown
---
id: INV-007
kind: invariant
domain: system
title: Status JSON is a superset of every human-readable status table
status: drifting
topics: [status, deterministic-parsing, tooling]
scope: [src/commands/status.ts, src/templates/agent-skills/skills/smithy.status/SKILL.prompt]
applies_to: [CLI, Status JSON, smithy.status]
established_by: [D-014]
---
# Status JSON is a superset of every human-readable status table

## Rule

Every field, column, badge, or marker that appears in any
human-readable `smithy status` table MUST also appear in the
corresponding entry of `smithy status --format json`. The JSON is the
authoritative payload; the human renderer is a view over it.

## Rationale

Without the superset guarantee, the `smithy.status` skill has to choose
between asking the LLM to reconstruct missing fields (forbidden by D-014)
and silently degrading to "I don't know". See D-014 for the full
argument.

## Known Exceptions

| Where | What diverges | Disposition + Why | Tracking Issue | Severity |
|-------|---------------|-------------------|----------------|----------|
| Engraved records (this EPIC) | The human-readable status table will gain an "Engraved" panel before the JSON schema is extended to include engraved records. | Temporary: status scanner work tracked under #416; renderer ships ahead of JSON. | #416 | medium |

## Citations

- D-014 — Status output must be deterministically parseable from JSON
  (establishing decision).
- P-001 — Constitution: tooling never asks an LLM to reconstruct
  deterministic data.
```

---

## Principle

Apex commitments — the project constitution. Cross-domain. Rarely changes.
Everything else cites them.

### Principle frontmatter

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | `active` | Yes | The only valid value. Principles are not lifecycled the way decisions are; a principle that no longer applies is removed from the constitution in a single discrete change, not deprecated. |

### Suffix and location

- Each principle is its own record with its own `kind: principle`
  frontmatter and its own file. The constitution directory
  (`docs/constitution/`, or `docs/design/constitution/` for the design
  domain) holds them; they live as separate `.md` files named after the
  principle's slug. Principles do **not** carry a dedicated suffix
  because the family is intentionally small and centralized — the
  directory walk is sufficient discovery.
- The "constitution" is the union of every `kind: principle` file in the
  constitution directory.

### Body structure

1. **Statement** — the principle in one paragraph (the rule).
2. **Why this is apex** — what makes this load-bearing, cross-domain, and
   resistant to release-to-release churn. Distinguishes it from a decision.
3. **How decisions cite this** — guidance for authors of decisions that
   need to cite this principle (what to say, what NOT to say, what the
   principle does and does not commit to).

### Example: a principle record

```markdown
---
id: P-001
kind: principle
domain: system
title: Tooling never asks an LLM to reconstruct deterministic data
topics: [deterministic-parsing, tooling, llm-discipline]
scope: [src/]
applies_to: [CLI, sub-agents, skills]
status: active
---
# Tooling never asks an LLM to reconstruct deterministic data

## Statement

When Smithy needs to answer a question whose answer can be computed
from on-disk artifacts and CLI output, the answer MUST come from a
deterministic parser. LLM reconstruction is reserved for genuinely
ambiguous prose interpretation, never for status, dependency graphs,
file structure, or other machine-checkable facts.

## Why this is apex

Cross-domain: applies equally to status surfaces, planning artifacts,
PR creation, and skill loading. Resistant to churn: every release that
touches deterministic data inherits this commitment without
renegotiation. Without it, "the LLM made it up" becomes a permanent
class of regression.

## How decisions cite this

Cite this principle when a decision constrains how Smithy emits or
consumes structured data (e.g., D-014: status JSON as the
authoritative payload). Do NOT cite this principle to forbid LLM use
in prose generation (artifact drafting, narrative review, prose
refinement) — that is in scope.
```

---

## Templates

The per-kind scaffold strings live in
[`src/engraved-templates.ts`](../src/engraved-templates.ts) (exported as
`ENGRAVED_DEFAULT_TEMPLATES`). `smithy.engrave` (#414) will substitute
`{{variable}}` placeholders when authoring a new record.

The template strings include the full YAML frontmatter and the required
section headings listed in `ENGRAVED_REQUIRED_SECTIONS`, so a freshly
engraved file is structurally complete before the author adds any prose.

---

## Where this gets used downstream

| Sub-issue | What it builds on the schema |
|-----------|-------------------------------|
| #414 `smithy.engrave` | Authoring command. Reads the scaffold templates above, scaffolds a new record, and applies the frontmatter shape. |
| #415 `smithy.recall` + consult-engraved snippet | Catalog and planning-time recall. Discovers decision and invariant records by suffix (`*.decision.md`, `*.invariant.md`) and principle records by walking the constitution directory (principles have no suffix); reads `topics` / `scope` / `applies_to`, flags supersession and drift. |
| #416 Status scanner / parser / classifier | Engraved as a first-class type. Parses frontmatter against the discriminated union; classifies by `kind`; reports `status` per kind's lifecycle. |
| #417 Graph edges + stale-ref check | Walks `supersedes` / `superseded_by` / `establishes` / `established_by`. Flags references to superseded or deprecated decisions. |
| #418 Orders templates + engrave audit checklist | Issue body templates for engraving work; audit checklist asserts the body structure listed above (e.g., the Known-Exceptions ledger column shape). |

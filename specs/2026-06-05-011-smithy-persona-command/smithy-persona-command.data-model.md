# Data Model: smithy.persona Command and Ignite Persona Reuse

## Overview

This feature introduces one new artifact type — the **Persona** (`.persona.md`) —
a durable, cross-RFC description of an actor. It is plain Markdown (no machine-readable
storage backend, no database). The model below defines the file's structure, its
storage identity, and — critically — what it deliberately is **not**: it is an
*orthogonal* artifact that sits outside the RFC→Feature→Spec→Tasks dependency lineage,
exactly like `.prd.md`.

## Entities

### 1) Persona (`<slug>.persona.md`)

Purpose: Capture a reusable actor description once and reference it from many RFCs and
UX/design discussions. A single persona may be the subject of flows across multiple RFCs,
so it is owned by no single RFC.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Heading | Markdown H1 | Yes | `# Persona: <Name/Role>` — the human-readable identity. |
| `Created` | Date (`YYYY-MM-DD`) | Yes | `**Created**: YYYY-MM-DD` metadata line, mirroring spark's PRD/strike header. |
| Role & Context | Narrative prose | Yes | Who they are and the context in which they encounter the system. |
| Friction Today | Narrative prose | Yes | The specific pain they experience now. |
| What Changes | Narrative prose | Yes | How their work changes concretely when relevant capabilities ship — kept capability-neutral so the file stays reusable across RFCs (not tied to one RFC's solution). |
| Stable identity key | Field (e.g. `slug:` / `**Role**:`) | **Undecided** | Whether the file carries a machine-readable identity to make ignite matching deterministic is open — see SD-002. The schema in US1 must resolve this before US4 matching is testable. |

Validation rules:
- The body is **narrative** (character-sketch style), not a bullet enumeration —
  consistent with the smithy-prose Personas drafting contract.
- Exactly one persona per file.
- The file MUST NOT contain a `## Dependency Order` section, an M/F/US/S identifier,
  or a `## Specification Debt` table.

### What is deliberately NOT an entity

- **No persona registry / index file.** Discovery is by globbing the persona directory
  (`{{artifactsRoot}}docs/personas/*.persona.md`). A registry was considered and
  deferred (would add a drift-prone sync surface). The "no registry" decision is in
  tension with SD-002 (a per-file identity key); resolve SD-002 without reintroducing a
  central index.
- **No inline planning surfaces.** Personas are descriptive reference docs, not planning
  artifacts — they carry no debt table, no acceptance criteria, no status field.

## Relationships

- **Persona → RFC**: many-to-many and *implicit*. A persona file is referenced by an
  RFC's `## Personas` section when ignite reuses it, but the persona file holds no link
  back to any RFC (back-reference link-tracking is out of scope). The RFC `## Personas`
  entry is a **per-RFC projection** of the durable persona ("how this RFC benefits
  them"); the `.persona.md` is the RFC-agnostic **superset**. They are intentionally
  *not* byte-identical.
- **Persona ↔ Dependency lineage**: none. A persona is never a parent or child of an
  RFC/Feature/Spec/Tasks row and never appears in a `## Dependency Order` `Artifact`
  cell.

## State Transitions

A persona file has a minimal lifecycle in v1:

1. `absent` → `created`
   - Trigger: `smithy.persona` writes the file (free-text or RFC mode).
   - Effects: a new `.persona.md` appears at the documented path.

2. `created` → `created` (collision, RFC mode)
   - Trigger: RFC mode targets a slug that already exists.
   - Effects: **skip-and-report** — the existing file is left untouched; the persona is
     reported as skipped. No overwrite.

> An explicit `created` → `updated` (re-run updates in place) transition is **deferred**
> (Out of Scope). v1 never mutates an existing persona file.

## Identity & Uniqueness

- A persona is identified on disk by its **filename slug** (`<slug>.persona.md`),
  kebab-case, derived from the persona name/role. No date or sequence prefix — identity
  is stable so the same file is reusable across RFCs over time.
- Whether the slug alone is the matching key for ignite reuse, or whether a richer
  in-file identity field is needed, is **open (SD-001, SD-002)**. Slug collision (two
  distinct personas inferring the same slug) is handled by skip-and-report; *semantic
  matching* (does an existing persona cover a needed RFC persona) is the harder,
  unresolved question.

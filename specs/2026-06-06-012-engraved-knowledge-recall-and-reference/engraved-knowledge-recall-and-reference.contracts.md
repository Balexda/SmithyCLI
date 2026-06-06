# Contracts: Engraved Knowledge Recall and Reference

## Overview

This feature introduces prompt-layer and template contracts that share one frozen
input — the engraved-record frontmatter schema (owned by `smithy.engrave.prompt`):

- the `smithy-recall` sub-agent and the `consult-engraved-knowledge` snippet (recall),
- the `smithy.engrave` projection-pointer step,
- the orders templates and the `audit-checklist-engraved` snippet.

There is no status-subsystem contract here — graph edges, stale-ref detection, and
status surfacing (#416/#417) are out of scope. Engraved record lifecycle is read by
recall as read-only ground truth from frontmatter.

## Interfaces

### `smithy-recall` Sub-Agent

**Purpose**: surface engraved records relevant to a planning context and flag
conflicts and superseded citations.
**Consumers**: the scan phase of `strike`, `ignite`, `render`, `mark`, `cut` (via the
`consult-engraved-knowledge` snippet). **Not user-invocable** — dispatched only by
those planning commands.
**Providers**: a new read-only sub-agent at
`src/templates/agent-skills/agents/smithy.recall.prompt` (frontmatter `name: smithy-recall`, `tools: [Read, Grep, Glob]`, `model: sonnet`), modeled on `smithy.scout.prompt`. Deployed to `.claude/agents/` only (Claude sub-agents).

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `planning_context` | text | Yes | Artifact type, goals, and the in-progress draft/feature description. |
| `domain_hint` | `system \| design \| both` | No | Which domain partition(s) to query; inferred when absent. |
| `topics`/`scope`/`applies_to` hints | string[] | No | Extracted from the work to seed relevance matching. |
| `scan_roots` | string[] | No | Engraved directories to read (defaults to canonical locations). |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `relevant` | RelevantRecord[] | Ranked records with id, kind, title, path, one-line relevance basis. |
| `conflicts` | ConflictFlag[] | Proposed work vs. an invariant rule — a candidate new exception (soft). |
| `superseded_citations` | SupersededCitation[] | Citations to superseded/deprecated records. |
| `empty` | boolean | True when there is nothing to return. |
| `empty_reason` | `no_records \| no_match \| null` | Why the result is empty (`null` when `empty` is false). |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| No engraved records in repo | `empty: true, empty_reason: "no_records"` | Common in fresh repos; caller proceeds normally. |
| Records exist, none match | `empty: true, empty_reason: "no_match"` | Non-blocking. |
| Divergence already `Accepted:` | omit from `conflicts` | Suppress conflict flags already covered by an accepted ledger row. |

### `consult-engraved-knowledge` Snippet

**Purpose**: a parameter-free, self-contained partial included at each planning
command's scan phase that consults engraved knowledge and folds findings into
clarification.
**Consumers**: `strike`, `ignite`, `render`, `mark` (Phase 1.5), `cut` (Phase 2.5).
**Providers**: `src/templates/agent-skills/snippets/consult-engraved-knowledge.md`
(registered in `snippets/README.md`).

#### Signature

`{{>consult-engraved-knowledge}}` — inlined at deploy time into all three agents.

#### Behavior

| Path | Behavior |
|------|----------|
| Claude | Dispatch the `smithy-recall` sub-agent with the planning context. |
| Gemini / Codex (no sub-agents) | Degraded inline path: `Read`/`Grep` the engraved scan roots directly and apply the same relevance/conflict/superseded reasoning inline. |
| Handling | Conflicts → fold into clarification (candidate exceptions); superseded citations → flag; clean/empty → proceed. |

### `smithy.engrave` Projection-Pointer Step

**Purpose**: maintain a managed pointer block in agent-context files after an
engrave/supersede.
**Consumers**: arbitrary agents reading CLAUDE.md / AGENTS.md.
**Providers**: a new phase appended to `smithy.engrave.prompt`.

#### Managed-Block Grammar

```
<!-- smithy:engraved:begin -->
This repository maintains engraved durable knowledge (decisions, invariants,
principles). Read the records under these locations and judge their applicability
before planning or making changes:
- docs/decisions/
- docs/invariants/
- docs/constitution/
<!-- smithy:engraved:end -->
```

The location list reflects the directories actually present in the repo (design-domain
variants appended when present). The block is a **pointer**, not a record copy.

#### Rules

| Rule | Behavior |
|------|----------|
| Pointer-only | Content is the location list + applicability note; no record bodies or per-record list. |
| Present-locations | List reflects the engraved-knowledge directories actually present in the repo. |
| Idempotent | No-change re-run yields a byte-identical file (deterministic location ordering). |
| Replace-in-place | Only content between the markers is regenerated. |
| Prose-safe | Content outside the markers is never modified. |
| First run | Add a fresh block at a defined anchor when no markers exist. |
| Existing-only | Manage agent-context files that already exist; never create missing ones. |
| Malformed markers | Abort projection for that file with a warning; the engrave op still succeeds. |

### Orders Templates

**Purpose**: scaffold GitHub issue bodies for engraved records.
**Providers**: `src/orders-templates.ts` (`ORDERS_DEFAULT_TEMPLATES`,
`ORDERS_TEMPLATE_TYPES`) + the `smithy.orders.prompt` heredoc.

| Contract element | Requirement |
|------------------|-------------|
| New types | `decision`, `invariant` (optionally `principle` — SD-003). |
| Lockstep | Template strings added to both the TS map and the prompt heredoc. |
| Parity | `src/templates.test.ts` parity assertion extended to the new types. |
| Auto-detect | `smithy.orders` detects `.decision.md`/`.invariant.md` by suffix; principles lack a suffix (SD-003). |

### Audit Checklist

**Purpose**: validate engraved record quality.
**Providers**: `src/templates/agent-skills/snippets/audit-checklist-engraved.md` +
`smithy.audit` type-selection wiring.

| Check | Question |
|-------|----------|
| Desired invariant | Does each decision state its desired invariant where applicable? |
| Citations + ledger | Does each invariant cite its establishing decisions and keep a Known-Exceptions ledger? |
| No stale citation | Does any citation point at a superseded decision? |
| Pivot-level | Is the record genuinely pivot-level (inclusion test)? |
| Structure | Are section order and ledger column order load-bearing-correct? |

## Events / Hooks

- **Engrave/supersede → projection refresh**: completing an engrave or supersede
  operation triggers the projection-pointer step (US2) against all existing target files.
- **Planning scan → recall dispatch**: entering a planning command's scan phase
  triggers `consult-engraved-knowledge` (US1).

## Integration Boundaries

- **Recall ↔ engraved records**: recall reads engraved files directly (Grep/Glob) and
  treats frontmatter as ground truth. There is no status-index dependency.
- **Projection ↔ recall**: independent. Projection is an author-time write of a pointer
  into agent-context files; recall is a plan-time read of the records. The engraved
  record files remain the single source of truth.
- **Cross-agent deployment**: the `smithy-recall` sub-agent reaches Claude only; the
  `consult-engraved-knowledge` snippet reaches all three agents at deploy time and
  must carry the degraded inline path for Gemini/Codex.
- **Agent-context files**: projection targets are existing CLAUDE.md / AGENTS.md (and
  possibly `.github/copilot-instructions.md`) — the exact default set is unresolved
  (SD-001).

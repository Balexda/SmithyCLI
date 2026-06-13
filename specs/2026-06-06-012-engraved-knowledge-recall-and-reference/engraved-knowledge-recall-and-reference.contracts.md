# Contracts: Engraved Knowledge Recall and Reference

## Overview

This feature introduces prompt-layer and template contracts that share one frozen
input — the engraved-record frontmatter schema (owned by `smithy.engrave.prompt`):

- the `smithy-recall` sub-agent and the shared `engraved-recall-rules` snippet (recall),
- the `smithy.engrave` projection-pointer step,
- the `smithy.engrave` drift-tracking-issue step (for `Temporary:` exceptions),
- the `audit-checklist-engraved` snippet.

There is no status-subsystem contract here — graph edges, stale-ref detection, and
status surfacing (#416/#417) are out of scope. Engraved record lifecycle is read by
recall as read-only ground truth from frontmatter.

## Interfaces

### `smithy-recall` Sub-Agent

**Purpose**: surface engraved records relevant to a planning context and flag
conflicts and superseded citations.
**Consumers**: the scan phase of `strike`, `ignite`, `render`, `mark`, `cut` (via the
inline `{{#ifAgent}}` consultation block each command adds). **Not user-invocable** —
dispatched only by those planning commands.
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

### Engraved-Knowledge Consultation (inline `{{#ifAgent}}` + shared rules snippet)

Engraved consultation follows the established sub-agent-dispatch pattern
(`smithy.forge` with `tdd-protocol` / `review-protocol`): the **dispatch prose is
written inline** in each consuming command behind the zero-arg `{{#ifAgent}}`
capability gate, and the only shared file is the **rules** snippet that both the
sub-agent and the degraded branch include. There is no per-agent "consult"
snippet.

**`engraved-recall-rules` snippet**
**Purpose**: single source of truth for the recall rules (scan roots, ranking,
conflict handling, superseded/deprecated hazards, empty-state result).
**Consumers**: the `smithy-recall` sub-agent; the inline degraded branch of
`strike`, `ignite`, `render`, `mark` (Phase 1.5), `cut` (Phase 2.5).
**Providers**: `src/templates/agent-skills/snippets/engraved-recall-rules.md`
(registered in `snippets/README.md`).
**Signature**: `{{>engraved-recall-rules}}` — agent-agnostic, no conditionals.

#### Inline consultation block (per command)

```
{{#ifAgent}}<dispatch smithy-recall with the planning context>{{else}}{{>engraved-recall-rules}}{{/ifAgent}}
```

| Path | Behavior |
|------|----------|
| Sub-agent-capable (Claude, Codex) | `{{#ifAgent}}` if-branch: dispatch the `smithy-recall` sub-agent with the planning context (dispatch prose inline in the command). |
| Degraded (Gemini, no sub-agents) | `{{else}}` branch: include `{{>engraved-recall-rules}}` and `Read`/`Grep` the engraved scan roots directly, applying the same relevance/conflict/superseded reasoning. |
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

### Engrave Exception → Drift-Tracking Issue

**Purpose**: when a `Temporary:` exception is added to an invariant, scaffold a GitHub
issue for closing the drift and record its number in the ledger. This reinterprets
the #418 orders half — engraved records do **not** become `smithy.orders` artifact
types (no `ORDERS_TEMPLATE_TYPES` entries, no parity-test change).
**Consumers**: developers tracking drift; the invariant's ledger.
**Providers**: a step added to `smithy.engrave`'s exception phase, creating the issue
via the `smithy.gh-issue` skill's `create-issue` script.

| Trigger | Behavior |
|---------|----------|
| `Temporary:` exception added | Create a drift-tracking issue (title from the divergence; body = invariant id/title + divergence + establishing decision(s)); write the returned `#NNN` into the row's `Tracking Issue` column. |
| `Accepted:` exception added | No issue; `Tracking Issue` stays `—`. |
| Issue creation fails | Write the ledger row with `Tracking Issue` `—`, surface the failure, do not roll back. |
| `Temporary:` exception resolved | Leave the linked issue **open**; a human closes it. Engrave never auto-closes or comments (mutates GitHub only on creation). |

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
- **Temporary exception added → drift-tracking issue**: adding a `Temporary:` ledger
  row triggers the drift-tracking-issue step (US3) and writes the `#NNN` back.
- **Planning scan → recall dispatch**: entering a planning command's scan phase
  triggers its inline engraved-knowledge consultation block (US1).

## Integration Boundaries

- **Recall ↔ engraved records**: recall reads engraved files directly (Grep/Glob) and
  treats frontmatter as ground truth. There is no status-index dependency.
- **Projection ↔ recall**: independent. Projection is an author-time write of a pointer
  into agent-context files; recall is a plan-time read of the records. The engraved
  record files remain the single source of truth.
- **Cross-agent deployment**: the `smithy-recall` sub-agent reaches the sub-agent-capable
  agents (Claude, Codex); the inline `{{#ifAgent}}` consultation block reaches all three
  agents at deploy time — the if-branch dispatches `smithy-recall`, and the `{{else}}`
  branch carries the degraded `{{>engraved-recall-rules}}` direct-read path for Gemini.
- **Agent-context files**: projection targets are existing CLAUDE.md / AGENTS.md (and
  possibly `.github/copilot-instructions.md`) — the exact default set is unresolved
  (SD-001).

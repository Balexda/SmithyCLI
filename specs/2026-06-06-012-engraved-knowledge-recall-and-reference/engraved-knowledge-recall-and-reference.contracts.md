# Contracts: Engraved Knowledge Recall and Reference

## Overview

This feature introduces contracts at two layers that share one frozen input — the
engraved-record frontmatter schema (owned by `smithy.engrave.prompt`):

- **Prompt-layer** templates: the `smithy-recall` sub-agent, the
  `consult-engraved-knowledge` snippet, the `smithy.engrave` projection step, and the
  `audit-checklist-engraved` snippet.
- **TS-layer** code: the status type surface, parser, graph edges, stale-ref check,
  and orders templates.

The governing boundary: **the TS status subsystem is the deterministic authority**
for lifecycle, edges, and stale references; **recall is the authority only for
semantic relevance and conflict-with-proposed-work**, treating lifecycle as read-only
ground truth.

## Interfaces

### `smithy-recall` Sub-Agent

**Purpose**: surface engraved records relevant to a planning context and flag
conflicts and superseded citations.
**Consumers**: the scan phase of `strike`, `ignite`, `render`, `mark`, `cut` (via the
`consult-engraved-knowledge` snippet); also invocable ad-hoc.
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
| `empty` | boolean | True when no records exist or none match. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| No engraved records in repo | `empty: true`, no error | Common in fresh repos; caller proceeds normally. |
| Records exist, none match | `empty: true` (records-exist note) | Distinct from no-records; still non-blocking. |
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

### `smithy.engrave` Projection Step

**Purpose**: refresh a managed engraved-knowledge block in agent-context files after
an engrave/supersede.
**Consumers**: arbitrary agents reading CLAUDE.md / AGENTS.md.
**Providers**: a new phase appended to `smithy.engrave.prompt`.

#### Managed-Block Grammar

```
<!-- smithy:engraved:begin -->
<generated, deterministic list of live records — id, kind, title, status — sorted by id>
<!-- smithy:engraved:end -->
```

#### Rules

| Rule | Behavior |
|------|----------|
| Idempotent | No-change re-run yields a byte-identical file. |
| Replace-in-place | Only content between the markers is regenerated. |
| Prose-safe | Content outside the markers is never modified. |
| First run | Append a fresh block at a defined anchor when no markers exist. |
| Existing-only | Manage agent-context files that already exist; never create missing ones. |
| Malformed markers | Abort projection for that file with a warning; the engrave op still succeeds. |
| Content | Live records only (`accepted` decisions, `aligned`/`drifting` invariants, `active` principles); exclude `superseded`/`deprecated`. |

### Status Graph Edges & Stale-Ref Check (TS, deterministic authority)

**Purpose**: model engraved relationships and catch stale references.
**Providers**: `src/status/graph.ts`, surfaced via `tree.ts` and `suggester.ts`.

#### Edge Types

| Edge | From → To | Source |
|------|-----------|--------|
| `citation` | spec / RFC / decision → invariant / principle | frontmatter citations |
| `supersedes` | decision → decision | `supersedes` / `superseded_by` |
| `establishes` | decision → invariant | `establishes` / `established_by` |

#### Stale-Reference Predicate

| Condition | Output |
|-----------|--------|
| Artifact cites a decision with `lifecycle: superseded` | Stale reference (review/update). |
| Artifact cites an invariant that is `deprecated` | Stale reference (review/update) — pending SD-007 (invariants have no `deprecated` state in the frozen schema). |

The citation source for these predicates (how spec/RFC artifacts declare a citation) is unresolved — see SD-006.

The render adds a "Decisions & Invariants" group (alignment + lifecycle); the
suggester emits next-actions (drifting invariant → review exceptions; cites-superseded
→ review citation).

### Orders Templates (TS)

**Purpose**: scaffold GitHub issue bodies for engraved records.
**Providers**: `src/orders-templates.ts` (`ORDERS_DEFAULT_TEMPLATES`,
`ORDERS_TEMPLATE_TYPES`) + the `smithy.orders.prompt` heredoc.

| Contract element | Requirement |
|------------------|-------------|
| New types | `decision`, `invariant` (optionally `principle` — SD-004). |
| Lockstep | Template strings added to both the TS map and the prompt heredoc. |
| Parity | `src/templates.test.ts` parity assertion extended to the new types. |
| Auto-detect | `smithy.orders` detects `.decision.md`/`.invariant.md` by suffix; principles lack a suffix (SD-004). |

### Audit Checklist (prompt)

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
  operation triggers the projection step (US3) against all existing target files.
- **Planning scan → recall dispatch**: entering a planning command's scan phase
  triggers `consult-engraved-knowledge` (US2).

## Integration Boundaries

- **Recall ↔ status subsystem**: recall reads engraved files directly and does not
  call the status scanner; whether it consumes deterministic stale-ref output via
  `smithy status --format json` is unresolved (SD-005).
- **Projection ↔ recall**: independent. Projection is an author-time write into
  agent-context files; recall is a plan-time read. The engraved record files remain
  the single source of truth; neither reads the other's output.
- **Cross-agent deployment**: the `smithy-recall` sub-agent reaches Claude only; the
  `consult-engraved-knowledge` snippet reaches all three agents at deploy time and
  must carry the degraded inline path for Gemini/Codex.
- **Agent-context files**: projection targets are existing CLAUDE.md / AGENTS.md (and
  possibly `.github/copilot-instructions.md`) — the exact default set is unresolved
  (SD-002).

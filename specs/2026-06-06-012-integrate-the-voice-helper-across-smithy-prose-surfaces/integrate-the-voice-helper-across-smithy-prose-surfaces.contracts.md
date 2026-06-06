# Contracts: Integrate the voice helper across Smithy prose surfaces

## Overview

This feature introduces no new function or CLI surface. `smithy.helper-voice`
is a prose-only skill. The contracts below are the **invocation and finding
conventions** every integration plugs into — the already-stable two-mode skill
contract plus the new wiring conventions. They are Reference-shaped: tables and
signatures, no narrative.

## Interfaces

### Skill two-mode invocation contract (existing, unchanged)

The skill exposes two modes; this feature wires more callers to them but does
not change them.

| Mode | Caller passes | Skill returns |
|------|---------------|---------------|
| Draft | section assignment, audience (Role × Mode), length budget | prose written to budget |
| Review / cleanup | an existing artifact, file path, or pasted text | original + revised side-by-side, plus findings (anti-pattern flags, diagram suggestions, audience-tag insertions) |

### New wiring conventions introduced by this feature

| Convention | Surface | Shape |
|------------|---------|-------|
| Draft-mode load | `smithy.prose`; narrative sections of `ignite` / `render` / `mark` / `cut` / `strike`; `engrave` decision/invariant prose | `Skill("smithy.helper-voice")` invoked at draft start; no taxonomy text inlined |
| Voice review category | `smithy.refine` (parent-supplied category), `smithy.plan-review` (owned category list) | New category `Voice & Audience`; fires only on prose-bearing / Explanation sections; routes through existing triage |
| Forge skill advertisement | `smithy.forge` Operational Skills table | New row: skill name + load-when trigger (README / ADR / runbook / migration-plan / substantive inline-doc authoring) |
| Maid flag | `smithy.maid` | Voice anti-pattern emitted as a **flag** finding only — never an in-place edit |
| Trigger description | `smithy.helper-voice` frontmatter `description` | Extended so review/cleanup mode auto-activates on standalone arbitrary-text phrasings; single entry point, no new command |

#### Voice review category — finding contract

| Field | Value | Notes |
|-------|-------|-------|
| category | `Voice & Audience` | Reuses the existing `audience` / `mode` / `length` vocabulary; does not invent a parallel grammar |
| applies to | narrative (Explanation) sections of prose-bearing artifacts | Excludes Reference tables already covered by the mechanical audit tag lint |
| routing | existing read-only finding channel (RefineResult / ReviewResult); parent applies | Review agents make no in-place edits |
| volume bound | severity-capped / count-limited like other non-critical refine findings | Prevents flooding review loops and debt tables |
| overlap rule | does not re-run the mechanical tag lint owned by `smithy.audit` | Qualitative judgment vs. mechanical tag-drift |
| double-work rule | a section drafted under the skill in the current pass is not voice-reviewed in that same pass | — |

## Events / Hooks

N/A — no events or hooks are published or consumed.

## Integration Boundaries

- **`smithy.audit` voice-tag lint (shipped, #424/#435)** — mechanical: validates
  `<!-- audience: … -->` grammar and length/diagram/examples mechanics on
  tagged artifacts. This feature **consumes** that boundary unchanged; review-mode
  voice is the complementary qualitative surface and must not re-lint it.
- **`src/templates.test.ts`** — the parse contract: every new `Skill("…")`
  invocation, trimmed block, and skill-table row must keep templates parseable.
- **`npm run eval`** — the behavioral verification surface for "the agent
  actually invokes the skill" and "voice findings route through existing
  channels," since `src/templates.test.ts` only checks structure.

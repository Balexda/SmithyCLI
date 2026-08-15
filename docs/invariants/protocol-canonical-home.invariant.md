---
id: INV-1
kind: invariant
domain: system
title: "Shared protocols are composed or cited, never restated"
status: drifting
topics: [protocol-composition, snippets, drift, template-authoring]
scope: [src/templates/agent-skills/**]
applies_to: [agent-skill templates, deployed commands, sub-agents, snippets]
established_by: [D-1]
---
# Shared protocols are composed or cited, never restated

## Rule

A protocol consumed by more than one template lives in exactly one
canonical file; no template carries its own hand-written copy of the
tables, gates, enums, or contract shapes defined there. A deployable
consumer that needs the protocol at runtime composes it (`{{>snippet}}`) —
snippets are inlined at render and never deploy as standalone files, so a
deployed citation to one resolves to nothing. Citation in place of
composition is valid only where the cited home is readable from where the
text runs (source-tree docs, or another deployed file). A consumer that
needs a genuine variant records the divergence as a row in this ledger
instead of restating the protocol with local edits.

## Rationale

Hand-maintained copies of invariant-dense text drift, and drift in a
safety protocol silently changes behavior; the establishing decision (D-1)
records the evidence from the 2026-08 audit.

## Known Exceptions

| Where | What diverges | Disposition + Why | Tracking Issue | Severity |
|-------|---------------|-------------------|----------------|----------|
| `agents/smithy.clarify.prompt` Step 3b, `agents/smithy.refine.prompt` | Both compose the one `kind-gate` definition but reroute a rejected candidate differently — clarify into its assumption stream with `[Critical Assumption]`, refine into `refinements` — because neither emits a `kind` field for a parent to route on | Accepted: the gate itself is shared and identical; only the return channel differs, and each consumer states its own in two sentences beside the composed gate | — | low |
| Voice-tag grammar in `skills/smithy.helper-voice` §8, `agent-skills/README.md`, `snippets/audit-checklist-voice.md` | The same tag grammar and keys table is maintained in three places | Temporary: pick one canonical home and point the other two at it | #551 | low |

## Citations

Established by D-1. Current-state evidence and the full duplication
inventory: audit [#551](https://github.com/Balexda/SmithyCLI/issues/551); remediation [#553](https://github.com/Balexda/SmithyCLI/issues/553).

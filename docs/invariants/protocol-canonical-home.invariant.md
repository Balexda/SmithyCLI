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
canonical file. Consumers pull it in by composition (`{{>snippet}}`) or
reference it by name and location; no template carries its own hand-written
copy of the tables, gates, enums, or contract shapes defined there. A
consumer that needs a genuine variant records the divergence as a row in
this ledger instead of restating the protocol with local edits.

## Rationale

Hand-maintained copies of invariant-dense text drift, and drift in a
safety protocol silently changes behavior; the establishing decision (D-1)
records the evidence from the 2026-08 audit.

## Known Exceptions

| Where | What diverges | Disposition + Why | Tracking Issue | Severity |
|-------|---------------|-------------------|----------------|----------|
| `commands/smithy.{mark,cut,render,ignite}.prompt` (two copies each), `commands/smithy.{strike,forge}.prompt` (one each) | Parent-side triage tables are hand-copied rather than composed from `snippets/review-protocol.md`, and the copies have diverged (ignite self-contradicts on the debt-row shape) | Temporary: predates this invariant; awaiting re-canonicalization | #553 | high |
| `agents/smithy.clarify.prompt` Step 3b | A sibling kind-gate definition (third condition "no-prescription", no implementation/hygiene kinds) coexists with review-protocol's ("human-only") | Temporary: reconcile the two gates, or convert this row to Accepted with the deliberate difference stated | #553 | medium |
| Voice-tag grammar in `skills/smithy.helper-voice` §8, `agent-skills/README.md`, `snippets/audit-checklist-voice.md` | The same tag grammar and keys table is maintained in three places | Temporary: pick one canonical home and point the other two at it | #551 | low |

## Citations

Established by D-1. Current-state evidence and the full duplication
inventory: audit #551; remediation #553.

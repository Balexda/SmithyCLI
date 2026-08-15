---
id: D-1
kind: decision
domain: system
title: "Shared protocols have one canonical home"
status: proposed
decided_at: 2026-08-15
topics: [protocol-composition, snippets, drift, template-authoring]
scope: [src/templates/agent-skills/**]
applies_to: [agent-skill templates, deployed commands, sub-agents, snippets]
supersedes: []
superseded_by: []
establishes: [INV-1]
---
# Shared protocols have one canonical home

## Context

The 2026-08 template audit (#551) found the kind × severity × confidence
triage protocol — the system's central review-safety mechanism — maintained
by hand in roughly twelve places, with two non-identical "canonical"
definitions (`snippets/review-protocol.md` and `smithy-clarify` Step 3b)
and drift already landed: one command contradicts itself about how to write
a debt row. The repo's READMEs already stated a link-don't-restate rule in
prose, and it did not hold; the one surface with deterministic enforcement
(the orders parity test) largely did. The alternatives on the table were to
keep the prose rule and fix the copies, or to commit to composition as the
only mechanism for sharing protocol text.

## Decision

Every protocol shared by more than one template — a triage table, a gate
definition, an output contract, a schema — has exactly one canonical home.
Templates that need it compose it (`{{>snippet}}`) or cite it by name and
location; they never restate it. A consumer that genuinely needs a variant
declares the variance as a Known Exception on INV-1, with rationale, rather
than diverging silently.

## Consequences

Good: drift between copies becomes structurally impossible for composed
content, and deliberate variance becomes visible and auditable in a single
ledger; the re-canonicalization work (#553) gains a defined target state.
Bad: composition costs deploy size where a hand-tuned inline copy could be
shorter (weigh against P-1), and per-command variations — such as different
finding destinations per command — require the canonical home to be written
parametrically or the variance to be declared, both more design effort than
copying.

## Establishes

INV-1 — Shared protocols are composed or cited, never restated.

## Citations

P-1 (always-loaded context is a budget — composition must not multiply
weight thoughtlessly). Evidence and remediation: audit #551, sub-issue #553.

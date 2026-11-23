---
id: D-6
kind: decision
domain: system
title: "Passes preserve what earlier passes recorded"
status: proposed
decided_at: 2026-11-22
topics: [artifact-writes, specification-debt, stable-ids, template-authoring]
scope: [src/templates/agent-skills/commands/**, src/templates/agent-skills/snippets/**, src/templates/agent-skills/agents/**]
applies_to: [planning artifacts, engraved records, durable UI artifacts, deployed commands]
supersedes: []
superseded_by: []
establishes: [INV-5]
excepts: []
---
# Passes preserve what earlier passes recorded

## Context

Most Smithy commands write onto something an earlier pass produced. Some
inherit rows, some re-enter an artifact that other files cite, and some
write into a shared store. A write that assumes an empty page erases that
earlier work without any error. Once an id is cited, renumbering it makes the
citation point at the wrong item. This decision covers files and record
stores. Git and GitHub writes are D-8's.

## Decision

A command writing to an existing artifact or store keeps what is there and
changes only what the pass exists to change. Empty-state text appears only
when the section is empty. An id is never renumbered once anything
references it; new items take the next free id. A write detects a name
collision and never overwrites an existing record or durable UI artifact. A
change with two sides, such as both ends of a supersession, lands in one
commit.

## Consequences

Good: re-running a command, or running the next pipeline step, never costs
earlier work, and ids stay safe to cite.

Bad: every write needs a read-before-write. Stable ids give up a tidy order,
so priority order and id order can differ.

## Establishes

INV-5 — Passes preserve what earlier passes recorded.

## Citations

D-1.

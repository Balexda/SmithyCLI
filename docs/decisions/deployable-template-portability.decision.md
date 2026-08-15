---
id: D-2
kind: decision
domain: system
title: "Deployed templates carry only target-repo-meaningful content"
status: proposed
decided_at: 2026-08-15
topics: [template-authoring, deployables, portability]
scope: [src/templates/agent-skills/**]
applies_to: [deployed commands, prompts, sub-agents, skills, snippets]
supersedes: []
superseded_by: []
establishes: [INV-2]
---
# Deployed templates carry only target-repo-meaningful content

## Context

Templates under `src/templates/agent-skills/` deploy verbatim into
arbitrary target repositories, but they are authored inside SmithyCLI —
where references to `src/manifest.ts`, local issue numbers, spec
data-models, and this repo's settings are natural to reach for. The
2026-08 audit (#551) found such references shipped on five surfaces
(orders, spark, engrave, the survey agent, branch-policy), where they
resolve to nothing — or to an unrelated issue — in every customer repo,
plus ~1.5KB of commentary addressed to future template editors deployed as
runtime instruction. The alternatives were to keep pruning these
case-by-case in review, or to commit to a portability rule the authoring
and review passes can hold templates against.

## Decision

Deployable template content is written for the agent executing it in the
target repository. SmithyCLI-internal references — source paths and line
numbers, SmithyCLI issue or PR numbers, this repo's specs and PRDs, and
this repo's permission or settings choices — do not ship in deployable
text, and neither does prose addressed to the template's future editors.
Maintainer-facing rationale lives in source-tree-only files (directory
READMEs, engraved records) or in commit and PR messages. The acceptance
test: rendered into a fresh repo by `smithy init`, every path, reference,
and instruction in the deployed file resolves there.

## Consequences

Good: deployed prompts stop instructing agents to read files that do not
exist, issue references stop pointing at strangers' issues, and pure-weight
maintainer commentary leaves the runtime context (per P-1). Bad: authoring
rationale loses its most convenient home next to the text it explains —
maintainers must route it to READMEs or engraved records — and templates
must cite deployable homes (snippets, skills, the deployed agent-skill
tree) rather than SmithyCLI source, which is occasionally less precise.

## Establishes

INV-2 — Deployable templates read correctly outside SmithyCLI.

## Citations

P-1 (always-loaded context is a budget — internal commentary is spent
weight with no runtime value). Evidence and remediation: audit #551,
sub-issue #555.

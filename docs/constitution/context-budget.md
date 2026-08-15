---
id: P-1
kind: principle
domain: system
title: "Always-loaded context is a budget"
status: active
topics: [context-economy, skill-descriptions, agent-descriptions, progressive-disclosure]
scope: [src/templates/agent-skills/**]
applies_to: [skill registry, command invocations, sub-agent dispatch, deployed agent-skill trees]
---
# Always-loaded context is a budget

## Statement

Every byte an agent carries without asking for it — skill and command
descriptions, sub-agent advertisements, snippet text multiplied across
composed templates — is spent from a shared budget before any work begins.
Content enters the always-loaded surface only when it changes what the agent
does next: descriptions are dispatch triggers, not documentation; reference
material, worked examples, and schemas load on demand; and a snippet's cost
is its size times every deployment that composes it, not its size once in
source.

## Why this is apex

The rule is cross-domain — it governs command bodies, skill descriptions,
agent frontmatter, snippet architecture, and deploy-time rendering alike —
and no release-to-release change in Smithy's features unseats it: it follows
from how LLM context works, not from any current template's shape. The
2026-08 template audit ([#551](https://github.com/Balexda/SmithyCLI/issues/551)) found five separate surfaces drifting toward
documentation-shaped always-loaded text independently, which is the
signature of a missing constitution-level commitment rather than five local
mistakes.

## How decisions cite this

Cite P-1 when a decision trades context weight against convenience: adding
an always-advertised description, inlining a schema into a composed
template, or choosing inline content over body-on-demand loading. State
which side of the trade the decision takes and what budget it spends. Do
not cite P-1 to justify omitting content an agent needs at dispatch time —
the principle bounds unrequested context; it does not argue for
under-specification.

---
id: INV-2
kind: invariant
domain: system
title: "Deployable templates read correctly outside SmithyCLI"
status: drifting
topics: [template-authoring, deployables, portability]
scope: [src/templates/agent-skills/**]
applies_to: [deployed commands, prompts, sub-agents, skills, snippets]
established_by: [D-2]
---
# Deployable templates read correctly outside SmithyCLI

## Rule

Every deployable template — commands, prompts, agents, skills, snippets —
must read correctly in a repository that is not SmithyCLI. No deployable
content references SmithyCLI source files or line numbers, SmithyCLI issue
or PR numbers, specs or PRDs in this repo, or this repo's permission and
settings choices; no deployable prose addresses the template's future
editors. The test: rendered into a fresh repo by `smithy init`, every
**actionable** reference — a path the agent is told to read, write, or
execute; an issue or document cited as evidence; an instruction's target —
resolves there. Purely illustrative example paths inside prose are exempt
(per the carve-out in `AGENTS.md`'s deployable-template authoring rules):
an example is not an instruction.

## Rationale

Deployed text is runtime instruction for an agent standing in someone
else's repo; internal references either dead-end or mislead it, and
maintainer commentary is pure context weight. The establishing decision
(D-2) records the evidence from the 2026-08 audit.

## Known Exceptions

| Where | What diverges | Disposition + Why | Tracking Issue | Severity |
|-------|---------------|-------------------|----------------|----------|
| `commands/smithy.orders.prompt` | Cites `src/manifest.ts` / `src/commands/update.ts` line references and "the data-model row" from a SmithyCLI spec across ~8 sites | Temporary: strip or restate self-contained in the context-diet pass | #555 | medium |
| `commands/smithy.spark.prompt` (line ~290; lines ~455–476) | An FR-006 citation of the SmithyCLI-only reduce-interaction-friction spec embedded in the PRD-shape rules, plus ~1.5KB of prose addressed to future template editors with further FR-006/FR-007 citations | Temporary: strip the spec citation and relocate the editor commentary to source-tree docs | #555 | low |
| `commands/smithy.engrave.prompt`, `agents/smithy.survey.prompt`, `snippets/branch-policy.md` | SmithyCLI issue numbers (#415/#416/#418), an eval-case maintenance comment, and a repo-local allowlist note ship in deployable text | Temporary: strip or generalize | #555 | low |

## Citations

Established by D-2. Current-state evidence: audit [#551](https://github.com/Balexda/SmithyCLI/issues/551); remediation [#555](https://github.com/Balexda/SmithyCLI/issues/555).

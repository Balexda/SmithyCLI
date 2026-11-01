---
id: INV-4
kind: invariant
domain: system
title: "The planning-artifact root is declared, never inferred from the working directory"
status: aligned
topics: [artifact-root, project-stores, parallel-workstreams, multi-repo, template-authoring]
scope: [src/project-store.ts, src/commands/root.ts, src/commands/status.ts, src/engraved/roots.ts, src/templates/agent-skills/snippets/artifact-root-resolution.md]
applies_to: [deployed commands, planning artifacts, smithy root, smithy status, project stores]
established_by: [D-5]
---
# The planning-artifact root is declared, never inferred from the working directory

## Rule

Which store a planning run reads from or writes to is settled by a
declaration — an explicit `--project <slug>`, the `**Project**` header or
physical location of the artifact being worked on, or the install-time root
`smithy init` rendered — and, for reads only, by the single named store on the
machine. No code path and no deployed prompt derives a project from the name
of the working directory or of any directory above it. A write never selects a
named store that nothing declared: it falls through to the install root and
says so. The resolution is performed by `smithy root` and the agent applies
its result as a literal prefix replacement; a deployed prompt never asks the
agent to work out the root for itself.

## Rationale

A guessed root scatters one workstream's artifacts across two stores, or
redirects every workstream on a machine into whichever project was created
last — both silent, both found only when a downstream command cannot find its
input. The establishing decision (D-5) records the observed failure and why
the alternatives that infer from the current directory were rejected.

## Known Exceptions

| Where | What diverges | Disposition + Why | Tracking Issue | Severity |
|-------|---------------|-------------------|----------------|----------|
| `src/project-store.ts` (`projectContaining`) | A `--from` path physically inside `~/.smithy/projects/<slug>/` resolves that project even without a `**Project**` header | Accepted: this is the artifact's own location, not the shell's — the signal the rule names, in its second spelling — and it is what lets an unstamped legacy artifact in a project store still resolve | — | low |

## Citations

Established by D-5. The resolution rule as deployed:
`src/templates/agent-skills/snippets/artifact-root-resolution.md`; the
operator guide: `docs/project-stores.md`.

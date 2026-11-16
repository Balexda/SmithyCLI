# Smithy CLI — Copilot instructions

Smithy is a CLI that deploys prompt templates, slash commands, sub-agents, and
permissions into other repositories, so developers can run structured planning
and implementation workflows from their AI assistant. `CLAUDE.md` has the full
architecture; `AGENTS.md` front-loads the template-authoring rules.

## Four kinds of file

Confusing them is behind most mistaken changes and most mistaken review
comments.

| Kind | Where | What it is |
|------|-------|------------|
| Source templates | `src/templates/agent-skills/` | The only source of truth for anything deployed. Rendered per agent by `smithy init` and dropped into other people's repositories. |
| Deployed snapshot | `.claude/`, `.agents/`, `.codex/`, `tools/codex/`, `.smithy/smithy-manifest.json` | The committed output of an earlier `smithy init` here. Intentionally allowed to drift from the templates between releases. |
| Planning artifacts | `docs/prds/`, `docs/rfcs/`, `specs/` | PRD → RFC → feature map → spec → tasks, written by Smithy's own commands. The record of what is being built and why. |
| CLI and evals | `src/`, `evals/` | TypeScript bundled by tsup to `dist/cli.js`, and the evals framework with its reference fixture. |

Durable commitments live in `docs/decisions/`, `docs/invariants/`, and
`docs/constitution/`. Cite a record by its ID (`INV-2`, `P-1`) when a change
touches what it governs.

## Validating a change

```bash
npm run build
npm run typecheck
npm test
```

Use the `npm` scripts. Do not call `npx vitest`, `npx tsx`, or `npx tsup`
directly.

## Where the detailed guidance lives

- `.github/instructions/*.instructions.md`: path-scoped rules, loaded for the
  files a change touches.
- `.github/skills/*/SKILL.md`: deeper review procedures, loaded on demand.
- `docs/reviewer-instructions.md`: how those files are organised and how a
  rule gets added.

Files named `smithy.*` or `smithy-*` there describe how Smithy artifacts work
in any repository. Everything else is specific to this repository.

<!-- smithy:engraved:begin -->
## Engraved Knowledge

This repository maintains engraved durable knowledge: decisions, invariants,
and principles. Before planning or making changes, read the applicable records
under these locations and judge whether they apply to the work at hand.

- docs/decisions/
- docs/invariants/
- docs/constitution/
<!-- smithy:engraved:end -->

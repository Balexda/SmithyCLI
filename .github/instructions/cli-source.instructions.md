---
applyTo: "src/**/*.ts"
excludeAgent: "coding-agent"
---
# Reviewing the Smithy CLI source

`src/` is the CLI that renders templates and deploys them for three agents.
Most escaped defects here came from one surface changing without its
counterparts. Check these before anything stylistic.

## Check

- **The three deployers move together.** `src/agents/claude.ts`, `gemini.ts`,
  and `codex.ts` deploy the same templates to different places. A change to
  what one deploys needs the matching change in the others, or a stated
  reason it does not apply.
- **Deployed metadata matches the target runtime (INV-3).** Each deploy path
  emits the frontmatter keys its runtime reads, in that runtime's spelling. A
  key is dropped only because the target does not read it. A deliberate
  divergence is a row in `docs/invariants/deployed-metadata-fidelity.invariant.md`,
  not silent behaviour in a deployer.
- **Everything deployed is tracked in the manifest.** A new deployed file that
  `src/manifest.ts` does not record survives `smithy uninit` and is left
  behind when a template is renamed. Ask how `uninit` and `update` treat it.
- **Permission rules use one grammar.** `Bash(command *)` only: never
  `Bash(command:*)`, never a glued `Bash(command*)`. `Skill(name)` or
  `Skill(name *)`, with no wildcard inside the name. See
  `docs/permission-grammar.md`.
- **`smithy status` surfaces agree.** The text tree, `--format json`, and
  `--graph` are derived from the same records. A suggested next action must
  not point at a row the graph shows as blocked, and a record must not appear
  in one surface and vanish from another.
- **Status never guesses.** Status, dependencies, and next actions are parsed
  from artifacts, never inferred.
- **Tests sit beside the code** as `src/**/*.test.ts` and run through
  `npm test`. A behaviour change without a test change deserves a question.

## Do not ask for

- Automated tests of interactive prompts. Inquirer flows cannot be driven
  through piped input; they are covered by the manual cases in `tests/`.
- Performance work on `smithy status` without a violated budget. It reads one
  repository's artifacts: tens to low hundreds of nodes.
- Moving templates out of `src/templates/`. The built CLI resolves them
  there at runtime, and the package ships that directory.
- Support for artifact paths or heading forms that no template writes, such
  as flat `docs/rfcs/name.rfc.md` or `## Slice 1 — Title`.

---
applyTo: "src/templates/**"
excludeAgent: "coding-agent"
---
# Reviewing changes to Smithy's deployable templates

Everything under `src/templates/agent-skills/` is rendered by `smithy init`
and dropped into **other people's repositories** as runtime instructions for
an agent. Review each change as that agent would read it there. Before
commenting, load the `smithycli-review-templates` skill and follow it: it
holds the per-file procedure and the judgement calls. This file states only
the rules a change can break.

The authoring rules are in `.claude/rules/template-authoring.md`, with the
reasoning in the engraved records it cites. `src/template-lint.test.ts`
enforces most of them, so do not repeat what a failing test already reports.
Cite the record ID when you raise one.

## Rules

- **Portability (INV-2).** Every path, document, or issue the text tells an
  agent to read must exist in a target repository. `AGENTS.md`, `CLAUDE.md`,
  `CONTRIBUTING.md`, `docs/`, `src/…`, `evals/`, and issue or pull request
  numbers do not. An example path inside prose is fine; an instruction to
  open one is not.
- **No narration of unbuilt work (INV-2).** "Not yet implemented", "lands in a
  later story", and notes to future editors do not belong in deployed text.
  The template describes what it does today.
- **One home per protocol (INV-1).** A table, gate, enum, or contract shape a
  snippet already defines is composed with `{{>snippet}}`, never re-typed or
  "adapted".
- **Agent gating lives in the consumer.** No `{{#ifAgent}}` and no "if you are
  Claude" prose inside a snippet. When behaviour differs per agent there is
  one snippet per branch and the command picks.
- **Context budget (P-1).** Descriptions are dispatch triggers: 40 words for
  commands and sub-agents, 55 for skills. Material needed only sometimes goes
  in a skill's `references/` file, linked with a sentence saying when to read
  it.

## Do not ask for

- Regenerating `.claude/`, `.agents/`, `.codex/`, or the manifest to match a
  template change. Those are refreshed in separate pull requests.
- Tailoring a deployed template to this repository's own scripts or layout.
  It must stay generic.
- A compatibility shim for an artifact format that the tasks file says a
  later slice migrates.

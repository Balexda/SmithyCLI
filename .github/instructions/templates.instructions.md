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
  "adapted". A passage copied between two templates needs one home too, even
  when no snippet exists yet.
- **Agent gating lives in the consumer.** No `{{#ifAgent}}` and no "if you are
  Claude" prose inside a snippet. When behaviour differs per agent there is
  one snippet per branch and the command picks.
- **Return fields are consumed (INV-4).** Flag a dispatch that ignores a
  field the agent's output contract defines (`bail_out`, `debt_items`,
  `destination`, a gaps or error shape) or appends the response verbatim.
- **Later passes keep earlier work (INV-5).** Flag a write that drops existing
  rows, renumbers a cited id, writes an empty-state line beside rows, or
  writes a record or UI file without a collision check.
- **Side effects survive a re-run (INV-6, D-7).** Flag a PR, issue, or branch
  created without looking for the existing one; a branch made from anything
  but the default branch, or renamed at push; repo identity derived twice; a
  listing filtered before it is paginated; a retry after an unknown outcome.
- **Declared limits are checked (INV-7).** "Read-only" prose, `tools:`, and
  `sandbox_mode` are not boundaries. Flag a read-only dispatch not verified by
  comparing `HEAD`, the index, and file contents (status alone misses re-edits), an edit
  from untrusted text outside the bound scope, and an outbound query carrying
  internal names.
- **Examples match their contract (INV-8).** Flag a sample, worked example, or
  guard/test pair that breaks the rules beside it or invents evidence.
- **Absence only when checked (P-2).** Flag "none" or "empty" reported where
  the producer failed, was truncated, or never looked. Reliance on a
  guarantee a lower layer provides is fine.
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

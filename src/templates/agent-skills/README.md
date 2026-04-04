# Agent Skills Templates

This directory contains the prompt templates that Smithy deploys into target
repositories. Templates are written as [Dotprompt](https://firebase.google.com/docs/genkit/dotprompt)
`.prompt` files with YAML frontmatter and Handlebars-rendered body text.

## Directory Structure

```
agent-skills/
  commands/    Slash commands (invocable as /smithy.<name>)
  prompts/     Reference prompts (readable by the AI, not invocable)
  agents/      Sub-agent definitions (dispatched by parent commands)
  snippets/    Shared Handlebars partials injected via {{>partial-name}}
```

See the README in each subdirectory for details on its contents and conventions.

## Dotprompt Conventions

- **Extension**: `.prompt` (Dotprompt native format)
- **Frontmatter**: YAML between `---` fences. Contains `name`, `description`,
  and for agents: `tools` and `model`.
- **Body**: Markdown with Handlebars expressions. Dotprompt resolves partials
  (`{{>snippet-name}}`) and conditionals (`{{#ifAgent}}...{{/ifAgent}}`) at
  deploy time.
- **Deploy transform**: Frontmatter is stripped when deploying to Claude
  (kept for Gemini skills). Files are renamed from `.prompt` to `.md`.

## Workflow Pipeline

The commands form a pipeline where each stage produces artifacts consumed by
the next:

```
ignite (RFC) → render (feature map) → mark (spec) → cut (tasks) → forge (implementation)
```

`strike` is a lightweight shortcut that combines planning + implementation in
one session, bypassing the full pipeline.

## Sub-Agent Roles

Sub-agents are invoked by parent commands, not directly by users:

| Agent | Role | Invoked By |
|-------|------|------------|
| smithy-clarify | Ambiguity scanning and Q&A | strike, ignite, mark, cut, render |
| smithy-refine | Artifact review and refinement | mark, cut, ignite, render (Phase 0) |
| smithy-implement | TDD implementation (test → code → commit) | forge |
| smithy-review | Code review with auto-fix | forge |
| smithy-scout | Pre-planning consistency scan | render, mark, cut |
| smithy-maid | Post-implementation doc cleanup | forge |

# Smithy CLI

An initialization tool for the **Codex-Assisted Development Workflow**. This package provides a CLI that easily sets up the `smithy` prompt templates for various AI assistant workflows, including Gemini CLI, Claude, and Codex.

## Installation

You can run Smithy directly via `npx` (recommended):

```bash
npx smithycli init
```

Or install it globally:

```bash
npm install -g smithycli
smithy init
```

## Supported AI Assistants

- **Gemini CLI:** Installs workspace skills (`.gemini/skills/`) so you can type `/skills reload` and immediately use `/skill smithy-scope` and other workflow commands.
- **Claude:** Installs prompts into `.claude/prompts/` to use within your Claude-based workflows.
- **Codex:** Sets up prompts in `tools/codex/prompts/` for the original `spec-kit` and Codex workflows.

## Workflow Prompts Included

- `smithy-scope`: Translate an RFC into a feature-plan folder.
- `smithy-segment`: Break a milestone into discrete Task Stubs.
- `smithy-detail`: Review a UX journey and prepare it for Spec Kit / Specify.
- `smithy-queue`: Turn a `tasks.md` spec into executable Implementation Tasks.
- `smithy-stage`: Implement a spec phase end-to-end and open a PR.
- `smithy-fix`: Apply a scoped microfix for CI failures, review tweaks, or bugs.

## Contributing

To build the tool locally:

```bash
npm install
npm run build
node dist/cli.js init
```

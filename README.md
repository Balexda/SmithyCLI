# Smithy CLI

Stop hand-crafting the same RFC → spec → tasks → PR scaffolding for every AI-assisted change. **Smithy** installs a structured pipeline of slash commands — `/smithy.ignite`, `/smithy.render`, `/smithy.mark`, `/smithy.cut`, `/smithy.forge`, plus the `/smithy.strike` fast track — into your repo so Claude Code, Gemini CLI, or Codex can drive it. One `smithy init` deploys the same prompts, permissions, and skills across every supported assistant.

## Installation

You can run Smithy directly via `npx` (recommended):

```bash
npx @balexda/smithy init
```

Or install it globally:

```bash
npm install -g @balexda/smithy
smithy init
```

## Supported AI Assistants

- **Claude:** Installs commands, prompts, and sub-agents into `.claude/` for use within your Claude Code workflows.
- **Gemini CLI:** Installs workspace skills (`.gemini/skills/`) so you can type `/skills reload` and immediately use Smithy workflow commands.
- **Codex:** Installs project skills into `.agents/skills/` and reference prompts into `tools/codex/prompts/`, with `smithy.forge` and `smithy.fix` ready for Codex-driven implementation and repair workflows.

## Workflow Industrial Pipeline

The Smithy Industrial Pipeline follows a structured path from broad ideas to verified implementations, incorporating "Fast Track" shortcuts and built-in "Review Loops" at every stage.

### The Pipeline Stages

| Stage | Agent | Purpose |
| :--- | :--- | :--- |
| **Ideation** | `smithy.ignite` | **Spark**: Workshop a broad idea into a structured RFC. |
| **Rendering** | `smithy.render` | **Render**: Break an RFC milestone into features. |
| **Planning** | `smithy.mark` | **Scope**: Specify a feature with spec, data model, and contracts. |
| **Cutting** | `smithy.cut` | **Cut**: Slice a user story into PR-sized task slices. |
| **Ordering** | `smithy.orders` | **Order**: Create tickets from Smithy artifacts. |
| **Forging** | `smithy.forge` | **Stage**: Implement a slice and forge a PR. |
| **Repair** | `smithy.fix` | **Fix**: Diagnose and fix errors from CI failures, test failures, or bugs. |
| **Shortcut** | `smithy.strike` | **Direct**: Strike while the iron is hot (Idea -> Tasks). |
| **Review** | `smithy.audit` | **Audit**: Universal auditor for any Smithy artifact. |

### Pipeline Diagram

```mermaid
graph TD
    %% Ideation
    Idea((Broad Idea)) --> Ignite[smithy.ignite]
    Ignite --> RFC{RFC}

    %% Rendering
    RFC --> Render[smithy.render]
    Render --> Features{Features}

    %% Planning
    Features --> Mark[smithy.mark]
    Mark --> Spec{Feature Spec}

    %% Cutting
    Spec --> Cut[smithy.cut]
    Cut --> Tasks{tasks.md}

    %% Orders & Forge
    Tasks --> Orders[smithy.orders]
    Orders --> Tickets{Tickets}
    Tickets --> Forge[smithy.forge]
    Forge --> PR[Pull Request]

    %% Fast Track
    Idea -.-> Strike[smithy.strike]
    Strike -.-> Tasks

    %% Universal Auditor
    RFC -.-> Audit[smithy.audit]
    Spec -.-> Audit
    Tasks -.-> Audit
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing strategy, and pre-release checklist.

# Agents (Sub-Agents)

Sub-agent definitions dispatched by parent commands. These are **not** invoked
directly by users — they are called by orchestrating commands (forge, mark, cut,
render, etc.) during specific workflow phases.

Deployed to:
- **Claude**: `.claude/agents/smithy.<name>.md` (**frontmatter kept** — Claude
  Code reads `tools` and `model` from the frontmatter to configure the sub-agent)
- **Gemini**: not deployed (Gemini does not support sub-agent dispatch)

## Current Agents

| Agent | Role | Invoked By | Model |
|-------|------|------------|-------|
| `smithy-clarify` | Ambiguity scanning, triage into assumptions (including [Critical Assumption]) and questions | strike, ignite, mark, cut, render | opus |
| `smithy-refine` | Artifact review, audit categories, refinement questions | mark, cut, ignite, render (Phase 0) | opus |
| `smithy-implement` | TDD implementation: failing test → code → commit | forge (per task) | opus |
| `smithy-review` | Code review with auto-fix capability | forge (after implementation) | opus |
| `smithy-scout` | Pre-planning consistency scan (non-interactive) | render, mark, cut | sonnet |
| `smithy-maid` | Post-implementation doc staleness scan (non-interactive) | forge (after review) | sonnet |

## Frontmatter Fields

```yaml
---
name: smithy-<name>
description: "One-line description of what this agent does."
tools:
  - Read
  - Grep
  - Glob
model: opus  # or sonnet
---
```

- **`tools`**: Which tools the sub-agent has access to. Read-only agents
  (clarify, refine, scout, maid) get `Read, Grep, Glob`. Implementation agents
  (implement) also get `Edit, Write, Bash`.
- **`model`**: Which model to use. Opus for complex reasoning (clarify, refine,
  implement, review). Sonnet for pattern-matching tasks (scout, maid).

## Interaction Patterns

Agents fall into two interaction styles:

1. **Interactive** (clarify, refine): Talk directly to the user. Present
   assumptions, ask questions one at a time, wait for responses. Return a
   structured summary to the parent when done.

2. **Non-interactive** (scout, maid, implement, review): Do not talk to the
   user. Perform their work and return a structured report to the parent agent,
   which decides how to surface findings.

# Contracts: smithy.persona Command and Ignite Persona Reuse

## Overview

This feature has a clean producer/consumer shape joined by one shared contract — the
`.persona.md` artifact. The new `smithy.persona` command is the **producer**; the
amended `smithy.ignite` command is the **consumer**. The boundaries below define the
command interfaces, the `.persona.md` file format, the two ignite amendment surfaces,
and the cross-agent deployment surface. All are prompt-template (Markdown) contracts, not
code APIs — Smithy commands are `.prompt` files deployed to AI coding agents.

## Interfaces

### `smithy.persona` command interface

**Purpose**: Generate durable `.persona.md` artifact(s).
**Consumers**: developers (via `/smithy.persona` slash command on Claude/Gemini/Codex).
**Providers**: the new `src/templates/agent-skills/commands/smithy.persona.prompt`.

#### Signature

```
/smithy.persona <free-text description>      → free-text mode  → 1 file
/smithy.persona <path/to/foo.rfc.md>         → RFC mode        → N files (one per persona)
/smithy.persona                              → ask the user what to generate
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$ARGUMENTS` | string | No | Free-text persona description, or a path ending in `.rfc.md`. Empty/unclear → ask-fallback. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| Persona file(s) | `.persona.md` | One (free-text) or N (RFC mode) files at `{{artifactsRoot}}docs/personas/<slug>.persona.md`. |
| One-shot summary | terminal output | spark-style summary: files written, skipped (collisions), and any diagnostic. |

#### Error / Edge Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| No input / `$ARGUMENTS` literal (Gemini/Codex) | Ask the user | Mirrors spark/mark fallback. |
| RFC-mode slug collision | Skip-and-report | Existing durable file is never overwritten (FR-009). |
| Empty/placeholder RFC `## Personas` | Zero files + diagnostic | Never writes a placeholder persona (FR-016). |
| RFC has no `## Personas` section | Diagnostic, zero files | Reported, not an error abort. |

#### Routing

- Input ends in `.rfc.md` → **RFC mode**.
- Any other non-empty input → **free-text mode**.
- Empty/unclear → ask-fallback.

### `.persona.md` file-format contract

**Purpose**: The durable artifact format both producer and consumer bind to.
**Owner**: `smithy.persona` (producer owns the format; ignite conforms).
**Defined once in**: `src/templates/agent-skills/README.md` (path + schema convention);
neither command prompt restates the literal path.

```markdown
# Persona: <Name/Role>

**Created**: YYYY-MM-DD

<Role and the context in which they encounter the system.>

<The specific friction they experience today.>

<How their work changes concretely when the relevant capability ships.>
```

Constraints: plain Markdown; narrative body (not bullets); exactly one persona per file;
no `## Dependency Order`, no M/F/US/S ID, no inline `## Specification Debt` table; lives
flat at `{{artifactsRoot}}docs/personas/<slug>.persona.md` with no date/sequence prefix.

> **Open**: whether the file carries a machine-readable identity key (`slug:` / `**Role**:`)
> for deterministic matching — SD-002.

### Ignite amendment contract — Sub-phase 3b (reuse-before-generate)

**Purpose**: Reuse pre-existing personas instead of drafting cold.
**Provider**: `smithy.ignite.prompt` Sub-phase 3b.

| Step | Contract |
|------|----------|
| Discover | Before dispatching smithy-prose, list existing `.persona.md` files via the README-defined convention. |
| Match | For each persona the RFC needs, determine whether an existing file **covers** it. *Matching rule is open — SD-001.* |
| Project | For a covered persona, project the durable persona into the RFC `## Personas` as "how this RFC benefits them" — do not regenerate it cold. |
| Generate gap only | Dispatch smithy-prose to draft only personas with no covering file. |

### Ignite amendment contract — Sub-phase 3g (non-clobber)

**Purpose**: Prevent the harmonize/repair pass from overwriting file-sourced personas.
**Provider**: `smithy.ignite.prompt` Sub-phase 3g harmonize / Personas-repair (the verified
clobber surface is the step that replaces the `## Personas` section in place).

| Step | Contract |
|------|----------|
| Detect source | Determine whether the current `## Personas` content was sourced from `.persona.md` files in 3b. *The provenance-detection mechanism — marker, sidecar state, or deterministic re-discovery — is open; it must survive a resume from the on-disk RFC with no in-memory record of 3b. See SD-004.* |
| Preserve | If file-sourced, the repair MUST re-project from the source files, NOT regenerate from `clarify_output`. Only position/formatting may be normalized. |
| Repair gap | The existing cold-draft repair behavior remains for personas that were not file-sourced. |

### smithy-prose integration contract

**Purpose**: The new command and ignite 3b both want smithy-prose to draft/project a
persona from an existing `.persona.md`.
**Provider**: `src/templates/agent-skills/agents/smithy.prose.prompt`.
**Current contract params**: `section_assignment`, `idea_description`, `clarify_output`,
`rfc_file_path`, `tone_directives` — *none accept existing-persona-file context.*

> **Open (SD-003)**: how the durable persona reaches smithy-prose — via `clarify_output`,
> via `rfc_file_path` reading, or a new optional `source_persona_paths` parameter (which
> would amend the smithy-prose contract). This decision determines whether smithy-prose
> itself must change.

## Events / Hooks

None. No events are published or subscribed; the only cross-command coupling is the
filesystem (persona files written by `smithy.persona`, discovered by `smithy.ignite`).

## Integration Boundaries

- **Cross-agent deployment**: `smithy.persona.prompt` placed in `commands/` deploys
  automatically to Claude (`.claude/commands/`), Gemini (`.gemini/skills/`), and Codex
  (`.agents/skills/`) via directory-discovery — no `src/agents/*.ts` change required. The
  `$ARGUMENTS` ask-fallback covers Gemini/Codex literal-passthrough.
- **`{{artifactsRoot}}` policy**: persona paths inherit the artifact-location-policy
  snippet; `.persona.md` should be added to that snippet's enumerated artifact list so
  in-repo vs. external-artifacts placement behaves consistently. Reuse only spans personas
  under the same artifacts root.
- **`smithy.orders`**: explicitly **out of scope** — `.persona.md` is not a valid orders
  artifact type and generates no GitHub issues. No registry entry is added.
- **Documentation surfaces** (follow-through, deferred to a later pass): the CLAUDE.md
  command catalog, the README command list, and the `smithy.audit` checklist would each
  gain a `.persona.md` entry. Tracked but not blocking v1.

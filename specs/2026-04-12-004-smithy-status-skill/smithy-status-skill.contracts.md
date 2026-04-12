# Contracts: Smithy Status Skill

## Overview

The status feature has two public surfaces: the `smithy status` CLI subcommand (the deterministic script that does all the real work) and the `smithy.status` agent-skill (a thin wrapper that invokes the CLI from inside an AI coding session). The CLI is the contract; the skill delegates to it.

## Interfaces

### 1) `smithy status` CLI Subcommand

**Purpose**: Walk the repo, classify Smithy artifacts, and render a status report.
**Consumers**: Developers at the shell; the `smithy.status` agent-skill; CI scripts consuming `--format json`.
**Providers**: The Smithy CLI package (`src/commands/status.ts` or equivalent).

#### Signature

```
smithy status [--root <path>]
              [--status <state>]
              [--type <artifact-type>]
              [--all]
              [--graph]
              [--format <text|json>]
              [--no-color]
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `--root` | path | No | Directory to scan. Defaults to the current working directory. |
| `--status` | `done \| in-progress \| not-started \| unknown` | No | Show only artifacts matching this status. Ancestors are still rendered for context. |
| `--type` | `rfc \| features \| spec \| tasks` | No | Show only artifacts of this type. |
| `--all` | flag | No | Disable collapsing of `DONE` subtrees and expand every artifact and slice. |
| `--graph` | flag | No | Render the cross-artifact dependency graph as topological layers (Layer 0 = items ready to work now, Layer 1 = items whose dependencies are all in Layer 0, and so on). Can be combined with `--format json` to emit the graph data structure. |
| `--format` | `text \| json` | No | Output format. Defaults to `text`. |
| `--no-color` | flag | No | Suppress ANSI color output. Implied when stdout is not a TTY. |

#### Outputs

**Text mode** (default): A human-readable tree written to stdout, structured as:

1. A summary header with per-type counts (`RFCs: 1 done · Features: 2 done / 1 in-progress / ...`).
2. One or more top-level nodes (RFCs, plus "Orphaned Specs" and "Broken Links" groups when non-empty).
3. Nested children using tree connectors (`├─`, `└─`) and title-based labels.
4. Per-artifact status markers (`DONE`, `N/M`, `not started`, or an `unknown` warning).
5. Inline next-action suggestions for non-done artifacts (one per topmost actionable chain).

**JSON mode** (`--format json`): A single JSON object written to stdout with this shape:

```json
{
  "summary": { "counts": { "...": {...} }, "orphan_count": 0, "broken_link_count": 0, "parse_error_count": 0 },
  "records": [
    {
      "type": "...", "path": "...", "title": "...", "status": "...",
      "completed": 0, "total": 0, "parent_path": "...",
      "dependency_order": {
        "id_prefix": "US",
        "format": "table",
        "rows": [
          { "id": "US1", "title": "...", "depends_on": [], "artifact_path": "specs/.../01-foo.tasks.md" },
          { "id": "US2", "title": "...", "depends_on": ["US1"], "artifact_path": null }
        ]
      },
      "next_action": { "..." : "..." },
      "warnings": []
    }
  ],
  "tree": { "roots": [ { "record": { "..." : "..." }, "children": [] } ] },
  "graph": {
    "nodes": { "specs/.../spec.md#US1": { "record_path": "...", "row": { "..." : "..." }, "status": "in-progress" } },
    "layers": [ { "layer": 0, "node_ids": ["specs/.../spec.md#US1", "specs/.../spec.md#US4"] } ],
    "cycles": [],
    "dangling_refs": []
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `summary` | ScanSummary | Aggregate counts (see data model). |
| `records` | ArtifactRecord[] | Flat list of every record produced by the scan. Each record embeds its parsed `dependency_order` table. |
| `tree` | `{ roots: StatusNode[] }` | Hierarchical view of the same records; contains only root nodes and their descendants. Does NOT duplicate `summary`. |
| `graph` | DependencyGraph | Cross-artifact dependency graph with topological layers and any detected cycles / dangling refs. Emitted unconditionally in JSON mode; the `--graph` flag only controls text-mode rendering. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| `--root` points to a non-existent path | Exit 2 with stderr message | Hard fail — no partial output. |
| Invalid `--status` or `--type` value | Exit 2 with stderr message listing valid values | Hard fail before any scanning. |
| No Smithy artifacts found | Exit 0 with a friendly hint pointing at `smithy.ignite` / `smithy.mark` | Not an error — the repo is simply empty. |
| Individual artifact parse failure | Exit 0; record emitted with `status: unknown` and populated `warnings` | Scanner continues with remaining artifacts. |
| Duplicate record paths (collision) | Exit 0; warning emitted on both records | Scanner tolerates and surfaces the collision. |

---

### 2) `smithy.status` Agent Skill

**Purpose**: Expose the `smithy status` CLI as a slash-command / skill inside an AI coding session (Claude Code, Gemini CLI) so users can check repo status without leaving their agent.
**Consumers**: Developers working inside an AI coding session.
**Providers**: A template file at `src/templates/agent-skills/commands/smithy.status.prompt`.

#### Signature

```
/smithy.status [<forwarded-cli-arguments>]
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<forwarded-cli-arguments>` | string | No | Any arguments accepted by `smithy status` — passed through verbatim. |

#### Outputs

The CLI's stdout, returned to the user with at most a one-sentence framing from the agent. No LLM re-interpretation, no summarization, no filtering.

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| `smithy` CLI not on `PATH` | Return a clear error message instructing the user to install or rebuild Smithy | Do not attempt to reconstruct the status view from first principles. |
| CLI exits non-zero | Return the captured stderr verbatim | Do not retry with different arguments or heuristics. |
| CLI output is unexpectedly empty | Return the empty output with a note that the repo may have no artifacts | Same behavior as the CLI's own empty-repo hint. |

---

## Events / Hooks

The status feature emits no events and installs no hooks. It is a read-only, on-demand command.

## Integration Boundaries

- **Smithy CLI package**: The `status` subcommand is added alongside existing subcommands (`init`, `uninit`, `update`). It reuses the CLI's argument parsing (Commander) and exit-code conventions. It must not introduce new dependencies beyond what the CLI already uses for file I/O and markdown parsing.
- **Agent-skill templates**: A new `smithy.status.prompt` file is added under `src/templates/agent-skills/commands/`. It follows existing Dotprompt conventions — YAML frontmatter with `name` and `description` only (matching `smithy.strike.prompt`, `smithy.audit.prompt`, etc.), plus a Handlebars body. The `commands/` directory itself is what makes the file deploy as a Claude slash command; no `command: true` frontmatter field is introduced (the repo does not currently use one).
- **Manifest**: The skill is registered in the standard template manifest so `smithy init` / `smithy update` deploys it alongside other commands. The status subcommand itself is part of the CLI and requires no manifest entry.
- **Filesystem**: Read-only access to the working directory and any path passed via `--root`. The scanner MUST NOT write, create, or modify files. It MUST NOT follow symlinks outside the scan root.
- **Network**: None. The scanner MUST make no network calls and MUST function offline.

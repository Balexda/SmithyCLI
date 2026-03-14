# Contracts: Smithy Command Redesign

## Overview

The smithy command redesign introduces no new programmatic APIs or integration boundaries. The contracts are the conventions by which commands discover, produce, and consume artifact files — and the interface between `orders` and the GitHub API.

## Interfaces

### Artifact Discovery Contract

**Purpose**: Defines how any smithy command locates and identifies artifacts.
**Consumers**: All smithy commands (audit, orders, cut, forge, stoke, and review loops).
**Providers**: The filesystem via naming conventions.

#### Convention

Commands identify artifact type by file extension:

| Extension | Artifact Type | Producing Command |
|-----------|--------------|-------------------|
| `.rfc.md` | RFC | ignite |
| `.map.md` | Feature Map | stoke |
| `.spec.md` | Feature Spec | shape |
| `.data-model.md` | Data Model | shape |
| `.contracts.md` | Contracts | shape |
| `.tasks.md` | Task Slices | cut |
| `.strike.md` | Strike Plan | strike |

Commands locate artifacts by folder convention:

| Pattern | Contains |
|---------|----------|
| `docs/rfcs/<YYYY-NNN-slug>/` | RFC + maps |
| `specs/<YYYY-MM-DD-NNN-slug>/` | Spec + data-model + contracts + tasks |
| `specs/strikes/` | Strike task files |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Unrecognized extension | Error with guidance | File does not match any known artifact type |
| Missing parent artifact | Warning + prompt | e.g., running cut without a spec file in the folder |
| Folder naming mismatch | Error | Folder doesn't match expected `YYYY-*` pattern |

Note: `.data-model.md` and `.contracts.md` are recognized artifact types for discovery purposes (e.g., audit can review them alongside a spec) but are **companion files** — they are not valid standalone targets for `orders` or `cut`. Commands that accept an artifact path must validate that the extension is a valid target for that command, not just a recognized type.

### Orders → GitHub Contract

**Purpose**: Defines how `orders` creates GitHub issues from artifacts.
**Consumers**: `smithy.orders` command.
**Providers**: GitHub API via `gh` CLI.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `artifact_path` | File path | Yes | Path to the artifact file to create tickets from |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `created_issues` | Issue[] | List of GitHub issues created |
| `parent_issue` | Issue | Tracking/epic issue if applicable |
| `links` | URL[] | URLs to created issues |

#### Ticket Mapping

| Artifact Extension | Parent Ticket | Child Tickets |
|--------------------|---------------|---------------|
| `.rfc.md` | Epic/tracking issue for the RFC | One issue per milestone (next step: stoke) |
| `.map.md` | Milestone issue (if exists) | One issue per feature (next step: shape) |
| `.spec.md` | (none) | One issue per user story (next step: cut) |
| `.tasks.md` | User story issue (if exists) | One issue per slice (next step: forge) |
| `.strike.md` | (none) | Single issue for the strike |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| `gh` CLI not available | Error with install guidance | GitHub CLI required for ticket creation |
| No GitHub remote | Error | Repository must have a GitHub remote |
| Companion file passed (`.data-model.md`, `.contracts.md`) | Error with guidance | These are companion files, not valid orders targets. Suggest running orders on the parent `.spec.md` instead |
| Duplicate tickets detected | Prompt user | Offer to update existing tickets rather than create duplicates |

### Forge Branch Context Contract

**Purpose**: Defines how `audit` discovers upstream context when run on a forge branch.
**Consumers**: `smithy.audit` (forge-branch mode).
**Providers**: Git branch metadata + filesystem.

#### Branch Naming Convention

Forge branches follow the pattern: `<NNN>/us-<NN>-<slug>/slice-<N>`

Example: `001/us-01-auth-flow/slice-1`

- `<NNN>` — spec number (from the spec folder `specs/YYYY-MM-DD-<NNN>-<slug>/`)
- `us-<NN>` — user story number (matches `<NN>-<story-slug>.tasks.md`)
- `slice-<N>` — slice number within the tasks file

#### Discovery Logic

1. Read current git branch name.
2. Parse spec number (`<NNN>`) to locate the spec folder in `specs/`.
3. Parse user story number (`us-<NN>`) to locate the `<NN>-*.tasks.md` file.
4. Parse slice number to identify the active slice within the tasks file.
5. Read `.spec.md` for feature context.
6. Trace back to feature map and RFC if available.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| (none) | — | — | Audit auto-discovers context from the current branch |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `code_diff` | Diff | Changes on the current branch |
| `slice_context` | Slice | The slice being implemented |
| `feature_context` | Spec | The parent feature spec |
| `feature_map_context` | Map entry | The parent feature from the map (if traceable) |
| `findings` | Finding[] | Audit results considering all context layers |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Branch doesn't match a spec folder | Warning | Audit proceeds on code only, notes missing context |
| Spec files missing | Warning | Audit proceeds with available context |

## Events / Hooks

No events or hooks are introduced. Commands are invoked directly by the user.

## Integration Boundaries

- **GitHub API**: Accessed exclusively through `gh` CLI by `orders` (ticket creation) and `forge` (PR creation). No direct API calls.
- **Git**: All commands interact with git for branch management. Branch names serve as the link between working state and spec folders.
- **Filesystem**: Artifact discovery relies entirely on folder structure and file extension conventions. No database, config file, or index is used.

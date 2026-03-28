# Contracts: Smithy Base Directory Customization

## Overview

This feature introduces a centralized configuration system for path resolution.

## Interfaces

### PathResolver

**Purpose**: Provides resolved absolute paths for supported artifact types (`rfc`, `spec`, `strike`) based on current settings.
**Consumers**: All smithy skills/commands that generate files.
**Providers**: TBD (centralized settings/path configuration module)

#### Signature

`resolvePath(artifactType: 'rfc' | 'spec' | 'strike', slug?: string): string`

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `artifactType` | enum | Yes | The type of artifact being resolved. |
| `slug` | string | No | Optional filename/folder slug to include in the final path. |

#### Outputs

`string` — The absolute path to the directory or file.

## Integration Boundaries

### `smithy init` → `.smithy/local.settings.json`
- `init` writes the initial configuration.
- **Note**: The orders spec (`2026-03-21-002`) states that declining template creation during `smithy init` must leave no `.smithy/` directory. When base directory customization is active, `init` will always create `.smithy/local.settings.json`. These specs must be reconciled: if the user provides a non-default base directory, `.smithy/` is created regardless of the template prompt outcome. The orders spec acceptance scenario should be updated to account for settings file creation.

### `smithy rehome` → `.smithy/local.settings.json`
- `rehome` reads and updates the configuration.

### Skills/Templates → PathResolver
- Skill templates (like `smithy.strike.md`) will use placeholders or logic that invokes the PathResolver to determine where to save files.

# Contracts: Smithy Base Directory Customization

## Overview

This feature introduces a centralized configuration system for path resolution.

## Interfaces

### PathResolver

**Purpose**: Provides resolved absolute paths for any artifact type based on current settings.
**Consumers**: All smithy skills/commands that generate files.
**Providers**: `src/settings.ts`

#### Signature

`resolvePath(artifactType: 'rfc' | 'spec' | 'strike', slug?: string): string`

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `artifactType` | enum | Yes | The type of artifact being resolved. |
| `slug` | string | No | Optional filename/folder slug to include in the final path. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `path` | string | The absolute path to the directory or file. |

## Integration Boundaries

### `smithy init` → `.smithy/local.settings.json`
- `init` writes the initial configuration.

### `smithy rehome` → `.smithy/local.settings.json`
- `rehome` reads and updates the configuration.

### Skills/Templates → PathResolver
- Skill templates (like `smithy.strike.md`) will use placeholders or logic that invokes the PathResolver to determine where to save files.

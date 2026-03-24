# Data Model: Smithy Base Directory Customization

## Overview

This model defines the configuration structure for Smithy's local workspace settings, specifically focusing on artifact path resolution.

## Entities

### 1) LocalSettings (`.smithy/local.settings.json`)

Purpose: Stores workspace-specific configurations that should not necessarily be shared globally or checked into the main repo (though they can be).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `baseDir` | string | No | The root directory for all Smithy artifacts. Defaults to `.`. |
| `paths` | object | No | Sub-path overrides for specific artifact types. |
| `paths.rfc` | string | No | Override for RFCs. Default: `docs/rfcs` |
| `paths.spec` | string | No | Override for Specs. Default: `specs` |
| `paths.strike` | string | No | Override for Strikes. Default: `specs/strikes` |

Validation rules:
- `baseDir` must be a valid relative or absolute path.
- `paths` entries must be valid relative paths.

## Identity & Uniqueness

- Only one `local.settings.json` exists per repository, located in the `.smithy/` directory.

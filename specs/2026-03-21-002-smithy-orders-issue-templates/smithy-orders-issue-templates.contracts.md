# Contracts: Smithy Orders Issue Templates

## Overview

This feature introduces three integration boundaries: (1) `smithy init` provisions templates, (2) `smithy.orders` resolves and interpolates templates, and (3) template files define a placeholder contract between authors and the orders command.

All three boundaries operate on `.smithy/`, the same directory that already contains the CLI-owned `smithy-manifest.json`. User-authored body templates and the manifest coexist in this directory; each contract below is explicit about which files it touches.

## Interfaces

### Template Resolution Contract

**Purpose**: Defines how `orders` finds the correct template for a given artifact type.
**Consumers**: `smithy.orders` command
**Providers**: `.smithy/` directory (user-managed) or built-in defaults (hardcoded)

#### Resolution Algorithm

1. Determine artifact type from the input file extension (`.rfc.md` → `rfc`, `.features.md` → `features`, `.spec.md` → `spec`, `.tasks.md` → `tasks`). `.strike.md`, `.prd.md`, and the `.data-model.md` / `.contracts.md` companions are not orders-eligible — orders rejects them upstream and never invokes this contract for them.
2. Check for `.smithy/<type>.md` in the repository root.
3. If found, use it as the body template (even if empty — the title is set independently, so an empty body is valid).
4. If not found, use the built-in default template for that type.

The resolver only considers files matching `<type>.md` for one of the four supported types. Any other file in `.smithy/` — most notably `smithy-manifest.json`, plus any user-added READMEs, drafts, or backups — is ignored, never read, and never altered.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `artifact_path` | string | Yes | Path to the artifact file being processed |
| `repo_root` | string | Yes | Repository root directory |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `template_body` | string | Markdown template content with `{{variable}}` placeholders |
| `template_source` | enum | `"custom"` if from `.smithy/`, `"default"` if built-in |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Unknown file extension | Error with guidance | Artifact type not recognized — list supported extensions (rfc, features, spec, tasks) |
| Template file is not valid UTF-8 | Fall back to default | Log warning, use built-in template |

---

### Template Interpolation Contract

**Purpose**: Defines how `orders` replaces `{{variable}}` placeholders with artifact content.
**Consumers**: GitHub issue body (the rendered output)
**Providers**: `smithy.orders` command (the interpolation engine)

#### Algorithm

1. Parse the template body for all `{{variable}}` patterns.
2. For each match, look up the variable name in the interpolation context for the artifact type.
3. If found, replace with the content value (may be multi-line markdown).
4. If not found, leave the `{{variable}}` literal in place.

The variable namespace per artifact type is defined in `smithy-orders-issue-templates.data-model.md`. Examples include `{{rfc_path}}` and `{{milestone_number}}` for rfc templates; `{{milestone_number}}` and `{{feature_description}}` for features; `{{spec_folder}}` and `{{user_story_number}}` for spec; `{{slice_number}}` and `{{slice_tasks}}` for tasks.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `template_body` | string | Yes | Template content with placeholders |
| `context` | Record<string, string> | Yes | Variable name → content value mapping, built from the parsed artifact |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `rendered_body` | string | Final markdown ready for `gh issue create --body` |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Placeholder references empty content | Replace with empty string | Variable is known but the artifact section is missing or empty |
| Malformed placeholder (e.g., `{{}}`, `{{ }}`) | Leave as literal text | Not treated as a valid variable reference |

---

### Init Template Provisioning Contract

**Purpose**: Defines how `smithy init` creates the four default body templates inside `.smithy/`.
**Consumers**: Developer running `smithy init`
**Providers**: `smithy init` command

#### Flow

1. After agent selection and permission setup, check whether the four template files (`rfc.md`, `features.md`, `spec.md`, `tasks.md`) exist in `.smithy/`. The directory itself may already exist because `smithy init` writes `.smithy/smithy-manifest.json` as part of the standard manifest flow.
2. If **none** of the four template files exist:
   1. Prompt: "Create smithy issue templates in .smithy/? (Y/n)"
   2. If declined, skip — no template files written. The manifest is unaffected.
   3. If accepted, write the four default template files into `.smithy/` alongside `smithy-manifest.json`. Creation must not modify, truncate, or rewrite `smithy-manifest.json`.
3. If **any** of the four template files already exist:
   1. Prompt: "Overwrite existing .smithy/ templates with defaults? (y/N)" (default no).
   2. If declined, preserve all existing template files and continue.
   3. If accepted, replace only the four `<type>.md` files with current defaults. Other files in `.smithy/` (including `smithy-manifest.json` and any user extras) are preserved.

`smithy init` does not prompt about, write, or modify `.gitignore` for `.smithy/`. The standard init flow already gitignores `.smithy/smithy-manifest.json` via `agentGitignoreEntries`; the four template files live alongside it and are committable by default.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target_dir` | string | Yes | Repository root where `.smithy/` will be created |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `templates_created` | boolean | Whether the four template files were written |
| `templates_overwritten` | boolean | Whether existing template files were replaced with defaults |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Some templates exist, others missing | Treat as "exists" | Offer overwrite, default no — preserves any user customizations |
| `.smithy/` is not writable | Error and abort | Surface filesystem error to the user; do not partially write |

## Events / Hooks

None. Template provisioning is a one-time init action; template resolution happens at `orders` runtime with no events.

## Integration Boundaries

- **`smithy init` → `.smithy/<type>.md`**: Init writes the four default template files. This is the only smithy command that writes user body templates. Init must never read, modify, or delete `smithy-manifest.json` as part of this flow.
- **`smithy init` → `.smithy/smithy-manifest.json`**: Owned by the existing manifest flow (`src/manifest.ts`). Template provisioning shares the directory but never touches this file.
- **`smithy.orders` → `.smithy/<type>.md`**: Orders reads templates at runtime. Read-only — never modifies user templates. Ignores `smithy-manifest.json` and any non-`<type>.md` file.
- **`smithy.orders` → `gh issue create`**: Orders passes the rendered body to GitHub CLI. The template contract ends at the rendered markdown string.
- **`smithy uninit` → `.smithy/`**: Uninit does NOT touch user body templates. Manifest cleanup remains the responsibility of the existing manifest flow.

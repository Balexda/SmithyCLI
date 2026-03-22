# Contracts: Smithy Orders Issue Templates

## Overview

This feature introduces three integration boundaries: (1) `smithy init` provisions templates, (2) `smithy.orders` resolves and interpolates templates, and (3) template files define a placeholder contract between authors and the orders command.

## Interfaces

### Template Resolution Contract

**Purpose**: Defines how `orders` finds the correct template for a given artifact type.
**Consumers**: `smithy.orders` command
**Providers**: `.smithy/` directory (user-managed) or built-in defaults (hardcoded)

#### Resolution Algorithm

1. Determine artifact type from input file extension (`.rfc.md` → `rfc`, `.features.md` → `features`, `.spec.md` → `spec`, `.tasks.md` → `tasks`).
2. Check for `.smithy/<type>.md` in the repository root.
3. If found, use it as the body template (even if empty — the title is set independently, so an empty body is valid).
4. If not found, use the built-in default template for that type.

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
| Unknown file extension | Error with guidance | Artifact type not recognized — list supported extensions |
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

**Purpose**: Defines how `smithy init` creates `.smithy/` and handles the commit/gitignore choice.
**Consumers**: Developer running `smithy init`
**Providers**: `smithy init` command

#### Flow

1. After agent selection and permission setup, check whether `.smithy/` already exists.
2. If `.smithy/` does **not** exist:
   1. Prompt: "Create smithy issue templates in .smithy/? (Y/n)"
   2. If declined, skip — no directory created.
   3. If accepted, create `.smithy/` with 4 default template files.
   4. Prompt: "Check .smithy/ into the repo? (Y/n)"
   5. If yes, do nothing (templates are ready to `git add`).
   6. If no, append `.smithy/` to `.gitignore` (create `.gitignore` if needed, avoid duplicate entries).
3. If `.smithy/` **already exists**:
   1. Prompt: "Overwrite existing .smithy/ templates with defaults? (y/N)" (default no).
   2. If declined, preserve existing templates and continue.
   3. If accepted, replace the 4 template files with current defaults. The commit/gitignore prompt is NOT repeated — the user's prior choice is already in effect.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target_dir` | string | Yes | Repository root where `.smithy/` will be created |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `templates_created` | boolean | Whether `.smithy/` was created |
| `gitignored` | boolean | Whether `.smithy/` was added to `.gitignore` |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| `.smithy/` already exists | Offer overwrite, default no | User chooses whether to replace templates with current defaults |
| `.gitignore` is not writable | Warn and continue | Templates are created but gitignore step fails gracefully |

## Events / Hooks

None. Template provisioning is a one-time init action; template resolution happens at `orders` runtime with no events.

## Integration Boundaries

- **`smithy init` → `.smithy/` directory**: Init writes default template files. This is the only smithy command that writes to `.smithy/`.
- **`smithy.orders` → `.smithy/` directory**: Orders reads templates at runtime. Read-only — never modifies user templates.
- **`smithy.orders` → `gh issue create`**: Orders passes the rendered body to GitHub CLI. The template contract ends at the rendered markdown string.
- **`smithy uninit` → `.smithy/` directory**: Uninit does NOT touch `.smithy/`. It is user-owned content.

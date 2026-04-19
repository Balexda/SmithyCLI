# Data Model: Smithy Orders Issue Templates

## Overview

This model defines the issue-body templates that live in `.smithy/` and the placeholder variables that `smithy.orders` interpolates when creating GitHub issues. Four template files are in scope — one per orders-eligible artifact type — and they coexist in `.smithy/` with the CLI-owned `smithy-manifest.json` without conflict.

## Entities

### 1) Issue Template (`.smithy/<type>.md`)

Purpose: Defines the body structure for GitHub issues created by `orders` for a specific artifact type.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `file_name` | string | Yes | One of `rfc.md`, `features.md`, `spec.md`, `tasks.md`. These are template filenames, not artifact extensions — the `<type>` segment matches the artifact type (`rfc`, `features`, `spec`, `tasks`) derived from the source file's extension (`.rfc.md`, `.features.md`, …). |
| `body` | markdown | Yes | Template body with `{{variable}}` placeholders |

Scope:
- Each of the four files defines the **child** issue body for its artifact type: `rfc.md` is used for per-milestone issues, `features.md` for per-feature issues, `spec.md` for per-user-story issues, `tasks.md` for per-slice issues.
- The RFC **parent** tracking issue (created once per `.rfc.md`) is not user-overridable through this feature; its body remains hardcoded in `smithy.orders`.
- `.strike.md`, `.prd.md`, `.data-model.md`, and `.contracts.md` are not orders-eligible and have no corresponding template. `smithy init` does not create files for them and `smithy.orders` never consults `.smithy/` on their behalf.

Non-template files in `.smithy/`:
- `smithy-manifest.json` is owned by the CLI manifest flow (`src/manifest.ts`) and is **not** a template. The resolver ignores it; init must never modify it while provisioning templates.
- Any other file a user drops into `.smithy/` (README drafts, backups, etc.) is similarly ignored by both resolution and provisioning.

Validation rules:
- File must be valid markdown.
- A template with no `{{variable}}` placeholders is still a valid override — it will be used as-is for the issue body (the title is set independently by `orders`).

### 2) Template Variable

Purpose: A named placeholder within a template that `orders` replaces with artifact-derived content. Variables are scoped to the artifact type — a variable is only recognized if it appears in the row for that type.

| Variable | Available In | Content Type | Notes |
|----------|-------------|--------------|-------|
| `{{title}}` | all | inline | Mirrors the issue title for use as a body heading — does NOT control the `--title` argument passed to `gh issue create` |
| `{{next_step}}` | all | inline | The smithy command the author should run next (see next-step mapping below) |
| `{{parent_issue}}` | all | inline | Reference to parent issue if found (e.g., `#42`). Replaced with empty string if no parent exists |
| `{{milestone_number}}` | rfc, features | inline | Milestone number within the source RFC (e.g., `3`). Used both in the per-milestone child issue (rfc) and for parent linkage on features |
| `{{milestone_title}}` | rfc | inline | Milestone title from `### Milestone N: <Title>` |
| `{{milestone_description}}` | rfc | inline | Milestone description paragraph (body of `**Description**`) |
| `{{milestone_success_criteria}}` | rfc | inline | Milestone success criteria (body of `**Success Criteria**`) |
| `{{rfc_path}}` | rfc | path | Path to the source `.rfc.md` |
| `{{feature_description}}` | features | inline | Feature description text (the `--title` is set via `gh issue create --title`, so no `{{feature_title}}` is exposed in the body template) |
| `{{features_path}}` | features | path | Path to the source `.features.md`. When available, taken from the `Artifact` column of the RFC's Dependency Order table |
| `{{user_story}}` | spec | inline | Full user story text (`As a …, I want …, so that …`) |
| `{{user_story_number}}` | spec | inline | Story number (e.g., `3`) |
| `{{acceptance_scenarios}}` | spec | inline | Given/When/Then scenarios for the story |
| `{{priority}}` | spec | inline | Story priority (`P1` / `P2` / `P3`) |
| `{{spec_path}}` | spec | path | Path to the source `.spec.md` |
| `{{spec_folder}}` | spec | path | Path to the spec's folder — used in the `smithy.cut <spec-folder> <N>` next-step |
| `{{data_model_path}}` | spec | path | Path to the companion `.data-model.md` |
| `{{contracts_path}}` | spec | path | Path to the companion `.contracts.md` |
| `{{slice_number}}` | tasks | inline | Slice number within the tasks file |
| `{{slice_goal}}` | tasks | inline | Slice goal statement |
| `{{slice_tasks}}` | tasks | inline | Task checklist for the slice |
| `{{tasks_path}}` | tasks | path | Path to the source `.tasks.md` |

Next-step mapping (the content `{{next_step}}` resolves to, per artifact type):

| Artifact type | `{{next_step}}` value |
|---------------|-----------------------|
| rfc | `smithy.render <rfc_path> <milestone_number>` |
| features | `smithy.mark` on this feature |
| spec | `smithy.cut <spec_folder> <user_story_number>` |
| tasks | `smithy.forge` on this slice |

Validation rules:
- Unknown `{{variable}}` names are left as literal text (no error).
- Missing content for a known variable results in the placeholder being replaced with an empty string.
- A variable used in a template for an artifact type that does not own it (e.g., `{{slice_number}}` in `rfc.md`) is treated as unknown and left literal.

## Relationships

- Issue Template 1:N Template Variable — each template contains multiple placeholders.
- Issue Template 1:1 Artifact Type — each template corresponds to exactly one of the four orders-eligible types.
- Built-in Default 1:1 Issue Template — each artifact type has one built-in fallback and at most one `.smithy/` override.

## State Transitions

### Content Lifecycle

1. `absent` → `created`
   - Trigger: User accepts template creation during `smithy init`.
   - Effects: The four template files are written into `.smithy/`. The `smithy-manifest.json` in the same directory is untouched.

2. `created` → `customized`
   - Trigger: User manually edits template files.
   - Effects: `orders` uses modified templates; smithy does not track edits.

3. `created` / `customized` → `overwritten`
   - Trigger: User accepts the overwrite prompt during `smithy init` when one or more of the four template files already exist.
   - Effects: The four known template files are replaced with current defaults; extra files in `.smithy/` (including `smithy-manifest.json` and any user extras) are preserved.

## Identity & Uniqueness

- Templates are uniquely identified by their file name within `.smithy/`, which maps 1:1 to artifact type.
- There is no versioning — the file on disk is the current template.

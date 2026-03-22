# Data Model: Smithy Orders Issue Templates

## Overview

This model defines the issue template files that live in `.smithy/` and the placeholder variables that `smithy.orders` interpolates when creating GitHub issues.

## Entities

### 1) Issue Template (`.smithy/<type>.md`)

Purpose: Defines the body structure for GitHub issues created by `orders` for a specific artifact type.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `file_name` | string | Yes | Matches artifact type (rfc/features/spec/tasks) and uses filenames `rfc.md`, `features.md`, `spec.md`, `tasks.md` — these are template filenames, not artifact extensions |
| `body` | markdown | Yes | Template body with `{{variable}}` placeholders |

Validation rules:
- File must be valid markdown
- File must contain at least one `{{variable}}` placeholder to be useful (but not enforced — an empty/static file falls back to defaults)

### 2) Template Variable

Purpose: A named placeholder within a template that `orders` replaces with artifact-derived content.

| Variable | Available In | Content Type | Notes |
|----------|-------------|--------------|-------|
| `{{title}}` | all | inline | Issue title derived from artifact |
| `{{artifact_path}}` | all | path | Repo-relative path to the source artifact |
| `{{next_step}}` | all | inline | The smithy command to run next (render/mark/cut/forge) |
| `{{milestone_title}}` | rfc | inline | Milestone name from the RFC |
| `{{milestone_description}}` | rfc | inline | Milestone description text |
| `{{rfc_path}}` | rfc | path | Path to the source `.rfc.md` |
| `{{feature_title}}` | features | inline | Feature name from the feature map |
| `{{feature_description}}` | features | inline | Feature description text |
| `{{features_path}}` | features | path | Path to the source `.features.md` |
| `{{user_story}}` | spec | inline | Full user story text (as a/I want/so that) |
| `{{user_story_number}}` | spec | inline | Story number (e.g., "3") |
| `{{acceptance_scenarios}}` | spec | inline | Given/When/Then scenarios for the story |
| `{{priority}}` | spec | inline | Story priority (P1/P2/P3) |
| `{{spec_path}}` | spec | path | Path to the source `.spec.md` |
| `{{data_model_path}}` | spec | path | Path to the companion `.data-model.md` |
| `{{contracts_path}}` | spec | path | Path to the companion `.contracts.md` |
| `{{slice_number}}` | tasks | inline | Slice number within the tasks file |
| `{{slice_goal}}` | tasks | inline | Slice goal statement |
| `{{slice_tasks}}` | tasks | inline | Task checklist for the slice |
| `{{tasks_path}}` | tasks | path | Path to the source `.tasks.md` |
| `{{parent_issue}}` | tasks, features | inline | Reference to parent issue if found (e.g., `#42`) |

Validation rules:
- Unknown `{{variable}}` names are left as literal text (no error)
- Missing content for a known variable results in the placeholder being replaced with an empty string

## Relationships

- Issue Template 1:N Template Variable — each template contains multiple placeholders.
- Issue Template 1:1 Artifact Type — each template corresponds to exactly one file extension.
- Built-in Default 1:1 Issue Template — each artifact type has one built-in fallback and at most one `.smithy/` override.

## State Transitions

### Template Lifecycle

1. `absent` → `created`
   - Trigger: User accepts template creation during `smithy init`
   - Effects: `.smithy/` directory created with 4 template files

2. `created` → `customized`
   - Trigger: User manually edits template files
   - Effects: `orders` uses modified templates; no smithy tracking of changes

3. `created` → `gitignored`
   - Trigger: User chooses not to commit during init
   - Effects: `.smithy/` added to `.gitignore`

## Identity & Uniqueness

- Templates are uniquely identified by their file name within `.smithy/`, which maps 1:1 to artifact type.
- There is no versioning — the file on disk is the current template.

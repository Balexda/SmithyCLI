# Data Model: Smithy Orders Issue Templates

## Overview

This model defines the issue-body templates that `smithy.orders` consumes and the placeholder variables it interpolates when creating GitHub issues. The templates live under a deploy-location-aware directory: `<manifestDir>/templates/orders/<type>.md`, where `<manifestDir>` is resolved by `resolveManifestDir(deployLocation)` in `src/manifest.ts:32-37` — `.smithy/` (relative to the target repo) when `smithy init` was run with `--location repo`, and `~/.smithy/` when run with `--location user`.

Four template files are in scope — one per orders-eligible artifact type. They are siblings of each other inside `<manifestDir>/templates/orders/`, and peers (through the shared `<manifestDir>` root) of the CLI-owned `<manifestDir>/smithy-manifest.json`, which is owned by the manifest flow in `src/manifest.ts` and is not a template. The `templates/` subtree is reserved for user-customisable template families; future families (`<manifestDir>/templates/artifacts/…` for planning-doc templates invoked by `smithy.mark`, `smithy.ignite`, etc.) are out of scope here but will follow the same convention.

## Entities

### 1) Issue Template (`<manifestDir>/templates/orders/<type>.md`)

Purpose: Defines the body structure for GitHub issues created by `orders` for a specific artifact type.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `file_name` | string | Yes | One of `rfc.md`, `features.md`, `spec.md`, `tasks.md`. These are template filenames, not artifact extensions — the `<type>` segment matches the artifact type (`rfc`, `features`, `spec`, `tasks`) derived from the source file's extension (`.rfc.md`, `.features.md`, …). |
| `body` | markdown | Yes | Template body with `{{variable}}` placeholders |

Scope:
- Each of the four files defines the **child** issue body for its artifact type: `rfc.md` is used for per-milestone issues, `features.md` for per-feature issues, `spec.md` for per-user-story issues, `tasks.md` for per-slice issues.
- The RFC **parent** tracking issue (created once per `.rfc.md`) is not user-overridable through this feature; its body remains hardcoded in `smithy.orders`.
- `.strike.md`, `.prd.md`, `.data-model.md`, and `.contracts.md` are not orders-eligible and have no corresponding template. `smithy init` does not create files for them and `smithy.orders` never consults `<manifestDir>/templates/orders/` on their behalf.

Non-template files under `<manifestDir>`:
- `<manifestDir>/smithy-manifest.json` is owned by the CLI manifest flow (`src/manifest.ts`) and is **not** a template. The resolver only looks under `<manifestDir>/templates/orders/`, so the manifest is never read as a template; init must never modify it while provisioning templates.
- Any other file a user drops into `<manifestDir>/templates/orders/` (README drafts, backups, etc.) is ignored by resolution (only the four canonical `<type>.md` files are consulted) and preserved by provisioning.

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
- Built-in Default 1:1 Issue Template — each artifact type has one built-in fallback and at most one `<manifestDir>/templates/orders/<type>.md` override.

## State Transitions

### Content Lifecycle

1. `absent` → `created`
   - Trigger: `smithy init` runs and no `<manifestDir>/templates/orders/<type>.md` files exist. Init provisions the four defaults unconditionally as part of standard setup (there is no opt-in prompt).
   - Effects: The four template files are written into `<manifestDir>/templates/orders/`, creating the `templates/` and `orders/` subdirectories as needed. `<manifestDir>/smithy-manifest.json` and any other `<manifestDir>` siblings are untouched.

2. `created` → `customized`
   - Trigger: User manually edits template files.
   - Effects: `orders` uses modified templates; smithy does not track edits.

3. `created` / `customized` → `overwritten`
   - Trigger: User accepts the overwrite prompt during `smithy init` when one or more of the four template files already exist at their resolved paths.
   - Effects: The four known template files are replaced with current defaults; extra files inside `<manifestDir>/templates/orders/` and every sibling of `<manifestDir>/templates/` (including `smithy-manifest.json`) are preserved.

## Identity & Uniqueness

- Templates are uniquely identified by the pair `(<manifestDir>, <type>)`: the file name maps 1:1 to artifact type within a given `<manifestDir>`.
- Under `--location user`, identity is global to the machine — every repo that reads the shared `~/.smithy/` sees the same template set. Under `--location repo`, identity is per-repo. Switching `deployLocation` between `smithy init` runs effectively addresses a different template set; cross-location migration is out of scope for this feature.
- There is no versioning — the file on disk is the current template.

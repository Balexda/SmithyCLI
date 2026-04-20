# Contracts: Smithy Orders Issue Templates

## Overview

This feature introduces three integration boundaries: (1) `smithy init` provisions templates, (2) `smithy.orders` resolves and interpolates templates, and (3) template files define a placeholder contract between authors and the orders command.

All three boundaries operate relative to `<manifestDir>`, the directory resolved by `resolveManifestDir(deployLocation)` in `src/manifest.ts:32-37` — `.smithy/` (relative to the target repo) when `smithy init` was run with `--location repo`, and `~/.smithy/` when run with `--location user`. The active `deployLocation` (`DeployLocation` = `'repo' | 'user'` in `src/manifest.ts:5`) is the one persisted on the manifest object (`src/manifest.ts:16`); both init and orders read it from there. Every contract below is written in `<manifestDir>`-relative terms and is explicit about which files it touches.

The four orders body templates live at `<manifestDir>/templates/orders/<type>.md`. They are siblings of each other under the `templates/orders/` subtree and peers (through the shared `<manifestDir>` root) of the CLI-owned `<manifestDir>/smithy-manifest.json`. Future peer template families (`<manifestDir>/templates/artifacts/…` for planning-doc templates consumed by `smithy.mark`, `smithy.ignite`, etc.) are out of scope for this feature but will follow the same `<manifestDir>/templates/<family>/…` convention.

## Interfaces

### Template Resolution Contract

**Purpose**: Defines how `orders` finds the correct template for a given artifact type.
**Consumers**: `smithy.orders` command
**Providers**: `<manifestDir>/templates/orders/` (user-managed) or built-in defaults (hardcoded)

#### Resolution Algorithm

1. Resolve `<manifestDir>` by loading the manifest and reading its `deployLocation` field (`src/manifest.ts:16`), then calling `resolveManifestDir(deployLocation)` (`src/manifest.ts:32-37`). If the manifest cannot be loaded, abort with a clear error — `smithy.orders` requires `smithy init` to have run.
2. Determine artifact type from the input file extension (`.rfc.md` → `rfc`, `.features.md` → `features`, `.spec.md` → `spec`, `.tasks.md` → `tasks`). `.strike.md`, `.prd.md`, and the `.data-model.md` / `.contracts.md` companions are not orders-eligible — orders rejects them upstream and never invokes this contract for them.
3. Check for `<manifestDir>/templates/orders/<type>.md`.
4. If found, use it as the body template (even if empty — the title is set independently, so an empty body is valid).
5. If not found, use the built-in default template for that type.

The resolver only considers files matching `<type>.md` for one of the four supported types, and only within `<manifestDir>/templates/orders/`. Any other file under `<manifestDir>` — most notably `<manifestDir>/smithy-manifest.json`, peer template families under `<manifestDir>/templates/` (once they exist), and any user-added READMEs, drafts, or backups — is ignored, never read, and never altered.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `artifact_path` | string | Yes | Path to the artifact file being processed |
| `manifest_dir` | string | Yes | `<manifestDir>` resolved from the loaded manifest's `deployLocation` (`src/manifest.ts:32-37`). Not derived from a `repo_root` — the `user` deploy location lives at `~/.smithy/`, not under the repo. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `template_body` | string | Markdown template content with `{{variable}}` placeholders |
| `template_source` | enum | `"custom"` if from `<manifestDir>/templates/orders/`, `"default"` if built-in |

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

**Purpose**: Defines how `smithy init` provisions the four default body templates under `<manifestDir>/templates/orders/` as a mandatory step of standard setup.
**Consumers**: Developer running `smithy init`
**Providers**: `smithy init` command

#### Flow

1. After agent selection (`promptAgent`), deploy-location selection (`promptDeployLocation` — `src/interactive.ts:51-66`), and permission setup (`promptPermissions`), resolve `<manifestDir>` via `resolveManifestDir(deployLocation)` (`src/manifest.ts:32-37`).
2. Ensure `<manifestDir>/templates/orders/` exists, creating the `templates/` and `orders/` subdirectories as needed. Creating these subdirectories must not modify `<manifestDir>/smithy-manifest.json` or any other sibling.
3. For each of the four template types (`rfc`, `features`, `spec`, `tasks`):
   - If `<manifestDir>/templates/orders/<type>.md` does not exist, write the default body. No opt-in prompt — provisioning is a requisite part of init, not a separate yes/no step (the legacy `promptIssueTemplates` flow is retired; see Legacy Retirement below).
   - If it exists, record it for the overwrite prompt.
4. If any files were recorded in step 3, prompt once: `"Overwrite existing orders templates at <manifestDir>/templates/orders/? (y/N)"` (default `no`). If accepted, write defaults to only the recorded files. If declined, leave all existing template files as-is.
5. Template provisioning never reads, modifies, truncates, or rewrites `<manifestDir>/smithy-manifest.json`, and never touches files outside `<manifestDir>/templates/orders/` — other `<manifestDir>/templates/<family>/` subtrees and user extras under `<manifestDir>/templates/orders/` (READMEs, drafts, backups) are preserved.

`smithy init` does not prompt about, write, or modify `.gitignore` for `<manifestDir>`. The CLI does not currently add `.smithy/*` entries to `.gitignore` at all — `agentGitignoreEntries` in `src/utils.ts:51-55` only covers `.claude/settings.local.json`. Template files are committable by default; teams that want to keep `<manifestDir>/smithy-manifest.json` (or any other file under `<manifestDir>`) out of VCS handle that through their existing gitignore policy, not through a smithy prompt.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deploy_location` | `'repo' \| 'user'` | Yes | The `DeployLocation` answer (`src/manifest.ts:5`) collected by `promptDeployLocation`. Drives `<manifestDir>` resolution. |
| `target_dir` | string | Yes | Target directory for `--location repo` (ignored for `--location user`, which resolves to `~/.smithy/`) |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `templates_written` | string[] | Paths of template files created or overwritten (empty if user declined the overwrite prompt and all four already existed) |
| `templates_preserved` | string[] | Paths of existing template files left untouched |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Some templates exist, others missing | Write missing defaults; prompt to overwrite existing | Per step 3 — new files are written unconditionally, existing files are gated by the single overwrite prompt |
| `<manifestDir>/templates/orders/` is not writable | Error and abort | Surface filesystem error to the user; do not partially write. Already-written files from an earlier step remain on disk (writes are per-file; no transactional rollback). |

## Events / Hooks

None. Template provisioning is a one-time init action; template resolution happens at `orders` runtime with no events.

## Integration Boundaries

- **`smithy init` → `<manifestDir>/templates/orders/<type>.md`**: Init writes the four default template files unconditionally for missing files and behind a single overwrite prompt for existing ones. This is the only smithy command that writes user body templates. Init must never read, modify, or delete `<manifestDir>/smithy-manifest.json` as part of this flow.
- **`smithy init` → `<manifestDir>/smithy-manifest.json`**: Owned by the existing manifest flow (`src/manifest.ts`). Template provisioning shares the `<manifestDir>` root but never touches this file.
- **`smithy.orders` → `<manifestDir>/templates/orders/<type>.md`**: Orders reads templates at runtime. Read-only — never modifies user templates. `<manifestDir>` is resolved from the manifest's persisted `deployLocation`; orders ignores `smithy-manifest.json`, any peer `<manifestDir>/templates/<family>/` subtree, and any non-`<type>.md` file.
- **`smithy.orders` → `gh issue create`**: Orders passes the rendered body to GitHub CLI. The template contract ends at the rendered markdown string.
- **`smithy uninit` → `<manifestDir>/templates/orders/`**: Uninit does NOT touch user body templates. Manifest cleanup remains the responsibility of the existing manifest flow.

## Legacy Retirement

This feature replaces the pre-rework `smithy.orders` YAML-forms flow. Implementation PRs derived from this spec must remove all three of the following, which were artifacts of an earlier design and are not reachable from the new `<manifestDir>/templates/orders/` contract:

- `src/templates/issues/` — directory of YAML GitHub issue-form templates (`smithy_bug_report.md`, `smithy_tech_debt.md`, `smithy_implementation_task.md`, `smithy_task_stub.md`, `config.yml`). These were installed flat under `<manifestDir>` (not under `.github/ISSUE_TEMPLATE/`, despite older docs claiming otherwise) and are superseded by the four `<manifestDir>/templates/orders/<type>.md` body templates defined here.
- `resolveIssueTemplatePath()` — the path helper in `src/utils.ts:25-30` that targeted the retired YAML forms.
- `promptIssueTemplates()` + the `--issue-templates` / `--no-issue-templates` CLI flags — the opt-in prompt in `src/interactive.ts:76-81` and its wiring in `src/commands/init.ts` and `src/cli.ts`. Orders templates are provisioned unconditionally per the Init Template Provisioning Contract above.

Cleanup of any already-deployed legacy YAML forms on user machines is handled by the next `smithy init` run (the new provisioning flow no longer writes them, and manifest-driven uninit/re-init can remove them if listed) or an ad-hoc manual step — out of scope for this contract.

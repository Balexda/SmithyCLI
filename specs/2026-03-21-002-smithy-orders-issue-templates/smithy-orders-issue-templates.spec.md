# Feature Specification: Smithy Orders Issue Templates

**Spec Folder**: `2026-03-21-002-smithy-orders-issue-templates`
**Branch**: `2026-03-21-002-smithy-orders-issue-templates`
**Created**: 2026-03-21
**Status**: Draft
**Input**: User description — create smithy-specific issue templates stored under `<manifestDir>/templates/orders/` (where `<manifestDir>` resolves to `.smithy/` or `~/.smithy/` per the user's `smithy init --location` choice) that `smithy.orders` uses when creating GitHub issues, with acceptance criteria designed to be usable as AI prompts.

## Clarifications

### Session 2026-03-21

- Q: Should templates use GitHub issue template frontmatter or be pure markdown body templates? → A: Pure markdown body templates. They serve a different role — prompt-ready body content that `orders` fills with artifact data.
- Q: Should there be a template for `.strike.md` artifacts? → A: No. Strikes are self-contained single-session artifacts (plan + implement in one PR). Only 4 templates: rfc, features, spec, tasks.
- Q: When does the user get prompted to create `.smithy/` templates? → A: During `smithy init`, alongside agent selection and permission setup.
- Q: How should the issue body reference artifact content — inline, by path, or hybrid? → A: Hybrid. Inline the most actionable content (acceptance scenarios, task checklists) and include repo-relative paths for full context.
- Q: What placeholder syntax should templates use? → A: `{{variable}}` (double curly braces). Widely recognized, visually distinct, won't conflict with shell or GitHub rendering.

### Session 2026-04-19

- Q: Should strike, PRD, or companion artifacts (`.data-model.md` / `.contracts.md`) get templates? → A: No. Scope stays at the four orders-eligible types: rfc, features, spec, tasks. Strike is self-contained, PRD has no orders mapping, and orders already rejects companions.
- Q: Should `smithy init` prompt the user to choose whether `<manifestDir>` is checked in or gitignored? → A: No. The CLI does not currently add `.smithy/*` entries to `.gitignore` at all (`agentGitignoreEntries` in `src/utils.ts:51-55` only covers `.claude/settings.local.json`); user-authored body templates are committable by default. The old US3 framed as "commit-or-gitignore" is removed — US3 is reintroduced as deployment-location awareness in the 2026-04-20 session below.
- Q: What happens to the four `.tasks.md` files under this spec folder? → A: Deleted. Their FR numbering, acceptance scenarios, and slicing no longer match this spec. Re-slicing is deferred to a follow-up `smithy.cut` run once spec / data-model / contracts updates land.

### Session 2026-04-20

- Q: Where do orders templates live relative to deploy location? → A: `<manifestDir>/templates/orders/<type>.md`, where `<manifestDir>` is resolved by `resolveManifestDir(deployLocation)` in `src/manifest.ts:32-37` — `.smithy/` (relative to the target repo) for `smithy init --location repo`, `~/.smithy/` for `smithy init --location user`. Init reuses the `deployLocation` answer already collected by `promptDeployLocation` (`src/interactive.ts:51-66`); no new prompt is added.
- Q: Should init's existing YAML issue-forms flow stay? → A: No. The legacy YAML forms (`src/templates/issues/*`), `resolveIssueTemplatePath()` in `src/utils.ts:25-30`, `promptIssueTemplates()` in `src/interactive.ts:76-81`, and the `--issue-templates` / `--no-issue-templates` CLI flags were leftovers from the pre-rework `smithy.orders`. This spec replaces them. Init no longer prompts to install issue templates; the four orders templates are provisioned unconditionally as part of the standard setup. Implementation PRs delete the legacy code and templates.
- Q: Why nest under `<manifestDir>/templates/orders/` instead of flat `<manifestDir>/orders/` or `<manifestDir>/<type>.md`? → A: Peer template families (`<manifestDir>/templates/artifacts/…` for future planning-doc templates invoked by `smithy.mark` / `smithy.ignite` / etc.) are coming. Grouping them under one `templates/` root keeps runtime state (`smithy-manifest.json`) cleanly separated from user-customisable template content and avoids name collisions as new families land.
- Q: Does the reintroduced US3 cover switching deploy location between init runs? → A: No. US3 asserts that provisioning and resolution both honor the active `deployLocation`. Migrating templates from one deploy location to another (or co-locating both) is out of scope and inherits whatever migration semantics the existing manifest flow provides.

## Artifact Hierarchy

Orders operates on the lineage `RFC → Milestone → Feature → User Story → Slice`. Each orders-eligible artifact type (`.rfc.md`, `.features.md`, `.spec.md`, `.tasks.md`) has a matching body template at `<manifestDir>/templates/orders/<type>.md`. `<manifestDir>` is resolved by `resolveManifestDir(deployLocation)` (`src/manifest.ts:32-37`) — `.smithy/` (relative to the target repo) when `smithy init` was run with `--location repo`, and `~/.smithy/` when run with `--location user`.

`.strike.md` and `.prd.md` also exist in the smithy template family but are **out of scope** for this feature — strike is self-contained (plan + implement in one PR) and PRD has no orders mapping. The companion files `.data-model.md` and `.contracts.md` are not orders-eligible either; orders rejects them upstream.

## User Scenarios & Testing

### User Story 1 — Provision orders templates during init (Priority: P1)

As a developer running `smithy init`, I want the four orders templates provisioned automatically so that `smithy.orders` works out of the box in the deploy location I selected, without an extra yes/no step.

**Why this priority**: Templates must exist before `orders` can use them. Init is the natural setup point, and making provisioning requisite (not opt-in) closes the gap where a user declined the old prompt and then hit a confusing fallback-only experience downstream.

**Independent Test**: Run `smithy init` in a fresh repo (either `--location repo` or `--location user`); after init completes, verify `<manifestDir>/templates/orders/rfc.md`, `features.md`, `spec.md`, and `tasks.md` exist with default content.

**Acceptance Scenarios**:

1. **Given** a fresh repo with no prior `smithy init`, **When** I run `smithy init --location repo`, **Then** `<repo>/.smithy/templates/orders/{rfc,features,spec,tasks}.md` are written with default bodies; `<repo>/.smithy/smithy-manifest.json` is written by the existing manifest flow in the same init run and is neither modified nor rewritten by template provisioning.
2. **Given** a fresh machine with no prior `smithy init`, **When** I run `smithy init --location user` in any repo, **Then** `~/.smithy/templates/orders/{rfc,features,spec,tasks}.md` are written; the target repo's own `.smithy/` is not created by template provisioning.
3. **Given** a repo where `<manifestDir>/smithy-manifest.json` already exists (the standard init flow writes it), **When** template provisioning runs, **Then** the manifest is neither read as a template, modified, truncated, nor rewritten.
4. **Given** one or more of the four template files already exist at `<manifestDir>/templates/orders/<type>.md`, **When** I run `smithy init`, **Then** init offers a single overwrite prompt (default `no`); if I decline, existing templates are preserved and any missing ones are still written with defaults.
5. **Given** I accept the overwrite prompt, **When** init runs, **Then** only the four canonical `<type>.md` files are replaced with defaults — `<manifestDir>/smithy-manifest.json`, other `<manifestDir>/templates/<family>/` subtrees (once they exist), and any user extras under `<manifestDir>/templates/orders/` (drafts, READMEs, backups) are preserved.

---

### User Story 2 — Orders uses templates when creating issues (Priority: P1)

As a developer running `smithy.orders`, I want the command to use my `<manifestDir>/templates/orders/` templates to format issue bodies so that the resulting issues contain structured acceptance criteria and are usable as AI prompts.

**Why this priority**: This is the core value proposition — templates shape the issue body that both humans and AI agents consume.

**Independent Test**: Customize a template at `<manifestDir>/templates/orders/<type>.md`, run `smithy.orders` against an artifact of that type, and verify the issue body matches the customised template structure with placeholders filled.

**Acceptance Scenarios**:

1. **Given** `<manifestDir>/templates/orders/spec.md` exists with `{{user_story}}` and `{{acceptance_scenarios}}` placeholders, **When** I run `smithy.orders path/to/feature.spec.md`, **Then** each created issue body has the user story text and acceptance scenarios inlined, following the template structure.
2. **Given** `<manifestDir>/templates/orders/rfc.md` exists, **When** I run `smithy.orders path/to/idea.rfc.md`, **Then** per-milestone issues use the rfc template with milestone titles from `### Milestone N: <Title>`, descriptions from `**Description**`, and success criteria from `**Success Criteria**` filled in. The RFC parent tracking issue continues to use the hardcoded body in `smithy.orders` — it is out of scope for this feature.
3. **Given** `<manifestDir>/templates/orders/features.md` exists, **When** I run `smithy.orders path/to/milestone.features.md`, **Then** per-feature issues use the features template with feature descriptions and milestone parent linkage filled in. When the source RFC's Dependency Order table records a path for this milestone in its `Artifact` column, `{{features_path}}` resolves to that path.
4. **Given** `<manifestDir>/templates/orders/tasks.md` exists, **When** I run `smithy.orders path/to/story.tasks.md`, **Then** per-slice issues use the tasks template with slice goals and task checklists inlined.
5. **Given** a `<manifestDir>/templates/orders/spec.md` template with `{{spec_path}}` and `{{data_model_path}}` placeholders, **When** `orders` creates issues from a `.spec.md` artifact, **Then** each issue body contains repo-relative paths to the source spec and companion files for full context.
6. **Given** any artifact type, **When** `orders` creates an issue using a template with `{{next_step}}`, **Then** the placeholder is populated with the correct next smithy command: rfc → `smithy.render <rfc_path> <milestone_number>`, features → `smithy.mark` on this feature, spec → `smithy.cut <spec_folder> <user_story_number>`, tasks → `smithy.forge` on this slice.

---

### User Story 3 — Deployment location is honored end-to-end (Priority: P1)

As a developer who ran `smithy init --location user`, I want both template provisioning and `smithy.orders` resolution to read and write `~/.smithy/templates/orders/`, so that my customized templates follow me across every repo on the machine without polluting each one — and conversely, for `--location repo` I want everything confined to the target repo's `.smithy/`.

**Why this priority**: Deploy location is a first-class init choice (`promptDeployLocation` in `src/interactive.ts:51-66`) that already determines where the manifest and permissions land. If templates don't honor the same answer, the feature forks from init's own mental model and silently breaks the multi-repo workflow that `--location user` was added to support.

**Independent Test**: Run `smithy init --location user` in a fresh repo; verify `~/.smithy/templates/orders/` is populated and the repo's own `.smithy/` is not. Then run `smithy.orders path/to/artifact.spec.md` in that repo and confirm the resulting issue bodies use the `~/.smithy/templates/orders/spec.md` template, not a built-in default. Repeat with `--location repo` and confirm the mirror behavior.

**Acceptance Scenarios**:

1. **Given** I run `smithy init --location repo` in `~/my-project`, **When** init completes, **Then** template files are written at `~/my-project/.smithy/templates/orders/{rfc,features,spec,tasks}.md` and nothing is written under `~/.smithy/`.
2. **Given** I run `smithy init --location user` in `~/my-project`, **When** init completes, **Then** template files are written at `~/.smithy/templates/orders/{rfc,features,spec,tasks}.md` and nothing under `~/my-project/.smithy/` is created or modified by template provisioning.
3. **Given** a machine whose `~/.smithy/smithy-manifest.json` records `deployLocation: "user"` (`src/manifest.ts:16`), **When** I run `smithy.orders path/to/feature.spec.md` in any repo on that machine, **Then** orders reads `~/.smithy/templates/orders/spec.md` to render issue bodies (not from any repo-local `.smithy/`).
4. **Given** a repo whose `.smithy/smithy-manifest.json` records `deployLocation: "repo"`, **When** I run `smithy.orders` in that repo, **Then** orders reads `<repo>/.smithy/templates/orders/<type>.md` — not `~/.smithy/templates/orders/`, even if the latter exists from a prior `--location user` install elsewhere.
5. **Given** `smithy init` has never been run, **When** I run `smithy.orders`, **Then** orders surfaces a clear error asking me to run `smithy init` first (the manifest is the source of truth for `deployLocation`; without it, orders cannot resolve `<manifestDir>`).

---

### User Story 4 — Orders falls back to built-in defaults (Priority: P1)

As a developer whose `<manifestDir>/templates/orders/` is missing one or more templates, I want `smithy.orders` to use sensible built-in default templates so that issue creation works out of the box and partial customization is supported.

**Why this priority**: Even though US1 provisions all four templates during init, a user may delete individual templates or run `orders` in a state where a template is missing (pre-init, mid-migration). Orders must still produce well-structured issue bodies.

**Independent Test**: In a smithy-initialized repo, delete `<manifestDir>/templates/orders/spec.md`, run `smithy.orders path/to/feature.spec.md`, and verify issues are created with well-structured bodies from the built-in default.

**Acceptance Scenarios**:

1. **Given** no `<manifestDir>/templates/orders/<type>.md` templates exist (e.g., after a manual `rm -rf`), **When** I run `smithy.orders path/to/feature.spec.md`, **Then** issues are created using built-in default body formatting with the same hybrid approach (inlined content + artifact paths).
2. **Given** `<manifestDir>/` exists with `smithy-manifest.json` but no `templates/orders/` subtree, **When** I run `smithy.orders` on any artifact, **Then** built-in defaults are used (no error, manifest untouched).
3. **Given** `<manifestDir>/templates/orders/` contains only some of the four body templates, **When** I run `smithy.orders` on a type missing a template, **Then** the built-in default for that type is used.
4. **Given** `<manifestDir>/templates/orders/` has all four body templates, **When** I run `smithy.orders`, **Then** customised templates take full precedence over built-in defaults.

---

### Edge Cases

- `<manifestDir>/templates/orders/<type>.md` templates contain invalid or unknown `{{placeholder}}` names — `orders` leaves them as literal text rather than erroring.
- A template file exists but is empty — `orders` uses it as-is (issue gets a title with no body). The file's presence is the override signal, not its content.
- When present, the manifest lives at `<manifestDir>/smithy-manifest.json` per the active `deployLocation` and is owned by the CLI (`src/manifest.ts`). Template provisioning must never touch it; resolution must never read it as a template. When the manifest is absent, `smithy.orders` cannot resolve `<manifestDir>` and surfaces a "run `smithy init` first" error (per US3 scenario 5).
- `.strike.md`, `.prd.md`, `.data-model.md`, and `.contracts.md` are not orders-eligible. `smithy init` does not create templates for them and `smithy.orders` never consults `<manifestDir>/templates/orders/` on their behalf.
- User runs `smithy uninit` — user body templates at `<manifestDir>/templates/orders/` are NOT removed (they are user content). Manifest cleanup follows the existing manifest flow.
- User manually creates `<manifestDir>/templates/orders/<type>.md` outside of `smithy init` — `orders` still detects and uses it on the next run.
- `<manifestDir>/templates/orders/` contains extras beyond the four known templates (e.g., `README.md`, drafts, backups) — overwrite during init touches only the four known `<type>.md` files and leaves extras untouched. Peer families under `<manifestDir>/templates/<other-family>/` (once they exist) are likewise never touched by orders provisioning or resolution.

## Dependency Order

| ID  | Title                                                 | Depends On | Artifact |
|-----|-------------------------------------------------------|------------|----------|
| US1 | Provision orders templates during init                | —          | —        |
| US2 | Orders uses templates when creating issues            | US1        | —        |
| US3 | Deployment location is honored end-to-end             | US1, US2   | —        |
| US4 | Orders falls back to built-in defaults                | US2        | —        |

## Requirements

### Functional Requirements

- **FR-001**: `smithy init` MUST provision the four orders template files unconditionally after agent selection, deploy-location selection, and permission setup. There is no opt-in prompt (the legacy `promptIssueTemplates` flow from `src/interactive.ts:76-81` is retired, per FR-011).
- **FR-002**: `smithy init` MUST write the four template files to `<manifestDir>/templates/orders/{rfc,features,spec,tasks}.md`, where `<manifestDir>` is resolved by `resolveManifestDir(deployLocation)` in `src/manifest.ts:32-37`. Init MUST create intermediate directories (`templates/`, `templates/orders/`) as needed.
- **FR-003**: When one or more of the four template files already exist at their resolved paths, `smithy init` MUST issue a single overwrite prompt (default `no`); declining preserves all existing template files and still writes defaults for any templates that were missing.
- **FR-004**: `smithy init` MUST NOT read, modify, truncate, or delete `<manifestDir>/smithy-manifest.json` or any file under `<manifestDir>` outside `templates/orders/<type>.md` while provisioning body templates.
- **FR-005**: `smithy.orders` MUST load the manifest, read its persisted `deployLocation` (`src/manifest.ts:16`), resolve `<manifestDir>` via `resolveManifestDir(deployLocation)`, and check `<manifestDir>/templates/orders/<artifact-type>.md` (where `<artifact-type>` ∈ `{rfc, features, spec, tasks}`) before creating issues; when found, the file MUST be used as the body template.
- **FR-006**: `smithy.orders` MUST fall back to built-in default templates when the resolved `<manifestDir>/templates/orders/<type>.md` is absent for the artifact type it is processing, regardless of deploy location.
- **FR-007**: Templates MUST use `{{variable}}` placeholder syntax for values that `orders` interpolates.
- **FR-008**: `orders` MUST support interpolation of inline content placeholders (e.g., `{{user_story}}`, `{{acceptance_scenarios}}`, `{{milestone_description}}`, `{{slice_tasks}}`) and path-reference placeholders (e.g., `{{rfc_path}}`, `{{spec_path}}`, `{{data_model_path}}`, `{{features_path}}`) for each of the four artifact types. The authoritative variable namespace per type lives in `smithy-orders-issue-templates.data-model.md`.
- **FR-009**: `smithy uninit` MUST NOT remove `<manifestDir>/templates/orders/<type>.md` body templates — they are user content.
- **FR-010**: Built-in default templates MUST produce issue bodies that follow the same hybrid format (inlined actionable content + repo-relative artifact paths) as user-authored templates.
- **FR-011**: Implementation PRs MUST retire the pre-rework YAML-forms flow that this spec replaces. That means deleting `src/templates/issues/` (the `smithy_*` YAML issue-form templates and `config.yml`), `resolveIssueTemplatePath()` in `src/utils.ts:25-30`, `promptIssueTemplates()` in `src/interactive.ts:76-81`, and the `--issue-templates` / `--no-issue-templates` CLI flags wired through `src/cli.ts` and `src/commands/init.ts`.

### Key Entities

- **Issue Template**: A markdown file at `<manifestDir>/templates/orders/<type>.md` containing a body structure with `{{variable}}` placeholders. One per orders-eligible artifact type (rfc, features, spec, tasks). Identity within a smithy installation is `(<manifestDir>, <type>)`; under `--location user` this is machine-global, under `--location repo` it is per-repo.
- **Template Variable**: A named placeholder that `orders` replaces with artifact-derived content. Variables are scoped to the artifact type; the full namespace lives in `smithy-orders-issue-templates.data-model.md`.
- **Built-in Default Template**: A hardcoded fallback body format within the `orders` command, used when no `<manifestDir>/templates/orders/<type>.md` file exists for the artifact type.

## Default Template Content

The following defines the default body structure for each of the 4 templates created by `smithy init`. These are the files written to `<manifestDir>/templates/orders/` and also serve as the built-in fallback when a template is absent.

### `<manifestDir>/templates/orders/rfc.md` — RFC milestone issue

```markdown
# {{title}}

**Milestone {{milestone_number}}**: {{milestone_title}}

{{milestone_description}}

## Success Criteria

{{milestone_success_criteria}}

## Source

- RFC: `{{rfc_path}}`

**Parent**: {{parent_issue}}

## Next Step

Run `{{next_step}}` to produce a feature map for this milestone.
```

### `<manifestDir>/templates/orders/features.md` — Feature issue

```markdown
# {{title}}

{{feature_description}}

**Milestone {{milestone_number}}** — parent issue: {{parent_issue}}

## Source

- Feature map: `{{features_path}}`

## Next Step

Run `{{next_step}}` on this feature to produce a spec with user stories.
```

### `<manifestDir>/templates/orders/spec.md` — User story issue

```markdown
# {{title}}

**Priority**: {{priority}} | **Story #{{user_story_number}}**

{{user_story}}

## Acceptance Criteria

{{acceptance_scenarios}}

## Context

- Spec: `{{spec_path}}`
- Data Model: `{{data_model_path}}`
- Contracts: `{{contracts_path}}`

## Next Step

Run `{{next_step}}` (equivalent to `smithy.cut {{spec_folder}} {{user_story_number}}`) to decompose this story into implementable slices, then `smithy.forge` on each slice.
```

### `<manifestDir>/templates/orders/tasks.md` — Slice issue

```markdown
# {{title}}

**Slice {{slice_number}}**

{{slice_goal}}

## Tasks

{{slice_tasks}}

## Context

- Tasks file: `{{tasks_path}}`

**Story issue**: {{parent_issue}}

## Next Step

Run `{{next_step}}` to implement this slice as a PR.
```

## Assumptions

- `smithy.orders` is already implemented and today hardcodes issue bodies inline in `src/templates/agent-skills/commands/smithy.orders.prompt`. This feature changes `orders` to consult `<manifestDir>/templates/orders/<type>.md` first and fall back to those hardcoded bodies as defaults when no template is present.
- The `{{variable}}` names defined in these templates (and catalogued in `smithy-orders-issue-templates.data-model.md`) become the interface between templates and `orders` — changes require coordination.
- `<manifestDir>/smithy-manifest.json` is created by the existing manifest flow (`src/manifest.ts`). The CLI does not currently add any `.smithy/*` entries to `.gitignore` — `agentGitignoreEntries` in `src/utils.ts:51-55` only covers `.claude/settings.local.json`. Template files under `<manifestDir>/templates/orders/` are committable by default (for `--location repo`); teams that want to keep the manifest or any other `<manifestDir>` file out of VCS handle that through their own gitignore policy, not through a smithy prompt. `--location user` templates live under `~/.smithy/` and are outside any target repo.
- GitHub CLI (`gh`) is available and authenticated for issue creation.
- Smithy artifacts (specs, RFCs, features maps, tasks files) are checked into the target repo so that repo-relative paths in issue bodies are valid references. Under `--location user`, templates may reference artifacts in whichever repo `orders` is run from — path placeholders are resolved relative to that repo.

## Specification Debt

_None — all ambiguities resolved._

## Out of Scope

- Implementation of `smithy.orders` itself (separate spec/task); this feature only defines the template contract it consumes.
- Body templates for `.strike.md`, `.prd.md`, `.data-model.md`, or `.contracts.md` — those artifacts are not orders-eligible.
- The RFC parent tracking issue's body (created once per `.rfc.md`); its body remains hardcoded in `smithy.orders` and is not user-overridable through this feature.
- Template versioning or migration when smithy upgrades default templates.
- Future `<manifestDir>/templates/artifacts/` planning-doc templates (for `smithy.mark`, `smithy.ignite`, and other planning commands) — those will follow the same `<manifestDir>/templates/<family>/…` convention this spec establishes, but are owned by a separate spec.
- Migration of any pre-existing flat `<manifestDir>/<type>.md` templates to the new `<manifestDir>/templates/orders/<type>.md` layout — the flat layout was never shipped, so no in-tree user exists to migrate.
- Cleanup of legacy `src/templates/issues/` YAML form files already deployed under `<manifestDir>` on user machines. FR-011 deletes the source directory and removes the installer; the next `smithy init` run simply won't redeploy them. Any manual cleanup is an operator task.
- Template inheritance or composition (e.g., a base template that others extend).
- A commit-or-gitignore prompt for `<manifestDir>` during `smithy init`.
- Switching `deployLocation` between init runs (e.g., migrating templates from `~/.smithy/` to a repo-local `.smithy/` or vice versa) — this inherits whatever migration semantics the existing manifest flow provides and is not specially handled here.
- Re-slicing of the four deleted `.tasks.md` files; a follow-up `smithy.cut` run handles that once this spec / data-model / contracts rework lands.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Running `smithy init` in a fresh repo produces `<manifestDir>/templates/orders/` with four well-structured `<type>.md` files, without any opt-in prompt, alongside the `<manifestDir>/smithy-manifest.json` the existing manifest flow writes.
- **SC-002**: An issue created by `orders` using `<manifestDir>/templates/orders/<type>.md` contains enough context (inlined content + artifact paths) for a coding agent (e.g., GitHub Copilot) to act on it without additional information.
- **SC-003**: An issue created by `orders` without any `<manifestDir>/templates/orders/<type>.md` file has the same structural quality as one created with templates (built-in fallback parity).
- **SC-004**: Running `smithy init` twice in the same repo never modifies or corrupts `<manifestDir>/smithy-manifest.json`, regardless of the overwrite choice.
- **SC-005**: Running `smithy init --location user` provisions `~/.smithy/templates/orders/` and leaves the target repo's `.smithy/` untouched by template provisioning; running `smithy init --location repo` provisions `<targetDir>/.smithy/templates/orders/` and never writes to `~/.smithy/`. In each case, `smithy.orders` reads from the matching `<manifestDir>` as recorded in the manifest's `deployLocation` field.

# Feature Specification: Smithy Orders Issue Templates

**Spec Folder**: `2026-03-21-002-smithy-orders-issue-templates`
**Branch**: `2026-03-21-002-smithy-orders-issue-templates`
**Created**: 2026-03-21
**Status**: Draft
**Input**: User description — create smithy-specific issue templates stored under `.smithy/` that `smithy.orders` uses when creating GitHub issues, with acceptance criteria designed to be usable as AI prompts.

## Clarifications

### Session 2026-03-21

- Q: Should templates use GitHub issue template frontmatter or be pure markdown body templates? → A: Pure markdown body templates. They serve a different role — prompt-ready body content that `orders` fills with artifact data.
- Q: Should there be a template for `.strike.md` artifacts? → A: No. Strikes are self-contained single-session artifacts (plan + implement in one PR). Only 4 templates: rfc, features, spec, tasks.
- Q: When does the user get prompted to create `.smithy/` templates? → A: During `smithy init`, alongside agent selection and permission setup.
- Q: How should the issue body reference artifact content — inline, by path, or hybrid? → A: Hybrid. Inline the most actionable content (acceptance scenarios, task checklists) and include repo-relative paths for full context.
- Q: What placeholder syntax should templates use? → A: `{{variable}}` (double curly braces). Widely recognized, visually distinct, won't conflict with shell or GitHub rendering.

### Session 2026-04-19

- Q: Should strike, PRD, or companion artifacts (`.data-model.md` / `.contracts.md`) get templates? → A: No. Scope stays at the four orders-eligible types: rfc, features, spec, tasks. Strike is self-contained, PRD has no orders mapping, and orders already rejects companions.
- Q: Should `smithy init` prompt the user to choose whether `.smithy/` is checked in or gitignored? → A: No. `.smithy/smithy-manifest.json` is already gitignored by the existing init flow (`agentGitignoreEntries` in `src/utils.ts`); user-authored body templates live alongside it and are committable by default. US3 (commit-or-gitignore) is removed.
- Q: What happens to the four `.tasks.md` files under this spec folder? → A: Deleted. Their FR numbering, acceptance scenarios, and slicing no longer match this spec. Re-slicing is deferred to a follow-up `smithy.cut` run once spec / data-model / contracts updates land.

## Artifact Hierarchy

Orders operates on the lineage `RFC → Milestone → Feature → User Story → Slice`. Each orders-eligible artifact type (`.rfc.md`, `.features.md`, `.spec.md`, `.tasks.md`) has a matching body template in `.smithy/`.

`.strike.md` and `.prd.md` also exist in the smithy template family but are **out of scope** for this feature — strike is self-contained (plan + implement in one PR) and PRD has no orders mapping. The companion files `.data-model.md` and `.contracts.md` are not orders-eligible either; orders rejects them upstream.

## User Scenarios & Testing

### User Story 1 — Create `.smithy/` issue templates during init (Priority: P1)

As a developer running `smithy init`, I want to be offered the option to create `.smithy/` issue templates so that I can customize how `smithy.orders` formats the GitHub issues it creates.

**Why this priority**: Templates must exist before `orders` can use them. Init is the natural setup point.

**Independent Test**: Run `smithy init` in a fresh repo, accept the template creation prompt, and verify that `.smithy/` is created with 4 template files.

**Acceptance Scenarios**:

1. **Given** a repo without `.smithy/<type>.md` body templates, **When** I run `smithy init` and accept the template prompt, **Then** `.smithy/rfc.md`, `.smithy/features.md`, `.smithy/spec.md`, and `.smithy/tasks.md` are created.
2. **Given** a repo without those templates, **When** I run `smithy init` and decline the template prompt, **Then** no template files are written (any pre-existing `.smithy/smithy-manifest.json` is left untouched).
3. **Given** a repo where `.smithy/smithy-manifest.json` already exists (the standard init flow writes it), **When** template creation runs, **Then** the manifest file is neither modified nor rewritten by this step.
4. **Given** one or more of the four template files already exist, **When** I run `smithy init`, **Then** init offers to *overwrite* (not create); if I decline, existing templates are preserved.
5. **Given** I accept the overwrite prompt, **When** init runs, **Then** only the four `<type>.md` files are replaced with defaults — `smithy-manifest.json` and any user-added extras in `.smithy/` are preserved.

---

### User Story 2 — Orders uses `.smithy/` templates when creating issues (Priority: P1)

As a developer running `smithy.orders`, I want the command to use my `.smithy/` templates to format issue bodies so that the resulting issues contain structured acceptance criteria and are usable as AI prompts.

**Why this priority**: This is the core value proposition — templates shape the issue body that both humans and AI agents consume.

**Independent Test**: Place custom templates in `.smithy/`, run `smithy.orders` against each artifact type, and verify the issue bodies match the template structure with placeholders filled.

**Acceptance Scenarios**:

1. **Given** `.smithy/spec.md` exists with `{{user_story}}` and `{{acceptance_scenarios}}` placeholders, **When** I run `smithy.orders path/to/feature.spec.md`, **Then** each created issue body has the user story text and acceptance scenarios inlined, following the template structure.
2. **Given** `.smithy/rfc.md` exists, **When** I run `smithy.orders path/to/idea.rfc.md`, **Then** per-milestone issues use the rfc template with milestone titles from `### Milestone N: <Title>`, descriptions from `**Description**`, and success criteria from `**Success Criteria**` filled in. The RFC parent tracking issue continues to use the hardcoded body in `smithy.orders` — it is out of scope for this feature.
3. **Given** `.smithy/features.md` exists, **When** I run `smithy.orders path/to/milestone.features.md`, **Then** per-feature issues use the features template with feature descriptions and milestone parent linkage filled in. When the source RFC's Dependency Order table records a path for this milestone in its `Artifact` column, `{{features_path}}` resolves to that path.
4. **Given** `.smithy/tasks.md` exists, **When** I run `smithy.orders path/to/story.tasks.md`, **Then** per-slice issues use the tasks template with slice goals and task checklists inlined.
5. **Given** a `.smithy/spec.md` template with `{{spec_path}}` and `{{data_model_path}}` placeholders, **When** `orders` creates issues from a `.spec.md` artifact, **Then** each issue body contains repo-relative paths to the source spec and companion files for full context.
6. **Given** any artifact type, **When** `orders` creates an issue using a template with `{{next_step}}`, **Then** the placeholder is populated with the correct next smithy command: rfc → `smithy.render <rfc_path> <milestone_number>`, features → `smithy.mark` on this feature, spec → `smithy.cut <spec_folder> <user_story_number>`, tasks → `smithy.forge` on this slice.

---

### User Story 3 — Orders falls back to built-in defaults (Priority: P1)

As a developer who hasn't created `.smithy/` templates, I want `smithy.orders` to use sensible built-in default templates so that issue creation works out of the box.

**Why this priority**: The templates are optional — orders must work without them.

**Independent Test**: Run `smithy.orders` in a repo with no `.smithy/<type>.md` files and verify issues are created with well-structured bodies.

**Acceptance Scenarios**:

1. **Given** no `.smithy/<type>.md` templates exist, **When** I run `smithy.orders path/to/feature.spec.md`, **Then** issues are created using built-in default body formatting with the same hybrid approach (inlined content + artifact paths).
2. **Given** `.smithy/` exists with `smithy-manifest.json` but no body templates, **When** I run `smithy.orders` on any artifact, **Then** built-in defaults are used (no error, manifest untouched).
3. **Given** `.smithy/` contains only some of the four body templates, **When** I run `smithy.orders` on a type missing a template, **Then** the built-in default for that type is used.
4. **Given** `.smithy/` has all four body templates, **When** I run `smithy.orders`, **Then** `.smithy/` templates take full precedence over built-in defaults.

---

### Edge Cases

- `.smithy/<type>.md` templates contain invalid or unknown `{{placeholder}}` names — `orders` leaves them as literal text rather than erroring.
- A template file exists but is empty — `orders` uses it as-is (issue gets a title with no body). The file's presence is the override signal, not its content.
- `.smithy/smithy-manifest.json` is always present and owned by the CLI (`src/manifest.ts`). Template provisioning must never touch it; resolution must never read it as a template.
- `.strike.md`, `.prd.md`, `.data-model.md`, and `.contracts.md` are not orders-eligible. `smithy init` does not create templates for them and `smithy.orders` never consults `.smithy/` on their behalf.
- User runs `smithy uninit` — user body templates are NOT removed (they are user content). Manifest cleanup follows the existing manifest flow.
- User manually creates `.smithy/<type>.md` outside of `smithy init` — `orders` still detects and uses them.
- `.smithy/` contains extra files beyond the four known templates and the manifest (e.g., `README.md`, drafts, backups) — overwrite during init replaces only the four known `<type>.md` files and leaves extras untouched.

## Dependency Order

| ID  | Title                                                 | Depends On | Artifact |
|-----|-------------------------------------------------------|------------|----------|
| US1 | Create `.smithy/` issue templates during init         | —          | —        |
| US2 | Orders uses `.smithy/` templates when creating issues | US1        | —        |
| US3 | Orders falls back to built-in defaults                | US2        | —        |

## Requirements

### Functional Requirements

- **FR-001**: `smithy init` MUST prompt the user to create `.smithy/<type>.md` issue templates after agent and permission setup.
- **FR-002**: When accepted, `smithy init` MUST write exactly four template files: `.smithy/rfc.md`, `.smithy/features.md`, `.smithy/spec.md`, `.smithy/tasks.md`.
- **FR-003**: When one or more of the four template files already exist, `smithy init` MUST offer to *overwrite* (default no) rather than silently skipping or creating.
- **FR-004**: `smithy init` MUST NOT read, modify, truncate, or delete `.smithy/smithy-manifest.json` or any non-`<type>.md` file in `.smithy/` while provisioning body templates.
- **FR-005**: `smithy.orders` MUST check for `.smithy/<artifact-type>.md` (where `<artifact-type>` ∈ `{rfc, features, spec, tasks}`) before creating issues and use it as the body template if found.
- **FR-006**: `smithy.orders` MUST fall back to built-in default templates when a `.smithy/<type>.md` file is absent for the artifact type it is processing.
- **FR-007**: Templates MUST use `{{variable}}` placeholder syntax for values that `orders` interpolates.
- **FR-008**: `orders` MUST support interpolation of inline content placeholders (e.g., `{{user_story}}`, `{{acceptance_scenarios}}`, `{{milestone_description}}`, `{{slice_tasks}}`) and path-reference placeholders (e.g., `{{rfc_path}}`, `{{spec_path}}`, `{{data_model_path}}`, `{{features_path}}`) for each of the four artifact types.
- **FR-009**: `smithy uninit` MUST NOT remove `.smithy/<type>.md` body templates.
- **FR-010**: Built-in default templates MUST produce issue bodies that follow the same hybrid format (inlined actionable content + repo-relative artifact paths) as user-authored templates.

### Key Entities

- **Issue Template**: A markdown file in `.smithy/` containing a body structure with `{{variable}}` placeholders. One per orders-eligible artifact type (rfc, features, spec, tasks). Coexists with `.smithy/smithy-manifest.json`.
- **Template Variable**: A named placeholder that `orders` replaces with artifact-derived content. Variables are scoped to the artifact type; the full namespace lives in `smithy-orders-issue-templates.data-model.md`.
- **Built-in Default Template**: A hardcoded fallback body format within the `orders` command, used when no `.smithy/<type>.md` file exists for the artifact type.

## Default Template Content

The following defines the default body structure for each of the 4 templates created by `smithy init`. These are the files written to `.smithy/` and also serve as the built-in fallback when `.smithy/` is absent.

### `.smithy/rfc.md` — RFC milestone issue

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

### `.smithy/features.md` — Feature issue

```markdown
# {{title}}

{{feature_description}}

**Milestone {{milestone_number}}** — parent issue: {{parent_issue}}

## Source

- Feature map: `{{features_path}}`

## Next Step

Run `{{next_step}}` on this feature to produce a spec with user stories.
```

### `.smithy/spec.md` — User story issue

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

### `.smithy/tasks.md` — Slice issue

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

- `smithy.orders` is already implemented and today hardcodes issue bodies inline in `src/templates/agent-skills/commands/smithy.orders.prompt`. This feature changes `orders` to consult `.smithy/<type>.md` first and fall back to those hardcoded bodies as defaults when no template is present.
- The `{{variable}}` names defined in these templates (and catalogued in `smithy-orders-issue-templates.data-model.md`) become the interface between templates and `orders` — changes require coordination.
- `.smithy/smithy-manifest.json` is already created and gitignored by the existing init flow (`src/utils.ts` → `agentGitignoreEntries`). User body templates in the same directory are committable by default.
- GitHub CLI (`gh`) is available and authenticated for issue creation.
- Smithy artifacts (specs, RFCs, features maps, tasks files) are checked into the repo so that repo-relative paths in issue bodies are valid references.

## Specification Debt

_None — all ambiguities resolved._

## Out of Scope

- Implementation of `smithy.orders` itself (separate spec/task); this feature only defines the template contract it consumes.
- Body templates for `.strike.md`, `.prd.md`, `.data-model.md`, or `.contracts.md` — those artifacts are not orders-eligible.
- The RFC parent tracking issue's body (created once per `.rfc.md`); its body remains hardcoded in `smithy.orders` and is not user-overridable through this feature.
- Template versioning or migration when smithy upgrades default templates.
- GitHub issue form templates (YAML-based under `.github/ISSUE_TEMPLATE/`) — those already exist as a separate mechanism (`src/templates/issues/`, deployed by `smithy init`) and are unrelated to the body templates defined here.
- Template inheritance or composition (e.g., a base template that others extend).
- A commit-or-gitignore prompt for `.smithy/` during `smithy init`.
- Re-slicing of the four deleted `.tasks.md` files; a follow-up `smithy.cut` run handles that once this spec / data-model / contracts rework lands.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Running `smithy init` in a fresh repo and accepting templates produces `.smithy/` with four well-structured `<type>.md` files alongside the existing `smithy-manifest.json`.
- **SC-002**: An issue created by `orders` using `.smithy/<type>.md` contains enough context (inlined content + artifact paths) for a coding agent (e.g., GitHub Copilot) to act on it without additional information.
- **SC-003**: An issue created by `orders` without any `.smithy/<type>.md` file has the same structural quality as one created with templates (built-in fallback parity).
- **SC-004**: Running `smithy init` twice in the same repo never modifies or corrupts `.smithy/smithy-manifest.json`, regardless of the overwrite choice.

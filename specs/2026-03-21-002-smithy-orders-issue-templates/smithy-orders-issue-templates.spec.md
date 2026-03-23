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

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

## User Scenarios & Testing

### User Story 1 — Create `.smithy/` issue templates during init (Priority: P1)

As a developer running `smithy init`, I want to be offered the option to create `.smithy/` issue templates so that I can customize how `smithy.orders` formats the GitHub issues it creates.

**Why this priority**: Templates must exist before `orders` can use them. Init is the natural setup point.

**Independent Test**: Run `smithy init` in a fresh repo, accept the template creation prompt, and verify that `.smithy/` is created with 4 template files.

**Acceptance Scenarios**:

1. **Given** a repo without `.smithy/`, **When** I run `smithy init` and accept the template prompt, **Then** `.smithy/` is created with `rfc.md`, `features.md`, `spec.md`, and `tasks.md` template files.
2. **Given** a repo without `.smithy/`, **When** I run `smithy init` and decline the template prompt, **Then** no `.smithy/` directory is created.
3. **Given** a repo with an existing `.smithy/` directory, **When** I run `smithy init`, **Then** init offers to *overwrite* the existing templates (not create). If the user declines, existing templates are preserved.
4. **Given** a repo with an existing `.smithy/` directory, **When** I accept the overwrite prompt, **Then** the 4 template files are replaced with the current defaults.

---

### User Story 2 — Orders uses `.smithy/` templates when creating issues (Priority: P1)

As a developer running `smithy.orders`, I want the command to use my `.smithy/` templates to format issue bodies so that the resulting issues contain structured acceptance criteria and are usable as AI prompts.

**Why this priority**: This is the core value proposition — templates shape the issue body that both humans and AI agents consume.

**Independent Test**: Place custom templates in `.smithy/`, run `smithy.orders` against each artifact type, and verify the issue bodies match the template structure with placeholders filled.

**Acceptance Scenarios**:

1. **Given** `.smithy/spec.md` exists with `{{user_story}}` and `{{acceptance_scenarios}}` placeholders, **When** I run `smithy.orders path/to/feature.spec.md`, **Then** each created issue body has the user story text and acceptance scenarios inlined, following the template structure.
2. **Given** `.smithy/rfc.md` exists, **When** I run `smithy.orders path/to/idea.rfc.md`, **Then** the epic issue and per-milestone issues use the rfc template with milestone details filled in.
3. **Given** `.smithy/features.md` exists, **When** I run `smithy.orders path/to/milestone.features.md`, **Then** per-feature issues use the features template with feature descriptions filled in.
4. **Given** `.smithy/tasks.md` exists, **When** I run `smithy.orders path/to/story.tasks.md`, **Then** per-slice issues use the tasks template with slice goals and task checklists inlined.
5. **Given** a `.smithy/spec.md` template with `{{spec_path}}` and `{{data_model_path}}` placeholders, **When** `orders` creates issues from a `.spec.md` artifact, **Then** each issue body contains repo-relative paths to the source spec and companion files for full context.
6. **Given** any artifact type, **When** `orders` creates an issue using a template with `{{next_step}}`, **Then** the placeholder is populated with the correct next smithy command (rfc→render, features→mark, spec→cut, tasks→forge).

---

### User Story 3 — Commit-or-gitignore choice for `.smithy/` (Priority: P1)

As a developer creating `.smithy/` templates, I want to choose whether the directory is checked into the repo or gitignored so that I can control whether templates are shared with the team or kept personal.

**Why this priority**: This is a setup-time decision that affects the entire team's workflow. Must be part of the init flow.

**Independent Test**: Run `smithy init`, accept template creation, choose "do not commit", and verify `.smithy/` is added to `.gitignore`.

**Acceptance Scenarios**:

1. **Given** I accept template creation during `smithy init`, **When** I choose to check `.smithy/` into the repo, **Then** `.smithy/` is NOT added to `.gitignore` and templates are ready to commit.
2. **Given** I accept template creation during `smithy init`, **When** I choose NOT to check `.smithy/` into the repo, **Then** `.smithy/` is appended to `.gitignore`.
3. **Given** `.gitignore` already contains a `.smithy/` entry, **When** the user chooses to gitignore, **Then** no duplicate entry is added.
4. **Given** `.gitignore` does not exist, **When** the user chooses to gitignore, **Then** `.gitignore` is created with the `.smithy/` entry.

---

### User Story 4 — Orders falls back to built-in defaults (Priority: P2)

As a developer who hasn't created `.smithy/` templates, I want `smithy.orders` to use sensible built-in default templates so that issue creation works out of the box.

**Why this priority**: The templates are optional — orders must work without them. But the core template stories must land first.

**Independent Test**: Run `smithy.orders` in a repo with no `.smithy/` directory and verify issues are created with well-structured bodies.

**Acceptance Scenarios**:

1. **Given** no `.smithy/` directory exists, **When** I run `smithy.orders path/to/feature.spec.md`, **Then** issues are created using built-in default body formatting with the same hybrid approach (inlined content + artifact paths).
2. **Given** `.smithy/` exists but is missing `spec.md`, **When** I run `smithy.orders` on a `.spec.md` file, **Then** the built-in default for that artifact type is used (no error).
3. **Given** `.smithy/` exists with all templates, **When** I run `smithy.orders`, **Then** `.smithy/` templates take full precedence over built-in defaults.

---

### Edge Cases

- `.smithy/` templates contain invalid or unknown `{{placeholder}}` names — `orders` should leave them as-is (literal text) rather than erroring.
- A template file exists but is empty — `orders` should still use it (issue gets a title with no body). The file's presence is the override signal, not its content.
- User runs `smithy uninit` — `.smithy/` is NOT removed (it's user content, not smithy-deployed artifacts).
- User manually creates `.smithy/` outside of `smithy init` — `orders` should still detect and use the templates.
- `.smithy/` is gitignored but the user later wants to commit it — this is a manual git operation, not smithy's responsibility.
- `.smithy/` contains extra files beyond the 4 known templates (e.g., `README.md`, custom templates) — overwrite during init replaces only the 4 known files and leaves extras untouched.

## Requirements

### Functional Requirements

- **FR-001**: `smithy init` MUST prompt the user to create `.smithy/` issue templates after agent and permission setup.
- **FR-002**: `smithy init` MUST create 4 template files when accepted: `.smithy/rfc.md`, `.smithy/features.md`, `.smithy/spec.md`, `.smithy/tasks.md`.
- **FR-003**: When templates are created during this init run, `smithy init` MUST prompt the user to choose whether `.smithy/` is checked into the repo or added to `.gitignore`.
- **FR-004**: When `.smithy/` already exists, `smithy init` MUST offer to *overwrite* existing templates rather than silently skipping or creating.
- **FR-005**: `smithy.orders` MUST check for `.smithy/<artifact-type>.md` before creating issues and use it as the body template if found.
- **FR-006**: `smithy.orders` MUST fall back to built-in default templates when `.smithy/` templates are absent.
- **FR-007**: Templates MUST use `{{variable}}` placeholder syntax for values that `orders` interpolates.
- **FR-008**: `orders` MUST interpolate both inline content placeholders (e.g., `{{user_story}}`, `{{acceptance_scenarios}}`) and path reference placeholders (e.g., `{{spec_path}}`, `{{data_model_path}}`).
- **FR-009**: `smithy uninit` MUST NOT remove the `.smithy/` directory or its contents.
- **FR-010**: Built-in default templates MUST produce issue bodies that follow the same hybrid format (inlined actionable content + repo-relative artifact paths).

### Key Entities

- **Issue Template**: A markdown file in `.smithy/` containing a body structure with `{{variable}}` placeholders. One per artifact type (rfc, features, spec, tasks).
- **Template Variable**: A named placeholder that `orders` replaces with artifact-derived content. Variables are type-specific (e.g., `spec.md` templates have `{{user_story}}` while `tasks.md` templates have `{{slice_goal}}`).
- **Built-in Default Template**: A hardcoded fallback body format within the `orders` command, used when no `.smithy/` template exists for the artifact type.

## Default Template Content

The following defines the default body structure for each of the 4 templates created by `smithy init`. These are the files written to `.smithy/` and also serve as the built-in fallback when `.smithy/` is absent.

### `.smithy/rfc.md` — RFC milestone issue

```markdown
# {{title}}

{{milestone_description}}

## Source

- RFC: `{{rfc_path}}`
- Artifact: `{{artifact_path}}`

## Next Step

Run `smithy.{{next_step}}` on this milestone to break it into a feature map.

{{#parent_issue}}
**Parent**: {{parent_issue}}
{{/parent_issue}}
```

### `.smithy/features.md` — Feature issue

```markdown
# {{title}}

{{feature_description}}

## Source

- Feature map: `{{features_path}}`
- Artifact: `{{artifact_path}}`

{{#parent_issue}}
**Milestone issue**: {{parent_issue}}
{{/parent_issue}}

## Next Step

Run `smithy.{{next_step}}` on this feature to produce a spec with user stories.
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

Run `smithy.{{next_step}}` on story #{{user_story_number}} to decompose into implementable slices, then `smithy.forge` to implement each slice.
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
- Artifact: `{{artifact_path}}`

{{#parent_issue}}
**Story issue**: {{parent_issue}}
{{/parent_issue}}

## Next Step

Run `smithy.{{next_step}}` to implement this slice as a PR.
```

## Assumptions

- `smithy.orders` is not yet implemented — these templates define the contract that `orders` will consume.
- The `{{variable}}` names defined in these templates become the interface between templates and `orders` — changes require coordination.
- GitHub CLI (`gh`) is available and authenticated for issue creation.
- Smithy artifacts (specs, RFCs, etc.) are checked into the repo so that repo-relative paths in issue bodies are valid references.

## Out of Scope

- Implementation of `smithy.orders` itself (separate spec/task).
- Template versioning or migration when smithy upgrades default templates.
- GitHub issue form templates (YAML-based) — these are body-only markdown templates.
- Template inheritance or composition (e.g., a base template that others extend).

## Success Criteria

### Measurable Outcomes

- **SC-001**: Running `smithy init` in a fresh repo and accepting templates produces `.smithy/` with 4 well-structured template files.
- **SC-002**: An issue created by `orders` using `.smithy/` templates contains enough context (inlined content + artifact paths) for GitHub Copilot to act on it without additional information.
- **SC-003**: An issue created by `orders` without `.smithy/` templates has the same structural quality as one created with templates.
- **SC-004**: The commit/gitignore prompt works correctly in repos with and without existing `.gitignore` files.

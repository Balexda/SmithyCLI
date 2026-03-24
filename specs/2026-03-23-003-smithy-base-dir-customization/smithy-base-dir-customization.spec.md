# Feature Specification: Smithy Base Directory Customization

**Spec Folder**: `2026-03-23-003-smithy-base-dir-customization`
**Branch**: `2026-03-23-003-smithy-base-dir-customization`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User request to allow scoping artifacts to a module/directory in monorepos.

## Clarifications

### Session 2026-03-23

- Q: Which specific artifact types should respect the new base directory configuration? → A: All artifacts (strikes, RFCs, specs) move to the base directory by default.
- Q: How should the `smithy rehome` command handle independent path overrides? → A: `smithy rehome` for global base directory, `smithy rehome --advanced` for individual sub-path overrides.
- Q: Should the command be named `smithy rehome` or `smithy move`? → A: `rehome`.

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

## User Scenarios & Testing

### User Story 1 — Configure base directory during init (Priority: P1)

As a developer running `smithy init`, I want to choose a base directory for all smithy artifacts so that I can scope my work to a specific module in a monorepo.

**Why this priority**: Fundamental for monorepo support and organization.

**Independent Test**: Run `smithy init`, provide `packages/api` as the base directory, and verify `.smithy/local.settings.json` is created with this value.

**Acceptance Scenarios**:

1. **Given** a new repository, **When** I run `smithy init`, **Then** I am prompted for a base directory (defaulting to the repo root `.`).
2. **Given** I provide `module-foo` as the base directory, **When** `init` completes, **Then** `.smithy/local.settings.json` contains `baseDir: "module-foo"`.

---

### User Story 2 — Rehome artifacts to a new base directory (Priority: P1)

As a developer who already initialized smithy, I want to change my base directory configuration using `smithy rehome` so that I can adjust my workspace organization later.

**Why this priority**: Allows correcting or changing organization without re-initializing everything.

**Independent Test**: Run `smithy rehome`, change the base directory from `.` to `src/smithy`, and verify the settings file is updated.

**Acceptance Scenarios**:

1. **Given** an existing smithy setup, **When** I run `smithy rehome`, **Then** I am prompted for a new global base directory.
2. **Given** I update the base directory, **When** I confirm the change, **Then** `.smithy/local.settings.json` is updated.
3. **Given** I run `smithy rehome`, **When** I provide an invalid path, **Then** an error is shown and no changes are saved.

---

### User Story 3 — Customize individual artifact paths (Priority: P2)

As an advanced user, I want to override the default sub-paths for RFCs, specs, and strikes in my configuration so that I can match my project's unique folder structure.

**Why this priority**: Flexibility for teams with established documentation standards.

**Independent Test**: Run `smithy rehome --advanced`, change the RFC path to `docs/architecture`, and verify `.smithy/local.settings.json` reflects the override.

**Acceptance Scenarios**:

1. **Given** I run `smithy rehome --advanced`, **When** I set the base directory, **Then** I am subsequently prompted to override paths for RFCs, Specs, and Strikes.
2. **Given** I only want to change the RFC path, **When** I provide a value for RFCs and leave others as default, **Then** only the RFC override is saved.

---

### User Story 4 — Artifact commands respect configuration (Priority: P1)

As a developer using smithy skills (like `/smithy.strike` or `/smithy.mark`), I want the generated files to be placed in the directories defined by my configuration.

**Why this priority**: Ensures the configuration is actually used by the tools.

**Independent Test**: Set base directory to `libs/core`, run `/smithy.strike "test"`, and verify the strike file is created in `libs/core/specs/strikes/`.

**Acceptance Scenarios**:

1. **Given** a base directory of `foo`, **When** I run a command that creates an RFC, **Then** it is placed in `foo/docs/rfcs/`.
2. **Given** a custom RFC override of `docs/planning`, **When** I run a command that creates an RFC, **Then** it is placed in `foo/docs/planning/` (relative to base) or `docs/planning/` (if absolute).

---

### Edge Cases

- **Missing `.smithy/` folder**: `rehome` should fail or offer to init if the folder doesn't exist.
- **Invalid characters in path**: Paths should be validated for OS compatibility.
- **Path collisions**: Warn if the new directory already contains files that might be overwritten.

## Requirements

### Functional Requirements

- **FR-001**: `smithy init` MUST prompt for a base directory.
- **FR-002**: `smithy rehome` MUST update `.smithy/local.settings.json`.
- **FR-003**: `smithy rehome --advanced` MUST allow overriding individual artifact type paths.
- **FR-004**: All artifact-generating templates (strike, mark, etc.) MUST resolve their output path via the `local.settings.json` configuration.
- **FR-005**: If `local.settings.json` is missing, commands MUST fall back to repo-root defaults.

### Key Entities

- **LocalSettings**: The configuration object persisted to disk.

## Success Criteria

### Measurable Outcomes

- **SC-001**: `smithy init` creates a valid `local.settings.json` with user-provided base directory.
- **SC-002**: `smithy rehome` successfully updates the base directory.
- **SC-003**: `/smithy.strike` places files in the configured directory.

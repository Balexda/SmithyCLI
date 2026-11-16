# Feature Specification: Declared Project Resolution

**Spec Folder**: `2026-11-15-013-declared-project-resolution`
**Branch**: `2026-11-15-013-declared-project-resolution`
**Created**: 2026-11-15
**Status**: Draft
**Input**: `docs/rfcs/2026-002-planning-artifact-location/planning-artifact-location.rfc.md` — Milestone 1, project selection.
**Source Feature Map**: `docs/rfcs/2026-002-planning-artifact-location/01-workspace-location-contract-and-read-path.features.md` — Feature 1: Declared Project Resolution

## Clarifications

### Session 2026-11-15

| Basis | Applied constraint |
|-------|--------------------|
| Feature-map SD-001 (resolved) | Drop lone-store auto-selection and legacy `project:` everywhere; accept that compatibility break. |
| Feature-map SD-002 (resolved) | Undeclared external installs inherit their repository key; recall dispatch changes remain outside F1. |
| Existing validation | Preserve safe single-segment syntax, adding refusal of exact reserved name `default`. |
| Non-git context | No repository identity means no inheritance; never substitute the working-directory basename. |
| Engraved consultation | Repo records consulted; no user records or project level in play. Template-scoped INV-1, INV-2, INV-3 and P-1 introduce no conflict with this contract. |

## Artifact Hierarchy

| Level | Source |
|-------|--------|
| RFC | Planning Artifact Location Model |
| Milestone | M1 — Workspace Location Contract and Read Path |
| Feature | F1 — Declared Project Resolution |
| Children | User stories below; tasks are not authored by this step |

## User Scenarios & Testing *(mandatory)*

### User Story 1: Resolve explicit declarations safely (Priority: P1)

As a maintainer, I want the invocation and artifact to agree on a project so that my run cannot silently select another workstream.

**Why this priority**: Errors must stop selection before a consumer uses the result.

**Independent Test**: Resolve option/header combinations against temporary named-store directories.

**Acceptance Scenarios**:

1. **Given** an existing named project, **When** only `--project` declares it, **Then** select it with option provenance.
2. **Given** an input artifact with `**Project**: fleet-sync`, **When** no option is supplied, **Then** select `fleet-sync` with artifact provenance; enclosing backticks and surrounding whitespace are accepted.
3. **Given** both declarations agree, **When** resolving, **Then** select that value with agreement provenance; **Given** they disagree, **Then** refuse and name both values and sources.
4. **Given** an empty, unsafe or reserved declaration, **When** resolving, **Then** refuse with its value, source and reason, without fallback.
5. **Given** a valid declared slug whose directory is absent or a regular file, **When** resolving, **Then** report the named project missing and create nothing.
6. **Given** only a legacy `project:` field, a fenced header example or a matching directory name, **When** resolving, **Then** none constitutes a declaration.
7. **Given** an unreadable input artifact, duplicate Project headers or malformed Project value, **When** resolving, **Then** return a named input refusal rather than choosing or ignoring a declaration.

### User Story 2: Inherit the repository identity (Priority: P1)

As an external-install maintainer, I want undeclared runs to inherit the stable repository identity so that all worktrees select the same project.

**Why this priority**: External installs need a deterministic default independent of checkout names.

**Independent Test**: Compare main checkout, nested directory and differently named linked worktree using one install.

**Acceptance Scenarios**:

1. **Given** an external install with no declarations and a repository identity, **When** resolving from any worktree or subdirectory, **Then** inherit exactly the key already used to locate that install's repository store.
2. **Given** a declaration on that install, **When** resolving, **Then** use it; inheritance is neither a competing declaration nor a mismatch.
3. **Given** an in-repo install or no repository identity, **When** declarations are absent, **Then** inherit no project.
4. **Given** an inherited key that is invalid or `default`, **When** resolving, **Then** refuse with the key and reason rather than inventing another name.
5. **Given** a valid inherited key with no named-project directory, **When** resolving, **Then** resolve the inherited identity anyway: it addresses the existing repo-keyed store, whose records remain repo-level.

### User Story 3: Report undeclared candidates consistently (Priority: P1)

As a maintainer, I want CLI consumers to share one project policy so that inventories cannot disagree about selection.

**Why this priority**: The shared helper contract is the prerequisite for both location-query consumers.

**Independent Test**: Exercise shared helpers with zero, one and several named stores and inspect consumer imports for one policy definition.

**Acceptance Scenarios**:

1. **Given** no declaration or inheritance and zero or one named store, **When** resolving, **Then** select no project, including when exactly one exists.
2. **Given** that context and several named stores, **When** resolving, **Then** return sorted candidate names and select none.
3. **Given** files, invalid names and the `default` directory alongside named stores, **When** enumerating, **Then** include only valid, non-reserved directories; an absent projects root yields an empty list.
4. **Given** planning-status and engraved-status helper consumers, **When** importing validation, enumeration and selection, **Then** use one shared definition; compatibility exports may delegate without retaining policy.

### Edge Cases

| Case | Required result |
|------|-----------------|
| Empty option plus valid header | Invalid declaration; no fallback |
| Case differs between declarations | Conflict; no case folding |
| Named store has no git history or records | Directory existence suffices |
| Resolution runs | No writes, registry lookup, walk-up declaration or prompt |

## Dependency Order

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Resolve explicit declarations safely | — | — |
| US2 | Inherit the repository identity | US1 | — |
| US3 | Report undeclared candidates consistently | US1, US2 | — |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Recognize only `--project` and the input artifact's document-level `**Project**` header as declarations; ignore fenced examples and legacy `project:` fields.
- **FR-002**: Validate every supplied declaration; refuse invalid/reserved values, malformed/duplicate headers and unreadable artifacts with source-specific diagnostics.
- **FR-003**: Accept agreement and refuse disagreement naming both values; never silently prefer the option.
- **FR-004**: A named project exists exactly when its directory exists under `~/.smithy/projects/`; git history and record content are irrelevant.
- **FR-005**: Only an undeclared external install may inherit its existing worktree-stable repository store key; the working directory's name never supplies project identity.
- **FR-006**: Without declaration or inheritance, select none; list sorted candidates when several exist, never auto-pick a lone store.
- **FR-007**: Planning and engraved CLI helpers MUST share validation, enumeration and resolution definitions; selection MUST preserve record levels and perform no writes.

### Key Entities

| Entity | Purpose |
|--------|---------|
| Declaration | Project value and option/artifact source |
| Context | Install mode and optional stable repository identity |
| Outcome | Selection, no selection, candidates or named refusal |

## Assumptions

| Assumption | Basis |
|------------|-------|
| Header metadata lives outside fenced blocks | Artifact header convention |
| Inheritance names the existing repo-keyed store | F1 boundary; F2 owns location mapping |
| Directory enumeration is read-only | RFC location-query contract |

## Specification Debt

_None — no specification debt was recorded._

## Out of Scope

| Exclusion | Owner |
|-----------|-------|
| Location mapping, query command and wire format | F2 |
| Status option wiring, rendering and lookup migration | F3 |
| Recall/engrave prompt edits | F4 |
| Reserved default-store addressing and continuity checks | Milestone 4 |
| Writes, commits, registries and provisioning | Outside F1 |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All acceptance scenarios have deterministic shared-helper outcomes, including every refusal and absent-selection case.
- **SC-002**: Main checkout, subdirectory and linked worktree yield identical inherited project identities.
- **SC-003**: No project is selected from store count, legacy fields or working-directory names.
- **SC-004**: Both CLI consumer families use one policy definition with zero filesystem writes or record-level changes.

# Data Model: Smithy Command Redesign

## Overview

The smithy command redesign does not introduce persistent data storage. The "data model" is the artifact file convention — file extensions, folder structure, and naming patterns that commands use to discover, produce, and consume planning artifacts.

## Entities

### 1) Artifact File

Purpose: A markdown file produced by a smithy command, identifiable by its extension.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `extension` | Enum | Yes | One of: `.rfc.md`, `.features.md`, `.spec.md`, `.data-model.md`, `.contracts.md`, `.tasks.md`, `.strike.md` |
| `slug` | String | Yes | Kebab-case name derived from the feature/RFC description |
| `folder` | Path | Yes | Parent folder: `docs/rfcs/<YYYY-NNN-slug>/`, `specs/<YYYY-MM-DD-NNN-slug>/`, or `specs/strikes/` |

Validation rules:
- Extension must be one of the seven recognized types.
- Slug must be kebab-case, derived from the artifact's subject.
- RFC-level folders use `YYYY-NNN-slug` format (coarser granularity).
- Spec-level folders use `YYYY-MM-DD-NNN-slug` format (finer granularity).
- Strike files use `specs/strikes/` (flat folder, no per-strike subfolder).

### 2) RFC Folder (`docs/rfcs/<YYYY-NNN-slug>/`)

Purpose: Groups an RFC and its derivative milestone maps together.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `rfc_file` | File | Yes | Exactly one `<slug>.rfc.md` |
| `map_files` | File[] | No | Zero or more `<NN>-<milestone-slug>.features.md` files |

Validation rules:
- Folder must contain exactly one `.rfc.md` file.
- Each `.features.md` must correspond to a milestone defined in the RFC.

### 3) Spec Folder (`specs/<YYYY-MM-DD-NNN-slug>/`)

Purpose: Groups a feature spec with its supporting artifacts.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `spec_file` | File | Yes | Exactly one `<slug>.spec.md` |
| `data_model_file` | File | Yes | Exactly one `<slug>.data-model.md` (may be minimal placeholder) |
| `contracts_file` | File | Yes | Exactly one `<slug>.contracts.md` (may be minimal placeholder) |
| `tasks_files` | File[] | No | Zero or more `<NN>-<story-slug>.tasks.md` files (produced by cut, one per user story) |

Validation rules:
- Folder must contain spec, data-model, and contracts files (mark produces all three).
- Tasks files are added later by cut, one per user story.
- Tasks file numbering (`NN`) must match user story numbering in the spec (01-99).
- A spec folder with more than 99 user stories indicates the feature should be split.

### 4) Tasks File (`<NN>-<story-slug>.tasks.md`)

Purpose: Decomposes a single user story into PR-sized slices with ordered implementation tasks. Produced by `cut`, consumed by `forge`. Named with zero-padded user story number for consistent sort order.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `header` | Metadata | Yes | User story title, spec folder path, source artifact references, user story number |
| `slices` | Slice[] | Yes | One or more slices, each as an H2 section numbered sequentially |

Each slice contains:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | String | Yes | H2 header: `## Slice N: <Title>` |
| `goal` | String | Yes | What this slice delivers as a standalone increment |
| `justification` | String | Yes | Why this slice stands alone (not disconnected scaffolding) |
| `addresses` | References | Yes | User stories and FRs this slice implements |
| `tasks` | Checklist | Yes | Ordered `- [ ]` task items |
| `pr_outcome` | String | Yes | What the PR delivers when merged |

Validation rules:
- Must reference source spec artifacts and user story number in header.
- Every slice must have a standalone goal and justification.
- Every slice must trace to at least one FR or acceptance scenario from the user story.
- Slices are numbered sequentially starting at 1.
- A dependency order section must define the recommended implementation sequence.

### 5) Strike File (`<YYYY-MM-DD>-<slug>.strike.md`)

Purpose: Self-contained planning + execution artifact for small, fast-track changes. Produced by `strike`. Contains inline requirements, data model, contracts, and exactly one slice.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `header` | Metadata | Yes | Date, branch, status, input description |
| `summary` | String | Yes | What and why in plain English |
| `goal` | String | Yes | Single meaningful outcome |
| `out_of_scope` | String[] | Yes | Explicitly excluded items |
| `requirements` | FR[] | Yes | Numbered functional requirements |
| `success_criteria` | SC[] | Yes | Numbered testable outcomes |
| `user_flow` | String | Yes | Behavior from user's point of view |
| `data_model` | String | No | Inline, minimal, only if needed |
| `contracts` | String | No | Inline, minimal, only if needed |
| `decisions` | String[] | Yes | Important decisions and tradeoffs |
| `slice` | Slice | Yes | Exactly one slice with tasks checklist |

Validation rules:
- Must contain exactly one slice (H2 `## Single Slice`).
- Data model and contracts sections are optional but the headings should be present with "N/A" or minimal content if not needed.

## Relationships

- RFC Folder 1:N Map Files via milestone references in the RFC.
- Map File 1:N Spec Folders — a map contains many features, each of which produces one spec folder.
- Spec (feature) 1:N User Stories — each spec contains one or more user stories (max 99).
- User Story 1:1 Tasks File — cut produces one `<NN>-<story-slug>.tasks.md` per user story.
- Tasks File 1:N Slices — each slice becomes one forge/PR.

## State Transitions

### Artifact Lifecycle

1. `draft` → `reviewed`
   - Trigger: Running `smithy.audit` or repeating the producing command.
   - Effects: Findings recorded; artifact may be updated via refinement loop.

2. `reviewed` → `approved`
   - Trigger: User explicitly approves the artifact.
   - Effects: Artifact is ready to be consumed by the next pipeline step.

3. `approved` → `ticketed`
   - Trigger: Running `smithy.orders` against the artifact.
   - Effects: GitHub issues created at the appropriate hierarchy level.

Note: These states are conceptual — they are not tracked in the files themselves. The presence of downstream artifacts implies progression (e.g., a spec with a tasks.md has implicitly been approved).

## Identity & Uniqueness

- RFC folders are uniquely identified by `YYYY-NNN-slug`.
- Spec folders are uniquely identified by `YYYY-MM-DD-NNN-slug`.
- Within an RFC folder, files are unique by extension (one `.rfc.md`, multiple `.features.md` distinguished by milestone number prefix `<NN>-`).
- Within a spec folder, `.spec.md`, `.data-model.md`, and `.contracts.md` are unique (one each). `.tasks.md` files are unique by user story number prefix (`<NN>-`), not by extension — multiple are expected.
- Within `specs/strikes/`, `.strike.md` files are unique by date + slug prefix, not by extension — multiple are expected.
- Sequential numbering (`NNN`) is determined by scanning existing folders at creation time.

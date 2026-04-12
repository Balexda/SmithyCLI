# Data Model: Smithy Status Skill

## Overview

The status scanner is read-only and does not persist state. Its "data model" is the in-memory record set produced by a single scan pass and consumed by the renderer, the filter, and the JSON emitter. No storage, no migration, no schema evolution — the records exist only for the lifetime of one `smithy status` invocation.

## Entities

### 1) ArtifactRecord (`artifact_record`)

Purpose: One entry per discovered artifact file, carrying everything needed to render it in the tree and to reason about its status and next action.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | `'rfc' \| 'features' \| 'spec' \| 'tasks'` | Yes | Derived from filename suffix. |
| `path` | string | Yes | Repo-relative path to the source file. |
| `title` | string | Yes | Extracted from the artifact's H1 or frontmatter (e.g., `# Feature Specification: <Title>`). Falls back to the filename if no title is parseable. |
| `status` | `'done' \| 'in-progress' \| 'not-started' \| 'unknown'` | Yes | See "State Transitions" below. |
| `completed` | number | No | Count of completed children (slices for tasks; stories for specs; features for feature maps). Omitted for records where counting is not meaningful. |
| `total` | number | No | Total count of children. Omitted alongside `completed`. |
| `parent_path` | string | No | Repo-relative path to the parent artifact (e.g., a tasks record's parent is its spec). Null for top-level RFCs and orphans. |
| `parent_missing` | boolean | No | True when `parent_path` was declared by the artifact but the referenced file does not exist. Drives "Broken Links" grouping. |
| `virtual` | boolean | No | True for "not-started" records that were inferred from a parent's checklist but have no file on disk yet (e.g., a story in a spec's `## Story Dependency Order` that has no tasks file). |
| `next_action` | NextAction \| null | No | Populated by the suggestion rules; null for `done` records. |
| `warnings` | string[] | No | Non-fatal parse issues encountered while reading the file (unknown sections, ambiguous numbering, legacy formats). Empty array if clean. |

Validation rules:
- `status = 'done'` requires `completed === total` (when counts are present) or all checked-state indicators to be checked (when counts are not meaningful, e.g., an RFC).
- `status = 'in-progress'` requires `0 < completed < total` OR at least one checked child and at least one unchecked child.
- `status = 'unknown'` requires at least one entry in `warnings` describing the parse failure.
- `virtual === true` implies `status === 'not-started'` and `path` is the *expected* path, not an existing file.

---

### 2) NextAction (`next_action`)

Purpose: The suggested smithy command to run next for a non-done artifact. Populated by the deterministic rule table in the scanner.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `command` | `'smithy.mark' \| 'smithy.cut' \| 'smithy.forge' \| 'smithy.render' \| 'smithy.ignite' \| 'smithy.strike'` | Yes | The smithy command the user should run. |
| `arguments` | string[] | Yes | Positional arguments to pass (e.g., the target file path and an optional feature number). May be empty. |
| `reason` | string | Yes | One-line human-readable rationale (e.g., "Spec exists but User Story 2 has no tasks file"). |
| `suppressed_by_ancestor` | boolean | No | True when an ancestor artifact is itself not-started, meaning this suggestion was dropped from the rendered output in favor of the ancestor's suggestion. Retained in the record set for JSON consumers. |

---

### 3) ScanSummary (`scan_summary`)

Purpose: Aggregate counts used by the summary header and the JSON output's top-level `summary` field.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `counts` | `Record<ArtifactType, Record<Status, number>>` | Yes | E.g., `counts.spec.in-progress === 3`. |
| `orphan_count` | number | Yes | Number of records with no parent (excluding top-level RFCs). |
| `broken_link_count` | number | Yes | Number of records with `parent_missing === true`. |
| `parse_error_count` | number | Yes | Number of records with `status === 'unknown'`. |

---

### 4) StatusTree (`status_tree`)

Purpose: The hierarchical view built from `ArtifactRecord[]` by grouping descendants under their ancestors. Rendered to terminal text (default) or JSON.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `roots` | TreeNode[] | Yes | Top-level nodes — typically RFCs, plus an implicit "Orphaned Specs" group and a "Broken Links" group when populated. |
| `summary` | ScanSummary | Yes | The aggregate view for the summary header. |

`TreeNode` is a recursive wrapper around `ArtifactRecord` with a `children: TreeNode[]` field. It carries no additional data — it exists only to encode parent/child relationships that ArtifactRecord records flatten.

---

## Relationships

- `RFC` 1:N `FeatureMap` via `Source RFC` reference in the feature map header.
- `FeatureMap` 1:N `Spec` via the `## Feature Dependency Order` checklist's `→ <spec-folder>` links.
- `Spec` 1:N `Tasks` via the `## Story Dependency Order` checklist's `→ <tasks-file>` links.
- `Tasks` 1:N `Slice` — slices are *not* separate ArtifactRecords; they exist only as counts (`completed`, `total`) on the tasks record, plus (optionally, for in-progress rendering) as child lines in the tree view.

Every relationship is resolved from artifact content, not from directory structure.

## State Transitions

### ArtifactRecord status lifecycle (per scan)

A record's status is computed freshly on each scan from the underlying file contents. There is no persistent state machine — the "transitions" below describe the rules the classifier applies.

1. `unknown` → (any other status)
   - Trigger: parser succeeds and the artifact's checkbox pattern becomes readable.
   - Effects: the record's `warnings` are cleared; `status` is set by the rules below.

2. `not-started` → `in-progress`
   - Trigger: at least one child (slice / story / feature) transitions from unchecked to checked.
   - Effects: `completed` becomes ≥ 1; `next_action` is recomputed to point at the current actionable item.

3. `in-progress` → `done`
   - Trigger: the last unchecked child is checked.
   - Effects: `next_action` becomes null; the record collapses in the default tree view.

4. `*` → `unknown`
   - Trigger: a subsequent edit removes or malforms the required headings/checklists.
   - Effects: `warnings` gains an entry describing the parse failure; the record is rendered under the default group with a clear warning marker.

## Identity & Uniqueness

Records are keyed by repo-relative `path`. Two ArtifactRecords with the same `path` are an error — the scanner reports the collision as a warning on both records. Virtual records (`virtual === true`) use the *expected* path as their key; a collision between a virtual record and a real one means the real one wins and the virtual one is discarded.

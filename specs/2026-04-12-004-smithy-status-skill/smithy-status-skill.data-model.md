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
| `parent_path` | string \| null | No | Repo-relative path to the parent artifact (e.g., a tasks record's parent is its spec). Null for top-level RFCs and orphans. JSON consumers MUST distinguish `null` from an omitted field — an omitted field means "unknown," `null` means "no parent." |
| `parent_missing` | boolean | No | True when `parent_path` was declared by the artifact but the referenced file does not exist. Drives "Broken Links" grouping. |
| `virtual` | boolean | No | True for "not-started" records that were inferred from a parent's checklist but have no file on disk yet (e.g., a story in a spec's `## Story Dependency Order` that has no tasks file). |
| `next_action` | NextAction \| null | No | Populated by the suggestion rules; null for `done` records. |
| `dependency_order` | DependencyOrderTable \| null | No | The parsed `## Dependency Order` section for this artifact. Null when the section is absent (legacy artifacts, or tasks files with no slice ordering). See "DependencyOrderTable" below. |
| `warnings` | string[] | No | Non-fatal parse issues encountered while reading the file (unknown sections, ambiguous numbering, legacy formats, malformed dependency tables, dangling ID references). Empty array if clean. |

Validation rules:
- For a **tasks** record (the only leaf type), `status = 'done'` requires `completed === total`, where both counts come from slice-body task checkboxes inside `## Slice N:` sections. `status = 'in-progress'` requires `0 < completed < total`.
- For **spec**, **features**, and **rfc** records (parent types), `status = 'done'` requires that every row in the record's parsed `dependency_order` table has a rolled-up status of `done`. `status = 'in-progress'` requires at least one row whose rolled-up status is `in-progress` or `done` AND at least one row that is not yet `done`. `status = 'not-started'` requires every row to be `not-started` (or its `Artifact` column to be `—`).
- `status = 'unknown'` requires at least one entry in `warnings` describing the parse failure (malformed table, legacy-format detection, missing required section, etc.).
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

### 4) DependencyRow (`dependency_row`)

Purpose: One row of an artifact's `## Dependency Order` table, parsed deterministically from its 4-column Markdown representation.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | Yes | Canonical per-level ID (`M1`, `F2`, `US3`, `S4`). Matches `^(M\|F\|US\|S)[1-9][0-9]*$`. No leading zeros. |
| `title` | string | Yes | Human-readable title taken verbatim from the table's Title column. |
| `depends_on` | string[] | Yes | List of IDs this row depends on. Empty array when the cell is `—`. IDs are normalized to the same format as `id`. |
| `artifact_path` | string \| null | Yes | Repo-relative path to the downstream artifact (file or folder), or null when the cell is `—`. Null signals "not yet created" — scanner then emits a virtual not-started record using the naming-convention-expected path. |

Validation rules:
- `id` MUST be unique within the containing `DependencyOrderTable`.
- Every ID in `depends_on` MUST match an `id` elsewhere in the same table. Dangling references produce a warning on the parent ArtifactRecord and are dropped from the row's `depends_on` list.
- `artifact_path`, when non-null, MUST be a repo-relative path (not absolute). Absolute paths produce a warning and are coerced to null.

---

### 5) DependencyOrderTable (`dependency_order_table`)

Purpose: The full parsed `## Dependency Order` section for a single artifact.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `rows` | DependencyRow[] | Yes | Rows in the order they appear in the source Markdown. Order is preserved so renderers can match user intent. |
| `id_prefix` | `'M' \| 'F' \| 'US' \| 'S'` | Yes | The canonical prefix used by rows in this table. Derived from the artifact's type (RFC → `M`, features → `F`, spec → `US`, tasks → `S`). A mismatch between `id_prefix` and any row's actual prefix produces a warning. |
| `format` | `'table' \| 'legacy' \| 'missing'` | Yes | `table` for the new format, `legacy` for any artifact still using checkbox-based ordering, `missing` when no `## Dependency Order` section exists. `legacy` triggers `format_legacy` warning and `unknown` status on the ArtifactRecord. |

---

### 6) DependencyGraph (`dependency_graph`)

Purpose: The cross-artifact DAG built by unioning every artifact's `DependencyOrderTable` and stitching nodes together via `artifact_path` links.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `nodes` | `Record<string, DependencyNode>` | Yes | Keyed by fully-qualified ID — `<artifact-path>#<row-id>` (e.g., `specs/2026-04-12-004-smithy-status-skill/smithy-status-skill.spec.md#US2`). Fully-qualified IDs allow the same short ID (`US1`) to appear in multiple specs without collision. |
| `layers` | `Array<{ layer: number, node_ids: string[] }>` | Yes | Topological layers. Layer 0 contains nodes with no incoming edges in the unioned graph; each subsequent layer contains nodes whose dependencies are all in earlier layers. Used directly by the `--graph` renderer. |
| `cycles` | `string[][]` | Yes | Each inner array is a cycle's participating fully-qualified node IDs in traversal order. Empty when the graph is a DAG. Non-empty cycles suppress layer computation for the nodes involved and trigger a structured warning. |
| `dangling_refs` | `Array<{ source_id: string, missing_id: string }>` | Yes | Any `depends_on` references the parser could not resolve — surfaced on the corresponding ArtifactRecord as warnings but retained here for JSON consumers. |

`DependencyNode` is a thin wrapper carrying `record_path` (the owning ArtifactRecord's path), `row: DependencyRow`, and `status: ArtifactRecord['status']` (the rolled-up status — computed from the node's downstream artifact, not from its own row).

---

### 7) StatusTree (`status_tree`)

Purpose: The hierarchical view built from `ArtifactRecord[]` by grouping descendants under their ancestors. Rendered to terminal text (default) or JSON.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `roots` | TreeNode[] | Yes | Top-level nodes — typically RFCs, plus an implicit "Orphaned Specs" group and a "Broken Links" group when populated. |

`StatusTree` contains only the hierarchical projection. The aggregate `ScanSummary` is **not** duplicated inside `StatusTree` — it appears only at the top level of the JSON response (see contracts). This avoids two copies of the same counts drifting out of sync.

`TreeNode` is a recursive wrapper around `ArtifactRecord` with a `children: TreeNode[]` field. It carries no additional data — it exists only to encode parent/child relationships that ArtifactRecord records flatten.

---

## Relationships

All parent/child relationships between artifacts are resolved from the unified `## Dependency Order` table's `Artifact` column — a row in a parent's table naming a child file IS the relationship. No relationship is inferred from prose, directory structure, or filename convention alone.

The canonical artifact lineage is:

```
RFC (milestones)
  └── Feature Map (features)
        └── Spec (user stories)
              └── Tasks (slices)
```

Each level is parent to the level below it. Specifically:

- **`RFC` 1:N `FeatureMap`** — each milestone row in an RFC's `## Dependency Order` table has `id_prefix = 'M'` and an `artifact_path` pointing at a `.features.md` file. The scanner stitches the parent RFC to every feature map it references.
- **`FeatureMap` 1:N `Spec`** — each feature row in a feature map's `## Dependency Order` table has `id_prefix = 'F'` and an `artifact_path` pointing at a spec folder (the folder containing `<slug>.spec.md`). The scanner resolves the spec file inside that folder by convention.
- **`Spec` 1:N `Tasks`** — each user-story row in a spec's `## Dependency Order` table has `id_prefix = 'US'` and an `artifact_path` pointing at a `NN-<slug>.tasks.md` file inside the same spec folder.
- **`Tasks` 1:N `Slice`** — slices are NOT separate ArtifactRecords. They exist as `DependencyRow` entries (with `id_prefix = 'S'`) inside the tasks file's own `## Dependency Order` table AND as `## Slice N:` body sections where the actual task-completion checkboxes live. Slice status is computed from the body-section checkboxes; slice ordering comes from the dependency table. Slice rows always have `artifact_path = null` because slices have no separate files.

An `artifact_path` cell containing `—` signals "not yet created" and causes the scanner to emit a virtual not-started record for the expected downstream artifact. If an `artifact_path` references a file that does not exist on disk, the row is flagged with a `broken_link` warning and grouped under "Broken Links" in the tree.

**Cross-artifact dependency edges**: Dependencies inside a `depends_on` cell MAY reference only IDs in the *same* table — cross-artifact dependencies are implicit in the parent/child lineage above and are never written explicitly. The `DependencyGraph` stitches cross-artifact edges by walking the `artifact_path` links and treating a child's roots as blocked by its parent row.

## State Transitions

### ArtifactRecord status lifecycle (per scan)

A record's status is computed freshly on each scan from the underlying file contents. There is no persistent state machine — the "transitions" below describe the rules the classifier applies when comparing one scan to a prior one, not live observations.

Trigger terminology: "a child reaches status X" means (a) for tasks records, a slice-body task checkbox flipped, or (b) for spec / features / rfc records, a downstream artifact referenced by the record's `dependency_order` table rolled up to status X.

1. `unknown` → (any other status)
   - Trigger: the artifact's `## Dependency Order` table (or slice bodies, for tasks files) parses successfully where a prior scan could not.
   - Effects: the record's parse-error `warnings` are cleared; `status` is recomputed from the validation rules above.

2. `not-started` → `in-progress`
   - Trigger: at least one child reaches `in-progress` or `done`, while at least one child is still `not-started`.
   - Effects: `completed` becomes ≥ 1 (for tasks records) or the record's rolled-up count reflects the new child state (for parent records); `next_action` is recomputed to point at the current actionable item.

3. `in-progress` → `done`
   - Trigger: the last non-`done` child reaches `done`.
   - Effects: `next_action` becomes null; the record collapses in the default tree view.

4. `*` → `unknown`
   - Trigger: a subsequent edit removes or malforms the `## Dependency Order` table or introduces the legacy checkbox format that triggers a `format_legacy` warning (see FR-028).
   - Effects: `warnings` gains an entry describing the parse failure; the record is rendered under the default group with a clear warning marker and no rolled-up status.

## Identity & Uniqueness

Records are keyed by repo-relative `path`. Two ArtifactRecords with the same `path` are an error — the scanner reports the collision as a warning on both records. Virtual records (`virtual === true`) use the *expected* path as their key; a collision between a virtual record and a real one means the real one wins and the virtual one is discarded.

# Data Model: Reduce Interaction Friction

## Overview

This model supports the shift from interactive, gate-heavy planning workflows
to one-shot execution with formal tracking of decisions and gaps. It introduces
the Debt Item entity, formalizes the Assumption entity with Critical annotations,
and defines the updated Triage Matrix that governs how clarify categorizes
ambiguity candidates.

## Entities

### 1) Debt Item

Purpose: Represents an unresolved ambiguity identified during clarification or
review that the agent could not confidently resolve. Debt items are the formal
replacement for interactive questions in one-shot mode — they record what would
have been asked so users can address gaps post-hoc.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `description` | string | Yes | Human-readable description of the unresolved ambiguity |
| `source_category` | enum | Yes | The clarify scan category that produced this item (Functional Scope, Domain & Data Model, Interaction & UX, Non-Functional Quality, Integration, Edge Cases, Constraints, Terminology) |
| `impact` | enum | Yes | Critical, High, Medium, or Low — how much this gap affects the artifact's validity |
| `confidence` | enum | Yes | High, Medium, or Low — how confident the agent is about the recommended resolution (Low confidence = became debt instead of assumption) |
| `status` | enum | Yes | `open` (unresolved), `resolved` (addressed by user or later pass), `inherited` (carried from upstream artifact) |
| `origin` | string | No | For inherited items: identifies the source artifact and original debt description |
| `resolution` | string | No | When resolved: describes how and when the item was addressed |

Validation rules:
- `status` must be one of: `open`, `resolved`, `inherited`.
- `inherited` items must have a non-empty `origin` field.
- `resolved` items must have a non-empty `resolution` field.

### 2) Assumption (extended)

Purpose: Represents a decision the agent made with high confidence, proceeding
as if the assumption is true. Extended from the current ephemeral assumption
with a `[Critical Assumption]` annotation for promoted Critical-impact items.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `statement` | string | Yes | The assumption text (e.g., "Webhook payloads are JSON-only") |
| `recommended_answer` | string | Yes | The agent's reasoning for this assumption |
| `impact` | enum | Yes | Critical, High, Medium, or Low |
| `confidence` | enum | Yes | Always High (items with non-High confidence become debt or questions) |
| `is_critical` | boolean | Yes | True if this was a Critical-impact item promoted to assumption. Renders as `[Critical Assumption]` annotation |

Validation rules:
- `confidence` is always `High` (by definition — only High-confidence items become assumptions).
- If `is_critical` is true, the assumption must be rendered with a `[Critical Assumption]` annotation.

### 3) Triage Matrix (updated)

Purpose: The decision table that governs how smithy-clarify categorizes each
ambiguity candidate based on its Impact and Confidence scores. This replaces
the current matrix where Critical items are always questions.

| Impact \ Confidence | High | Medium | Low |
|---------------------|------|--------|-----|
| **Critical** | Assumption `[Critical Assumption]` | Question (interactive) / Debt (one-shot) | Question (interactive) / Debt (one-shot) |
| **High** | Assumption | Question (interactive) / Debt (one-shot) | Question (interactive) / Debt (one-shot) |
| **Medium** | Assumption | Question (interactive) / Debt (one-shot) | Question (interactive) / Debt (one-shot) |
| **Low** | Assumption | Question (interactive) / Debt (one-shot) | Question (interactive) / Debt (one-shot) |

In one-shot mode (`mode: one-shot`), the Question column is replaced by Debt —
items that would have been questions are recorded as debt instead.

### 4) Plan Review Finding

Purpose: Represents an inconsistency or gap found by smithy-plan-review during
automated self-consistency review of a planning artifact.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `artifact_path` | string | Yes | Path to the artifact file containing the finding |
| `category` | enum | Yes | Internal contradiction, Logical gap, Assumption-output drift, Debt completeness |
| `severity` | enum | Yes | Critical, Important, Minor |
| `description` | string | Yes | What the inconsistency is and where it appears |
| `confidence` | enum | Yes | High or Low — whether the finding can be auto-resolved |
| `resolution` | string | No | If auto-resolved: what was changed. If not: becomes a debt item |

Validation rules:
- High-confidence findings are returned to the parent command for auto-fix.
- Low-confidence findings become debt items in the artifact's Specification Debt section.

## Relationships

- Debt Item 1:1 Assumption — a debt item may reference a related assumption if
  the debt arose from the same clarify candidate (e.g., a Critical+Low item
  that became debt instead of an assumption).
- Debt Item 1:N Debt Item — inherited debt items reference their parent item
  from the upstream artifact via the `origin` field.
- Plan Review Finding → Debt Item — Low-confidence findings are converted to
  debt items when they cannot be auto-resolved.

## State Transitions

### Debt Item lifecycle

1. `open` → `resolved`
   - Trigger: User addresses the debt item in a subsequent pass (Phase 0
     review loop) or provides the missing information.
   - Effects: `resolution` field is populated with how/when it was addressed.

2. `open` → `inherited`
   - Trigger: A downstream pipeline command (e.g., cut consuming mark output)
     encounters the debt item in the upstream artifact.
   - Effects: A new debt item is created in the downstream artifact with
     `status: inherited` and `origin` pointing to the upstream item.

3. `inherited` → `resolved`
   - Trigger: The downstream command or a user addresses the inherited item.
   - Effects: Same as open → resolved.

### Triage lifecycle (per clarify invocation)

1. Candidate identified → scored (Impact × Confidence)
2. Scored → triaged via Triage Matrix → Assumption, Question, or Debt
3. In one-shot mode: Question → Debt (automatic conversion)

## Identity & Uniqueness

- Debt items are identified by their position in the `## Specification Debt`
  section of the artifact. There is no global ID system — items are scoped to
  their containing artifact.
- Inherited debt items are linked to their origin by the `origin` field
  containing the source artifact type and description text.
- Assumptions are identified by their position in the `## Assumptions` or
  `## Clarifications` section.

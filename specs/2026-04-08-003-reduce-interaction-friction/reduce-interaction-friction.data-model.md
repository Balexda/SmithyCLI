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
| `confidence` | enum | Yes | Medium or Low — how confident the agent was about a resolution. Any non-High confidence item becomes debt (High confidence items become assumptions instead) |
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
the current matrix where Critical items are always questions. Questions are
eliminated as a triage category — clarify is non-interactive.

| Impact \ Confidence | High | Medium | Low |
|---------------------|------|--------|-----|
| **Critical** | Assumption `[Critical Assumption]` | Debt | Debt |
| **High** | Assumption | Debt | Debt |
| **Medium** | Assumption | Debt | Debt |
| **Low** | Assumption | Debt | Debt |

All High-confidence items become assumptions. All non-High-confidence items
become debt. There is no interactive question category.

### 4) Review Finding (shared)

Purpose: Represents an issue found by either review agent (`smithy-plan-review`
or `smithy-implementation-review`). Both agents return findings using the same
structure — neither modifies artifacts or code directly.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `artifact_path` | string | Yes | Path to the file containing the finding |
| `category` | enum | Yes | Plan review: Internal contradiction, Logical gap, Assumption-output drift, Debt completeness, Brittle reference. Implementation review: Missing tests, Broken contracts, Security issues, Error handling gaps, Naming inconsistencies, Scope creep |
| `severity` | enum | Yes | Critical, Important, Minor |
| `confidence` | enum | Yes | High or Low — whether the parent command can auto-apply the proposed fix |
| `description` | string | Yes | What the issue is and where it appears |
| `proposed_fix` | string | No | For High-confidence findings: suggested resolution for the parent to apply |

Validation rules:
- High-confidence findings include a `proposed_fix` for the parent command to apply.
- Low-confidence findings become debt items in the artifact's Specification Debt section.
- The parent command (planning command or forge) applies fixes — review agents are read-only.

## Relationships

- Debt Item 1:1 Assumption — a debt item may reference a related assumption if
  the debt arose from the same clarify candidate (e.g., a Critical+Low item
  that became debt instead of an assumption).
- Debt Item 1:N Debt Item — inherited debt items reference their parent item
  from the upstream artifact via the `origin` field.
- Review Finding → Debt Item — Low-confidence findings are converted to
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
2. Scored → triaged via Triage Matrix → Assumption or Debt

## Identity & Uniqueness

- Debt items are identified by their position in the `## Specification Debt`
  section of the artifact. There is no global ID system — items are scoped to
  their containing artifact.
- Inherited debt items are linked to their origin by the `origin` field
  containing the source artifact type and description text.
- Assumptions are identified by their position in the `## Assumptions` or
  `## Clarifications` section.

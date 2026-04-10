# Contracts: Reduce Interaction Friction

## Overview

This feature modifies the interfaces between parent planning commands and their
sub-agents (smithy-clarify, smithy-refine), introduces a new sub-agent
(smithy-plan-review), and standardizes the terminal output format for one-shot
execution. The primary integration boundaries are: (1) the clarify return
contract (extended with debt items, interactive behavior removed), (2) the
refine return contract (interactive behavior removed), (3) the new plan-review
interface, and (4) the shared one-shot output snippet consumed by all planning
commands.

## Interfaces

### smithy-clarify (updated)

**Purpose**: Scan for ambiguity, triage candidates into assumptions and debt,
and return structured results. Non-interactive — no user interaction during
scan or triage.
**Consumers**: strike, ignite, mark, render, cut (planning commands)
**Providers**: smithy-clarify sub-agent

#### Signature

```
invoke smithy-clarify(criteria, context, special_instructions?)
  → ClarifyResult
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `criteria` | table | Yes | Categories to scan (unchanged from current) |
| `context` | string | Yes | Feature description, file paths, plan context |
| `special_instructions` | string | No | Caller-specific overrides (e.g., "if all categories are Clear, skip") |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `assumptions` | Assumption[] | High-confidence items the agent will proceed with. Critical items annotated with `[Critical Assumption]` |
| `debt_items` | DebtItem[] | Non-High-confidence items the agent could not confidently resolve |
| `bail_out` | boolean | True if debt scope exceeds threshold (artifact would be hollowed out). Parent command should abort and output debt summary |
| `bail_out_summary` | string | If `bail_out` is true: structured summary of debt explaining why the artifact cannot be produced and what information is needed |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| All candidates are Low confidence | `bail_out: true` | The feature description is too vague to produce a meaningful artifact. Returns debt summary prompting for expanded information |
| Debt would hollow out the artifact | `bail_out: true` | Key entities undefined, core stories unspecifiable. Scope-based assessment, not count-based |
| Zero candidates identified | Normal return | Empty assumptions and debt. Pipeline proceeds — the feature is clear |

---

### smithy-refine (updated)

**Purpose**: Audit existing artifacts and generate refinement findings. Applies
refinements directly or records as debt — non-interactive, no per-question
user interaction.
**Consumers**: mark, cut, render, ignite (Phase 0 review loops)
**Providers**: smithy-refine sub-agent

#### Signature

```
invoke smithy-refine(audit_categories, target_files, context)
  → RefineResult
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `audit_categories` | table | Yes | Categories to audit (unchanged from current) |
| `target_files` | string[] | Yes | Paths to spec, data-model, contracts files |
| `context` | string | Yes | Review context |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `refinements` | Refinement[] | Changes applied to the artifacts |
| `debt_items` | DebtItem[] | Findings refine could not confidently resolve |
| `summary` | string | Human-readable summary of what was found and changed |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Target files do not exist | Error with file paths | Cannot audit non-existent artifacts |
| All findings are Low confidence | Returns findings as debt | Refine cannot auto-apply any changes; all become debt |

---

### smithy-plan-review (new)

**Purpose**: Automated self-consistency review of planning artifacts. Checks for
internal contradictions, logical gaps, assumption-output drift, and debt
completeness. Non-interactive, read-only.
**Consumers**: strike, ignite, mark, render, cut (after artifact generation,
before PR creation)
**Providers**: smithy-plan-review sub-agent

#### Signature

```
invoke smithy-plan-review(artifact_paths, artifact_type)
  → PlanReviewResult
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `artifact_paths` | string[] | Yes | Paths to the artifact files to review (e.g., spec.md, data-model.md, contracts.md) |
| `artifact_type` | enum | Yes | `spec`, `strike`, `rfc`, `feature-map`, `tasks` — determines which checklist to apply |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `findings` | PlanReviewFinding[] | Issues found, each with category, severity, confidence, and description |
| `auto_fixable` | PlanReviewFinding[] | Subset of findings with High confidence that the parent command should apply |
| `debt_items` | DebtItem[] | Low-confidence findings converted to debt items for the artifact's Specification Debt section |
| `summary` | string | Human-readable summary of findings |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Artifact files do not exist | Error with file paths | Cannot review non-existent artifacts |
| Artifact type not recognized | Error | Unknown artifact type has no checklist |
| Zero findings | Normal return | Artifact is internally consistent. Empty findings, auto_fixable, and debt_items |

---

### One-Shot Output Snippet

**Purpose**: Standardized terminal output format for planning commands running
in one-shot mode. Ensures all commands produce consistent, scannable output.
**Consumers**: strike, ignite, mark, render, cut
**Providers**: Shared snippet (`one-shot-output.md`)

#### Format

```markdown
## Summary

- **Spec folder**: `<path>`
- **Branch**: `<branch>`
- **Artifacts produced**: <count> files (<list>)
- **User stories**: <count> (P1: <n>, P2: <n>, P3: <n>)
- **Functional requirements**: <count>

## Assumptions

<bulleted list of assumptions, with [Critical Assumption] annotations where applicable>

## Specification Debt

<count> items deferred — see `## Specification Debt` in the artifact.
<if any items>:
- <debt item 1 description> [Impact: <level>]
- ...

## PR

<PR link>
```

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| PR creation fails | Output artifacts summary without PR link, report the error | Artifacts are on disk; PR failure should not lose work |
| Bail-out triggered | Output debt summary only, no PR | Pipeline aborted due to excessive debt scope |

## Events / Hooks

- **Bail-out event**: When clarify returns `bail_out: true`, the parent command
  skips all remaining phases (specify, model, contract, review, PR) and outputs
  the bail-out summary directly. No artifacts are written to disk.
- **Plan-review auto-fix**: When smithy-plan-review returns `auto_fixable`
  findings, the parent command applies these fixes to the artifact files on disk
  before PR creation. The fixes are included in the PR diff.

## Integration Boundaries

### Planning commands → smithy-clarify

All 5 planning commands invoke clarify. Clarify is non-interactive — it runs
scan/triage and returns assumptions and debt without user interaction. Forge
and fix do not invoke clarify, so this change has no impact on them.

### Planning commands → smithy-refine

Phase 0 review loops in mark, cut, render, and ignite invoke refine. Refine
is non-interactive — it applies changes directly and returns a summary with
any unresolvable findings as debt. The parent command writes updated files and
proceeds to PR.

### Planning commands → smithy-plan-review

New integration point. After artifact generation (Phase 3-5 in mark, equivalent
phases in other commands), planning commands invoke smithy-plan-review with the
artifact paths and type. Findings are processed (auto-fix or debt) before PR
creation.

### Planning commands → PR creation

New integration point for strike, ignite, mark, render, and cut. These commands
currently write artifacts and stop. In one-shot mode, they additionally create a
PR using the same `gh pr create` pattern as forge. The PR body includes the
one-shot output snippet content.

### Artifact templates → Specification Debt section

All planning artifact templates gain a `## Specification Debt` section. This is
a structural change to the artifact format. Downstream consumers (e.g., cut
reading a spec, forge reading tasks) must be aware of this section and handle
inherited debt.

### Forge/Fix boundary

Forge and fix are explicitly excluded from scope. They do not invoke clarify
or refine, so the sub-agent changes do not affect them. Their existing STOP
gates (error-handling, complex-fix approval) are unchanged.

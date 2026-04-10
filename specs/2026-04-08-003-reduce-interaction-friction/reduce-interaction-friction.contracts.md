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

### Shared Review Finding (common to both review agents)

**Purpose**: Both `smithy-plan-review` and `smithy-implementation-review` return
findings using the same structure. Neither agent modifies artifacts or code
directly — the parent command (planning command or forge) applies fixes based on
the returned findings.

#### Finding Structure

| Field | Type | Description |
|-------|------|-------------|
| `category` | enum | What kind of issue (see per-agent categories below) |
| `severity` | enum | Critical, Important, Minor |
| `confidence` | enum | High or Low — whether the finding can be auto-resolved by the parent |
| `description` | string | What the issue is and where it appears |
| `artifact_path` | string | Path to the file containing the issue |
| `proposed_fix` | string | Suggested resolution (for High-confidence findings) |

#### Triage Rules (applied by parent command)

| Severity | Confidence | Parent Action |
|----------|------------|---------------|
| Critical | High | Apply proposed fix, note in PR |
| Critical | Low | Record as specification debt, flag in PR for reviewer |
| Important | High | Apply proposed fix |
| Important | Low | Record as specification debt |
| Minor | Any | Note in PR only |

---

### smithy-plan-review (new)

**Purpose**: Automated self-consistency review of planning artifacts. Checks for
internal contradictions, logical gaps, assumption-output drift, and debt
completeness. Non-interactive, read-only.
**Consumers**: strike, ignite, mark, render, cut (after artifact generation,
before PR creation)
**Providers**: smithy-plan-review sub-agent
**Tools**: Read, Grep, Glob (read-only)

#### Categories

Internal contradiction, Logical gap, Assumption-output drift, Debt completeness,
Brittle reference (line numbers instead of stable section/header references)

#### Signature

```
invoke smithy-plan-review(artifact_paths, artifact_type)
  → ReviewResult
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `artifact_paths` | string[] | Yes | Paths to the artifact files to review (e.g., spec.md, data-model.md, contracts.md) |
| `artifact_type` | enum | Yes | `spec`, `strike`, `rfc`, `feature-map`, `tasks` — determines which checklist to apply |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `findings` | Finding[] | Issues found, using the shared finding structure above |
| `summary` | string | Human-readable summary of findings |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Artifact files do not exist | Error with file paths | Cannot review non-existent artifacts |
| Artifact type not recognized | Error | Unknown artifact type has no checklist |
| Zero findings | Normal return | Artifact is internally consistent |

---

### smithy-implementation-review (renamed from smithy-review)

**Purpose**: Code review of implementation diffs against spec, data model, and
contracts. Non-interactive, read-only. Returns findings for forge to apply.
Replaces the current `smithy-review` which auto-fixes directly.
**Consumers**: forge (after implementation, before PR)
**Providers**: smithy-implementation-review sub-agent
**Tools**: Read, Grep, Glob (read-only — write tools removed)

#### Categories

Missing tests, Broken contracts, Security issues, Error handling gaps,
Naming inconsistencies, Scope creep

#### Signature

```
invoke smithy-implementation-review(base_sha, slice_goal, tasks, ref_paths, changed_files, raw_diff)
  → ReviewResult
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `base_sha` | string | Yes | Commit SHA from before implementation started |
| `slice_goal` | string | Yes | High-level objective of the slice |
| `tasks` | string[] | Yes | Task descriptions that were implemented |
| `ref_paths` | object | Yes | Paths to spec, data-model, contracts files |
| `changed_files` | string[] | Yes | Files modified between base_sha and HEAD |
| `raw_diff` | string | Yes | Full `git diff base_sha HEAD` output |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `findings` | Finding[] | Issues found, using the shared finding structure above |
| `summary` | string | Human-readable summary of findings |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| base_sha not found | Error | Cannot compute diff without valid base |
| Reference files do not exist | Warning, proceed | Review without spec context, flag as limitation |
| Zero findings | Normal return | Implementation is clean |

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
- **Review findings apply**: When either review agent returns High-confidence
  findings, the parent command (planning command or forge) applies the proposed
  fixes to files on disk. The fixes are included in the PR diff. The review
  agents themselves never modify files.

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

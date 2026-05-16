# Contracts: smithy.implement Per-Task Spec Re-Read Reduction

## Overview

This feature changes the forge-to-implementation context boundary. The parent forge flow remains responsible for dispatching one implementation agent per task, but the dispatch must include bounded task-specific planning context so the child agent does not repeatedly load the full planning artifact set only to recover acceptance details.

## Interfaces

### Implementation Task Dispatch Context

**Purpose**: Defines the context the parent forge flow supplies to an implementation task agent.
**Consumers**: The implementation task agent.
**Providers**: The forge orchestration flow.

#### Signature

```text
dispatchImplementationTask(
  taskDescription,
  taskNumber,
  sliceGoal,
  taskContextPacket,
  sourceArtifactReferences,
  branchName
) -> ImplementationTaskResult
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskDescription` | text | Yes | The single task to implement. |
| `taskNumber` | text | Yes | Task ordinal or equivalent identifier within the slice. |
| `sliceGoal` | text | Yes | High-level goal for the slice. |
| `taskContextPacket` | TaskContextPacket | Yes | Bounded task-specific acceptance, requirement, data, contract, and debt context. |
| `sourceArtifactReferences` | list of artifact references | Yes | Source trace for the context packet and fallback review. |
| `branchName` | text | Yes | Branch where the task implementation occurs. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `status` | enum (`success`, `blocked`, `failure`) | Task result. |
| `commit_sha` | text | Commit SHA when successful. |
| `files_changed` | list of paths | Files changed by the task. |
| `blockers` | list of text | Missing or contradictory context, validation failures, or other blockers. |
| `notes` | list of text | Scope discoveries or observations for the parent flow. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Missing acceptance context | Block the task and report the missing context. | The agent must not infer acceptance criteria from memory or guesswork. |
| Contradictory packet and source trace | Block the task and report the contradiction. | The source artifacts remain authoritative. |
| Packet exceeds the defined bound | Block or use the documented safe fallback. | Oversized packets would recreate the token problem. |
| Required contract/data detail absent | Block the task and identify the missing section. | The parent flow must repair packet assembly. |

### Context Delivery Decision Record

**Purpose**: Defines the evidence required before selecting the context-delivery strategy.
**Consumers**: Maintainers reviewing the implementation PR.
**Providers**: The feature implementation author.

#### Signature

```text
recordContextDeliveryDecision(
  candidateResults,
  selectedStrategy,
  qualitySummary,
  rejectionReason?
) -> DecisionRecord
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `candidateResults` | list of MeasurementResult | Yes | Results for both strategies across JS and JVM fixtures. |
| `selectedStrategy` | enum (`pre_pasted_excerpts`, `per_task_brief`) | Yes | Candidate selected for implementation. |
| `qualitySummary` | text | Yes | Structural-eval and human sample-review summary. |
| `rejectionReason` | text | Conditional | Required when the lowest-token strategy is not selected. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `decision_record` | text/table | Human-readable evidence included in the implementation PR or linked artifact. |
| `merge_gate` | enum (`pass`, `blocked`) | Whether the selected strategy satisfies quality and measurement gates. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Missing fixture measurement | `merge_gate = blocked` | Both JS and JVM measurements are required. |
| Missing candidate strategy | `merge_gate = blocked` | Both candidate strategies must be compared. |
| Structural regression | `merge_gate = blocked` | Quality gate failure blocks merge. |
| Sampled review regression | `merge_gate = blocked` | Human-reviewed acceptance regression blocks merge. |

## Events / Hooks

No new events or hooks are introduced. The feature uses the existing forge dispatch flow and existing eval execution flow.

## Integration Boundaries

- **Forge orchestration to implementation task agent**: The dispatch input gains bounded task context as a required element for this feature's selected path.
- **Planning artifacts to context packet assembly**: The source spec, data model, contracts, and task list remain authoritative; packets are derived context with source trace.
- **Eval reporting and baselines**: M1 forge baseline outputs provide the comparison point for token deltas and quality results.
- **Implementation PR review**: The PR description or linked decision record is the maintainer-facing evidence boundary for the selected strategy and measured outcome.

No external service integration, public CLI contract, or persistent API is introduced by this feature.

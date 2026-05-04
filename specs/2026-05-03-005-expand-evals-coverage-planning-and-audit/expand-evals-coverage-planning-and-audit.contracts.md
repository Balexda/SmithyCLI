# Contracts: Expand Evals Coverage Across Planning Commands

## Overview

This feature adds **new instances** to two existing contracts (the YAML scenario shape consumed by `loadScenarios` and the structural-expectations regex grammar consumed by `validateStructure`) and introduces one **new convention contract** (the planted-artifact fixture layout). No new programmatic interfaces are introduced; no existing interfaces are modified.

## Interfaces

### 1) Scenario YAML File Shape

**Purpose**: A single eval case authored as YAML. Loaded by `loadScenarios(casesDir)` in `evals/lib/scenario-loader.ts`; returns one `EvalScenario` per file.

**Consumers**:
- `evals/run-evals.ts` (orchestrator iterates loaded scenarios).
- `evals/lib/runner.ts` (per-scenario `runScenario(scenario, fixtureDir)`).
- `evals/lib/structural.ts` (`validateStructure(text, scenario.structural_expectations)`).
- `evals/lib/baseline.ts` (`loadBaseline(scenario.name)`).

**Providers**: this feature authors six new files under `evals/cases/`.

#### Signature (YAML)

```yaml
name: <kebab-case-string>             # required, unique across cases
skill: /<smithy-command>              # required, non-empty
prompt: <argument-string>             # required
timeout: <integer-seconds>            # optional; required for mark/cut/render/ignite (FR-010)
structural_expectations:
  required_headings:                  # required, non-empty array
    - '## ...'
  required_patterns:                  # optional regex strings (no flags)
    - '...'
  forbidden_patterns:                 # required minimum: refusal phrases + leading frontmatter
    - "I'd be happy to help"
    - "Sure, here's"
    - '^---\r?\n'
  required_tables:                    # optional
    - columns: [<col1>, <col2>]
sub_agent_evidence:                   # required for spark/ignite/render/mark/cut; omitted for audit
  - agent: <smithy-sub-agent-name>
    pattern: '<regex>'
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Kebab-case identifier; matches `[a-z0-9-]+`. Unique across `evals/cases/*.yaml`. |
| `skill` | string | Yes | Non-empty slash-command form. The runner's `runScenario` composes the headless invocation as `${skill} ${prompt}` before spawning `claude`. |
| `prompt` | string | Yes | For scenarios consuming a plant, MUST be an exact repo-relative path; for spark, free-text idea. |
| `timeout` | number | Conditional | In seconds. Required when the empirical run-time is known to exceed the runner's 120s default. |
| `structural_expectations` | object | Yes | See structural-expectations grammar in §2. |
| `sub_agent_evidence` | array | Conditional | Required for any command that dispatches sub-agents per the Sub-Agent Evidence Matrix. |

#### Outputs

The loader yields an `EvalScenario` (TS interface from `evals/lib/types.ts`); the orchestrator passes that to the runner and validators. No new output shape.

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Duplicate `name` across files | Loader skips the second-loaded file with a stderr note (existing behavior). | Authoring error; the implementer renames one. |
| Empty `skill` field | Loader rejects the file with a stderr note (existing behavior). | All six new scenarios use non-empty skills. |
| Invalid regex in `required_patterns` / `forbidden_patterns` | `validateStructure` (in `evals/lib/structural.ts`) throws at run-time. | Authoring error; implementer fixes the YAML. |
| `sub_agent_evidence[].pattern` does not match canonical text or any dispatch record | The check fails for that scenario; the run reports FAIL for that scenario. | Either a regression in the producing command or expected sub-agent did not dispatch. |
| Missing or empty `required_headings` | Loader rejects the file (existing behavior). | Authoring error. |

### 2) Structural-Expectations Regex Grammar (existing, used as-is)

**Purpose**: The grammar that `validateStructure` and `verifySubAgents` interpret.

**Consumers**: `evals/lib/structural.ts`.

**Providers**: each scenario YAML authors patterns conforming to this grammar.

#### Signature

- `required_patterns: string[]` — each compiled via `new RegExp(pattern)` (no flags). Pattern must match somewhere in `output` for the check to PASS.
- `forbidden_patterns: string[]` — each compiled the same way. Pattern MUST NOT match in `output`. Empty `output` ALSO fails the check.
- `required_headings: string[]` — exact line match against `output.split('\n').map(l => l.trimEnd())`.
- `required_tables: { columns: string[] }[]` — at least one line containing `|` AND every column substring.

No grammar changes in this feature; new scenarios author patterns within the existing shape.

#### Authoring rules for new scenarios (per FR-014)

- Anchor `required_headings` to the **literal** ATX headings emitted by the producing template's output code-fence, RFC template, spec template, or one-shot snippet. Do not derive headings from prose narration.
- Anchor `required_patterns` to template-stable markers. Examples: `\*\*Spec folder\*\*`, `\*\*PRD path\*\*`, `\*\*RFC path\*\*`, `^[Cc]larif`, `## Plan\n\n\*\*Directive\*\*`.
- Single-quote regex strings in YAML so backslash escapes round-trip byte-for-byte.

### 3) Sub-Agent Evidence Per-Command Contract (new authoring contract)

**Purpose**: Documents which sub-agents each new scenario MUST verify and which marker conventions are template-stable.

**Consumers**: scenario authors during initial authoring and during drift refresh.

**Providers**: this spec's `### Sub-Agent Evidence Matrix` (lifted into the eval's authoring conventions).

#### Per-Command Required Sub-Agent Evidence

| Scenario | Required `sub_agent_evidence` agents | Marker conventions |
|----------|--------------------------------------|---------------------|
| `audit-flawed-spec` | (none — `sub_agent_evidence` field omitted from YAML) | n/a |
| `mark-from-features` | smithy-scout, smithy-plan, smithy-clarify, smithy-refine, smithy-plan-review | `## Plan\n\n\*\*Directive\*\*` (plan); `^[Cc]larif` (clarify dispatch description); `^[Ss]cout` or scout's report-stable marker (scout); `## Step \d+:` or refine's stable marker (refine); plan-review's stable marker (plan-review). |
| `cut-from-spec` | smithy-scout, smithy-clarify, smithy-plan-review | same conventions as mark for the agents listed. |
| `render-from-rfc` | smithy-scout, smithy-clarify, smithy-plan-review | same. |
| `ignite-from-prd` | smithy-prose, smithy-plan, smithy-clarify, smithy-plan-review | `## Plan\n\n\*\*Directive\*\*` (plan); `^[Cc]larif` (clarify); prose's stable marker; plan-review's stable marker. |
| `spark-from-idea` | smithy-survey, smithy-clarify, smithy-prose, smithy-plan-review | `^[Ss]urvey` (survey dispatch description) OR survey's empty-state stub (FR-008 alternation); `^[Cc]larif` (clarify); prose's marker; plan-review's marker. |

#### Error Conditions

| Condition | Response |
|-----------|----------|
| The producing template's sub-agent set changes (an agent removed; a new agent added) | Implementer updates this matrix and the affected scenarios in the same PR; otherwise the check fails (false positive) or under-tests (false negative). |
| A sub-agent's stable marker changes (e.g., `## Plan` heading renamed) | Implementer updates the marker convention here and in every consuming scenario in the same PR. |

### 4) Planted-Artifact Fixture Layout Contract (new convention)

**Purpose**: Specifies the directory layout and naming rules for parent-artifact plants consumed by scenarios.

**Consumers**: scenario YAML files (via exact-path references in `prompt`).

**Providers**: this feature creates the planted artifacts on disk.

#### Layout

```
evals/fixture/
  prds/
    ignite-eval/
      <slug>.prd.md                        # owned by ignite-from-prd
  rfcs/
    render-eval/
      <slug>.rfc.md                        # owned by render-from-rfc
    mark-eval/
      <slug>.rfc.md                        # owned by mark-from-features (RFC for traceability)
      01-core.features.md                  # owned by mark-from-features (the consumed features-map)
  specs/
    cut-eval/
      <slug>.spec.md                       # owned by cut-from-spec
      <slug>.data-model.md                 # owned by cut-from-spec
      <slug>.contracts.md                  # owned by cut-from-spec
    audit-eval/
      <slug>.spec.md                       # owned by audit-flawed-spec — DELIBERATELY MISSING `## Dependency Order`
```

(spark requires no plants; `evals/fixture/prds/spark-eval/` MUST NOT exist.)

#### Inputs (per planted artifact)

| Field | Description |
|-------|-------------|
| `path` | Repo-relative path under `evals/fixture/{prds,rfcs,specs}/<scenario-slug>/`. |
| `scenario_slug` | Matches the consuming scenario's `name` exactly. |
| `content` | Conforms to the canonical artifact shape (PRD template, RFC template, features-map schema, spec template) so the consuming command's input parsing succeeds; for the audit `flawed-spec`, conforms **except** for the deliberately missing section. |
| `top-of-file comment` (flawed plants only) | A multi-line comment describing exactly which checklist invariant the flaw violates and why future maintainers should not "fix" it. |

#### Outputs

- The plant is read by exactly one scenario via the runner's invocation `${skill} ${prompt}` where `prompt` is the plant's exact path.
- `evals/fixture/README.md` documents each plant in a per-row table (path, owner, purpose, flaw description if any).

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| A scenario's prompt references a path outside its own `<scenario-slug>/` subdirectory | Authoring error; reviewer rejects. | Cross-scenario cross-talk forbidden. |
| A flawed plant has no top-of-file flaw comment | Authoring error; reviewer rejects. | Future maintainers might "fix" the flaw during cleanup. |
| The planted RFC, features-map, or spec drifts from the producing command's current schema | The consuming command rejects the input or routes incorrectly; scenario fails on next run. | Implementer regenerates the plant and refreshes the scenario's `structural_expectations` together. |
| A plant references files outside `evals/fixture/<scenario-slug>/` | Authoring error. | Plants are self-contained per scenario. |

### 5) Audit Scenario Detection Contract (new behavioral contract)

**Purpose**: The audit scenario must prove audit *catches the planted flaw*, not just produce a report-shaped document.

**Consumers**: scenario `required_patterns` validate against audit's emitted text.

#### Signature

The planted `evals/fixture/specs/audit-eval/<slug>.spec.md` MUST:
- Contain all other mandatory spec sections (`# Feature Specification: ...`, `## Clarifications`, `## User Scenarios & Testing`, `## Requirements`, `## Success Criteria`, etc.).
- **Omit** the `## Dependency Order` section entirely.
- Carry a top-of-file comment explaining the deliberate omission.

The scenario YAML MUST assert via `required_patterns`:
- The literal string `Dependency Order` (audit's report references the missing section by name).
- At least one `Critical` severity label (audit's report categorizes a missing required section as Critical).

#### Error Conditions

| Condition | Response |
|-----------|----------|
| Audit's checklist reorganization renames "Dependency Order" → some other phrase | The scenario fails with a missing-pattern error; implementer updates the planted flaw, the checklist, and the scenario together. (Tracked as SD-002.) |
| Audit's severity grading drifts (e.g., `Critical` → `Blocker`) | The scenario fails with a missing-pattern error; implementer refreshes both the prompt template and the scenario. |
| The planted spec's flaw is "fixed" by an unrelated cleanup PR | The scenario fails (audit no longer finds the missing section); the file's top-of-file flaw comment exists to prevent this. |

## Events / Hooks

This feature publishes no new events. It consumes the same evaluation flow as existing scenarios:

- Orchestrator startup → `loadScenarios` → per-scenario `runScenario` → `validateStructure` → `verifySubAgents` → `compareToBaseline` (skipped for new scenarios per SD-012) → `scenarioRunToResult` → `buildReport` → `formatReport`.

No webhook publication, no event subscription, no inter-process messaging.

## Integration Boundaries

- **`claude` CLI** (existing boundary): the runner spawns `claude --output-format stream-json --verbose -p <invocation>` per scenario. New scenarios use the same boundary; no auth or invocation surface changes.
- **Filesystem** (existing boundary): the runner copies `evals/fixture/` to a temp directory before each run; writes by mark/cut/render/ignite happen in the temp copy. The source-fixture checksum invariant (`hashDirectory` before/after) holds for all new scenarios per FR-013.
- **GitHub `gh` CLI** (new edge case): mark/cut/render/ignite invoke `gh pr create` during their workflows. In the eval execution context `gh` may be unauthenticated; scenarios MUST tolerate the PR-creation-failure branch of the producing command's one-shot snippet (per SD-008).
- **`git` CLI** (new edge case): mark/cut/render/ignite call `git checkout -b` and `git commit`. The temp fixture copy MUST be a working git repository or the scenarios fail before any output is captured (per SD-001 and SD-007).

No new external system integrations are introduced. The Anthropic Messages Batches API integration is explicitly **out of scope** this round (see spec `## Out of Scope`).
